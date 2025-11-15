const { Pinecone } = require('@pinecone-database/pinecone');
const OpenAI = require('openai');

// Initialize Pinecone
const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY
});

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

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
 * Search for relevant context in Pinecone for exercise evaluation
 */
async function searchExerciseContext(question, correctAnswer, topK = 5) {
    try {
        // Combine question and correct answer for better context retrieval
        const searchQuery = `${question} ${correctAnswer}`;
        const questionEmbedding = await generateEmbedding(searchQuery);

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
        console.error('⚠️ Pinecone search failed for exercise:', error.message);
        return [];
    }
}

/**
 * Evaluate user's answer for QCM (Multiple Choice Questions)
 * Simplified: exact matching + detailed feedback with calculations
 */
async function evaluateAnswer(exerciseData, userAnswer, history = []) {
    try {
        const { question, correct_answer, detailed_explanation, calculation_details, options } = exerciseData;

        // QCM: Simple exact matching
        const isCorrect = userAnswer.trim().toUpperCase() === correct_answer.trim().toUpperCase();

        console.log(`📝 QCM Évaluation: ${userAnswer} ${isCorrect ? '✅ correct' : '❌ incorrect'} (attendu: ${correct_answer})`);

        // Get RAG context for sources
        const contexts = await searchExerciseContext(question, correct_answer);

        // Find the selected and correct options text
        const selectedOptionObj = options?.find(opt => opt.id.toUpperCase() === userAnswer.trim().toUpperCase());
        const correctOptionObj = options?.find(opt => opt.id.toUpperCase() === correct_answer.trim().toUpperCase());

        // Build concise feedback (detailed explanation will be shown separately in UI)
        let feedback = '';
        if (isCorrect) {
            feedback = `🎉 Parfait ! Vous maîtrisez ce concept.`;
        } else {
            feedback = `Cette réponse n'est pas correcte.\n\n`;
            feedback += `Vous avez choisi : **${selectedOptionObj?.text || userAnswer}**\n\n`;
            feedback += `La bonne réponse était : **${correctOptionObj?.text || correct_answer}**`;
        }

        // Return direct QCM evaluation result
        return {
            is_correct: isCorrect,
            score: isCorrect ? 100 : 0,
            feedback: feedback,
            sources: contexts.slice(0, 3).map(ctx => ({
                module: ctx.module,
                section: ctx.section,
                score: ctx.score
            }))
        };

    } catch (error) {
        console.error('Error evaluating answer:', error);
        throw error;
    }
}

