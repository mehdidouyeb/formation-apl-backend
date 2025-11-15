# 🤖 Backend RAG - CAF Formation

Backend Node.js/Express pour le système RAG (Retrieval Augmented Generation) utilisant Pinecone et Gemini AI.

## 🏗️ Architecture

```
┌─────────────┐
│   Frontend  │ 
│   React     │
└──────┬──────┘
       │ HTTP POST /api/ask
       ▼
┌─────────────┐
│   Express   │
│   Backend   │
└──────┬──────┘
       │
       ├──────────────┐
       ▼              ▼
┌──────────┐   ┌──────────┐
│ Pinecone │   │  Gemini  │
│ Vector DB│   │   AI     │
└──────────┘   └──────────┘
```

## 📦 Installation

```bash
cd backend
npm install
```

## 🔑 Configuration

Les clés API sont déjà configurées dans `.env` :
- Pinecone API Key
- Gemini API Key
- Index Name: `caf-formation`
- Namespace: `apl-modules`

## 🚀 Utilisation

### 1. Indexation (Une seule fois)

Indexer le contenu de `info_to_rag.txt` dans Pinecone :

```bash
npm run index
```

**Ce que fait l'indexation** :
1. ✅ Lit le fichier `info_to_rag.txt`
2. ✅ Découpe en chunks intelligents (~500 tokens avec overlap)
3. ✅ Génère les embeddings avec Gemini
4. ✅ Stocke dans Pinecone avec métadonnées (module, section)

**Durée estimée** : 5-10 minutes pour ~600 lignes

**Note** : La création de l'index Pinecone prend ~1 minute la première fois.

### 2. Démarrer le serveur

```bash
npm start
# ou pour le mode dev avec auto-reload
npm run dev
```

Le serveur démarre sur **http://localhost:3001**

## 📡 API Endpoints

### POST /api/ask

Poser une question au système RAG.

**Request** :
```json
{
  "question": "Comment fonctionne l'APL ?",
  "history": [
    {
      "role": "user",
      "content": "Question précédente..."
    },
    {
      "role": "assistant",
      "content": "Réponse précédente..."
    }
  ]
}
```

**Response** :
```json
{
  "answer": "L'APL (Aide Personnalisée au Logement) est...",
  "sources": [
    {
      "module": "MODULE 1 : Les Fondamentaux",
      "section": "1.2 L'Arbre de Priorité",
      "score": 0.89
    }
  ],
  "confidence": "high"
}
```

### GET /health

Vérifier l'état du serveur.

**Response** :
```json
{
  "status": "ok",
  "message": "Backend RAG is running"
}
```

## 🔄 Flux RAG

1. **Question utilisateur** → Envoyée au backend
2. **Embedding** → Génération via Gemini
3. **Recherche** → Top 5 chunks similaires dans Pinecone
4. **Contexte** → Agrégation des chunks pertinents
5. **Génération** → Gemini génère une réponse basée sur le contexte
6. **Réponse** → Retournée au frontend avec sources

## 📊 Structure des Chunks

Chaque chunk stocké contient :

```javascript
{
  id: "chunk-123",
  values: [0.123, -0.456, ...],  // Embedding (768 dimensions)
  metadata: {
    text: "Contenu du chunk...",
    module: "MODULE 1 : Les Fondamentaux",
    section: "1.2 L'Arbre de Priorité",
    index: 123
  }
}
```

## 🎯 Prompt Engineering

Le système utilise un prompt structuré :

```
Tu es un expert CAF Formation...

CONTEXTE DOCUMENTAIRE:
[Context 1 - MODULE 1]
...

HISTORIQUE DE LA CONVERSATION:
Question: ...
Réponse: ...

QUESTION ACTUELLE: ...

INSTRUCTIONS:
- Réponds de manière claire
- Base ta réponse sur le contexte
- Utilise des exemples concrets
...
```

## 🔧 Configuration

### Variables d'environnement (.env)

```bash
PINECONE_API_KEY=your_key
GEMINI_API_KEY=your_key
PINECONE_INDEX_NAME=caf-formation
PINECONE_NAMESPACE=apl-modules
PORT=3001
```

### Paramètres de chunking

Dans `indexRAG.js` :
```javascript
maxTokens = 500      // Taille max par chunk
overlap = 50         // Overlap entre chunks
```

### Paramètres de recherche

Dans `ragService.js` :
```javascript
topK = 5            // Nombre de chunks à récupérer
```

## 🐛 Debugging

### Logs

Le serveur affiche des logs détaillés :

```bash
🚀 Serveur RAG démarré sur http://localhost:3001
📩 Question reçue: Comment fonctionne l'APL ?
🔍 Recherche de contexte...
📚 5 contextes trouvés
Scores: 0.892, 0.854, 0.821, 0.789, 0.756
✅ Réponse générée
```

### Test manuel

```bash
# Test health check
curl http://localhost:3001/health

# Test question
curl -X POST http://localhost:3001/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "Qu'\''est-ce que l'\''APL ?"}'
```

## 📈 Performance

- **Recherche Pinecone** : ~100-200ms
- **Génération Gemini** : ~1-3s
- **Total** : ~1.5-3.5s par question

## 🔒 Sécurité

✅ Clés API stockées dans `.env` (git ignored)  
✅ CORS activé pour le frontend  
✅ Pas d'exposition des clés côté client  
✅ Rate limiting possible (à implémenter si besoin)

## 📝 Fichiers Importants

```
backend/
├── server.js          # Serveur Express
├── ragService.js      # Logique RAG (recherche + génération)
├── indexRAG.js        # Script d'indexation
├── .env               # Clés API (git ignored)
├── .gitignore         # Ignore node_modules et .env
└── package.json       # Dépendances
```

## 🆘 Troubleshooting

### Erreur : Index not found

**Solution** : Exécutez `npm run index` pour créer l'index

### Erreur : API key invalid

**Solution** : Vérifiez les clés dans `.env`

### Erreur : Rate limit exceeded

**Solution** : Attendez quelques secondes (limites Gemini gratuites)

### Pas de réponse pertinente

**Solution** : 
1. Vérifiez que l'indexation est complète
2. Reformulez la question
3. Augmentez `topK` dans `ragService.js`

## 🚀 Prochaines Améliorations

- [ ] Cache des questions fréquentes
- [ ] Rate limiting
- [ ] Métriques et analytics
- [ ] Support multi-langue
- [ ] Streaming de réponses
- [ ] Feedback utilisateur sur les réponses

## 📄 Licence

Propriété de la CAF - Tous droits réservés

---

**Version** : 1.0.0  
**Dernière mise à jour** : Novembre 2025

