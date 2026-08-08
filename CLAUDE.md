# CLAUDE.md

Guidance pour les agents travaillant sur Creveton — app de quiz mobile compétitive
(Cameroun, joueurs 12–30 ans). Monorepo : `backend/` (Node·Express·PostgreSQL·Redis),
`creveton-admin/` (React 19·Vite·JS/JSX), `mobile/` (React Native·Expo).

## Lancer en local

- Backend : `cd backend && npm start` → http://localhost:4000 (API sous `/api/v1`,
  liveness sous `/health`). DB dev : `creveton_dev` (Postgres :5432), Redis :6379.
  Migrations : `npm run migrate` (`src/models/migrations/*.sql`, appliquées en ordre) ;
  lint : `npm run lint`.
- Admin : `cd creveton-admin && npm run dev` → http://localhost:5174. Vite proxifie
  `/api` **et** `/health` vers :4000. Login admin : `admin@creveton.cm` / `Admin1234`.
  Avant commit : `npm run lint` **et** `npm run build` doivent passer.
- Mobile : `cd mobile && npm start` (Expo). `EXPO_PUBLIC_API_URL` pointe le backend (sur
  appareil physique : l'IP LAN, **pas** `localhost`). Détails, conventions et build APK
  local dans **[`mobile/CLAUDE.md`](mobile/CLAUDE.md)** (à lire avant toute tâche mobile).
- Tests backend : `cd backend && npm test` (jest `--runInBand` ; `test:watch`,
  `test:coverage`). Les tests d'intégration tournent contre un **vrai** Postgres + Redis ;
  `tests/helpers/integration.js`
  (`ensureReady`/`resetState`/`createUser`/`tokenFor`/`createApprovedQuestion`) les
  saute proprement si l'infra est absente. Un seul fichier :
  `npm test -- challenges.test.js` (ou `-t "motif"` pour un test précis).

## Design Context

Le contexte de design produit/visuel vit à la racine et **fait autorité** pour toute
tâche d'interface (console admin) :

- **[`PRODUCT.md`](PRODUCT.md)** — register (`product`), utilisateurs, raison d'être,
  personnalité de marque (*chaleureux · camerounais · fiable*), anti-références, et les
  5 principes de design stratégiques.
- **[`DESIGN.md`](DESIGN.md)** — système visuel au format Stitch : North Star
  **« Le Cockpit Émeraude »**, charte vert profond / or rare, typo Outfit + Space Grotesk,
  élévation plate-par-défaut, composants. Tokens normatifs en frontmatter.
- **`.impeccable/design.json`** — sidecar (rampes tonales, ombres, motion, snippets de
  composants) consommé par `/impeccable live`.

On versionne le contexte de design (`design.json`, `.impeccable/live/config.json`) **mais pas**
l'état runtime : les caches `**/.impeccable/hook.cache.json` (par session, éparpillés dans les
sous-dossiers) sont gitignorés.

**Avant toute modification d'UI dans `creveton-admin/`**, lire `DESIGN.md`. Règles clés :
l'or ≤ 10 % de l'écran (CTA primaire, nav active, récompenses) ; tout chiffre important en
Outfit ≥ 700 ; surfaces plates (bordure 1px, ombre légère), profondeur réservée aux
overlays ; toute couleur signifiante doublée d'un libellé ; états skeleton/vide/erreur
obligatoires ; confirmation explicite sur toute action destructrice ; `Escape` ferme
modales et drawers.

Tokens sources côté code : `creveton-admin/src/constants/theme.js` (JS) et
`creveton-admin/src/index.css` (CSS). DESIGN.md les reflète ; en cas de dérive, le
régénérer avec `/impeccable document`.

## Backend — conventions

- **Couches** : route → `validate(schema)` (+ `requirePermission(op)` pour `/admin/*`) →
  contrôleur fin (`asyncHandler`) → service (logique) → model (SQL). Pas de logique dans
  les contrôleurs.
- **Erreurs** : `throw new ApiError('CODE', { message?, details? })`. Le catalogue
  `src/utils/errorCodes.js` mappe code → http. Le middleware d'erreurs produit
  `{ error: { code, message, request_id } }`.