// OLD COMPLEX EVALUATION CODE BELOW (kept for reference but not used)
/*
        const evaluationPrompt = `Tu es un CORRECTEUR CAF EXTRÊMEMENT STRICT et RIGOUREUX. Ta mission est d'évaluer avec une PRÉCISION ABSOLUE.

═══════════════════════════════════════════════════════════
📚 CONTEXTE DOCUMENTAIRE OFFICIEL (SOURCE DE VÉRITÉ):
═══════════════════════════════════════════════════════════
${contextText}

═══════════════════════════════════════════════════════════
📝 DONNÉES DE L'EXERCICE:
═══════════════════════════════════════════════════════════
QUESTION POSÉE:
${question}

RÉPONSE CORRECTE ATTENDUE (RÉFÉRENCE ABSOLUE):
${correct_answer}

EXPLICATION OFFICIELLE COMPLÈTE:
${detailed_explanation}

RÉPONSE FOURNIE PAR L'ÉTUDIANT:
"${userAnswer}"

═══════════════════════════════════════════════════════════
⚠️ RÈGLES D'ÉVALUATION ULTRA STRICTES:
═══════════════════════════════════════════════════════════

1️⃣ COMPARAISON EXACTE DE LA RÉPONSE:
   - Compare la réponse de l'étudiant avec la RÉPONSE CORRECTE ATTENDUE
   - Vérifie que le CONCEPT PRINCIPAL est identique (pas approximatif)
   - Pour APL/ALF/ALS : CE SONT 3 AIDES COMPLÈTEMENT DIFFÉRENTES
     * APL ≠ ALF ≠ ALS (AUCUNE confusion acceptée)
     * Si attendu = "ALS" et réponse = "APL" → FAUX (score 0-20)
     * Si attendu = "APL" et réponse = "ALF" → FAUX (score 0-20)
     * Si attendu = "ALF" et réponse = "ALS" → FAUX (score 0-20)

2️⃣ VÉRIFICATION FACTUELLE CONTRE LE CONTEXTE RAG:
   - Consulte le CONTEXTE DOCUMENTAIRE OFFICIEL ci-dessus
   - Chaque affirmation de l'étudiant DOIT être validée par le contexte
   - Si l'étudiant dit quelque chose non présent dans le contexte → INCORRECT
   - Si l'étudiant contredit le contexte → INCORRECT (score 0-30)

3️⃣ CRITÈRES DE CONFORMITÉ (TOUS obligatoires pour score > 80):
   ✓ Type d'aide mentionné = Réponse correcte attendue
   ✓ Justification alignée avec l'explication officielle
   ✓ Aucune contradiction avec le contexte documentaire
   ✓ Terminologie précise (pas de flou, pas d'approximation)
   ✓ Logique correcte (si justification fournie)

4️⃣ VARIATIONS ACCEPTABLES (SEULEMENT):
   Pour APL: "APL", "Aide Personnalisée au Logement", "l'APL", "aide personnalisée"
   Pour ALF: "ALF", "Allocation de Logement Familiale", "l'ALF", "allocation familiale"
   Pour ALS: "ALS", "Allocation de Logement Sociale", "l'ALS", "allocation sociale"
   ⚠️ Toute autre variation = vérifier strictement dans le contexte

5️⃣ GRILLE DE NOTATION STRICTE:
   100%: Réponse PARFAITE (type exact + justification complète et exacte)
   90-99%: Réponse correcte + justification bonne mais pourrait être plus précise
   70-89%: Type correct + justification partielle ou imprécise
   50-69%: Type correct mais justification manquante ou incorrecte
   30-49%: Type correct mais erreurs factuelles dans la justification
   0-29%: Type d'aide INCORRECT ou erreur factuelle majeure

6️⃣ CAS AUTOMATIQUEMENT INCORRECTS (score ≤ 30):
   ❌ Confusion APL/ALF/ALS
   ❌ Contradiction directe avec le contexte documentaire
   ❌ Invention de faits non présents dans le cours
   ❌ Erreur sur les critères d'éligibilité
   ❌ Mauvaise compréhension des concepts de base

═══════════════════════════════════════════════════════════
🎯 PROCESSUS D'ÉVALUATION (SUIS CET ORDRE):
═══════════════════════════════════════════════════════════

ÉTAPE 1: Compare le TYPE d'aide
- Réponse attendue: ${correct_answer}
- Réponse étudiant: ${userAnswer}
- Est-ce identique ? OUI/NON

ÉTAPE 2: Vérifie dans le CONTEXTE DOCUMENTAIRE
- Les affirmations de l'étudiant sont-elles validées par le contexte ?
- Y a-t-il des contradictions ?

ÉTAPE 3: Compare avec l'EXPLICATION OFFICIELLE
- La logique de l'étudiant suit-elle l'explication officielle ?
- Manque-t-il des éléments essentiels ?

ÉTAPE 4: Attribue le score selon la grille stricte

═══════════════════════════════════════════════════════════
📤 FORMAT DE RÉPONSE OBLIGATOIRE:
═══════════════════════════════════════════════════════════

Réponds UNIQUEMENT avec un JSON valide (sans markdown, sans \`\`\`json):
{
  "is_correct": true si score >= 90, false sinon,
  "score": 0-100 (nombre entier),
  "feedback": "Explication DÉTAILLÉE et PÉDAGOGIQUE de l'évaluation (2-4 phrases). Si incorrect, explique PRÉCISÉMENT pourquoi en citant le contexte documentaire. Si correct, félicite et résume les points clés.",
  "sources_used": ["liste des modules utilisés"]
}

⚠️ RAPPEL FINAL: Sois IMPITOYABLE sur la précision mais PÉDAGOGIQUE dans le feedback.
NOTE: L'étudiant pourra poser des questions de suivi dans un chat libre après le feedback.`;

        // Call OpenAI for evaluation with STRICT parameters
        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: 'system',
                    content: 'Tu es un CORRECTEUR STRICT et RIGOUREUX. Suis EXACTEMENT les instructions. Réponds UNIQUEMENT avec du JSON valide, sans markdown, sans commentaire supplémentaire.'
                },
                {
                    role: 'user',
                    content: evaluationPrompt
                }
            ],
            temperature: 0.1, // TRÈS LOW temperature pour évaluation ultra-consistante et stricte
            max_tokens: 600 // Plus de tokens pour feedback détaillé
        });

        const responseText = completion.choices[0].message.content.trim();

        // Parse JSON response
        let evaluation;
        try {
            // Remove markdown code blocks if present
            const cleanedResponse = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
            evaluation = JSON.parse(cleanedResponse);
        } catch (parseError) {
            console.error('Failed to parse LLM response:', responseText);
            throw new Error('Invalid JSON response from LLM');
        }

        return {
            is_correct: evaluation.is_correct,
            score: evaluation.score,
            feedback: evaluation.feedback,
            follow_up_question: evaluation.follow_up_question || null,
            sources: contexts.map(ctx => ({
                module: ctx.module,
                section: ctx.section,
                score: ctx.score
            })),
            sources_used: evaluation.sources_used || []
        };

*/

