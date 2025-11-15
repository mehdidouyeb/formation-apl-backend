require('dotenv').config();
const { ask } = require('./ragService');

/**
 * Test Suite pour le Chain of Thought Hybride
 * Vérifie que le système évite les hallucinations
 */

const testQuestions = [
  {
    id: 1,
    question: "Puis-je louer un appartement à mon fils et qu'il bénéficie de l'APL ?",
    expected_type: "refusal", // Doit dire NON clairement
    should_contain: ["ascendants", "descendants", "interdit"],
    should_not_contain: ["oui", "possible", "autorisé"],
    confidence_min: "medium"
  },
  {
    id: 2,
    question: "Mon frère peut-il me louer son appartement avec une aide au logement ?",
    expected_type: "unknown", // Doit dire que l'info n'est pas disponible
    should_contain: ["information", "disponible", "CAF", "contacter"],
    should_not_contain: ["interdit", "impossible", "ascendants"],
    confidence_max: "low"
  },
  {
    id: 3,
    question: "Quelle est la surface minimum pour 3 personnes ?",
    expected_type: "answer", // Doit répondre précisément
    should_contain: ["25", "m²", "16", "9"],
    confidence_min: "high"
  },
  {
    id: 4,
    question: "Un grand-père peut-il louer à son petit-fils ?",
    expected_type: "refusal", // Doit dire NON
    should_contain: ["ascendants", "descendants", "interdit"],
    confidence_min: "medium"
  },
  {
    id: 5,
    question: "Puis-je louer à ma tante ?",
    expected_type: "unknown", // Info non disponible
    should_contain: ["information", "disponible"],
    confidence_max: "low"
  },
  {
    id: 6,
    question: "Quelle est la différence entre APL et ALF ?",
    expected_type: "answer", // Doit répondre clairement
    should_contain: ["conventionné", "APL"],
    confidence_min: "high"
  }
];

async function runTest(test) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`TEST ${test.id}: ${test.question}`);
  console.log(`${'='.repeat(80)}`);
  
  try {
    const result = await ask(test.question);
    
    console.log(`\n📝 RÉPONSE:`);
    console.log(result.text);
    
    console.log(`\n📊 MÉTADONNÉES:`);
    console.log(`   Confiance: ${result.confidence}`);
    console.log(`   Sources: ${result.sources.length}`);
    
    if (result.reasoning) {
      console.log(`\n🧠 RAISONNEMENT (CoT):`);
      console.log(`   Mots-clés: ${result.reasoning.keywords.join(', ')}`);
      console.log(`   Citations: ${result.reasoning.relevant_quotes.length}`);
      console.log(`   Couverture: ${result.reasoning.coverage}`);
      console.log(`   Ambiguïtés: ${result.reasoning.ambiguities.join(', ') || 'Aucune'}`);
    }
    
    // Validation
    console.log(`\n✅ VALIDATION:`);
    
    let passed = true;
    const issues = [];
    
    // Check should_contain
    if (test.should_contain) {
      test.should_contain.forEach(term => {
        if (!result.text.toLowerCase().includes(term.toLowerCase())) {
          passed = false;
          issues.push(`❌ Devrait contenir "${term}"`);
        } else {
          console.log(`   ✓ Contient "${term}"`);
        }
      });
    }
    
    // Check should_not_contain
    if (test.should_not_contain) {
      test.should_not_contain.forEach(term => {
        if (result.text.toLowerCase().includes(term.toLowerCase())) {
          passed = false;
          issues.push(`❌ NE devrait PAS contenir "${term}"`);
        } else {
          console.log(`   ✓ Ne contient pas "${term}"`);
        }
      });
    }
    
    // Check confidence
    const confidenceLevels = { none: 0, low: 1, medium: 2, high: 3 };
    const actualLevel = confidenceLevels[result.confidence] || 0;
    
    if (test.confidence_min) {
      const minLevel = confidenceLevels[test.confidence_min];
      if (actualLevel < minLevel) {
        passed = false;
        issues.push(`❌ Confiance trop faible (${result.confidence} < ${test.confidence_min})`);
      } else {
        console.log(`   ✓ Confiance suffisante (${result.confidence} >= ${test.confidence_min})`);
      }
    }
    
    if (test.confidence_max) {
      const maxLevel = confidenceLevels[test.confidence_max];
      if (actualLevel > maxLevel) {
        passed = false;
        issues.push(`❌ Confiance trop élevée (${result.confidence} > ${test.confidence_max})`);
      } else {
        console.log(`   ✓ Confiance appropriée (${result.confidence} <= ${test.confidence_max})`);
      }
    }
    
    if (passed) {
      console.log(`\n🎉 TEST ${test.id} RÉUSSI`);
    } else {
      console.log(`\n❌ TEST ${test.id} ÉCHOUÉ`);
      issues.forEach(issue => console.log(`   ${issue}`));
    }
    
    return { passed, issues, result };
    
  } catch (error) {
    console.error(`\n❌ ERREUR TEST ${test.id}:`, error.message);
    return { passed: false, issues: [error.message], result: null };
  }
}

async function runAllTests() {
  console.log('\n🧪 DÉBUT DES TESTS CHAIN OF THOUGHT (CoT) HYBRIDE\n');
  
  const results = [];
  
  for (const test of testQuestions) {
    const result = await runTest(test);
    results.push(result);
    
    // Pause entre les tests pour éviter rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Résumé
  console.log(`\n${'='.repeat(80)}`);
  console.log('📊 RÉSUMÉ DES TESTS');
  console.log(`${'='.repeat(80)}\n`);
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const percentage = Math.round((passed / total) * 100);
  
  console.log(`Tests réussis: ${passed}/${total} (${percentage}%)`);
  
  if (passed === total) {
    console.log('\n✅ TOUS LES TESTS SONT PASSÉS !');
    console.log('🎉 Le système CoT Hybride fonctionne correctement.');
  } else {
    console.log(`\n⚠️ ${total - passed} test(s) ont échoué.`);
    console.log('Vérifiez les détails ci-dessus.');
  }
  
  console.log('\n');
}

// Run tests
if (require.main === module) {
  runAllTests()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Erreur fatale:', error);
      process.exit(1);
    });
}

module.exports = { runAllTests, testQuestions };

