const { Pinecone } = require('@pinecone-database/pinecone');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Initialize Pinecone
const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY
});

const INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'formation-apl';
const NAMESPACE = process.env.PINECONE_NAMESPACE || 'info-to-rag';

// ====================================================================
// SIMULATION DATA LOADING
// ====================================================================

/**
 * Load simulation scenarios from JSON
 */
function loadSimulations() {
    try {
        const simulationsPath = path.join(__dirname, '../public/simulations_apl.json');
        const data = fs.readFileSync(simulationsPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading simulations:', error);
        throw error;
    }
}

/**
 * Get a specific simulation by ID
 */
function getSimulation(simulationId) {
    const data = loadSimulations();
    const simulation = data.simulations.find(s => s.simulation_id === simulationId);
    
    if (!simulation) {
        throw new Error(`Simulation ${simulationId} not found`);
    }
    
    return simulation;
}

// ====================================================================
// RAG CONTEXT RETRIEVAL (For Gemini system instruction)
// ====================================================================

/**
 * Search RAG context for simulation
 * Used to build Gemini's system instruction with CAF rules
 */
async function searchSimulationContext(moduleReference, query, topK = 5) {
    try {
        console.log(`📚 [RAG] Searching context for module: ${moduleReference}, query: "${query}"`);
        
        // Generate embedding for the query
        const embeddingResponse = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: `${moduleReference} ${query}`
        });

        const queryEmbedding = embeddingResponse.data[0].embedding;

        // Search in Pinecone
        const index = pinecone.index(INDEX_NAME);
        const queryResponse = await index.namespace(NAMESPACE).query({
            vector: queryEmbedding,
            topK: topK,
            includeMetadata: true
        });

        // Extract and format results
        const contexts = queryResponse.matches.map(match => ({
            text: match.metadata.text,
            score: match.score,
            module: match.metadata.module,
            section: match.metadata.section
        }));

        console.log(`✅ [RAG] Retrieved ${contexts.length} context(s)`);
        return contexts;
        
    } catch (error) {
        console.error('⚠️ [RAG] Search failed for simulation:', error.message);
        return []; // Return empty array if RAG fails (simulation can still work)
    }
}

// ====================================================================
// SIMULATION EVALUATION - Nouvelle version simplifiée
// ====================================================================

/**
 * Evaluate conversation with comparison between ideal and actual responses
 * For each allocataire question, generate ideal agent response and compare
 */