/**
 * Generate a hint for an exercise using RAG context
 */
async function generateHint(exerciseData, attemptNumber = 1) {
    try {
        const { question, hints } = exerciseData;

        // If we have predefined hints, use them first
        if (hints && hints.length > 0 && attemptNumber <= hints.length) {
            return {
                hint: hints[attemptNumber - 1],
                type: 'predefined'
            };
        }

        // Otherwise, generate a hint using RAG context
        const contexts = await searchExerciseContext(question, exerciseData.correct_answer, 2);

        const contextText = contexts
            .map((ctx) => ctx.text)
            .join('\n\n');

        const hintPrompt = `Génère un indice pédagogique (sans donner la réponse) pour cette question:

Question: ${question}

Contexte: ${contextText}

Indice (1 phrase):`;

        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: 'Tu es un tuteur pédagogue. Donne un indice subtil sans révéler la réponse.' },
                { role: 'user', content: hintPrompt }
            ],
            temperature: 0.7,
            max_tokens: 100
        });

        return {
            hint: completion.choices[0].message.content.trim(),
            type: 'generated'
        };

    } catch (error) {
        console.error('Error generating hint:', error);
        return {
            hint: "Relisez attentivement la question et pensez aux critères principaux.",
            type: 'fallback'
        };
    }
}

/**
 * Provide pedagogical clarification without giving the answer
 */