- **Enveloppe de réponse** : les helpers `ok/created/noContent` (`src/utils/response.js`)
  renvoient le payload **au niveau racine** (ex. `{ access_token, ... }` ou
  `{ data, page }` quand le service le structure ainsi), **pas** sous une clé `.data`
  automatique. Les erreurs, elles, sont sous `.error`.
- **Permissions admin** : `src/middlewares/admin.middleware.js` — table `PERMISSIONS`
  (`op → rôle minimum`) + hiérarchie `player < moderator < admin < super_admin`.
- **XP & niveau (1–5)** : `userModel.creditSessionXp(id, xpDelta, executor?)` est l'**unique**
  point d'écriture de `total_xp`. Il recalcule le niveau **en SQL** (`CASE`) dans la même
  requête. Bandes : `LEVEL_XP_THRESHOLDS = [0, 200, 500, 1200, 3000]` (= `userModel.XP_LEVELS`,
  `levelForXp`). Tout gain (`/sessions/submit`, `/challenges/:id/submit`, bonus vainqueur)
  passe par cette fonction.
- **Score** : `src/services/scoreService.js` (module pur, testable) — `computeSession`,
  `basePoints(level)`, `speedBonus(base, elapsedMs)`. Base : beginner 50 / intermediate 75 /
  expert 100 ; bonus vitesse +50 % si `elapsed_ms ≤ 5000`.
- **Défis 1v1 (`src/services/challengeService.js`, spec §9)** : les deux joueurs répondent
  au **même set figé** (`question_ids` + `seed`) ; le vainqueur reçoit **+25 % d'XP**.
  Colonne `opponent_id` (NULL = matchmaking aléatoire). Statut « métier » exposé (dérivé,
  indépendant du label DB) : `awaiting_challenger_play` / `awaiting_opponent_play` / `completed`.
  Routes (toutes sous `authenticate`) :
  · `POST /challenges/create` — le challenger reçoit le set, joue en premier.
  · `POST /challenges/:id/accept` — l'adversaire récupère le **même** set.
  · `POST /challenges/:id/submit` — score serveur (même `scoreService.computeSession` que
    `/sessions/submit`, niveau **stocké** sur le défi). Réponse **auto-suffisante côté
    soumettant** dans les deux branches : `your_score`, `xp_earned`, `total_questions`,
    `correct_count` ; en `completed` ajoute `opponent_score`, `won` (true/false/`null`=égalité),
    `score_challenger`/`score_opponent`/`winner_id`/`xp_bonus`.
  · `GET /challenges?status=received|sent|completed&page=&limit=` — liste paginée pour les
    onglets mobile ; joint l'adversaire (`opponent {id,name,avatar_url,level}`). `received` =
    `opponent_id = moi AND pending` ; `sent` = `challenger_id = moi AND pending` ; `completed` =
    participant des deux côtés. (Filtres SQL qualifiés `c.` — `users.status` ambigu après le JOIN.)
  · `DELETE /challenges/:id/decline` — **destinataire** refuse (`pending → declined`, 403/400/404).
  · `DELETE /challenges/:id` — **émetteur** annule (`pending → cancelled`, 403/400/404).
  Tests d'intégration : `backend/tests/challenges.test.js`.
- **Annuaire joueurs** : `GET /users/search?q=&limit=` (`userModel.search`) — `name`/`phone`
  ILIKE, exclut soi-même + comptes non `active`/supprimés, projection réduite
  (`id,name,avatar_url,level,total_xp` — jamais `phone`/`email`), `q` ≥ 2 caractères (sinon 400),
  limit défaut 10 / max 20. Sert à cibler un ami pour un défi côté mobile.
- **Support admin (tickets + signalements)** : sous-système **admin-only**, monté sur
  `/admin/support/*` (`routes/admin/support.admin.routes.js`, schémas Joi inline →
  `support.admin.controller` → `supportService` → `support.model`). Permissions dédiées
  (`admin.middleware.js`) : `support:read` (moderator), `support:manage` / `support:assign`
  (admin). **Tickets** : `status` open→in_progress→resolved/closed, `priority`
  urgent/normal/low, `type` account/question/bug/other. `POST /tickets/:id/reply`
  (`supportService.replyTicket`) porte la **seule** logique métier — ajoute un message
  `sender_role='admin'` puis transitionne le statut (`resolve` → resolved, sinon
  open → in_progress) ; le reste du service est du pass-through model. **Signalements de
  questions** : `GET /reports`, `/reports/summary`, `PATCH /reports/:id/status`
  (pending/ignored/resolved). `GET /kpis` agrège les compteurs. Tests :
  `backend/tests/support.test.js`.
