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
| Auth | JWT (access 1 h / refresh 30 j) + bcrypt |
| Validation | Joi |
| SMS / OTP | Twilio |
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
│   ├── config/        # env, database (pg), redis, logger, multer
│   ├── controllers/   # logique de requête/réponse par domaine
│   ├── middlewares/   # auth, rôles, validation, rate limit, feature flags, erreurs
│   ├── models/        # accès données PostgreSQL (à implémenter)
│   ├── routes/        # définition des routes, montées sous /api/v1
│   ├── services/      # logique métier (scoring, OTP, SMS, paiements…)
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
- **Anti-triche questions** : `correct_index` / `explanation` ne sont **jamais** exposés par `GET /questions` ; révélés uniquement par `POST /sessions/submit`.
- **Scoring serveur-authoritative** : voir `src/services/scoreService.js`.
- **Feature flag** `tournaments.paid.enabled` (défaut `false`) : toute la couche paiement renvoie `403 FEATURE_DISABLED` tant qu'il est inactif.

## État d'implémentation

Le câblage complet (routes, middlewares, validation, erreurs, sockets, scoring)
est en place. Les contrôleurs dépendant de la persistance renvoient
`501 NOT_IMPLEMENTED` en attendant la couche modèles + migrations DB
(voir `src/models/README.md`). Déjà fonctionnels :

- `GET /health` (vérifie DB + Redis)
- Validation Joi de toutes les entrées
- Authentification JWT + contrôle de rôle
- Service de scoring (`scoreService`) + service OTP (`otpService`)