async function provideClarification(exerciseData, userQuestion, conversationHistory = [], questionCount = 0) {
    try {
        const { question, correct_answer, detailed_explanation } = exerciseData;

        // Get relevant context from RAG
        const contexts = await searchExerciseContext(question + " " + userQuestion, correct_answer);

        console.log(`💬 Clarification demandée pour: "${userQuestion}"`);

        // Build context string
        const contextText = contexts
            .map((ctx, i) => `[Context ${i + 1} - ${ctx.module}]\n${ctx.text}`)
            .join('\n\n');

        // Build conversation history string
        const historyText = conversationHistory
            .map(msg => `${msg.role === 'user' ? 'ÉTUDIANT' : 'TUTEUR'}: ${msg.content}`)
            .join('\n');

        // Determine if we should suggest answering
        const shouldSuggestAnswering = questionCount >= 3 && (questionCount % 3 === 0);

        // Build clarification prompt
        const clarificationPrompt = `Tu es un TUTEUR CAF bienveillant et pédagogue.

QUESTION DE L'EXERCICE:
${question}

CONTEXTE DOCUMENTAIRE OFFICIEL:
${contextText}

${historyText ? `HISTORIQUE DE LA CONVERSATION:\n${historyText}\n` : ''}

L'ÉTUDIANT DEMANDE MAINTENANT:
"${userQuestion}"

═══════════════════════════════════════════════════════════
⚠️ RÈGLES STRICTES POUR LES CLARIFICATIONS:
═══════════════════════════════════════════════════════════

1. EXPLIQUE les concepts, termes techniques, règles demandés
2. BASE-TOI UNIQUEMENT sur le CONTEXTE DOCUMENTAIRE ci-dessus
3. NE RÉVÈLE JAMAIS la réponse finale à la question de l'exercice
4. DONNE des indices subtils, des pistes de réflexion, mais PAS la solution
5. SOIS encourageant et pédagogique
6. RÉPONDS en 2-4 phrases maximum (sois concis)
7. Si la question de l'étudiant est hors sujet ou n'a pas de rapport avec l'exercice, redirige-le vers le sujet

${shouldSuggestAnswering ? '\n8. IMPORTANT: À la fin de ta réponse, ajoute sur une nouvelle ligne: "💡 Tu as posé plusieurs bonnes questions ! Tu sembles avoir compris les concepts clés. Prêt à répondre ?"' : ''}

EXEMPLE DE BON COMPORTEMENT:
Question: "C'est quoi la zone 1 ?"
✅ BON: "La zone 1 correspond aux grandes agglomérations comme Paris, Lyon, Marseille. C'est une classification géographique qui impacte les plafonds de loyer."
❌ MAUVAIS: "La réponse à l'exercice est que Marc aura une réduction de l'aide..."

RÉPONDS MAINTENANT à la question de l'étudiant:`;

        // Call OpenAI for clarification
        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: 'system',
                    content: 'Tu es un tuteur pédagogue CAF. Tu aides à comprendre les concepts SANS donner la réponse finale. Sois concis et encourageant.'
                },
                {
                    role: 'user',
                    content: clarificationPrompt
                }
            ],
            temperature: 0.7, // Plus conversationnel que l'évaluation
            max_tokens: 300
        });

        const clarification = completion.choices[0].message.content.trim();

        return {
            clarification,
            sources: contexts.map(ctx => ({
                module: ctx.module,
                section: ctx.section,
                score: ctx.score
            })),
            shouldSuggestAnswering
        };

    } catch (error) {
        console.error('Error providing clarification:', error);
        throw error;
    }
}

/**
 * Provide clarification AFTER answer submission (post-feedback discussion)
 * This can be more open since the answer has already been revealed
 */
