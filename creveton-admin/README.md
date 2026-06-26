# Creveton — Console d'administration

Dashboard web pour piloter l'application quiz mobile **Creveton** (Cameroun, 12–30 ans) :
contenu (questions), utilisateurs, tournois, finances, conformité et analytics.

Consomme l'API backend (`../backend`, REST + JWT). Réf. design : CDC §3 / §9 · Réf. API : `docs/Creveton_API_Spec.md` §12.

## Stack

- **React 19** + **Vite** (JavaScript/JSX)
- **react-router-dom** (routing + routes protégées par rôle)
- **axios** (client HTTP, intercepteur JWT + refresh auto)
- **recharts** (graphiques : barres, anneau, courbes, sparklines)
- **@tanstack/react-table** (tables triables/paginées)
- **react-hook-form** (formulaires)
- **zustand** (état global : auth + UI + thème)
- **i18next** / **react-i18next** (bilingue FR/EN)
- **lucide-react** (icônes) · **react-hot-toast** (notifications)
- **papaparse** (CSV) · **date-fns** (dates)
- Design system maison : `src/constants/theme.js` + `src/index.css` (charte vert foncé / or, polices Outfit + Space Grotesk).

## Démarrage

```bash
npm install
cp .env.example .env      # ajuster VITE_API_URL si besoin
npm run dev               # http://localhost:5174
```

Le backend écoute par défaut sur **http://localhost:4000** ; les appels `/api` sont
proxifiés par Vite (voir `vite.config.js`).

### Mode démo (sans backend)

Avec `VITE_USE_MOCKS=true` (dev uniquement), l'app reste pleinement navigable sans
backend : les services retombent sur `src/mocks/` et l'écran de connexion ouvre une
session admin fictive **uniquement si le backend est injoignable** (jamais sur un
refus d'authentification). Un build de production n'active jamais les mocks.

## Scripts

| Script | Rôle |
|---|---|
| `npm run dev` | Serveur de dev (HMR) |
| `npm run build` | Build de production (`dist/`) |
| `npm run preview` | Prévisualise le build |
| `npm run lint` | ESLint |

## Structure

```
src/
  main.jsx              Point d'entrée (Router + Toaster)
  App.jsx              Routes (publiques /, /landing, /login + routes protégées)
  index.css            Design system global (charte « Cockpit Émeraude »)
  constants/           theme.js (couleurs/statuts), enums.js
  i18n/                Configuration i18next + traductions FR/EN
  services/            api.js (axios+JWT) + auth, questions, users, tournaments,
                       leaderboard, sessions, finances, analytics, dashboard,
                       settings, support, team, health
  store/               authStore (session/rôle), uiStore (langue/maintenance),
                       themeStore
  hooks/               useApiData.js (fetch + refresh + polling)
  components/          KpiCard, DataTable, StatusBadge, ThemeBadge, Modal, Drawer,
                       Toast, Avatar, AvatarUpload, CommandPalette (⌘K), Gauge,
                       Sparkline, Skeleton, EmptyState, ErrorBoundary, PageHeader,
                       PasswordInput, FilterSelect, ScrollToTop, Logo, PrivateRoute,
                       Layout/ (Sidebar, Header, Layout)
  pages/               Landing, Login, Dashboard, Questions, Utilisateurs, Tournois
                       (+ TournoiDetail), Classement, Parties, Finances, Parametres,
                       Privacy, AcceptInvite, RolesPage, SupportPage, TeamPage
  mocks/               Données de démonstration (FCFA réalistes)
  utils/               format.js (FCFA, dates, %)
```

## Authentification & rôles

`POST /auth/login` → JWT. Les routes sont protégées par `PrivateRoute` (session
valide **et** rôle ∈ moderator | admin | super_admin, CDC §3.7). L'intercepteur
axios rafraîchit l'access token sur `401` et redirige vers `/login` si le refresh
échoue.

### Stockage des tokens (mitigation XSS)

- **access_token** : en **mémoire** uniquement (variable module dans `api.js`),
  jamais persisté ; re-dérivé via `/auth/refresh` après un rechargement.
- **refresh_token** : `sessionStorage` (et non `localStorage`) → effacé à la
  fermeture de l'onglet, fenêtre d'exposition réduite.
- **Idéal à venir** (évolution backend) : refresh_token dans un cookie
  `HttpOnly + Secure + SameSite=Strict` posé par le backend, invisible au JS.
  Dès que le backend pose ce cookie, retirer le stockage `sessionStorage`.

## Pages connectées au backend

| Page | Endpoints backend |
|---|---|
| Dashboard | `/admin/dashboard` (KPIs agrégés) |
| Questions | `/admin/questions` CRUD · `/transition` · `/import` · `/translate` · `/force-sync` |
| Utilisateurs | `/admin/users` · suspend / ban / reset-password / delete |
| Tournois | `/admin/tournaments` create/start/cancel/payout |
| Classement | `/admin/leaderboard` (route front `/classement`) |
| Parties | `/admin/sessions` |
| Finances | `/admin/transactions` · `/admin/analytics/finances` |
| Support / Équipe / Rôles | `/admin/support` · `/admin/team` (invitations) · rôles & permissions |
| Paramètres | `/admin/settings` (dont mode maintenance) |

> Restitution honnête des données (charte produit) : un écran sans endpoint dédié
> n'affiche pas de chiffres factices. Le repli `src/mocks/` n'existe qu'en dev sous
> `VITE_USE_MOCKS=true` (jamais en production).
