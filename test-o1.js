/**
 * Test script for o1-preview native reasoning
 */

require('dotenv').config();
const ragService = require('./ragService');

const testQuestions = [
  {
    title: 'Test 1: Question avec information complète (APL conventionnement)',
    question: 'Qu\'est-ce qu\'un logement conventionné pour l\'APL ?'
  },
  {
    title: 'Test 2: Question ambiguë CRITIQUE (location entre frères)',
    question: 'Si je loue mon appartement à mon frère, peut-il avoir l\'APL ?'
  },
  {
    title: 'Test 3: Question ambiguë (tante)',
    question: 'Ma tante peut-elle me louer son appartement et que je reçoive l\'ALF ?'
  },
  {
    title: 'Test 4: Question hors contexte',
    question: 'Quel est le montant maximum de l\'APL pour un étudiant ?'
  },
  {
    title: 'Test 5: Question sur passage ALF/ALS',
    question: 'Que se passe-t-il si je suis enceinte et que je bénéficie de l\'ALS ?'
  }
];

async function runTests() {
  console.log('='.repeat(80));
  console.log('🧪 TEST o1-preview - Native Reasoning Model');
  console.log('='.repeat(80));
  console.log('');

  for (let i = 0; i < testQuestions.length; i++) {
    const test = testQuestions[i];
    
    console.log('\n' + '═'.repeat(80));
    console.log(`📝 ${test.title}`);
    console.log('═'.repeat(80));
    console.log(`❓ Question: ${test.question}`);
    console.log('');

    try {
      const startTime = Date.now();
      const result = await ragService.ask(test.question);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log('─'.repeat(80));
      console.log(`✅ RÉPONSE (${duration}s) :`);
      console.log('─'.repeat(80));
      console.log(result.text);
      console.log('');
      console.log(`🎯 Confiance: ${result.confidence || 'N/A'}`);
      console.log(`🤖 Modèle: ${result.model || 'N/A'}`);
      console.log(`📊 Score contexte: ${result.context_score?.toFixed(3) || 'N/A'}`);
      
      if (result.sources && result.sources.length > 0) {
        console.log(`📚 Sources (${result.sources.length}):`);
        result.sources.slice(0, 2).forEach((src, idx) => {
          console.log(`   ${idx + 1}. ${src.module} (score: ${src.score.toFixed(3)})`);
        });
      }

      // Pause entre les tests
      if (i < testQuestions.length - 1) {
        console.log('\n⏳ Pause 2s avant test suivant...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

    } catch (error) {
      console.log('');
      console.log('❌ ERREUR:', error.message);
      console.log('');
      if (error.response) {
        console.log('API Response:', error.response.data);
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ Tests terminés');
  console.log('='.repeat(80));
  console.log('');
  console.log('📊 ANALYSE DES RÉSULTATS :');
  console.log('   ✓ Vérifier que les ambiguïtés sont bien détectées');
  console.log('   ✓ Vérifier que le raisonnement est visible et clair');
  console.log('   ✓ Vérifier qu\'il n\'y a pas d\'hallucinations');
  console.log('   ✓ Vérifier la redirection vers CAF si info incomplète');
  console.log('');
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