- **Anti-triche** : `/sessions/submit` ≥ 3 réponses < 500 ms (`scoreService.CHEAT_MIN_MS`)
  → `CHEAT_DETECTED`, **sauf en `blitz`/`marathon`** (cadence rapide voulue ; garde-fou =
  timer global 62 s) ; `/sessions/answer` (feedback immédiat, mode `normal` only) une
  réponse < 150 ms → `CHEAT_DETECTED`. La bonne réponse n'est révélée qu'après soumission.
  (Seuils assouplis depuis 2 répétitions / 1 s / 500 ms pour limiter les faux positifs.)
- **Vérification d'adresse email** (`src/services/emailVerificationService.js`,
  migration `026_users_email_verified.sql`) : code à 6 chiffres par email, Redis
  `emailverify:<user_id>` (stocke aussi l'adresse **VISÉE** — un code demandé pour une
  adresse ne peut pas en valider une autre), TTL 15 min, 3 essais, 5/h. Routes
  **authentifiées** : `POST /users/me/email/verify/request` (adresse courante),
  `POST /users/me/email` (changement — code envoyé à la **nouvelle**, rien n'est écrit
  avant confirmation), `POST /users/me/email/verify`. `toPublic` expose `email_verified`.
  · **Non bloquant** : l'email part en parallèle de l'OTP à l'inscription
    (`issueOnRegister`, fire-and-forget) ; le compte est jouable sans. Ce qui est refusé
    sans vérification, c'est la **récupération de mot de passe**, pas l'usage. Les comptes
    existants sont à `false` (les marquer vrais perpétuerait le trou) ; les invitations
    admin acceptées sont backfillées à `true` (le lien prouvait déjà la boîte).
  · **Le changement d'adresse fait partie du lot** : `PATCH /users/me` n'accepte pas
    `email`, donc sans lui une faute de frappe à l'inscription serait définitive et le
    compte irrécupérable pour toujours. `userModel.setVerifiedEmail` pose adresse +
    drapeau dans la **même** requête. Notification par SMS (canal vérifié) — alerter
    l'ancienne adresse email n'aurait aucune valeur, c'est justement elle qui bouge.
  · Codes `VERIFY_CODE_INVALID` / `VERIFY_CODE_EXPIRED` / `VERIFY_TOO_MANY_ATTEMPTS` /
    `EMAIL_ALREADY_VERIFIED`. Front : mobile `components/EmailVerifySheet.js` (ligne Email
    du Profil, pastille « Non vérifié ») ; admin : pastille dans le tiroir Utilisateurs.
    Tests : `backend/tests/emailVerification.test.js`.
  · **Relance** : `components/EmailNudge.js`, bandeau en tête du corps de l'Accueil.
    Canal choisi faute d'ordonnanceur serveur (le push en exigerait un) et parce qu'une
    relance PAR EMAIL irait à l'adresse justement non prouvée. Fermable, mais revient
    après **7 jours** (`crv.email_nudge_dismissed_at`) : la conséquence, elle, ne
    disparaît pas. Disparaît seul quand `email_verified` passe à vrai.