async function evaluateConversation(conversationHistory, scenarioContext = {}) {
    try {
        console.log(`📊 [Evaluation] Analyzing conversation with ${conversationHistory.length} messages...`);
        
        // Get RAG context for official rules (reduced to 3 for token limit)
        const ragContexts = await searchSimulationContext(
            'module_1',
            'différence APL ALF ALS conditions grossesse famille basculement',
            3
        );

        // Truncate RAG text to max 2000 characters to save tokens
        const ragContextText = ragContexts
            .map((ctx, i) => `[Doc ${i + 1}] ${ctx.text.substring(0, 600)}`)
            .join('\n\n');

        // Build conversation text
        const conversationText = conversationHistory
            .map((msg, idx) => {
                const role = msg.role === 'user' ? 'AGENT CAF (vous)' : 'ALLOCATAIRE (Sophie)';
                return `[Message ${idx + 1}] ${role}:\n${msg.content}`;
            })
            .join('\n\n');

        // Build evaluation prompt (DETAILED VERSION with question extraction)
        const evaluationPrompt = `Évaluateur CAF expert. Analyse détaillée de la conversation entre agent CAF et allocataire.

📋 CONTEXTE ALLOCATAIRE:
${scenarioContext.allocataire ? `${scenarioContext.allocataire.prenom} ${scenarioContext.allocataire.nom}` : 'Allocataire'}
Problème: ${scenarioContext.problem ? scenarioContext.problem.substring(0, 200) : 'N/A'}

📚 DOCUMENTATION CAF (RÉFÉRENCE):
${ragContextText || 'N/A'}

💬 CONVERSATION COMPLÈTE:
${conversationText}

🎯 TA MISSION:

1. IDENTIFIE TOUTES LES QUESTIONS/INQUIÉTUDES de l'allocataire dans la conversation
2. Pour CHAQUE question identifiée:
   - Génère la RÉPONSE IDÉALE basée sur la doc CAF
   - Extrait la RÉPONSE RÉELLE de l'agent (cite exactement ce qu'il a dit)
   - Compare les deux et évalue (exactitude, clarté, empathie)
   - Identifie ce qui MANQUE (chiffres, dates, détails techniques)

3. ANALYSE GLOBALE:
   - Détails techniques/chiffrés manquants
   - Questions de clarification que l'agent aurait dû poser
   - Informations importantes non vérifiées

RETOURNE JSON STRICTEMENT:
{
  "questions_identifiees": [
    {
      "numero": 1,
      "question_allocataire": "La question ou inquiétude EXACTE exprimée par l'allocataire",
      "contexte_question": "Dans quel contexte de la conversation",
      "reponse_ideale": {
        "contenu": "Ce que l'agent aurait dû répondre selon la doc CAF (détaillé)",
        "elements_cles": ["Élément 1", "Élément 2", "Élément 3"],
        "chiffres_dates_requis": ["Juin 2025", "205€/mois", "etc."]
      },
      "reponse_reelle": {
        "contenu": "Ce que l'agent a RÉELLEMENT dit (citation exacte de la conversation)",
        "elements_mentionnes": ["Ce qui a été dit"],
        "elements_manquants": ["Ce qui manque"]
      },
      "feedback_comparaison": {
        "exactitude_technique": "correct/partiellement correct/incorrect",
        "justesse_chiffres": "précis/approximatif/absent/incorrect",
        "clarte_explication": "clair/moyennement clair/confus",
        "empathie": "présente/partielle/absente",
        "score": 0-100,
        "commentaire_detaille": "Analyse de l'écart entre idéal et réel, ce qui manque"
      }
    }
  ],
  "informations_manquantes_globales": {
    "details_techniques_non_mentionnes": ["Règle X non expliquée", "Condition Y oubliée"],
    "chiffres_dates_absents": ["Date précise du basculement", "Montant estimé"],
    "questions_clarification_oubliees": ["Aurait dû demander la date de déclaration", "Aurait dû vérifier le conventionnement"]
  },
  "synthese_finale": {
    "points_forts": ["Ce qui a été bien fait"],
    "points_amelioration": ["Ce qui doit être amélioré"],
    "competences": {
      "maitrise_technique": {"score": 0-100, "commentaire": "Analyse"},
      "precision_chiffres_dates": {"score": 0-100, "commentaire": "Analyse"},
      "communication": {"score": 0-100, "commentaire": "Analyse"},
      "relationnel": {"score": 0-100, "commentaire": "Analyse"}
    },
    "score_global": 0-100,
    "niveau": "Débutant/Intermédiaire/Confirmé/Expert",
    "recommandations_prioritaires": ["Action 1", "Action 2", "Action 3"]
  }
}

⚠️ RÈGLES CRITIQUES POUR LE JSON:
- JSON valide UNIQUEMENT, sans markdown
- Échappe TOUS les guillemets dans les chaînes avec \"
- Pas de retours à la ligne dans les chaînes JSON
- Pas de virgules trailing
- Structure complète et fermée
- Sois TRÈS détaillé dans l'extraction des réponses réelles`;

        // Call OpenAI for evaluation (using gpt-4o for complex JSON generation)
        console.log(`🤖 [Evaluation] Calling OpenAI gpt-4o (better for complex JSON)...`);
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'system',
                    content: 'Tu es un évaluateur expert CAF. Retourne UNIQUEMENT du JSON valide et complet.'
                },
                {
                    role: 'user',
                    content: evaluationPrompt
                }
            ],
            response_format: { type: "json_object" },
            temperature: 0.2
        });

        const responseText = completion.choices[0].message.content.trim();
        console.log(`✅ [Evaluation] OpenAI response received (${responseText.length} chars)`);
        
        // Parse JSON with improved error handling
        let evaluation;
        try {
            // With response_format json_object, the response should be clean JSON
            evaluation = JSON.parse(responseText);
            console.log(`✅ [Evaluation] JSON parsed successfully. Score global: ${evaluation.synthese_finale?.score_global || evaluation.synthese?.score_global}/100`);
        } catch (parseError) {
            console.error('❌ [Evaluation] Failed to parse JSON');
            console.error('Parse error:', parseError.message);
            console.error('Response length:', responseText.length);
            console.error('Response text (first 1000 chars):', responseText.substring(0, 1000));
            console.error('Response text (last 500 chars):', responseText.substring(Math.max(0, responseText.length - 500)));
            
            // Try to extract partial data if possible
            try {
                // Try to find and parse just the synthese if the full JSON fails
                const syntheseMatch = responseText.match(/"synthese_finale"\s*:\s*\{[^}]*"score_global"\s*:\s*(\d+)/);
                if (syntheseMatch) {
                    console.warn('⚠️ [Evaluation] Using fallback: extracted partial data');
                    evaluation = {
                        questions_identifiees: [],
                        informations_manquantes_globales: {},
                        synthese_finale: {
                            score_global: parseInt(syntheseMatch[1]),
                            niveau: 'Intermédiaire',
                            points_forts: ['Analyse partielle disponible'],
                            points_amelioration: ['Réponse JSON incomplète - erreur technique'],
                            competences: {},
                            recommandations_prioritaires: ['Vérifier la réponse complète']
                        }
                    };
                } else {
                    throw parseError;
                }
            } catch (fallbackError) {
                throw new Error('Invalid JSON response from evaluation: ' + parseError.message);
            }
        }

        return evaluation;

    } catch (error) {
        console.error('❌ [Evaluation] Error:', error);
        throw error;
    }
}

