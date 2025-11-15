require('dotenv').config();
const { Pinecone } = require('@pinecone-database/pinecone');

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY
});

const INDEX_NAME = process.env.PINECONE_INDEX_NAME;

async function resetPinecone() {
  console.log('🔄 Reset de l\'index Pinecone...\n');
  
  try {
    // Check if index exists
    const indexList = await pinecone.listIndexes();
    const indexExists = indexList.indexes.some(idx => idx.name === INDEX_NAME);
    
    if (indexExists) {
      console.log(`🗑️  Suppression de l'ancien index "${INDEX_NAME}"...`);
      await pinecone.deleteIndex(INDEX_NAME);
      console.log('✅ Ancien index supprimé');
      
      // Wait a bit for deletion to complete
      console.log('⏳ Attente de la suppression...');
      await new Promise(resolve => setTimeout(resolve, 10000));
    } else {
      console.log(`ℹ️  Aucun index "${INDEX_NAME}" trouvé`);
    }
    
    // Create new index with correct dimension
    console.log(`\n📊 Création d'un nouvel index avec dimension 1536 (OpenAI)...`);
    await pinecone.createIndex({
      name: INDEX_NAME,
      dimension: 1536, // OpenAI text-embedding-3-small
      metric: 'cosine',
      spec: {
        serverless: {
          cloud: 'aws',
          region: 'us-east-1'
        }
      }
    });
    
    console.log('⏳ Attente de la création de l\'index (60 secondes)...');
    await new Promise(resolve => setTimeout(resolve, 60000));
    
    console.log('✅ Nouvel index créé avec succès!');
    console.log('\n🎉 Prêt pour l\'indexation!');
    console.log('▶️  Lancez maintenant: npm run index\n');
    
    return true;
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    return false;
  }
}

resetPinecone().then(success => {
  process.exit(success ? 0 : 1);
});


