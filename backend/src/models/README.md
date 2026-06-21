# Models

Couche d'accès aux données (PostgreSQL via `src/config/database.js`).

Chaque modèle expose des fonctions de requête typées par domaine et **n'utilise
jamais `process.env` ni la connexion directement** — il passe par
`db.query()` / `db.getClient()` (transactions).

Modèles à implémenter (alignés sur la spec API §15) :

| Fichier | Entité | Notes |
|---|---|---|
| `user.model.js` | User | hash bcrypt, `referral_code` unique, `role`, `phone_verified` |
| `question.model.js` | Question | `version`, `status` (workflow), soft delete, index sur `updated_at` (delta sync) |
| `session.model.js` | Session de jeu | score recalculé serveur, historique |
| `tournament.model.js` | Tournament + participations | statut, `entry_fee`, `prize_pool` |
| `challenge.model.js` | Challenge 1v1 | `seed` partagé, statut |
| `transaction.model.js` | Transaction | Mobile Money, idempotence par `reference` (flag payant) |
| `leaderboard.model.js` | Vue/agrégat classement | scopes global/theme/weekly/monthly |

> Le schéma SQL et les migrations seront ajoutés dans un dossier `migrations/`
> (ou via l'outil retenu) avant de brancher ces modèles.
