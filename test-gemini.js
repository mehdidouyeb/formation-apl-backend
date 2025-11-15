require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function testGeminiEmbeddings() {
  console.log('🧪 Test des embeddings Gemini...\n');
  
  try {
    const model = genAI.getGenerativeModel({ model: 'embedding-001' });
    const text = "Qu'est-ce que l'APL ?";
    
    console.log(`📝 Texte de test: "${text}"`);
    console.log('⏳ Génération de l\'embedding...\n');
    
    const result = await model.embedContent(text);
    const embedding = result.embedding.values;
    
    console.log('✅ SUCCESS! Embedding généré avec succès!');
    console.log(`📊 Dimension: ${embedding.length}`);
    console.log(`📈 Premier 10 valeurs: [${embedding.slice(0, 10).map(v => v.toFixed(4)).join(', ')}...]`);
    console.log('\n🎉 Gemini embeddings fonctionne correctement!');
    console.log('✅ Vous pouvez maintenant lancer: npm run index\n');
    
    return true;
  } catch (error) {
    console.error('❌ ERREUR:', error.message);
    
    if (error.status === 429) {
      console.log('\n⚠️  Quota dépassé ou limite atteinte');
      console.log('Solutions:');
      console.log('  1. Attendez quelques minutes et réessayez');
      console.log('  2. Vérifiez votre quota: https://ai.dev/usage?tab=rate-limit');
      console.log('  3. Créez une nouvelle clé API avec un autre compte Google');
      console.log('  4. Passez à OpenAI (recommandé pour production)\n');
    } else if (error.status === 403) {
      console.log('\n⚠️  Clé API invalide ou révoquée');
      console.log('Solutions:');
      console.log('  1. Créez une nouvelle clé: https://aistudio.google.com/app/apikey');
      console.log('  2. Mettez à jour backend/.env avec la nouvelle clé\n');
    } else {
      console.log('\n⚠️  Erreur inattendue');
      console.log('Détails:', error);
    }
    
    return false;
  }
}

// Run test
testGeminiEmbeddings().then(success => {
  process.exit(success ? 0 : 1);
});


