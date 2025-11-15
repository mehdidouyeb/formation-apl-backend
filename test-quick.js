require('dotenv').config();
const { ask } = require('./ragService');

async function quickTest() {
  console.log('🧪 Test rapide : Question sur le frère\n');
  
  const question = "Mon frère peut-il me louer son appartement avec une aide au logement ?";
  
  console.log(`Q: ${question}\n`);
  console.log('⏳ Analyse en cours...\n');
  
  try {
    const result = await ask(question);
    
    console.log('═'.repeat(80));
    console.log('📝 RÉPONSE COMPLÈTE:');
    console.log('═'.repeat(80));
    console.log(result.text);
    console.log('\n' + '═'.repeat(80));
    console.log('🧠 RAISONNEMENT INTERNE (JSON):');
    console.log('═'.repeat(80));
    console.log(JSON.stringify(result.reasoning, null, 2));
    console.log('\n📊 CONFIANCE:', result.confidence);
    console.log('🤔 THINKING VISIBLE:', result.thinking_visible ? 'OUI' : 'NON');
    
    // Validation
    const hasFrere = result.text.toLowerCase().includes('frère');
    const hasAscendants = result.text.toLowerCase().includes('ascendants');
    const hasInfoDispo = result.text.toLowerCase().includes('information') && 
                         (result.text.toLowerCase().includes('disponible') || 
                          result.text.toLowerCase().includes('incomplète'));
    const lowConfidence = ['none', 'low'].includes(result.confidence);
    
    console.log('\n✅ VALIDATION:');
    console.log(`   Mentionne "frère": ${hasFrere ? '✓' : '✗'}`);
    console.log(`   Confiance basse: ${lowConfidence ? '✓ CORRECT' : '✗ ERREUR (devrait être low/none)'}`);
    console.log(`   Dit que l'info est incomplète: ${hasInfoDispo ? '✓ CORRECT' : '✗'}`);
    console.log(`   Généralise à "ascendants": ${hasAscendants ? '✗ ERREUR (hallucination)' : '✓ CORRECT'}`);
    
    if (lowConfidence && !hasAscendants && hasInfoDispo) {
      console.log('\n🎉 TEST RÉUSSI ! Le système évite l\'hallucination.');
    } else {
      console.log('\n❌ TEST ÉCHOUÉ. Le système hallucine encore.');
    }
    
  } catch (error) {
    console.error('Erreur:', error.message);
  }
}

quickTest();

