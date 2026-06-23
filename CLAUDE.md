# CLAUDE.md

Guidance pour les agents travaillant sur Creveton — app de quiz mobile compétitive
(Cameroun, joueurs 12–30 ans). Monorepo : `backend/` (Node·Express·PostgreSQL·Redis),
`creveton-admin/` (React 19·Vite·JS/JSX), `mobile/` (React Native·Expo).

## Lancer en local

- Backend : `cd backend && npm start` → http://localhost:4000 (API sous `/api/v1`,
  liveness sous `/health`). DB dev : `creveton_dev` (Postgres :5432), Redis :6379.
- Admin : `cd creveton-admin && npm run dev` → http://localhost:5174. Vite proxifie
  `/api` **et** `/health` vers :4000. Login admin : `admin@creveton.cm` / `Admin1234`.
- Tests backend : `cd backend && npm test` (jest `--runInBand`). Les tests d'intégration
  tournent contre un **vrai** Postgres + Redis ; `tests/helpers/integration.js`
  (`ensureReady`/`resetState`/`createUser`/`tokenFor`/`createApprovedQuestion`) les
  saute proprement si l'infra est absente.

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
- **Anti-triche** : `/sessions/submit` ≥ 3 réponses < 500 ms (`scoreService.CHEAT_MIN_MS`)
  → `CHEAT_DETECTED`, **sauf en `blitz`/`marathon`** (cadence rapide voulue ; garde-fou =
  timer global 62 s) ; `/sessions/answer` (feedback immédiat, mode `normal` only) une
  réponse < 150 ms → `CHEAT_DETECTED`. La bonne réponse n'est révélée qu'après soumission.
  (Seuils assouplis depuis 2 répétitions / 1 s / 500 ms pour limiter les faux positifs.)

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
- **ESLint propre + `npm run build` qui passe** sont obligatoires avant commit.

## Git

`main` est la branche par défaut (commits directs, monorepo → un seul `git push` couvre
backend + admin + mobile). Ne commiter que ce que la tâche produit : les changements
`mobile/` non liés restent hors des commits admin.