async function provideFeedbackClarification(exerciseData, userQuestion, evaluation, conversationHistory = []) {
    try {
        const { question, correct_answer, detailed_explanation } = exerciseData;

        // Get relevant context from RAG
        const contexts = await searchExerciseContext(question + " " + userQuestion + " " + correct_answer, correct_answer);

        console.log(`💬 Discussion post-feedback pour: "${userQuestion}"`);

        // Build context string
        const contextText = contexts
            .map((ctx, i) => `[Context ${i + 1} - ${ctx.module}]\n${ctx.text}`)
            .join('\n\n');

        // Build conversation history string
        const historyText = conversationHistory
            .map(msg => `${msg.role === 'user' ? 'ÉTUDIANT' : 'TUTEUR'}: ${msg.content}`)
            .join('\n');

        // Build feedback clarification prompt
        const feedbackPrompt = `Tu es un TUTEUR CAF bienveillant et pédagogue.

CONTEXTE DE L'EXERCICE:
Question: ${question}
Réponse correcte: ${correct_answer}
Explication: ${detailed_explanation}

ÉVALUATION DE L'ÉTUDIANT:
- Réponse correcte: ${evaluation.is_correct ? 'OUI ✅' : 'NON ❌'}
- Feedback donné: ${evaluation.feedback}

CONTEXTE DOCUMENTAIRE OFFICIEL:
${contextText}

${historyText ? `HISTORIQUE DE LA CONVERSATION POST-FEEDBACK:\n${historyText}\n` : ''}

L'ÉTUDIANT DEMANDE MAINTENANT:
"${userQuestion}"

═══════════════════════════════════════════════════════════
⚠️ RÈGLES POUR LA DISCUSSION POST-FEEDBACK:
═══════════════════════════════════════════════════════════

1. TU PEUX MAINTENANT parler ouvertement de la réponse correcte (elle a déjà été révélée)
2. APPROFONDIS les concepts selon la demande de l'étudiant
3. DONNE des exemples concrets si demandé
4. CLARIFIE les points confus ou complexes
5. ILLUSTRE avec des cas pratiques
6. RENTRE dans les détails techniques si nécessaire
7. BASE-TOI sur le CONTEXTE DOCUMENTAIRE OFFICIEL
8. SOIS pédagogique et encourageant
9. RÉPONDS en 3-6 phrases selon la complexité de la question

EXEMPLES DE BON COMPORTEMENT:

Question: "Peux-tu me donner un exemple concret de dégressivité ?"
✅ BON: "Bien sûr ! Prenons Marc en zone 1 qui paie 1 150 € (entre P2 de 1 121,01 € et P3 de 1 318,84 €). Son aide sera réduite progressivement : pour chaque euro de loyer au-dessus de P2, son aide diminue de 0,75 €. Donc : 1 150 - 1 121,01 = 28,99 € au-dessus, soit une réduction de 21,74 € sur son aide."

Question: "Quelle est la différence entre APL et ALF ?"
✅ BON: "L'APL s'applique aux logements conventionnés (avec accord entre le propriétaire et l'État), quelle que soit la situation familiale. L'ALF concerne les logements NON conventionnés mais nécessite une composition familiale spécifique : couple marié/pacsé depuis moins de 5 ans, ou enfants/personnes à charge. Si le logement est non conventionné ET que la personne n'a pas de charge familiale, c'est l'ALS qui s'applique."

Question: "Pourquoi cette règle existe ?"
✅ BON: "Cette règle vise à réguler les aides en fonction du marché locatif. Les seuils P2 et P3 évitent que l'aide encourage des loyers trop élevés. Au-delà de P2, l'aide diminue progressivement (dégressivité) pour inciter à chercher des logements au loyer raisonnable, tout en continuant à aider jusqu'au plafond P3."

RÉPONDS MAINTENANT à la question de l'étudiant:`;

        // Call OpenAI for feedback clarification
        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: 'system',
                    content: 'Tu es un tuteur pédagogue CAF expert. L\'étudiant a déjà reçu son évaluation, tu peux maintenant approfondir librement. Sois détaillé, pédagogique et utilise des exemples concrets.'
                },
                {
                    role: 'user',
                    content: feedbackPrompt
                }
            ],
            temperature: 0.7,
            max_tokens: 500 // Plus de tokens pour des explications détaillées
        });

        const clarification = completion.choices[0].message.content.trim();

        return {
            clarification,
            sources: contexts.map(ctx => ({
                module: ctx.module,
                section: ctx.section,
                score: ctx.score
            }))
        };

    } catch (error) {
        console.error('Error providing feedback clarification:', error);
        throw error;
    }
}

module.exports = {
    evaluateAnswer,
    generateHint,
    searchExerciseContext,
    provideClarification,
    provideFeedbackClarification
};

