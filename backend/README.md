# Creveton — Backend

API REST + WebSocket de **Creveton**, application de quiz mobile compétitif
(marché camerounais, 12–30 ans). Partagée par l'app mobile et la console admin.

- **Spec d'API** : [`../docs/Creveton_API_Spec.md`](../docs/Creveton_API_Spec.md) (fait foi)
- **Cahier des charges** : `../docs/Creveton_CDC.docx`

## Stack

| Domaine | Techno |
|---|---|
| Runtime | Node.js ≥ 20 |
| Framework HTTP | Express |
| Base de données | PostgreSQL (`pg`) |
| Cache / temps réel / rate limit | Redis (`ioredis`) |
| Temps réel | Socket.io |
| Auth | JWT (access 1 h / refresh 30 j) + `bcryptjs` |
| Validation | Joi |
| SMS / OTP | Twilio |
| E-mail (invitations…) | Resend |
| Médias (avatars, images de questions) | Cloudinary |
| Traduction IA FR↔EN (questions) | Anthropic (gardée par `ANTHROPIC_API_KEY`) |
| Paiements (plus tard, derrière flag) | Orange Money · MTN MoMo · Campay |

## Démarrage

```bash
cd backend
cp .env.example .env        # puis renseigner les valeurs
npm install
npm run dev                 # nodemon, rechargement à chaud
```

Le serveur écoute par défaut sur `http://localhost:4000`, API montée sous
`http://localhost:4000/api/v1`. Health check : `GET /health`.

### Prérequis services

- **PostgreSQL** et **Redis** accessibles (voir variables `DATABASE_URL` / `REDIS_URL`).
- En dev sans Twilio configuré, les OTP sont **simulés** (loggés en console).
- Le rate limiting s'appuie sur Redis (fail-open si indisponible).

## Scripts

| Commande | Description |
|---|---|
| `npm start` | Démarre le serveur (production). |
| `npm run dev` | Démarre avec nodemon. |
| `npm test` | Lance la suite Jest. |
| `npm run test:coverage` | Tests + couverture. |

## Structure

```
backend/
├── src/
│   ├── config/        # env, database (pg), redis, logger, multer, cloudinary
│   ├── controllers/   # contrôleurs fins (asyncHandler), un par domaine
│   ├── middlewares/   # auth, rôles, validation, rate limit, feature flags, erreurs
│   ├── models/        # accès données PostgreSQL (SQL) + migrations + migrate.js
│   ├── routes/        # définition des routes, montées sous /api/v1 (+ routes/admin)
│   ├── services/      # logique métier (scoring, OTP, SMS, e-mail, avatars, IA…)
│   ├── sockets/       # couche temps réel Socket.io (tournois)
│   ├── utils/         # ApiError, codes d'erreur, JWT, helpers
│   ├── validators/    # schémas Joi
│   ├── app.js         # configuration Express (middlewares + routes)
│   └── server.js      # bootstrap HTTP + Socket.io + arrêt gracieux
├── tests/             # Jest + supertest
├── .env.example
├── nodemon.json
└── jest.config.js
```

## Conventions (rappel spec)

- **JSON `snake_case`** en entrée/sortie ; horodatages **ISO 8601 UTC** ; identifiants **UUID v4**.
- **Montants** entiers en **FCFA** (XAF, sans sous-unité).
- **Modèle d'erreur unique** : `{ error: { code, message, details?, request_id } }` (voir `src/utils/errorCodes.js`).
- **Anti-triche questions** : `correct_index` / `explanation` / `explanation_en` ne sont **jamais** exposés par la vue joueur (`GET /questions`) ; révélés uniquement après réponse, via `POST /sessions/answer` (feedback immédiat, mode `normal`) et le `review[]` de `POST /sessions/submit`.
- **Scoring serveur-authoritative** : voir `src/services/scoreService.js`.
- **XP & niveaux (1–5)** : `userModel.creditSessionXp` est l'unique point d'écriture de `total_xp` (recalcul du niveau en SQL). Bandes `[0, 200, 500, 1200, 3000]`.
- **Bilingue FR/EN** : `text_fr` (NOT NULL, source de vérité) + `text_en` / `options[].text_en` / `explanation_en`. Auto-traduction IA fire-and-forget (gardée par `ANTHROPIC_API_KEY`) après création/édition/import.
- **Médias sur Cloudinary** : avatars et images de questions, jamais sur le disque local (conteneur éphémère).
- **Feature flag** `tournaments.paid.enabled` (défaut `false`) : toute la couche paiement renvoie `403 FEATURE_DISABLED` tant qu'il est inactif.

## État d'implémentation

L'API est **fonctionnelle de bout en bout** : auth (OTP/JWT/rôles), questions (CRUD admin,
import CSV, traduction IA, delta sync), sessions notées, tournois temps réel, défis,
classement, wallet, support, équipes/invitations, analytics et dashboard. La couche modèles
PostgreSQL (`src/models/*.model.js`) et les migrations (`src/models/migrations/`, lancées via
`migrate.js`) sont en place. `GET /health` vérifie DB + Redis.
