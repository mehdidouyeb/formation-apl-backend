const { Pinecone } = require('@pinecone-database/pinecone');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');

// Initialize Pinecone
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY
});

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Initialize Gemini (for generation only)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const INDEX_NAME = process.env.PINECONE_INDEX_NAME;
const NAMESPACE = process.env.PINECONE_NAMESPACE;

/**
 * Generate embedding for a text using OpenAI
 */
async function generateEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

/**
 * Search for relevant context in Pinecone
 */
async function searchContext(question, topK = 5) {
  try {
    // Generate embedding for the question
    const questionEmbedding = await generateEmbedding(question);

    // Search in Pinecone
    const index = pinecone.index(INDEX_NAME);
    const queryResponse = await index.namespace(NAMESPACE).query({
      vector: questionEmbedding,
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

    return contexts;
  } catch (error) {
    console.error('⚠️ Pinecone search failed, using fallback:', error.message);
    // Return empty context - will trigger fallback response
    return [];
  }
}

/**
 * PHASE 1: Generate structured reasoning chain (Chain of Thought)
 * This helps prevent hallucinations by forcing step-by-step analysis
 */
async function generateReasoningChain(question, contexts) {
  try {
    const contextText = contexts
      .map((ctx, i) => `[Context ${i + 1}]\n${ctx.text}`)
      .join('\n\n');

    const reasoningPrompt = `Tu es un analyste CAF ULTRA-RIGOUREUX. Analyse cette question avec le contexte fourni.

⚠️ RÈGLES ABSOLUES NON-NÉGOCIABLES :
1. Tu DOIS chercher des citations EXACTES dans le contexte
2. Si un terme de la question N'EST PAS EXPLICITEMENT dans le contexte → "ambiguities"
3. INTERDICTION de généraliser (ex: "ascendants/descendants" ≠ "frères/sœurs")
4. INTERDICTION d'utiliser tes connaissances générales
5. Si le contexte ne couvre PAS EXACTEMENT la question → coverage = "none" ou "partial"

CONTEXTE DOCUMENTAIRE :
${contextText}

QUESTION : ${question}

ANALYSE ÉTAPE PAR ÉTAPE (réponds en JSON valide) :

1️⃣ MOTS-CLÉS : Identifie les termes EXACTS de la question
2️⃣ RECHERCHE : Trouve les citations TEXTUELLES du contexte (si rien ne correspond EXACTEMENT, mettre [])
3️⃣ VÉRIFICATION : Les termes de la question sont-ils TOUS dans les citations ?
   - Si NON → ajoute aux ambiguïtés
4️⃣ COUVERTURE : 
   - "complete" = TOUS les termes de la question sont dans le contexte
   - "partial" = SEULEMENT CERTAINS termes sont dans le contexte
   - "none" = AUCUN terme pertinent dans le contexte
5️⃣ CONFIANCE :
   - "high" = Le contexte répond EXACTEMENT à la question
   - "medium" = Le contexte répond partiellement
   - "low" = Le contexte contient des infos liées mais pas précises
   - "none" = Le contexte ne contient pas l'information

EXEMPLE CRITIQUE :
Question : "Mon frère peut-il me louer ?"
Contexte : "Location entre ascendants et descendants interdite"
→ MAUVAIS : coverage="complete" (frère ≠ ascendant/descendant)
→ CORRECT : coverage="none", ambiguities=["frère n'est pas mentionné"], confidence="none"

Réponds UNIQUEMENT avec ce JSON (pas d'autre texte) :
{
  "keywords": ["terme1", "terme2"],
  "relevant_quotes": ["citation exacte 1"],
  "coverage": "complete|partial|none",
  "ambiguities": ["terme non trouvé ou ambigu"],
  "confidence": "high|medium|low|none"
}`;

    const reasoningResponse = await openai.chat.completions.create({
      model: 'gpt-4', // Utiliser GPT-4 pour plus de rigueur dans le raisonnement
      messages: [
        {
          role: 'system',
          content: `Tu es un robot d'analyse CAF ULTRA-STRICT. 

RÈGLES :
1. Tu cherches des correspondances EXACTES mot-à-mot
2. Tu NE PEUX PAS faire de déductions ou d'inférences
3. Tu NE PEUX PAS utiliser de synonymes ou généralisations
4. Si le mot EXACT n'est pas dans le contexte → ambiguïté
5. Réponds UNIQUEMENT en JSON valide`
        },
        {
          role: 'user',
          content: reasoningPrompt
        }
      ],
      temperature: 0, // Minimum absolu pour rigueur maximale
      max_tokens: 500
    });

    const reasoningText = reasoningResponse.choices[0].message.content.trim();

    // Parse JSON (avec gestion d'erreur si le LLM ne respecte pas le format)
    let reasoning;
    try {
      // Extraire le JSON si le LLM a ajouté du texte avant/après
      const jsonMatch = reasoningText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        reasoning = JSON.parse(jsonMatch[0]);
      } else {
        reasoning = JSON.parse(reasoningText);
      }
    } catch (parseError) {
      console.warn('⚠️ Erreur parsing JSON reasoning, fallback:', parseError.message);
      // Fallback si JSON invalide
      reasoning = {
        keywords: [],
        relevant_quotes: [],
        coverage: 'none',
        ambiguities: ['Erreur d\'analyse'],
        confidence: 'none'
      };
    }

    console.log('🧠 Reasoning Chain:', JSON.stringify(reasoning, null, 2));
    return reasoning;

  } catch (error) {
    console.error('❌ Error in reasoning chain:', error);
    // Fallback
    return {
      keywords: [],
      relevant_quotes: [],
      coverage: 'none',
      ambiguities: ['Erreur technique'],
      confidence: 'none'
    };
  }
}

/**
 * Generate visible "thinking" explanation (à la Gemini Pro 2.5)
 * Uses LLM to generate semantic analysis for ANY ambiguity (not hardcoded)
 */
async function generateThinkingExplanation(question, reasoning, contexts) {
  const thinkingParts = [];

  // Partie statique (toujours affichée)
  if (reasoning.keywords && reasoning.keywords.length > 0) {
    thinkingParts.push(`**1️⃣ Termes clés identifiés :** ${reasoning.keywords.map(k => `"${k}"`).join(', ')}`);
  }

  if (reasoning.relevant_quotes && reasoning.relevant_quotes.length > 0) {
    thinkingParts.push(`\n**2️⃣ Recherche dans la documentation :**\nJ'ai trouvé : "${reasoning.relevant_quotes[0].substring(0, 120)}..."`);
  } else {
    thinkingParts.push(`\n**2️⃣ Recherche dans la documentation :**\nAucune information exacte trouvée pour ces termes.`);
  }

  if (reasoning.ambiguities && reasoning.ambiguities.length > 0) {
    thinkingParts.push(`\n**3️⃣ Points problématiques détectés :**`);
    reasoning.ambiguities.forEach(amb => {
      thinkingParts.push(`   ⚠️ ${amb}`);
    });
  }

  // Partie dynamique : Analyse sémantique GÉNÉRIQUE par le LLM
  if (reasoning.ambiguities && reasoning.ambiguities.length > 0 && reasoning.relevant_quotes.length > 0) {
    try {
      const semanticAnalysis = await generateSemanticAnalysis(
        question,
        reasoning.relevant_quotes,
        reasoning.ambiguities,
        contexts
      );

      if (semanticAnalysis) {
        thinkingParts.push(`\n**4️⃣ Analyse sémantique :**\n${semanticAnalysis}`);
      }
    } catch (error) {
      console.warn('⚠️ Erreur génération analyse sémantique:', error.message);
      // Continuer sans l'analyse sémantique
    }
  }

  // Couverture
  thinkingParts.push(`\n**5️⃣ Évaluation de la couverture :**\n   Couverture : ${reasoning.coverage} | Confiance : ${reasoning.confidence}`);

  return thinkingParts.join('\n');
}

/**
 * Generate semantic analysis for ambiguous terms using LLM
 * This is GENERIC and works for ANY ambiguity, not just "frère"
 */
async function generateSemanticAnalysis(question, quotes, ambiguities, contexts) {
  const contextText = contexts
    .map((ctx, i) => `[Context ${i + 1}]\n${ctx.text}`)
    .join('\n\n');

  const analysisPrompt = `Tu es un expert en analyse sémantique CAF.

QUESTION ORIGINALE : ${question}

TERMES TROUVÉS DANS LA DOCUMENTATION :
${quotes.map(q => `- "${q}"`).join('\n')}

TERMES MANQUANTS/AMBIGUS :
${ambiguities.map(a => `- ${a}`).join('\n')}

CONTEXTE COMPLET :
${contextText}

TA MISSION :
Explique en 3-5 points POURQUOI les termes manquants NE SONT PAS couverts par les termes trouvés.
Utilise une analyse sémantique pour montrer la différence.

FORMAT DE RÉPONSE (points concis avec tirets) :
   - [Explication du terme trouvé dans la doc]
   - [Définition précise de ce qu'il couvre]
   - [Analyse du terme manquant]
   - ❌ [Pourquoi ce n'est pas la même chose]
   - → [Conclusion claire]

EXEMPLE pour frère vs ascendants/descendants :
   - La documentation mentionne "ascendants et descendants"
   - Ascendants = parents, grands-parents | Descendants = enfants, petits-enfants
   - Le terme manquant "frère" désigne un membre collatéral de la famille
   - ❌ Un frère n'est NI ascendant NI descendant (lien de côté, pas direct)
   - → La règle documentée ne couvre PAS ce cas

Maintenant, fais la même analyse pour les termes actuels (sois concis, 5 lignes max) :`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'Tu es un expert en analyse sémantique. Réponds de manière concise et structurée avec des tirets.'
        },
        {
          role: 'user',
          content: analysisPrompt
        }
      ],
      temperature: 0.3,
      max_tokens: 300
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('Erreur analyse sémantique:', error);
    return null;
  }
}

