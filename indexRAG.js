require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { Pinecone } = require('@pinecone-database/pinecone');
const OpenAI = require('openai');

// Initialize
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY
});
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const INDEX_NAME = process.env.PINECONE_INDEX_NAME;
const NAMESPACE = process.env.PINECONE_NAMESPACE;

/**
 * Split text into chunks with overlap
 */
function splitIntoChunks(text, maxTokens = 500, overlap = 50) {
  // Rough estimation: 1 token ≈ 4 characters
  const maxChars = maxTokens * 4;
  const overlapChars = overlap * 4;

  const chunks = [];
  const paragraphs = text.split(/\n\n+/);

  let currentChunk = '';
  let currentModule = '';
  let currentSection = '';

  for (const paragraph of paragraphs) {
    // Extract module/section info from headers
    if (paragraph.match(/^MODULE \d+/)) {
      currentModule = paragraph.split('\n')[0];
    }
    if (paragraph.match(/^\d+\.\d+/)) {
      currentSection = paragraph.split('\n')[0];
    }

    // If adding this paragraph would exceed max, save current chunk
    if (currentChunk.length + paragraph.length > maxChars && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        module: currentModule,
        section: currentSection
      });

      // Keep overlap
      const words = currentChunk.split(' ');
      currentChunk = words.slice(-overlap).join(' ') + '\n\n' + paragraph;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }

  // Add last chunk
  if (currentChunk.trim()) {
    chunks.push({
      text: currentChunk.trim(),
      module: currentModule,
      section: currentSection
    });
  }

  return chunks;
}

/**
 * Generate embedding using OpenAI
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
 * Create Pinecone index if it doesn't exist
 */
async function ensureIndex() {
  try {
    const indexList = await pinecone.listIndexes();
    const indexExists = indexList.indexes.some(idx => idx.name === INDEX_NAME);

    if (!indexExists) {
      console.log(`📊 Création de l'index "${INDEX_NAME}"...`);
      
      await pinecone.createIndex({
        name: INDEX_NAME,
        dimension: 1536, // OpenAI text-embedding-3-small dimension
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1'
          }
        }
      });

      // Wait for index to be ready
      console.log('⏳ Attente de la création de l\'index...');
      await new Promise(resolve => setTimeout(resolve, 60000)); // 1 minute
      
      console.log('✅ Index créé avec succès');
    } else {
      console.log(`✅ Index "${INDEX_NAME}" existe déjà`);
    }

    return pinecone.index(INDEX_NAME);
  } catch (error) {
    console.error('Error ensuring index:', error);
    throw error;
  }
}

/**
 * Index all chunks into Pinecone
 */
async function indexChunks(chunks, index) {
  console.log(`\n📝 Indexation de ${chunks.length} chunks...`);

  const batchSize = 10;
  let indexed = 0;

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    
    // Generate embeddings for batch
    const vectors = await Promise.all(
      batch.map(async (chunk, idx) => {
        const embedding = await generateEmbedding(chunk.text);
        
        return {
          id: `chunk-${i + idx}`,
          values: embedding,
          metadata: {
            text: chunk.text,
            module: chunk.module,
            section: chunk.section,
            index: i + idx
          }
        };
      })
    );

    // Upsert to Pinecone
    await index.namespace(NAMESPACE).upsert(vectors);
    
    indexed += batch.length;
    console.log(`✅ Indexé: ${indexed}/${chunks.length} chunks`);
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`\n🎉 Indexation terminée: ${indexed} chunks indexés`);
}

/**
 * Main indexing function
 */
async function main() {
  try {
    console.log('🚀 Démarrage de l\'indexation RAG\n');

    // Read the text file
    const textPath = path.join(__dirname, '../../info_to_rag.txt');
    console.log(`📖 Lecture du fichier: ${textPath}`);
    
    const content = await fs.readFile(textPath, 'utf-8');
    console.log(`✅ Fichier lu: ${content.length} caractères`);

    // Split into chunks
    console.log('\n✂️  Découpage en chunks...');
    const chunks = splitIntoChunks(content);
    console.log(`✅ ${chunks.length} chunks créés`);
    
    // Show sample
    console.log(`\n📋 Exemple de chunk:\nModule: ${chunks[0].module}\nSection: ${chunks[0].section}\nTexte: ${chunks[0].text.substring(0, 200)}...\n`);

    // Ensure index exists
    console.log('📊 Vérification/création de l\'index Pinecone...');
    const index = await ensureIndex();

    // Index all chunks
    await indexChunks(chunks, index);

    // Stats
    const stats = await index.describeIndexStats();
    console.log('\n📊 Statistiques de l\'index:');
    console.log(`  - Vecteurs totaux: ${stats.totalRecordCount}`);
    console.log(`  - Namespace "${NAMESPACE}": ${stats.namespaces[NAMESPACE]?.recordCount || 0} vecteurs`);

    console.log('\n✅ Indexation terminée avec succès!');
    console.log('🚀 Le backend RAG est prêt à être utilisé\n');

  } catch (error) {
    console.error('\n❌ Erreur lors de l\'indexation:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { splitIntoChunks, indexChunks, main };