/**
 * Answer assistant question using RAG
 */
async function answerAssistantQuestion(question, moduleNumber, scenarioContext) {
    try {
        console.log(`🤖 [Assistant] Question: "${question}" for Module ${moduleNumber}`);
        
        // Search RAG context for the module
        const contexts = await searchSimulationContext(
            `module_${moduleNumber}`,
            question,
            5
        );

        // Build RAG context text
        const ragContextText = contexts
            .map((ctx, i) => `[Règle ${i + 1}] ${ctx.text}`)
            .join('\n\n');

        // Build prompt for assistant
        const assistantPrompt = `Tu es un assistant expert de la CAF spécialisé dans les aides au logement (APL, ALF, ALS).

📚 DOCUMENTATION OFFICIELLE CAF (Module ${moduleNumber}) :
${ragContextText}

${scenarioContext ? `📋 CONTEXTE DU SCÉNARIO EN COURS :
Allocataire : ${scenarioContext.allocataire?.prenom} ${scenarioContext.allocataire?.nom}
Problème : ${scenarioContext.problem_statement?.substring(0, 200)}...

` : ''}❓ QUESTION DE L'AGENT CAF :
"${question}"

🎯 TA MISSION :
Réponds de manière PRÉCISE, CLAIRE et PÉDAGOGIQUE à la question de l'agent.
- Utilise UNIQUEMENT les informations de la documentation officielle ci-dessus
- Cite les règles précises et les pages si nécessaire
- Donne des exemples concrets si pertinent
- Structure ta réponse avec des puces ou des paragraphes courts
- Sois PRÉCIS sur les dates, montants, conditions

⚠️ IMPORTANT :
- Si la question n'est pas couverte par la documentation → dis-le clairement
- Reste factuel et basé sur les règles officielles
- Aide l'agent à comprendre pour qu'il puisse expliquer à l'allocataire`;

        // Call OpenAI for answer (using o4-mini)
        const completion = await openai.chat.completions.create({
            model: 'o4-mini',
            messages: [
                {
                    role: 'user',
                    content: assistantPrompt
                }
            ]
        });

        // o4-mini peut retourner le contenu dans reasoning ou content
        let answer = '';
        if (completion.choices[0].message.content) {
            answer = completion.choices[0].message.content.trim();
        } else if (completion.choices[0].message.reasoning) {
            answer = completion.choices[0].message.reasoning.trim();
        }
        
        console.log(`✅ [Assistant] Answer generated (${answer.length} chars)`);

        return answer;

    } catch (error) {
        console.error('❌ [Assistant] Error:', error);
        throw error;
    }
}

/**
 * Generate real-time co-pilot recommendations
 */
