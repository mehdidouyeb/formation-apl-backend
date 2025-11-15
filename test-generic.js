require('dotenv').config();
const { ask } = require('./ragService');

/**
 * Test du système GÉNÉRIQUE avec différents types d'ambiguïtés
 * Pas seulement "frère" mais aussi "tante", "cousin", "belle-mère", etc.
 */

const testQuestions = [
  {
    name: "Frère",
    question: "Mon frère peut-il me louer son appartement avec l'APL ?"
  },
  {
    name: "Tante",
    question: "Ma tante peut-elle me louer un logement et que je touche l'aide ?"
  },
  {
    name: "Cousin",
    question: "Si mon cousin me loue un studio, puis-je avoir l'ALF ?"
  },
  {
    name: "Belle-mère",
    question: "Ma belle-mère me loue un appartement, ai-je droit aux aides ?"
  }
];

async function testGenericSystem() {
  console.log('🧪 TEST DU SYSTÈME GÉNÉRIQUE D\'ANALYSE SÉMANTIQUE\n');
  console.log('═'.repeat(80));
  console.log('Objectif : Vérifier que le système détecte les ambiguïtés pour');
  console.log('N\'IMPORTE quel terme familial, pas seulement "frère"');
  console.log('═'.repeat(80));
  
  for (const test of testQuestions) {
    console.log(`\n\n${'═'.repeat(80)}`);
    console.log(`TEST : ${test.name}`);
    console.log(`${'═'.repeat(80)}`);
    console.log(`Q: ${test.question}\n`);
    console.log('⏳ Analyse en cours...\n');
    
    try {
      const result = await ask(test.question);
      
      console.log('📝 RÉPONSE:\n');
      console.log(result.text);
      console.log(`\n📊 Confiance: ${result.confidence}`);
      console.log(`🤔 Thinking visible: ${result.thinking_visible ? 'OUI' : 'NON'}`);
      
      // Validation
      const hasThinking = result.text.includes('**4️⃣ Analyse sémantique :**');
      const hasAmbiguity = result.reasoning && result.reasoning.ambiguities && result.reasoning.ambiguities.length > 0;
      const lowConfidence = ['none', 'low'].includes(result.confidence);
      
      console.log('\n✅ VALIDATION:');
      console.log(`   Détecte l'ambiguïté: ${hasAmbiguity ? '✓' : '✗'}`);
      console.log(`   Génère analyse sémantique: ${hasThinking ? '✓' : '✗'}`);
      console.log(`   Confiance appropriée: ${lowConfidence ? '✓' : '✗'}`);
      
      if (hasAmbiguity && hasThinking && lowConfidence) {
        console.log('\n🎉 TEST RÉUSSI ! Le système est générique.');
      } else {
        console.log('\n❌ TEST ÉCHOUÉ.');
      }
      
      // Pause entre les tests pour éviter rate limiting
      await new Promise(resolve => setTimeout(resolve, 3000));
      
    } catch (error) {
      console.error(`❌ ERREUR: ${error.message}`);
    }
  }
  
  console.log(`\n\n${'═'.repeat(80)}`);
  console.log('📊 RÉSUMÉ');
  console.log(`${'═'.repeat(80)}`);
  console.log('Le système doit générer une analyse sémantique différente pour chaque');
  console.log('type de lien familial, sans hardcoder les cas spécifiques.');
  console.log('');
}

testGenericSystem()
  .then(() => {
    console.log('\n✅ Tests terminés');
    process.exit(0);
  })
  .catch(error => {
    console.error('Erreur fatale:', error);
    process.exit(1);
  });

