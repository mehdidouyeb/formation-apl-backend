require('dotenv').config();
const express = require('express');
const cors = require('cors');
const ragService = require('./ragService');
const exerciseService = require('./exerciseService');
const simulationService = require('./simulationService');
// NOTE: multer removed - no longer needed (audio handled by Gemini)

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware - CORS configuration for production
const allowedOrigins = [
  'http://localhost:5173',
  'https://caffromation.netlify.app'
];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend RAG is running' });
});

// RAG endpoint
app.post('/api/ask', async (req, res) => {
  try {
    const { question, history } = req.body;

    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    console.log(`📩 Question reçue: ${question}`);

    const answer = await ragService.ask(question, history);

    console.log(`✅ Réponse générée`);

    res.json({
      answer: answer.text,
      sources: answer.sources,
      confidence: answer.confidence
    });

  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la génération de la réponse',
      details: error.message 
    });
  }
});

// Exercise evaluation endpoint
app.post('/api/evaluate-exercise', async (req, res) => {
  try {
    const { exerciseData, userAnswer, history } = req.body;

    if (!exerciseData || !userAnswer) {
      return res.status(400).json({ error: 'exerciseData and userAnswer are required' });
    }

    console.log(`🎯 Évaluation exercice: ${exerciseData.exercise_id}`);
    console.log(`📝 Réponse utilisateur: "${userAnswer}"`);

    const evaluation = await exerciseService.evaluateAnswer(exerciseData, userAnswer, history);

    console.log(`✅ Évaluation terminée - Score: ${evaluation.score}%`);

    res.json(evaluation);

  } catch (error) {
    console.error('❌ Erreur évaluation:', error);
    res.status(500).json({ 
      error: 'Erreur lors de l\'évaluation de la réponse',
      details: error.message 
    });
  }
});

// Hint generation endpoint
app.post('/api/get-hint', async (req, res) => {
  try {
    const { exerciseData, attemptNumber } = req.body;

    if (!exerciseData) {
      return res.status(400).json({ error: 'exerciseData is required' });
    }

    console.log(`💡 Demande d'indice pour: ${exerciseData.exercise_id}`);

    const hint = await exerciseService.generateHint(exerciseData, attemptNumber || 1);

    res.json(hint);

  } catch (error) {
    console.error('❌ Erreur génération indice:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la génération de l\'indice',
      details: error.message 
    });
  }
});

// Clarification endpoint (NEW - for conversational mode BEFORE answering)
app.post('/api/ask-clarification', async (req, res) => {
  try {
    const { exerciseData, userQuestion, conversationHistory, questionCount } = req.body;

    if (!exerciseData || !userQuestion) {
      return res.status(400).json({ error: 'exerciseData and userQuestion are required' });
    }

    console.log(`💬 Clarification pour exercice: ${exerciseData.exercise_id}`);
    console.log(`❓ Question: "${userQuestion}"`);

    const clarificationResponse = await exerciseService.provideClarification(
      exerciseData, 
      userQuestion, 
      conversationHistory || [],
      questionCount || 0
    );

    console.log(`✅ Clarification fournie`);

    res.json(clarificationResponse);

  } catch (error) {
    console.error('❌ Erreur clarification:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la génération de la clarification',
      details: error.message 
    });
  }
});

// Feedback clarification endpoint (NEW - for discussion AFTER answering)
app.post('/api/ask-feedback-clarification', async (req, res) => {
  try {
    const { exerciseData, userQuestion, evaluation, conversationHistory } = req.body;

    if (!exerciseData || !userQuestion || !evaluation) {
      return res.status(400).json({ error: 'exerciseData, userQuestion, and evaluation are required' });
    }

    console.log(`💬 Discussion post-feedback pour exercice: ${exerciseData.exercise_id}`);
    console.log(`❓ Question: "${userQuestion}"`);

    const clarificationResponse = await exerciseService.provideFeedbackClarification(
      exerciseData, 
      userQuestion, 
      evaluation,
      conversationHistory || []
    );

    console.log(`✅ Clarification post-feedback fournie`);

    res.json(clarificationResponse);

  } catch (error) {
    console.error('❌ Erreur clarification post-feedback:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la génération de la clarification post-feedback',
      details: error.message 
    });
  }
});

// ==================== SIMULATION ENDPOINTS ====================

// Get all simulations
app.get('/api/simulations', (req, res) => {
  try {
    const simulations = simulationService.loadSimulations();
    res.json(simulations);
  } catch (error) {
    console.error('❌ Erreur chargement simulations:', error);
    res.status(500).json({ error: 'Erreur lors du chargement des simulations' });
  }
});

// Get specific simulation
app.get('/api/simulation/:simulationId', (req, res) => {
  try {
    const { simulationId } = req.params;
    const simulation = simulationService.getSimulation(simulationId);
    res.json(simulation);
  } catch (error) {
    console.error('❌ Erreur chargement simulation:', error);
    res.status(404).json({ error: 'Simulation non trouvée' });
  }
});

// ====================================================================
// NOTE: /api/simulation-chat removed
// Chat is now handled by Gemini Live API through WebSocket
// ====================================================================