/**
 * PHASE 2: Generate final answer based on reasoning chain
 * This ensures the answer is grounded in the reasoning
 */
async function generateAnswerWithCoT(question, contexts, reasoning, history = []) {
  try {
    const contextText = contexts
      .map((ctx, i) => `[Context ${i + 1}]\n${ctx.text}`)
      .join('\n\n');

    // Vérifications de sécurité basées sur le raisonnement
    if (reasoning.confidence === 'none' || reasoning.coverage === 'none') {
      return {
        text: "❌ Cette information n'est pas disponible dans la documentation officielle CAF dont je dispose.\n\n💡 Je vous recommande de :\n- Reformuler votre question\n- Contacter directement un conseiller CAF\n- Consulter le site officiel caf.fr",
        sources: [],
        confidence: 'none',
        reasoning: reasoning,
        thinking_visible: false
      };
    }

    if (reasoning.confidence === 'low' || reasoning.coverage === 'partial') {
      // CRÉER UN "THINKING" VISIBLE pour montrer le raisonnement (GÉNÉRIQUE, pas hardcodé)
      const thinkingProcess = await generateThinkingExplanation(question, reasoning, contexts);

      const partialInfo = reasoning.relevant_quotes.length > 0
        ? `\n\n📖 Information trouvée dans la documentation : "${reasoning.relevant_quotes[0].substring(0, 150)}..."`
        : '';

      return {
        text: `🤔 **Analyse de votre question :**\n\n${thinkingProcess}\n\n⚠️ **Conclusion : Information INCOMPLÈTE**${partialInfo}\n\n💡 Pour votre cas spécifique, je vous conseille vivement de contacter la CAF pour obtenir une réponse précise et définitive.`,
        sources: contexts.map(ctx => ({
          module: ctx.module,
          section: ctx.section,
          score: ctx.score
        })),
        confidence: reasoning.confidence,
        reasoning: reasoning,
        thinking_visible: true
      };
    }

    // Si confiance suffisante, générer une réponse complète
    const finalPrompt = `CONTEXTE DOCUMENTAIRE :
${contextText}

ANALYSE PRÉALABLE :
- Citations pertinentes trouvées : ${reasoning.relevant_quotes.length}
- Couverture de la question : ${reasoning.coverage}
- Niveau de confiance : ${reasoning.confidence}
${reasoning.ambiguities.length > 0 ? `- Points ambigus : ${reasoning.ambiguities.join(', ')}` : ''}

QUESTION : ${question}

GÉNÈRE UNE RÉPONSE STRUCTURÉE :

FORMAT OBLIGATOIRE :
1. 📖 Citation : Cite TEXTUELLEMENT une partie du contexte entre guillemets
2. 💡 Explication : Explique clairement basé UNIQUEMENT sur cette citation
3. ${reasoning.ambiguities.length > 0 ? '⚠️ Note : Précise les limitations ou cas non couverts' : '✅ Information complète'}

RÈGLES ABSOLUES :
- Ne JAMAIS inventer d'information non présente dans le contexte
- Ne JAMAIS généraliser au-delà de ce qui est écrit
- Si un terme technique n'est pas défini dans le contexte, le signaler
- Rester factuel et précis`;

    const messages = [
      {
        role: 'system',
        content: 'Tu es un expert CAF. Tu réponds de manière claire et précise en te basant STRICTEMENT sur le contexte fourni.'
      }
    ];

    // Add conversation history
    history.forEach(msg => {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      });
    });

    // Add final prompt
    messages.push({
      role: 'user',
      content: finalPrompt
    });

    const finalResponse = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: messages,
      temperature: 0.5, // Modéré pour équilibre précision/fluidité
      max_tokens: 600
    });

    const answer = finalResponse.choices[0].message.content;

    return {
      text: answer,
      sources: contexts.map(ctx => ({
        module: ctx.module,
        section: ctx.section,
        score: ctx.score
      })),
      confidence: reasoning.confidence,
      reasoning: reasoning // Inclus pour debug et amélioration continue
    };

  } catch (error) {
    console.error('❌ Error generating final answer:', error);
    throw error;
  }
}

