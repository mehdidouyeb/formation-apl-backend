require('dotenv').config();
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function testOpenAIEmbeddings() {
  console.log('🧪 Test des embeddings OpenAI...\n');
  
  try {
    const text = "Qu'est-ce que l'APL ?";
    
    console.log(`📝 Texte de test: "${text}"`);
    console.log('⏳ Génération de l\'embedding...\n');
    
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    
    const embedding = response.data[0].embedding;
    
    console.log('✅ SUCCESS! Embedding généré avec succès!');
    console.log(`📊 Dimension: ${embedding.length}`);
    console.log(`📈 Premiers 10 valeurs: [${embedding.slice(0, 10).map(v => v.toFixed(4)).join(', ')}...]`);
    console.log(`\n💰 Tokens utilisés: ${response.usage.total_tokens}`);
    console.log('\n🎉 OpenAI embeddings fonctionne correctement!');
    console.log('✅ Vous pouvez maintenant lancer: npm run index\n');
    
    return true;
  } catch (error) {
    console.error('❌ ERREUR:', error.message);
    
    if (error.status === 401) {
      console.log('\n⚠️  Clé API invalide');
      console.log('Solutions:');
      console.log('  1. Vérifiez votre clé: https://platform.openai.com/api-keys');
      console.log('  2. Mettez à jour backend/.env avec la bonne clé\n');
    } else if (error.status === 429) {
      console.log('\n⚠️  Quota dépassé ou rate limit');
      console.log('Solutions:');
      console.log('  1. Attendez quelques secondes et réessayez');
      console.log('  2. Vérifiez votre usage: https://platform.openai.com/usage\n');
    } else {
      console.log('\n⚠️  Erreur inattendue');
      console.log('Détails:', error);
    }
    
    return false;
  }
}

// Run test
testOpenAIEmbeddings().then(success => {
  process.exit(success ? 0 : 1);
});