// NEW: Get RAG context for simulation
app.post('/api/simulation-context', async (req, res) => {
  try {
    const { moduleReference, query } = req.body;

    if (!moduleReference) {
      return res.status(400).json({ error: 'moduleReference required' });
    }

    console.log(`📚 RAG context pour module: ${moduleReference}`);

    const contexts = await simulationService.searchSimulationContext(
      moduleReference,
      query || 'contexte complet règles procédures',
      5
    );

    res.json({ contexts });

  } catch (error) {
    console.error('❌ Erreur récupération contexte RAG:', error);
    res.status(500).json({ error: 'Erreur récupération contexte', details: error.message });
  }
});

// ====================================================================
// NOTE: /api/generate-audio and /api/transcribe-audio endpoints removed
// Audio streaming is now handled by Gemini Live API through WebSocket
// ====================================================================

// Evaluate conversation (NEW - simplified version)
app.post('/api/evaluate-conversation', async (req, res) => {
  try {
    const { conversationHistory, scenarioContext } = req.body;

    if (!conversationHistory || conversationHistory.length === 0) {
      return res.status(400).json({ error: 'conversationHistory required (non-empty)' });
    }

    console.log(`📊 Évaluation conversation (${conversationHistory.length} messages)`);

    const evaluation = await simulationService.evaluateConversation(
      conversationHistory,
      scenarioContext || {}
    );

    console.log(`✅ Évaluation terminée - Score: ${evaluation.synthese?.score_global}/100`);

    res.json(evaluation);

  } catch (error) {
    console.error('❌ Erreur évaluation conversation:', error);
    res.status(500).json({ error: 'Erreur évaluation conversation', details: error.message });
  }
});

// Assistant help endpoint (RAG assistant pour aider pendant simulation)
app.post('/api/assistant-help', async (req, res) => {
  try {
    const { question, moduleNumber, scenarioContext } = req.body;

    if (!question) {
      return res.status(400).json({ error: 'question required' });
    }

    console.log(`🤖 [Assistant] Module ${moduleNumber}: ${question}`);

    const answer = await simulationService.answerAssistantQuestion(
      question,
      moduleNumber,
      scenarioContext
    );

    console.log(`✅ [Assistant] Answer generated`);
    res.json({ answer });

  } catch (error) {
    console.error('❌ Erreur assistant:', error);
    res.status(500).json({ error: 'Erreur assistant', details: error.message });
  }
});

// Co-Pilot recommendations endpoint (real-time suggestions)
app.post('/api/copilot-recommend', async (req, res) => {
  try {
    const { allocataireMessage, conversationHistory, moduleNumber } = req.body;

    if (!allocataireMessage) {
      return res.status(400).json({ error: 'allocataireMessage required' });
    }

    console.log(`🧭 [Co-Pilot] Module ${moduleNumber}: Generating recommendations...`);

    const recommendations = await simulationService.generateCoPilotRecommendations(
      allocataireMessage,
      conversationHistory || [],
      moduleNumber
    );

    console.log(`✅ [Co-Pilot] Recommendations generated`);
    res.json({ recommendations });

  } catch (error) {
    console.error('❌ Erreur co-pilot:', error);
    res.status(500).json({ error: 'Erreur co-pilot', details: error.message });
  }
});

// Generate call summary endpoint (for phone assistant)
app.post('/api/generate-call-summary', async (req, res) => {
  try {
    const { conversation, situation } = req.body;

    if (!conversation || !Array.isArray(conversation)) {
      return res.status(400).json({ error: 'conversation required' });
    }

    console.log(`📝 [Call Summary] Generating summary for ${conversation.length} messages...`);

    const summary = await simulationService.generateCallSummary(conversation, situation);

    console.log(`✅ [Call Summary] Summary generated`);
    res.json({ summary });

  } catch (error) {
    console.error('❌ Erreur call summary:', error);
    res.status(500).json({ error: 'Erreur call summary', details: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Serveur RAG démarré sur http://localhost:${PORT}`);
  console.log(`\n📊 Endpoints disponibles:`);
  console.log(`\n🎓 FORMATION & EXERCICES:`);
  console.log(`   - POST http://localhost:${PORT}/api/ask`);
  console.log(`   - POST http://localhost:${PORT}/api/evaluate-exercise`);
  console.log(`   - POST http://localhost:${PORT}/api/ask-clarification`);
  console.log(`   - POST http://localhost:${PORT}/api/ask-feedback-clarification`);
  console.log(`   - POST http://localhost:${PORT}/api/get-hint`);
  console.log(`\n🎭 SIMULATIONS (avec Gemini Live API):`);
  console.log(`   - GET  http://localhost:${PORT}/api/simulations`);
  console.log(`   - GET  http://localhost:${PORT}/api/simulation/:id`);
  console.log(`   - POST http://localhost:${PORT}/api/simulation-context (RAG)`);
  console.log(`   - POST http://localhost:${PORT}/api/evaluate-conversation (NEW)`);
  console.log(`   - POST http://localhost:${PORT}/api/assistant-help (Assistant RAG)`);
  console.log(`   - POST http://localhost:${PORT}/api/copilot-recommend (Co-Pilot en temps réel)`);
  console.log(`\n📞 PHONE ASSISTANT (Assistant téléphonique CAF):`);
  console.log(`   - POST http://localhost:${PORT}/api/generate-call-summary (Synthèse d'appel)`);
  console.log(`\n✅ Le serveur backend est prêt !`);
  console.log(`⚠️  Note: La voix est gérée par Gemini Live API (côté frontend)\n`);
});