- **Mot de passe oublié** (`src/services/passwordResetService.js`) : code à **6 chiffres
  par EMAIL** (Resend), Redis `pwdreset:<user_id>`, TTL 15 min, 3 tentatives, 5 demandes/h
  par compte. `POST /auth/forgot-password` répond **204 systématiquement** (anti-énumération,
  même règle que `login`) ; `POST /auth/reset-password { email, code, new_password }` renvoie
  les **mêmes tokens que `/auth/login`** après avoir coupé **TOUTES** les sessions
  (`authService.revokeAllSessions` — un reset veut dire « peut-être compromis », à la
  différence de `changePassword` qui préserve la session courante). Codes dédiés
  `RESET_CODE_INVALID` / `RESET_CODE_EXPIRED` / `RESET_TOO_MANY_ATTEMPTS`.
  · **Adresse vérifiée EXIGÉE** (`email_verified`) : sans elle, aucun code n'est émis —
    la réponse reste 204 (anti-énumération), et l'admin, lui, reçoit un motif explicite.
    La notification « mot de passe modifié » part par **SMS**, seul canal vérifié
    (`phone_verified`) : un email de confirmation irait à l'attaquant en cas d'usurpation.
  · Sur le chemin PUBLIC l'envoi est **fire-and-forget** : l'attendre créait un oracle
    temporel (mesuré 16,4 s pour un compte connu contre 3 ms pour un inconnu) qui annulait
    l'anti-énumération. L'admin, lui, attend (il veut savoir si c'est parti).
  · `emailService.send({ logSubject })` **caviarde le sujet dans les journaux** : celui du
    code le porte en clair (pour l'aperçu de notification), il atterrissait donc dans les logs.
  · `POST /admin/users/:id/reset-password` passe par le même service. **Il envoyait avant un
    OTP que RIEN ne consommait** — le seul consommateur, `/auth/verify-otp`, émet des tokens :
    le bouton de la console envoyait un code de *connexion* et le mot de passe restait
    inchangé. Front : mobile `ForgotPasswordScreen`/`ResetPasswordScreen` (+ `CodeInput`
    partagé, extrait d'`OTPScreen`) ; admin `pages/ForgotPassword.jsx` (`/forgot-password`,
    publique). Tests : `backend/tests/passwordReset.test.js`.
  · ⚠️ Prérequis de déploiement : `RESEND_API_KEY` **et un domaine vérifié chez Resend**
    (constaté en local : la clé existe mais `creveton.cm` n'est pas vérifié → envoi refusé).
- **Avatars (médias)** : stockés sur **Cloudinary**, jamais sur le disque local (éphémère
  sur Railway). `POST /users/me/avatar` (multipart, champ `avatar` ; `config/multer.js`
  `avatarUpload` = memoryStorage, 5 Mo, filtre `image/*` → rejet en `ApiError` 400) →
  `services/avatarService.js` (`uploader.unsigned_upload` via preset
  `CLOUDINARY_UPLOAD_PRESET`, défaut `creveton_avatar`, `public_id user_<id>`, dossier
  `creveton/avatars`) → on persiste `secure_url` (`userModel.setAvatar`). Le recadrage
  **200×200** vit dans le preset Cloudinary. `DELETE /users/me/avatar` supprime côté
  Cloudinary + colonne. Config : `config/cloudinary.js` lit `CLOUDINARY_CLOUD_NAME/
  API_KEY/API_SECRET` (+ `CLOUDINARY_UPLOAD_PRESET`) depuis l'env — à définir aussi sur
  Railway. Côté mobile, `avatar_url` est une URL HTTPS absolue (rendue telle quelle).
- **Bilingue FR/EN & traduction IA** (questions) : colonnes `text_fr` (**NOT NULL**, source
  de vérité), `text_en`, `options[].text_en`, `explanation`, `explanation_en`
  (migration `020_explanation_en.sql`). `toPlayerView` expose `text_fr`/`text_en`/`text`
  (= FR, rétro-compat) + options `{ index, text, text_fr, text_en }` — mais **JAMAIS**
  `explanation`/`explanation_en` (anti-triche, comme `correct_index`). L'explication EN
  transite, comme l'explication FR, par `/sessions/answer` et le `review[]` de
  `/sessions/submit` (révélation post-réponse). `src/services/aiCorrectorService.js` :
  `improveText({ text, lang, type, action })` — `action='correct'|'translate'` ; en
  traduction `lang` = langue **cible** (`'en'` = FR→EN, `'fr'` = EN→FR) ; les guillemets
  encadrants de la réponse IA sont retirés. `autoTranslate(id, sourceLang)` traduit énoncé +
  options + explication en un appel JSON et écrit via `questionModel.applyTranslation`
  (bump `version` pour le delta sync, `success_rate` **préservé**). Auto-traduction
  **fire-and-forget** après `create`/`update` admin et après chaque ligne importée (CSV),
  gardée par `ANTHROPIC_API_KEY`. Endpoint **bloquant** `POST /admin/questions/:id/translate`
  (`{ target_lang }`) pour le bouton « Traduire » (réutilise la permission
  `questions:update` — `questions:manage` n'existe pas). Scripts de batch idempotents
  (lots de 30) : `backend/scripts/translate-questions-en.js` (énoncés+options) et
  `translate-explanations-en.js` ; sur staging via `DATABASE_URL="…" node …` (TCP proxy
  Railway, proxy supprimé immédiatement après).
- **Génération assistée de questions** (`src/services/aiQuestionGeneratorService.js`,
  `generateDrafts({ theme, level, count })` ; `POST /admin/questions/generate`, perm
  `questions:create`, `count` ≤ 20/appel) : un appel IA par lot, chaque item inséré en
  **`status='draft'` + `source='ai_generated'`** (INVISIBLE côté app — le delta sync ne sert
  que `approved`), relecture humaine obligatoire (`approveDraft`/`rejectDraft`) ; auto-traduction
  FR→EN fire-and-forget par draft. **Ancrage régional** (prompt, revue 07-2026) : ~la moitié du
  lot biaisée vers du contenu Cameroun/Afrique centrale (le reste universel), **jamais** de fait
  régional inventé (dans le doute → fait universel vérifiable), + variation de la position de la
  bonne réponse. ⚠️ **Review** : le contenu régional augmente la surface d'erreurs
  plausibles-mais-fausses (dates/records) → vérifier chaque fait régional à la main.

## Frontend (`creveton-admin/`) — conventions

- **Routing** (`src/App.jsx`) : `/` et `/landing` → Landing (public) ; `/login` → Login
  (public) ; le reste sous `PrivateRoute` → `/dashboard`, `/questions`, `/classement`,
  `/sessions` (Parties), `/tournaments` (Tournois), `/users` (Utilisateurs), `/settings`
  (Paramètres). Après login → `/dashboard` ; non authentifié → `/login`. (Route front
  `/classement` ; l'API reste `/admin/leaderboard`.)
- **Données** : `useApiData(fetcher, deps, { pollMs })` → `{ data, loading, error, refetch,
  setData }`. `deps` doivent être **littérales** (lint `react-hooks`). `triggerRefresh()`
  rafraîchit toutes les vues (bouton Actualiser).
- **Services** (`src/services/*.service.js`) : `withMock(fetcher, mock)` + `cleanParams`
  (retire les params vides → évite les 400 Joi). Repli mock seulement si
  `USE_MOCKS` (`import.meta.env.DEV && VITE_USE_MOCKS==='true'`). Jamais de mock en prod.
- **Auth** : JWT d'accès **en mémoire** (pas localStorage, choix sécurité), refresh auto sur
  401 via l'intercepteur axios. `authStore` (zustand) + `uiStore` (lang, `maintenance`).
- **Composants partagés** (`src/components/`) : `PageHeader`, `DataTable` (skeleton de
  chargement intégré, tri, pagination), `Drawer`/`Modal` (Escape + clic overlay + focus
  trap via `useFocusTrap`), `Avatar`, `KpiCard`, `Sparkline`, `Gauge`, `Skeleton(s)`,
  `ThemeBadge`, `StatusBadge`, `EmptyState`, `PasswordInput` (œil afficher/masquer),
  `CommandPalette` (⌘K), `ScrollToTop`, `Toast` (`notify.success/error/info`). Layout
  monte la palette, le scroll-top et la bannière maintenance ; chaque page est enveloppée
  d'un `ErrorBoundary` (clé = route).
- **CSS** : le design system vit dans `src/index.css` (ne pas le modifier pour du
  spécifique). Chaque page peut avoir un `src/pages/<Page>.css` à classes **préfixées**
  (`.dash-…`, `.u-…`, etc.) importé en tête — pas de collision, pas d'édition partagée.
- **Éditeur bilingue questions** (`src/pages/Questions.jsx`, modale partagée
  création/édition/duplication) : champs FR/EN (énoncé, options, explication) **réordonnés
  selon `i18n.language`** — le champ de la langue active est *primaire* (badge « Principal »
  + saisi), l'autre *secondaire* (tag « optionnelle » + bouton 🌐 qui le traduit depuis le
  primaire). `✨` = correcteur, `🌐` = traduction (`questionsService.improveText` /
  `translateQuestion`). `text_fr` reste **requis** ; en mode EN, « Suivant » auto-traduit
  EN→FR si le FR est vide. **Édition = `PATCH /admin/questions/:id`** (state `editingId` →
  `update()` + mise à jour locale via `setData`, pas de refetch) ; **création/duplication =
  `POST`** ; le suffixe « (Copie) » n'est ajouté **qu'à la duplication**. L'aperçu mobile et
  le drawer (section « Gestion bilingue » repliable) suivent aussi `i18n.language`.
- **ESLint propre + `npm run build` qui passe** sont obligatoires avant commit.
- **Logo admin (Cockpit Émeraude)** : les 5 tiles « C » monogramme ont été remplacés par
  `<img src="/logo.png">` — `Login.jsx`, `Landing.jsx` (×2 : nav + footer), `AcceptInvite.jsx`,
  `Privacy.jsx` (header). `creveton-admin/public/logo.png` : vrai PNG 416×416 (était un JPEG mislabeled).
  `creveton-admin/public/favicon.png` : idem, re-encodé en vrai PNG. CSS : tile or → tile
  image, `object-fit: cover`, fond crème (cream backing).

## Mobile (`mobile/`) — l'essentiel

Doc complète (stack, architecture `src/`, build APK local, branding) :
**[`mobile/CLAUDE.md`](mobile/CLAUDE.md)** — la lire avant toute tâche mobile. Points
transverses qui touchent aussi le backend :

- **Expo SDK 54** (RN 0.81, React 19.1), **JavaScript pur** (pas de TS). Navigation
  `@react-navigation` v7, state `zustand`, réseau `axios`, temps réel `socket.io-client`.
- **Tokens visuels** dans `src/constants/theme.js` (même charte « Cockpit Émeraude » que
  l'admin) — jamais de couleur en dur. Contenu bilingue localisé via `utils/i18n.js`
  (`getQuestionText`/`getOptionText`, **repli FR toujours**) ; l'explication localisée
  vient du **serveur** (`/sessions/answer`, `review[]`), jamais du cache (anti-triche).
- **Cache & sync questions** : `expo-sqlite` alimenté par le delta sync (`/questions/all`
  puis `/questions/delta`) ; `correct_index`/`explanation` présents **en mode normal
  seulement**. Ne jamais fabriquer la bonne réponse côté client.
- **Hors ligne** : les parties jouées sans réseau sont mises en file (`offlineQueue`,
  AsyncStorage) et **rejouées** via `/sessions/submit` au retour de connexion.
- **Courbe XP** : mêmes paliers `[0, 200, 500, 1200, 3000]` que le backend (`levelForXp`
  dans `utils/format.js`) ; niveau dérivé de `total_xp`.
- **Commits scopés à `mobile/`** (voir Git ci-dessous).

## Temps réel (tournois)

Serveur socket.io monté dans `backend/src/sockets/index.js` (adossé à
`services/liveTournamentService.js` / `tournamentService.js`) ; côté mobile
`services/socket.js` + `hooks/useTournamentSocket.js` (écran `TournamentLiveScreen`).

## Git

`main` est la branche par défaut (commits directs, monorepo → un seul `git push` couvre
backend + admin + mobile). Ne commiter que ce que la tâche produit : les changements
`mobile/` non liés restent hors des commits admin.

**Déploiement staging** — deux pipelines **indépendants**, détaillés dans
**[`docs/deploy.md`](docs/deploy.md)** (à lire avant toute intervention sur
`deploy-staging.yml` ou les réglages Railway) : backend `creveton` via GitHub Actions
(gate CI, auto-deploy natif Railway **désactivé**) ; admin `creveton-admin-staging` via
auto-deploy natif Railway (`Wait for CI` actif, pas de workflow). Règle : **un seul
mécanisme de déploiement actif par service**.