/**
 * Generate answer using OpenAI o4-mini (Native Reasoning Model)
 * o4-mini has built-in Chain of Thought reasoning (next-gen after o1-mini)
 * Single-call approach - optimal balance of speed, cost, and quality
 * Performance: ~13s latency, 200k TPM limit, native reasoning
 */
async function generateAnswer(question, contexts, history = []) {
  try {
    console.log('🧠 Using o4-mini (native reasoning model)...');

    const contextText = contexts
      .map((ctx, i) => `[Context ${i + 1} - ${ctx.module}]\n${ctx.text}`)
      .join('\n\n');

    // Construct the prompt for o4-mini
    // Note: o-series models don't support system messages, only user/assistant
    // o4-mini has native reasoning, so we can be more direct
    const userPrompt = `Tu es un formateur CAF expérimenté qui répond aux questions des agents en formation.

CONTEXTE DOCUMENTAIRE :
${contextText}

QUESTION DE L'APPRENANT : ${question}

⚠️ RÈGLES ABSOLUES :
1. Base-toi UNIQUEMENT sur le contexte fourni (pas de connaissances générales)
2. Cherche des correspondances EXACTES dans le contexte
3. INTERDIT de généraliser 
4. Si un terme de la question n'est PAS explicitement dans le contexte → DIS-LE CLAIREMENT
5. Réponds de façon NATURELLE et PÉDAGOGIQUE (comme un formateur qui parle à un apprenant)

📋 COMMENT RÉPONDRE :

✅ SI L'INFORMATION EST DANS LE CONTEXTE :
Réponds naturellement en citant le texte. Exemple :
"D'après la documentation, [citation exacte]. Cela signifie que [explication claire]."

⚠️ SI L'INFORMATION EST INCOMPLÈTE OU AMBIGUË :
Explique naturellement le problème, PUIS donne un raisonnement logique basé sur ce qui est dans le contexte. Exemple :
"Excellente question ! J'ai cherché dans la documentation et j'ai trouvé que [ce qui est dit exactement]. 
Cependant, ce passage parle uniquement de [ce qui est couvert]. 
Votre question concerne [terme spécifique], ce qui n'est pas explicitement mentionné.

💡 D'après mon raisonnement basé sur la documentation :
[Explique ton raisonnement logique à partir des informations disponibles]
Je suppose donc que [ta supposition raisonnée], MAIS ce n'est qu'une hypothèse.

⚠️ Pour une réponse officielle et certaine, je vous recommande de contacter directement la CAF."

❌ SI AUCUNE INFORMATION PERTINENTE :
"Je n'ai pas trouvé d'information sur ce sujet dans la documentation de formation. Je vous conseille de contacter la CAF directement."

IMPORTANT : Réponds comme un formateur bienveillant, pas comme un robot. Sois pédagogique et naturel.`;

    // Build messages array (o-series only supports user/assistant, no system)
    const messages = [];

    // Add conversation history if present
    history.forEach(msg => {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      });
    });

    // Add current question with context
    messages.push({
      role: 'user',
      content: userPrompt
    });

    // Call o4-mini (native reasoning model - next-gen after o1)
    console.log('⏳ Calling o4-mini (native reasoning model)...');

    const completion = await openai.chat.completions.create({
      model: 'o4-mini',  // Native reasoning model - optimal for semantic analysis
      messages: messages,
      // Note: o-series models don't support temperature, max_tokens, or top_p parameters
      // They use internal reasoning and automatically determine response length
    });

    const answer = completion.choices[0].message.content;

    console.log('✅ o4-mini response received');

    // Analyze the response to determine confidence
    const confidence = analyzeConfidence(answer);

    // Calculate average context score
    const avgScore = contexts.length > 0
      ? contexts.reduce((sum, ctx) => sum + ctx.score, 0) / contexts.length
      : 0;

    return {
      text: answer,
      sources: contexts.map(ctx => ({
        module: ctx.module,
        section: ctx.section,
        score: ctx.score
      })),
      confidence: confidence,
      model: 'o4-mini',
      thinking_visible: true, // o4-mini includes native reasoning in response
      context_score: avgScore
    };

  } catch (error) {
    console.error('❌ Error with o4-mini:', error);

    // Fallback to safe response
    return {
      text: "Je rencontre une difficulté technique pour analyser cette question. Veuillez reformuler ou contacter la CAF.",
      sources: [],
      confidence: 'none',
      error: true
    };
  }
}

