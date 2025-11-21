# 🧠 Mémoire Conversationnelle - FlowGenius AI

## 📋 Résumé des améliorations

Votre application FlowGenius AI dispose maintenant d'une **mémoire conversationnelle complète** qui permet à l'IA de se souvenir de tout le contexte de vos échanges.

## ✨ Nouvelles fonctionnalités

### 1. **Historique de conversation**
- ✅ L'IA se souvient de **tous les messages précédents** dans la session
- ✅ Chaque message (utilisateur et IA) est horodaté
- ✅ Le contexte complet est envoyé à chaque requête Gemini

### 2. **Chronologie des modifications de flux**
- ✅ Chaque action est enregistrée avec un timestamp :
  - Ajout de nœud
  - Suppression de nœud
  - Création de lien
  - Génération de flux par l'IA
- ✅ L'IA peut référencer ces modifications dans ses réponses

### 3. **Bouton de réinitialisation**
- ✅ Nouveau bouton 🗑️ dans l'en-tête du chat
- ✅ Permet de repartir sur une conversation fraîche
- ✅ Conserve les flux existants

## 🔧 Modifications techniques

### State enrichi (`app.js`)
```javascript
const state = {
  // ... existant
  conversationHistory: [],      // Historique complet des messages
  flowModificationHistory: [],  // Chronologie des modifications
};
```

### Structure d'un message
```javascript
{
  role: "user" | "assistant",
  text: "contenu du message",
  timestamp: "2025-11-21T08:22:19.000Z"
}
```

### Structure d'une modification
```javascript
{
  timestamp: "2025-11-21T08:22:19.000Z",
  action: "Node added" | "Node removed" | "Edge created" | "AI generated flow",
  // ... données spécifiques à l'action
}
```

## 🎯 Exemples d'utilisation

### Avant (sans mémoire)
```
Utilisateur: Crée un flux de login
IA: [génère le flux]

Utilisateur: Qu'est-ce que je viens de te dire ?
IA: Je ne sais pas, je n'ai pas d'historique
```

### Après (avec mémoire)
```
Utilisateur: Crée un flux de login
IA: [génère le flux]

Utilisateur: Qu'est-ce que je viens de te dire ?
IA: Vous m'avez demandé de créer un flux de login, 
    ce que j'ai fait avec 4 nœuds (Page de connexion, 
    Vérification, Tableau de bord, Erreur)
```

## 🚀 Fonctionnement

1. **Chaque message utilisateur** est ajouté à `conversationHistory`
2. **Chaque réponse IA** est également enregistrée
3. **À chaque requête**, l'historique complet est envoyé à Gemini
4. **L'IA peut ainsi** :
   - Se référer aux échanges précédents
   - Maintenir la cohérence
   - Répondre à des questions sur "ce qui a été fait avant"
   - Comprendre le contexte global du projet

## 🎨 Interface utilisateur

- **Icône de corbeille** dans le header du chat
- **Tooltip** "Réinitialiser la conversation"
- **Message de confirmation** après réinitialisation

## 📊 Tracking des modifications

Toutes les actions suivantes sont maintenant trackées :

| Action | Données enregistrées |
|--------|---------------------|
| Ajout de nœud | `nodeTitle`, `nodeId` |
| Suppression de nœud | `nodeId` |
| Création de lien | `from`, `to` |
| Génération IA | `userPrompt`, `nodesCount`, `edgesCount` |

## 💡 Conseils d'utilisation

1. **Conversations longues** : Si le chat devient trop long, utilisez le bouton de réinitialisation
2. **Contexte riche** : Plus vous discutez avec l'IA, mieux elle comprendra votre projet
3. **Références** : Vous pouvez maintenant dire "modifie le flux précédent" ou "ajoute une étape après ce que tu as créé"

## 🔮 Améliorations futures possibles

- [ ] Persistance de l'historique dans localStorage
- [ ] Export de l'historique de conversation
- [ ] Recherche dans l'historique
- [ ] Résumé automatique des conversations longues
- [ ] Undo/Redo basé sur l'historique des modifications

---

**Date de mise à jour** : 21 novembre 2025
**Version** : 2.0 avec mémoire conversationnelle
