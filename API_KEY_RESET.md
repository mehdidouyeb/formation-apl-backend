# 🔑 Renouvellement de la clé API Gemini

## ⚠️ Problème

Votre clé API Gemini a été révoquée car elle a été détectée comme "leaked" (divulguée publiquement).

**Erreur** :
```
[403 Forbidden] Your API key was reported as leaked. Please use another API key.
```

## ✅ Solution en 3 étapes

### 1. Obtenir une nouvelle clé API Gemini

1. Allez sur : https://aistudio.google.com/app/apikey
2. Connectez-vous avec votre compte Google
3. Cliquez sur **"Create API Key"**
4. Sélectionnez un projet (ou créez-en un nouveau)
5. **Copiez la nouvelle clé** (elle ressemble à `AIzaSy...`)

### 2. Mettre à jour le fichier .env

Éditez le fichier `/Users/mehdidouyeb/agent_on_boarding/react-formation-apl/backend/.env` :

```bash
# Remplacez l'ancienne clé par la nouvelle
GEMINI_API_KEY=VOTRE_NOUVELLE_CLE_ICI
```

**⚠️ IMPORTANT** : Ne partagez JAMAIS cette clé publiquement !

### 3. Relancer l'indexation

```bash
cd /Users/mehdidouyeb/agent_on_boarding/react-formation-apl/backend
npm run index
```

---

## 🔐 Bonne Pratique : Sécurité des Clés API

### ❌ À NE JAMAIS FAIRE

- ❌ Partager les clés dans un chat
- ❌ Commiter les clés dans Git
- ❌ Publier les clés sur GitHub/GitLab
- ❌ Envoyer les clés par email

### ✅ À FAIRE

- ✅ Stocker dans `.env` (git ignored)
- ✅ Utiliser des variables d'environnement
- ✅ Renouveler régulièrement
- ✅ Limiter les permissions
- ✅ Surveiller l'usage

---

## 🔄 Commandes Rapides

### Éditer le .env

```bash
# Option 1 : Avec nano
nano /Users/mehdidouyeb/agent_on_boarding/react-formation-apl/backend/.env

# Option 2 : Avec VS Code
code /Users/mehdidouyeb/agent_on_boarding/react-formation-apl/backend/.env
```

### Vérifier le .env

```bash
cat /Users/mehdidouyeb/agent_on_boarding/react-formation-apl/backend/.env
```

### Tester la nouvelle clé

```bash
cd /Users/mehdidouyeb/agent_on_boarding/react-formation-apl/backend
npm run index
```

---

## 📊 Statut Actuel

✅ Index Pinecone créé  
✅ 10/16 chunks indexés  
❌ Indexation interrompue (clé invalide)

**→ Une fois la nouvelle clé configurée, l'indexation reprendra automatiquement**

---

## 🆘 Besoin d'aide ?

Si vous avez des questions, consultez :
- Documentation Gemini : https://ai.google.dev/docs
- Support Pinecone : https://docs.pinecone.io

---

**Dès que vous avez la nouvelle clé, remplacez-la dans `.env` et relancez `npm run index` !** 🚀