/**
 * Analyze the confidence level from o4-mini response
 * Based on keywords and natural language patterns in the response
 */
function analyzeConfidence(responseText) {
  const lowerText = responseText.toLowerCase();

  // High confidence indicators (natural language)
  if (lowerText.includes('d\'après la documentation') ||
    lowerText.includes('selon le texte') ||
    lowerText.includes('la réglementation indique') ||
    lowerText.includes('✅')) {
    return 'high';
  }

  // No info indicators
  if (lowerText.includes('je n\'ai pas trouvé') ||
    lowerText.includes('aucune information') ||
    lowerText.includes('pas dans la documentation')) {
    return 'none';
  }

  // Incomplete/uncertain info indicators (natural language)
  if (lowerText.includes('je vous recommande de contacter') ||
    lowerText.includes('contactez la caf') ||
    lowerText.includes('n\'est pas explicitement mentionné') ||
    lowerText.includes('pas explicitement') ||
    lowerText.includes('je ne peux pas vous donner une réponse certaine') ||
    lowerText.includes('incomplète')) {
    return 'low';
  }

  // Default to medium
  return 'medium';
}

/**
 * Main RAG function
 */
async function ask(question, history = []) {
  try {
    console.log(`🔍 Recherche de contexte pour: "${question}"`);

    // Search for relevant context
    const contexts = await searchContext(question);

    console.log(`📚 ${contexts.length} contextes trouvés`);
    console.log(`Scores: ${contexts.map(c => c.score.toFixed(3)).join(', ')}`);

    // Generate answer
    const answer = await generateAnswer(question, contexts, history);

    return answer;

  } catch (error) {
    console.error('❌ Erreur RAG:', error);

    // Fallback response
    return {
      text: "Je suis désolé, je rencontre une difficulté technique pour répondre à votre question. Veuillez réessayer ou reformuler votre question.",
      sources: [],
      confidence: 'low',
      error: true
    };
  }
}

module.exports = {
  ask,
  generateEmbedding,
  searchContext
};