async function generateCoPilotRecommendations(allocataireMessage, conversationHistory, moduleNumber) {
    try {
        console.log(`🧭 [Co-Pilot] Analyzing message for Module ${moduleNumber}`);
        
        // Search RAG context for the module
        const contexts = await searchSimulationContext(
            `module_${moduleNumber}`,
            allocataireMessage,
            3 // Top 3 most relevant documents
        );

        // Build RAG context text
        const ragContextText = contexts
            .map((ctx, i) => `[Règle ${i + 1}] ${ctx.text}`)
            .join('\n\n');

        // Build conversation history text
        const historyText = conversationHistory
            .map(msg => `${msg.role === 'user' ? 'Agent CAF' : 'Allocataire'}: ${msg.content}`)
            .join('\n');

        // Build co-pilot prompt - SIMPLE ET INTELLIGENT
        const coPilotPrompt = `Tu es un assistant IA qui aide un agent CAF pendant une conversation avec un allocataire.

📜 CONVERSATION COMPLÈTE :
${historyText}

🗣️ DERNIÈRE PHRASE DE L'ALLOCATAIRE :
"${allocataireMessage}"

📚 DOCUMENTATION CAF (pour référence) :
${ragContextText}

🎯 ÉTAPE 1 - CHECKLIST OBLIGATOIRE :
Vérifie dans la CONVERSATION (pas dans la documentation) si ces infos ont été EXPLICITEMENT dites :
- Type d'aide actuel (APL/ALF/ALS) : OUI ✅ ou NON ❌
- Situation familiale précise : OUI ✅ ou NON ❌

🎯 ÉTAPE 2 - DÉCISION STRICTE :
- Si Type d'aide = ❌ (PAS mentionné) → OBLIGATOIREMENT type: "questions" pour le demander
- Si Type d'aide = ✅ (mentionné) → type: "responses" pour répondre à la question

⚠️ RÈGLE ABSOLUE CRITIQUE :
- JAMAIS parler d'APL/ALF/ALS dans tes recommandations si le type d'aide n'a PAS été dit
- JAMAIS supposer "passage ALS→ALF" si "ALS" n'a pas été mentionné
- Si tu ne sais pas quel type d'aide → DEMANDE d'abord (questions)

🎯 ÉTAPE 3 - FORMAT DES RECOMMANDATIONS :
MAUVAIS ❌ : "Expliquer la différence ALF/ALS"
BON ✅ : "ALF pour famille (généralement plus élevée) | ALS pour isolé/couple sans enfant"

MAUVAIS ❌ : "Rassurer l'allocataire"
BON ✅ : "Le changement est automatique, aucun risque de perte d'aide pendant la transition"

MAUVAIS ❌ : "Expliquer le basculement"
BON ✅ : "Basculement ALS→ALF au 5ème mois de grossesse (automatique, aucune démarche)"

→ Donne l'INFORMATION CONCRÈTE que l'agent peut dire directement à l'allocataire
→ Utilise des CHIFFRES, DATES, RÈGLES PRÉCISES de la documentation
→ L'agent doit pouvoir LIRE tes recommandations mot pour mot
→ MAX 2 ITEMS (JAMAIS 3 ou plus)

Format JSON STRICT :
{
  "type": "questions" | "responses" | "both",
  "items": ["Info concrète 1 (max 25 mots)", "Info concrète 2 (max 25 mots)"]
}

ATTENTION : Le tableau "items" doit contenir EXACTEMENT 2 éléments maximum.`;

        // Call OpenAI for recommendations (using o4-mini)
        const completion = await openai.chat.completions.create({
            model: 'o4-mini',
            messages: [
                {
                    role: 'user',
                    content: coPilotPrompt
                }
            ]
        });

        // o4-mini peut retourner le contenu dans reasoning ou content
        let responseText = '';
        if (completion.choices[0].message.content) {
            responseText = completion.choices[0].message.content.trim();
        } else if (completion.choices[0].message.reasoning) {
            responseText = completion.choices[0].message.reasoning.trim();
        }
        
        // Parse JSON
        let recommendations;
        try {
            // Clean markdown code blocks
            let cleanedResponse = responseText
                .replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .trim();
            
            // Find JSON object
            const firstBrace = cleanedResponse.indexOf('{');
            const lastBrace = cleanedResponse.lastIndexOf('}');
            
            if (firstBrace !== -1 && lastBrace !== -1) {
                cleanedResponse = cleanedResponse.substring(firstBrace, lastBrace + 1);
            }
            
            // Remove trailing commas
            cleanedResponse = cleanedResponse.replace(/,(\s*[}\]])/g, '$1');
            
            recommendations = JSON.parse(cleanedResponse);
            
            // Ensure max 2 items
            if (recommendations.items && recommendations.items.length > 2) {
                recommendations.items = recommendations.items.slice(0, 2);
            }
            
            console.log(`✅ [Co-Pilot] Recommendations parsed successfully`);
        } catch (parseError) {
            console.error('❌ [Co-Pilot] JSON parse error:', parseError.message);
            // Return fallback recommendations
            recommendations = {
                type: "both",
                items: ["Demander plus de détails sur la situation", "Vérifier les conditions d'éligibilité"]
            };
        }

        return recommendations;

    } catch (error) {
        console.error('❌ [Co-Pilot] Error:', error);
        throw error;
    }
}

