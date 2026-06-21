# Creveton — Spécification d'API

**Version** 1.0 · Juin 2026 · Document confidentiel
**Périmètre** Backend REST partagé par `creveton/mobile` et `creveton/creveton-admin`
**Complément du** Cahier des charges consolidé v2.0 (réf. §5)

> Ce document fait foi pour le contrat d'interface entre le backend, l'app mobile et la console admin. Tout écart doit être validé en amont. Les routes marquées **`flag`** dépendent du feature flag `tournaments.paid.enabled` et restent inactives au lancement (voir CDC §2.4).

---

## Sommaire

1. [Conventions générales](#1-conventions-générales)
2. [Authentification](#2-authentification)
3. [Modèle d'erreur](#3-modèle-derreur)
4. [Endpoints — Auth](#4-endpoints--auth)
5. [Endpoints — Questions & synchronisation](#5-endpoints--questions--synchronisation)
6. [Endpoints — Sessions de jeu](#6-endpoints--sessions-de-jeu)
7. [Endpoints — Classement](#7-endpoints--classement)
8. [Endpoints — Tournois](#8-endpoints--tournois)
9. [Endpoints — Challenges](#9-endpoints--challenges)
10. [Endpoints — Profil & utilisateur](#10-endpoints--profil--utilisateur)
11. [Endpoints — Wallet & paiements (flag)](#11-endpoints--wallet--paiements-flag)
12. [Endpoints — Administration](#12-endpoints--administration)
13. [Temps réel — Socket.io](#13-temps-réel--socketio)
14. [Webhooks & push](#14-webhooks--push)
15. [Schémas d'objets réutilisables](#15-schémas-dobjets-réutilisables)
16. [Catalogue des codes d'erreur](#16-catalogue-des-codes-derreur)

---

## 1. Conventions générales

| Élément | Convention |
|---|---|
| **Base URL** | `https://api.creveton.app/api/v1` |
| **Versioning** | Préfixe de chemin `/v1`. Toute rupture de contrat → `/v2`. |
| **Content-Type** | `application/json; charset=utf-8` en requête et réponse. |
| **Encodage** | UTF-8 partout. |
| **Identifiants** | UUID v4 (string). |
| **Horodatages** | ISO 8601 UTC, ex. `2026-06-21T10:00:00Z`. |
| **Montants** | Entiers en **FCFA** (XAF n'a pas de sous-unité). `"amount": 2000` = 2 000 FCFA. |
| **Langue** | Header `Accept-Language: fr` ou `en` (défaut `fr`). |
| **Casse JSON** | `snake_case` pour tous les champs. |

### Pagination

Pagination par curseur pour les listes volumineuses (historique, classement, admin).

**Paramètres de requête**

| Param | Type | Défaut | Description |
|---|---|---|---|
| `limit` | int | 20 | Max 100. |
| `cursor` | string | — | Curseur opaque renvoyé par la page précédente. |
| `sort` | string | dépend | Ex. `-created_at` (préfixe `-` = desc). |

**Enveloppe de réponse paginée**

```json
{
  "data": [ /* items */ ],
  "page": {
    "limit": 20,
    "next_cursor": "eyJpZCI6IjB4...",
    "has_more": true
  }
}
```

### Rate limiting

Limites : **100 req/min/IP** (public), **500 req/min** (authentifié), **5/heure** sur l'envoi d'OTP.

Headers renvoyés sur chaque réponse :

```
X-RateLimit-Limit: 500
X-RateLimit-Remaining: 487
X-RateLimit-Reset: 1718965200
```

Dépassement → `429 Too Many Requests` (code `RATE_LIMITED`) avec header `Retry-After` (secondes).

### Idempotence

Les requêtes à effet financier (`/wallet/recharge`, `/tournaments/:id/join`) acceptent un header :

```
Idempotency-Key: <uuid généré par le client>
```

Le serveur garantit qu'une même clé ne déclenche qu'une seule opération (rejouer la requête renvoie la réponse initiale). Clé conservée 24 h.

---

## 2. Authentification

Authentification **stateless par JWT Bearer**.

```
Authorization: Bearer <access_token>
```

| Token | Durée | Usage |
|---|---|---|
| `access_token` | 1 h | Toutes les requêtes authentifiées. |
| `refresh_token` | 30 j | Obtenir un nouvel `access_token` via `/auth/refresh`. |

**Claims du JWT (payload)**

```json
{
  "sub": "9f1c2e6a-...",     // user_id
  "role": "player",          // player | moderator | admin | super_admin
  "lvl": 3,                  // niveau joueur (info, non autoritatif)
  "iat": 1718960000,
  "exp": 1718963600
}
```

Les routes `/admin/*` exigent `role ∈ {moderator, admin, super_admin}` selon l'opération (voir §12). Un rôle insuffisant → `403 FORBIDDEN`.

---

## 3. Modèle d'erreur

Toutes les erreurs partagent une enveloppe unique.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Le champ « phone » est invalide.",
    "details": [
      { "field": "phone", "issue": "format", "expected": "+237XXXXXXXXX" }
    ],
    "request_id": "req_8f2c..."
  }
}
```

| Champ | Description |
|---|---|
| `code` | Code stable, lisible machine (voir §16). |
| `message` | Message lisible humain, déjà localisé selon `Accept-Language`. |
| `details` | Optionnel : liste de problèmes par champ (validation). |
| `request_id` | À fournir au support pour traçabilité. |

### Codes HTTP utilisés

| Code | Signification |
|---|---|
| `200` | OK |
| `201` | Créé |
| `204` | OK sans corps |
| `400` | Requête invalide / validation |
| `401` | Non authentifié (token absent/expiré) |
| `403` | Authentifié mais non autorisé (rôle, feature flag) |
| `404` | Ressource introuvable |
| `409` | Conflit (doublon, état incompatible) |
| `422` | Entité non traitable (règle métier) |
| `429` | Rate limit dépassé |
| `500` | Erreur serveur |
| `503` | Service tiers indisponible (Mobile Money, SMS) |

---

## 4. Endpoints — Auth

### POST /auth/register

Crée un compte joueur et déclenche l'envoi d'un OTP SMS. Le compte est `phone_verified: false` tant que l'OTP n'est pas validé.

**Auth** : Public

**Requête**

```json
{
  "name": "Awa Mballa",
  "email": "awa.mballa@example.cm",
  "phone": "+237690000000",
  "password": "M0tDePasse!",
  "ville": "Yaoundé",
  "age": 16,
  "sexe": "F",
  "lang": "fr",
  "referral_code": "CREV-7HQ2"
}
```

| Champ | Type | Requis | Règles |
|---|---|---|---|
| `name` | string | oui | 2–100 caractères |
| `email` | string | oui | format email, unique |
| `phone` | string | oui | `+237` + 9 chiffres, unique |
| `password` | string | oui | ≥ 8 caractères, 1 chiffre, 1 majuscule |
| `ville` | string | non | — |
| `age` | int | non | 6–99 |
| `sexe` | enum | non | `H` \| `F` \| `N` |
| `lang` | enum | non | `fr` \| `en` (défaut `fr`) |
| `referral_code` | string | non | code parrain existant |

**Réponse `201`**

```json
{
  "user_id": "9f1c2e6a-1b2c-4d3e-8f90-aabbccddeeff",
  "phone": "+237690000000",
  "otp_sent": true,
  "otp_expires_at": "2026-06-21T10:10:00Z"
}
```

**Erreurs** : `400 VALIDATION_ERROR`, `409 EMAIL_ALREADY_USED`, `409 PHONE_ALREADY_USED`, `503 SMS_PROVIDER_UNAVAILABLE`.

---

### POST /auth/verify-otp

Valide le code OTP et retourne les tokens. À succès, `phone_verified` passe à `true`.

**Auth** : Public

**Requête**

```json
{ "phone": "+237690000000", "code": "482915" }
```

| Champ | Règles |
|---|---|
| `code` | 6 chiffres, expiration 10 min, 3 tentatives max |

**Réponse `200`**

```json
{
  "access_token": "eyJhbGci...",
  "refresh_token": "eyJhbGci...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "user": { /* objet User abrégé, voir §15 */ }
}
```

**Erreurs** : `400 OTP_INVALID`, `410 OTP_EXPIRED`, `429 OTP_TOO_MANY_ATTEMPTS`.

---

### POST /auth/resend-otp

Renvoie un OTP (rate-limit 5/heure/numéro).

**Requête** : `{ "phone": "+237690000000" }`
**Réponse `200`** : `{ "otp_sent": true, "otp_expires_at": "2026-06-21T10:20:00Z" }`
**Erreurs** : `429 RATE_LIMITED`, `404 USER_NOT_FOUND`.

---

### POST /auth/login

Connexion par email + mot de passe. (Google OAuth : v1.5, hors périmètre actuel.)

**Requête**

```json
{ "email": "awa.mballa@example.cm", "password": "M0tDePasse!" }
```

**Réponse `200`** : identique à `/auth/verify-otp`.
**Erreurs** : `401 AUTH_INVALID_CREDENTIALS`, `403 PHONE_NOT_VERIFIED`, `403 ACCOUNT_SUSPENDED`.

---

### POST /auth/refresh

**Requête** : `{ "refresh_token": "eyJhbGci..." }`
**Réponse `200`** : `{ "access_token": "...", "expires_in": 3600 }`
**Erreurs** : `401 REFRESH_TOKEN_INVALID`, `401 REFRESH_TOKEN_EXPIRED`.

---

### POST /auth/logout

Révoque le refresh token courant. **Auth** : Token. **Réponse** : `204`.

---

## 5. Endpoints — Questions & synchronisation

> Règle d'or (CDC §2.8) : l'app ne stocke jamais de questions en dur. Tout passe par ces endpoints. Le quiz lit depuis le cache local, alimenté par le delta sync.

### GET /questions

Renvoie un set de questions filtré pour démarrer une partie (utilisé surtout en mode live ; en mode hybride, l'app pioche dans son cache local).

**Auth** : Token

**Query** : `?theme=culture&level=beginner&count=10`

| Param | Valeurs |
|---|---|
| `theme` | `culture` \| `geographie` \| `histoire` \| `industrie` \| `sport` \| `science` |
| `level` | `beginner` \| `intermediate` \| `expert` |
| `count` | 1–20 |

**Réponse `200`**

```json
{
  "data": [
    {
      "id": "b21e...",
      "type": "mcq",
      "text": "Quelle est la capitale du Cameroun ?",
      "options": [
        { "index": 0, "text": "Douala" },
        { "index": 1, "text": "Yaoundé" },
        { "index": 2, "text": "Bafoussam" },
        { "index": 3, "text": "Garoua" }
      ],
      "theme": "geographie",
      "level": "beginner",
      "version": 3
    }
  ],
  "seed": "a3f9c1"
}
```

> **Anti-triche** : `correct_index` et `explanation` ne sont **jamais** renvoyés ici. La bonne réponse est révélée uniquement dans la réponse de `/sessions/submit`, après validation serveur. Le `seed` garantit le même tirage pour les deux joueurs d'un challenge.

**Erreurs** : `400 VALIDATION_ERROR`, `404 NO_QUESTIONS_AVAILABLE`.

---

### GET /questions/delta

Cœur de la synchronisation. Renvoie uniquement ce qui a changé depuis `since`.

**Auth** : Token

**Query** : `?since=2026-05-20T10:00:00Z`

**Réponse `200`**

```json
{
  "new": [ { /* Question complète (sans correct_index) */ } ],
  "updated": [ { "id": "b21e...", "version": 4, "...": "..." } ],
  "deleted_ids": ["c33f...", "d44a..."],
  "synced_at": "2026-06-21T10:00:00Z"
}
```

Algorithme client : UPSERT `new[]` + `updated[]`, soft-delete `deleted_ids[]`, puis stocker `synced_at` comme nouveau `last_sync_at` (CDC §2.8). `updated_at` est **indexé** côté base.

**Erreurs** : `400 INVALID_TIMESTAMP`.

---

### GET /questions/all

Snapshot complet pour le **premier lancement** (onboarding) quand il n'existe pas de `last_sync_at`. Paginé.

**Auth** : Token
**Query** : `?limit=200&cursor=...`
**Réponse `200`** : enveloppe paginée d'objets Question + `synced_at`.

---

## 6. Endpoints — Sessions de jeu

### POST /sessions/submit

Soumet une partie complète. Le serveur **recalcule** le score (timer serveur-authoritative, anti-triche), crédite l'XP, met à jour le niveau et le classement.

**Auth** : Token

**Requête**

```json
{
  "mode": "normal",
  "theme": "geographie",
  "level": "beginner",
  "started_at": "2026-06-21T10:00:00Z",
  "answers": [
    { "question_id": "b21e...", "selected_index": 1, "elapsed_ms": 4200, "skipped": false },
    { "question_id": "c87d...", "selected_index": 0, "elapsed_ms": 18900, "skipped": false },
    { "question_id": "e09a...", "selected_index": null, "elapsed_ms": 30000, "skipped": true }
  ]
}
```

| Champ | Type | Description |
|---|---|---|
| `mode` | enum | `normal` \| `tournament` \| `challenge` |
| `elapsed_ms` | int | Temps de réponse (sert au bonus vitesse + détection triche < 1 s) |
| `selected_index` | int\|null | `null` si passée/timeout |
| `skipped` | bool | Bouton « Passer » |

**Réponse `200`**

```json
{
  "session_id": "55aa...",
  "score": 350,
  "correct_count": 7,
  "total_questions": 10,
  "xp_earned": 1050,
  "speed_bonus": 100,
  "streak_max": 4,
  "level_before": 2,
  "level_after": 3,
  "level_unlocked": true,
  "unlocked_difficulty": "expert",
  "review": [
    {
      "question_id": "b21e...",
      "your_index": 1,
      "correct_index": 1,
      "is_correct": true,
      "explanation": "Yaoundé est la capitale politique du Cameroun depuis 1922."
    }
  ]
}
```

> **Calcul du score (référence).** Par bonne réponse : `points_base(level)` (50/75/100) ; si `elapsed_ms ≤ 5000` → `+50 %` (bonus vitesse). XP de session : `score × multiplicateur_niveau × multiplicateur_streak`. Streak : ×1,5 dès 3 bonnes réponses consécutives, ×2 dès 5. Déverrouillage difficulté supérieure si réussite ≥ 70 %.

**Erreurs** : `400 VALIDATION_ERROR`, `409 SESSION_ALREADY_SUBMITTED`, `422 CHEAT_DETECTED` (réponses < 1 s répétées).

---

## 7. Endpoints — Classement

### GET /leaderboard

**Auth** : Token

**Query**

| Param | Valeurs | Défaut |
|---|---|---|
| `scope` | `global` \| `theme` \| `weekly` \| `monthly` | `global` |
| `theme` | (si `scope=theme`) | — |
| `limit` | 1–100 | 20 |
| `cursor` | — | — |

**Réponse `200`**

```json
{
  "me": { "rank": 142, "score": 8450, "level": 3 },
  "data": [
    { "rank": 1, "user_id": "...", "name": "Junior K.", "level": 5, "score": 41200, "ville": "Douala" },
    { "rank": 2, "user_id": "...", "name": "Awa M.", "level": 4, "score": 38900, "ville": "Yaoundé" }
  ],
  "page": { "limit": 20, "next_cursor": "...", "has_more": true }
}
```

---

## 8. Endpoints — Tournois

> La couche **payante** (`entry_fee > 0`, paiement, payout) est derrière le flag `tournaments.paid.enabled`. Tant qu'il est `false`, seuls les tournois `type: "free"` sont joignables ; rejoindre un tournoi payant renvoie `403 FEATURE_DISABLED`.

### GET /tournaments

**Auth** : Token
**Query** : `?status=open&type=free`

**Réponse `200`**

```json
{
  "data": [
    {
      "id": "t_grand_juin26",
      "name": "Grand Tournoi Juin",
      "type": "grand",
      "entry_fee": 2000,
      "currency": "XAF",
      "max_players": 128,
      "registered_players": 96,
      "prize_pool": 256000,
      "theme": "histoire",
      "format": { "questions": 40, "time_per_q_s": 25 },
      "status": "open",
      "starts_at": "2026-06-25T19:00:00Z",
      "ends_at": "2026-06-25T19:45:00Z",
      "joinable": true
    }
  ]
}
```

`status` : `scheduled` → `open` → `running` → `closed` → `paid` (ou `cancelled`).

---

### GET /tournaments/:id

Détail d'un tournoi + classement live si `running`/`closed`.

**Réponse `200`** : objet Tournament complet + `participants[]` (rank, score, user abrégé) + `my_participation` (statut d'inscription du joueur courant).

---

### POST /tournaments/:id/join · `flag`

Inscrit le joueur. Si `entry_fee > 0`, déclenche le paiement Mobile Money (voir §11/§14) ; l'inscription est **`pending`** jusqu'à réception du webhook de paiement, puis **`confirmed`**.

**Auth** : Token · **Header** : `Idempotency-Key`

**Requête**

```json
{ "payment": { "provider": "mtn_momo", "phone": "+237690000000" } }
```

**Réponse `202`** (paiement en attente)

```json
{
  "participation_id": "tp_88...",
  "status": "pending_payment",
  "payment": {
    "transaction_id": "tx_9a...",
    "amount": 2000,
    "provider": "mtn_momo",
    "ussd_prompt_sent": true
  }
}
```

**Réponse `201`** (tournoi gratuit, inscription immédiate) : `{ "participation_id": "...", "status": "confirmed" }`

**Erreurs** : `403 FEATURE_DISABLED`, `409 TOURNAMENT_FULL`, `409 ALREADY_REGISTERED`, `422 TOURNAMENT_NOT_OPEN`, `402 PAYMENT_REQUIRED`, `503 PAYMENT_PROVIDER_UNAVAILABLE`.

---

## 9. Endpoints — Challenges

### POST /challenges/create

Crée un défi 1v1 contre un ami (`opponent_id`) ou un adversaire aléatoire de même niveau (`opponent_id: null`). Le challenger joue en premier ; l'adversaire reçoit un push.

**Auth** : Token

**Requête**

```json
{ "opponent_id": "a77b...", "theme": "culture", "level": "intermediate", "stake": 0 }
```

`stake` > 0 réservé v2 et soumis au flag payant.

**Réponse `201`**

```json
{
  "challenge_id": "ch_12...",
  "status": "awaiting_challenger_play",
  "seed": "a3f9c1",
  "questions": [ /* set figé, même seed pour les deux joueurs */ ]
}
```

### POST /challenges/:id/accept

L'adversaire accepte → renvoie le même set (même `seed`). **Réponse `200`**.

### POST /challenges/:id/submit

Même corps que `/sessions/submit` (`mode: "challenge"`). Quand les deux ont joué, le gagnant est désigné (+25 % XP).

**Réponse `200`**

```json
{
  "challenge_id": "ch_12...",
  "status": "completed",
  "score_challenger": 280,
  "score_opponent": 310,
  "winner_id": "a77b...",
  "xp_bonus": 70
}
```

**Erreurs** : `404 CHALLENGE_NOT_FOUND`, `409 ALREADY_PLAYED`, `422 CHALLENGE_EXPIRED`.

---

## 10. Endpoints — Profil & utilisateur

### GET /users/me

Profil courant complet. **Réponse `200`** : objet User (voir §15) + `stats` (parties, % réussite, thème favori).

### PATCH /users/me

Met à jour les champs modifiables : `name`, `ville`, `age`, `sexe`, `lang`, `password` (avec `current_password`). **Réponse `200`** : User mis à jour.

### GET /users/me/history

Historique paginé des 50 dernières parties.

```json
{
  "data": [
    { "session_id": "...", "theme": "histoire", "level": "expert", "score": 1500,
      "correct_count": 18, "total_questions": 20, "xp_earned": 4500, "played_at": "2026-06-20T18:00:00Z" }
  ],
  "page": { "limit": 20, "next_cursor": "...", "has_more": true }
}
```

### GET /users/me/transactions · `flag`

Historique Mobile Money / wallet (dépôts, retraits, payouts).

---

## 11. Endpoints — Wallet & paiements (flag)

> Tout ce bloc dépend de `tournaments.paid.enabled`. Désactivé → `403 FEATURE_DISABLED`.

### GET /wallet

```json
{ "balance": 3500, "currency": "XAF", "pending": 0 }
```

### POST /wallet/recharge

Recharge le wallet via Mobile Money. **Header** : `Idempotency-Key`.

**Requête** : `{ "amount": 2000, "provider": "orange_money", "phone": "+237690000000" }`

**Réponse `202`**

```json
{
  "transaction_id": "tx_9a...",
  "status": "pending",
  "amount": 2000,
  "provider": "orange_money",
  "ussd_prompt_sent": true,
  "reference": "CRV-TX-2026-0001"
}
```

Le crédit effectif intervient à réception du webhook signé (§14). Statuts transaction : `pending` → `success` \| `failed` \| `reversed`.

> **Sécurité paiement** : signature HMAC obligatoire des webhooks, double vérification du montant, idempotence (clé conservée 24 h), retry automatique (3× / 5 min). KYC requis pour tout retrait > 10 000 FCFA.

---

## 12. Endpoints — Administration

Préfixe `/admin`. Auth requise avec rôle suffisant.

| Opération | Rôle minimum |
|---|---|
| Lire questions / users / analytics | `moderator` |
| Créer/modifier/approuver une question | `moderator` |
| Supprimer une question, gérer users (suspendre, reset) | `admin` |
| Créer/lancer un tournoi, déclencher payouts | `admin` |
| Gérer l'équipe admin, paramètres système, feature flags | `super_admin` |

### Questions

#### POST /admin/questions

Crée une question. Statut initial forcé à `draft` ou `pending_review` (jamais `approved` directement).

**Requête**

```json
{
  "text_fr": "Quel fleuve traverse Yaoundé ?",
  "text_en": null,
  "type": "mcq",
  "options": [
    { "text": "Le Wouri", "is_correct": false },
    { "text": "La Sanaga", "is_correct": false },
    { "text": "Le Mfoundi", "is_correct": true },
    { "text": "Le Nyong", "is_correct": false }
  ],
  "theme": "geographie",
  "level": "intermediate",
  "explanation": "Le Mfoundi traverse Yaoundé.",
  "tags": ["fleuve", "yaoundé"],
  "language": "fr",
  "media_url": null,
  "source": "manual"
}
```

Validation : exactement une option `is_correct`, champs requis présents, détection de doublon par hash du texte.

**Réponse `201`** : objet Question avec `status`, `version: 1`, `created_by`.
**Erreurs** : `400 VALIDATION_ERROR`, `409 DUPLICATE_QUESTION`, `422 INVALID_CORRECT_OPTION_COUNT`.

#### PATCH /admin/questions/:id

Modifie une question ; incrémente `version`, bumpe `updated_at` (déclenche le delta sync). Une modification de la bonne réponse réinitialise `success_rate`.

#### POST /admin/questions/:id/transition

Change le statut dans le workflow.

**Requête** : `{ "to": "approved" }` (ou `rejected` avec `reason`)
Transitions : `draft → review → approved/rejected`, `approved → archived`, `rejected → review`.

#### DELETE /admin/questions/:id

**Soft delete** (jamais de suppression réelle) : pose `deleted_at`, `status: archived`. L'app la retirera au prochain delta sync.

#### POST /admin/questions/import

Import CSV/Excel en masse. `multipart/form-data`, champ `file`.

Template : `question | option_a | option_b | option_c | option_d | correct | difficulty | category`

**Réponse `200`**

```json
{
  "total_rows": 200,
  "accepted": 187,
  "rejected": 13,
  "errors": [
    { "row": 14, "issue": "correct hors A-D" },
    { "row": 52, "issue": "doublon (hash) avec question existante" }
  ]
}
```

#### POST /admin/questions/force-sync

Retrait d'urgence (< 30 s) : déclenche un push silencieux FCM/APNs `force_sync` (§14).

**Requête** : `{ "question_ids": ["uuid-à-retirer"] }`
**Réponse `202`** : `{ "pushed": true, "devices_targeted": 14230 }`

### Utilisateurs

| Méthode | Route | Description |
|---|---|---|
| GET | `/admin/users` | Liste paginée + filtres (`ville`, `level`, `role`, `status`, `q`) |
| GET | `/admin/users/:id` | Fiche : profil, stats, historique, transactions |
| POST | `/admin/users/:id/suspend` | `{ "reason": "...", "until": "2026-07-01T00:00:00Z" }` |
| POST | `/admin/users/:id/ban` | Bannissement définitif |
| POST | `/admin/users/:id/reset-password` | Déclenche une réinitialisation |
| DELETE | `/admin/users/:id` | Soft delete RGPD + purge planifiée |
| GET | `/admin/referrals/:code` | Nombre d'inscrits via un code parrain |

### Tournois

| Méthode | Route | Description |
|---|---|---|
| POST | `/admin/tournaments` | Créer/programmer (name, type, entry_fee, max_players, theme, starts_at) |
| POST | `/admin/tournaments/:id/start` | Lancer (vérifie min joueurs) |
| POST | `/admin/tournaments/:id/cancel` | Annuler + remboursements auto si payant |
| POST | `/admin/tournaments/:id/payout` | Valider résultats + déclencher payouts |

### Analytics

#### GET /admin/analytics

**Query** : `?period=30d&metrics=dau,mau,revenue,retention`

**Réponse `200`**

```json
{
  "period": "30d",
  "dau": 1240, "mau": 3380, "dau_mau_ratio": 0.367,
  "new_signups": 1530,
  "activation_rate": 0.72,
  "retention": { "d1": 0.41, "d7": 0.21, "d30": 0.11 },
  "revenue_fcfa": 0,
  "tournaments_run": 0,
  "transactions": { "total": 0, "pending": 0 },
  "by_type": { "free": 8200, "mini": 0, "grand": 0, "premium": 0 }
}
```

> Au lancement (flag payant `false`), `revenue_fcfa`, `transactions` et les types payants sont à `0` — cohérent avec le MVP gratuit (CDC §7).

---

## 13. Temps réel — Socket.io

Namespace tournois temps réel. Connexion authentifiée par JWT (handshake `auth: { token }`).

**Rooms** : une par tournoi, ex. `tournament:t_grand_juin26`.

### Événements serveur → client

| Événement | Payload | Description |
|---|---|---|
| `tournament:lobby` | `{ registered, max_players, starts_in_s }` | État du lobby avant départ |
| `question` | `{ index, total, question, deadline_at }` | Question diffusée simultanément |
| `answer:ack` | `{ index, received_at }` | Accusé de réception serveur |
| `score:update` | `{ leaderboard: [...top10], my_rank }` | Classement live |
| `tournament:end` | `{ final_rank, score, payout }` | Clôture + résultat |
| `reconnect:state` | `{ current_index, score, deadline_at }` | Restauration après coupure (état Redis) |

### Événements client → serveur

| Événement | Payload |
|---|---|
| `answer` | `{ index, selected_index, elapsed_ms }` |

> Chronomètre **serveur-authoritative** : toute réponse reçue après `deadline_at` est comptée incorrecte. Score calculé et validé côté serveur. Reconnexion automatique : l'état est restauré depuis Redis (`reconnect:state`).

---

## 14. Webhooks & push

### Webhook paiement (prestataire → backend)

`POST /webhooks/payments/:provider` (`orange_money` | `mtn_momo` | `campay`)

**Sécurité** : signature **HMAC** dans le header `X-Signature` à vérifier avant traitement. Idempotence par `reference`.

**Corps (normalisé)**

```json
{
  "reference": "CRV-TX-2026-0001",
  "transaction_id": "tx_9a...",
  "status": "success",
  "amount": 2000,
  "provider": "mtn_momo",
  "paid_at": "2026-06-21T10:03:00Z"
}
```

**Réponse attendue** : `200` (sinon le prestataire retente : 3× / 5 min).
Sur `success` : crédit du wallet / confirmation d'inscription. Sur `failed` : participation annulée.

### Push silencieux (backend → app) — force_sync

Notification data-only FCM/APNs déclenchée par `/admin/questions/force-sync`. L'app retire la question du cache local en < 30 s, même en arrière-plan.

```json
{ "data": { "type": "force_sync", "question_ids": ["uuid-à-retirer"] } }
```

Autres types de push : `tournament_start`, `challenge_received`, `level_up`, `tournament_result`.

---

## 15. Schémas d'objets réutilisables

### User

```json
{
  "id": "uuid",
  "name": "string",
  "email": "string",
  "phone": "string",
  "phone_verified": true,
  "ville": "string|null",
  "age": "int|null",
  "sexe": "H|F|N|null",
  "lang": "fr|en",
  "total_xp": 0,
  "level": 1,
  "role": "player|moderator|admin|super_admin",
  "wallet_balance": 0,
  "referral_code": "string",
  "created_at": "ISO8601",
  "last_active_at": "ISO8601|null"
}
```

### Question (vue joueur — sans solution)

```json
{
  "id": "uuid",
  "type": "mcq|true_false|open|order",
  "text": "string",
  "options": [ { "index": 0, "text": "string" } ],
  "theme": "culture|geographie|histoire|industrie|sport|science",
  "level": "beginner|intermediate|expert",
  "media_url": "string|null",
  "version": 1
}
```

### Question (vue admin — complète)

Ajoute : `text_fr`, `text_en`, `options[].is_correct`, `correct_index`, `explanation`, `tags[]`, `source`, `status`, `success_rate`, `created_by`, `updated_at`, `deleted_at`.

### Tournament

```json
{
  "id": "uuid",
  "name": "string",
  "type": "free|flash|mini|grand|premium",
  "entry_fee": 0,
  "currency": "XAF",
  "max_players": 128,
  "registered_players": 0,
  "prize_pool": 0,
  "theme": "string",
  "format": { "questions": 40, "time_per_q_s": 25 },
  "status": "scheduled|open|running|closed|paid|cancelled",
  "starts_at": "ISO8601",
  "ends_at": "ISO8601"
}
```

### Transaction

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "type": "deposit|withdraw|payout|entry_fee|refund",
  "amount": 0,
  "currency": "XAF",
  "provider": "orange_money|mtn_momo|campay",
  "status": "pending|success|failed|reversed",
  "reference": "string",
  "created_at": "ISO8601"
}
```

---

## 16. Catalogue des codes d'erreur

| Code | HTTP | Signification |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Champ(s) invalide(s), voir `details` |
| `INVALID_TIMESTAMP` | 400 | Paramètre `since` mal formé |
| `AUTH_INVALID_CREDENTIALS` | 401 | Email/mot de passe incorrect |
| `TOKEN_EXPIRED` | 401 | Access token expiré |
| `REFRESH_TOKEN_INVALID` | 401 | Refresh token invalide/révoqué |
| `REFRESH_TOKEN_EXPIRED` | 401 | Refresh token expiré |
| `PHONE_NOT_VERIFIED` | 403 | OTP non validé |
| `ACCOUNT_SUSPENDED` | 403 | Compte suspendu/banni |
| `FORBIDDEN` | 403 | Rôle insuffisant |
| `FEATURE_DISABLED` | 403 | Fonctionnalité derrière un flag inactif |
| `USER_NOT_FOUND` | 404 | — |
| `QUESTION_NOT_FOUND` | 404 | — |
| `TOURNAMENT_NOT_FOUND` | 404 | — |
| `CHALLENGE_NOT_FOUND` | 404 | — |
| `NO_QUESTIONS_AVAILABLE` | 404 | Pool vide pour le filtre |
| `EMAIL_ALREADY_USED` | 409 | — |
| `PHONE_ALREADY_USED` | 409 | — |
| `DUPLICATE_QUESTION` | 409 | Hash de texte déjà existant |
| `SESSION_ALREADY_SUBMITTED` | 409 | — |
| `ALREADY_REGISTERED` | 409 | Déjà inscrit au tournoi |
| `TOURNAMENT_FULL` | 409 | `max_players` atteint |
| `ALREADY_PLAYED` | 409 | Challenge déjà joué |
| `OTP_INVALID` | 400 | Mauvais code |
| `OTP_EXPIRED` | 410 | Code expiré (10 min) |
| `OTP_TOO_MANY_ATTEMPTS` | 429 | > 3 tentatives |
| `PAYMENT_REQUIRED` | 402 | Paiement nécessaire |
| `INVALID_CORRECT_OPTION_COUNT` | 422 | ≠ 1 option correcte |
| `TOURNAMENT_NOT_OPEN` | 422 | État incompatible |
| `CHALLENGE_EXPIRED` | 422 | Délai dépassé |
| `CHEAT_DETECTED` | 422 | Anti-triche déclenché |
| `RATE_LIMITED` | 429 | Trop de requêtes |
| `SMS_PROVIDER_UNAVAILABLE` | 503 | Twilio indisponible |
| `PAYMENT_PROVIDER_UNAVAILABLE` | 503 | Mobile Money indisponible |
| `INTERNAL_ERROR` | 500 | Erreur serveur |

---

*Fin de la spécification — Creveton API v1.0 · Juin 2026 · Document confidentiel.*