/**
 * Generate call summary for phone assistant
 */
async function generateCallSummary(conversation, situation) {
    try {
        console.log(`📝 [Call Summary] Analyzing conversation...`);
        
        // Build conversation text
        const conversationText = conversation
            .map(msg => `${msg.role === 'user' ? 'Allocataire' : 'Assistant'}: ${msg.content}`)
            .join('\n');

        // Build prompt for summary generation
        const summaryPrompt = `Tu es un expert en synthèse d'appels CAF.

📞 CONVERSATION TÉLÉPHONIQUE :
${conversationText}

🎯 SITUATION CHOISIE PAR L'ALLOCATAIRE :
${situation ? `${situation.title} - ${situation.description}` : 'Non spécifiée'}

📝 TA MISSION :
Génère une NOTE DE DOSSIER professionnelle et structurée pour l'agent CAF qui prendra le relais.

FORMAT JSON OBLIGATOIRE :
{
  "identity": "Nom et prénom de l'allocataire (ou 'Non communiquée' si absent)",
  "reason": "Motif de l'appel en 1-2 phrases claires",
  "information_collected": [
    "Info 1 collectée",
    "Info 2 collectée",
    "..."
  ],
  "missing_information": [
    "Info manquante 1",
    "Info manquante 2",
    "..."
  ],
  "recommended_actions": [
    "Action recommandée 1",
    "Action recommandée 2",
    "..."
  ]
}

RÈGLES :
- Sois CONCIS et FACTUEL
- Liste TOUTES les informations collectées
- Identifie ce qui MANQUE pour traiter le dossier
- Propose des actions CONCRÈTES pour l'agent

Génère UNIQUEMENT le JSON, rien d'autre.`;

        // Call OpenAI
        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: 'system',
                    content: 'Tu es un expert en synthèse d\'appels CAF. Génère des notes de dossier structurées en JSON uniquement.'
                },
                {
                    role: 'user',
                    content: summaryPrompt
                }
            ],
            temperature: 0.3,
        });

        let summary;
        try {
            const responseText = completion.choices[0].message.content.trim();
            console.log(`📝 [Call Summary] Raw response:`, responseText.substring(0, 200));
            
            // Extract JSON from response
            let cleanedResponse = responseText;
            if (cleanedResponse.startsWith('```json')) {
                cleanedResponse = cleanedResponse.replace(/```json\n?/g, '').replace(/```\n?$/g, '');
            } else if (cleanedResponse.startsWith('```')) {
                cleanedResponse = cleanedResponse.replace(/```\n?/g, '');
            }
            
            summary = JSON.parse(cleanedResponse);
            console.log(`✅ [Call Summary] Summary parsed successfully`);
        } catch (parseError) {
            console.error('❌ [Call Summary] JSON parse error:', parseError.message);
            // Return fallback summary
            summary = {
                identity: "Non communiquée",
                reason: "Demande concernant les aides au logement",
                information_collected: ["Conversation enregistrée"],
                missing_information: ["Identité complète", "Détails de la situation"],
                recommended_actions: ["Recontacter l'allocataire pour compléter les informations"]
            };
        }

        return summary;

    } catch (error) {
        console.error('❌ [Call Summary] Error:', error);
        throw error;
    }
}

// ====================================================================
// EXPORTS
// ====================================================================

module.exports = {
    loadSimulations,
    getSimulation,
    searchSimulationContext,
    evaluateConversation,
    answerAssistantQuestion,
    generateCoPilotRecommendations,
    generateCallSummary
};

// ====================================================================
// NOTE: The following functions have been REMOVED (obsolete):
// - generateAllocataireResponse() → Gemini Live API now handles this
// - generateAudio() → Gemini Live API includes TTS
// - transcribeAudio() → Gemini Live API includes STT
// All voice chat functionality is now handled by Gemini WebSocket API
// ====================================================================
