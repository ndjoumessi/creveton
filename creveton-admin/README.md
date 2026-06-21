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
- **zustand** (état global : auth + UI)
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
  App.jsx              Routes (publique /login + routes protégées)
  index.css            Design system global (charte CDC §9)
  constants/           theme.js (couleurs/statuts), enums.js
  services/            api.js (axios+JWT) + auth/questions/users/tournaments/analytics/transactions
  store/               authStore.js (session/rôle), uiStore.js (sidebar/langue)
  hooks/               useApiData.js (fetch + refresh + polling)
  components/          KPICard, DataTable, StatusBadge, Modal, Drawer, Toast,
                       LoadingSpinner, EmptyState, PageHeader, PrivateRoute,
                       Layout/ (Sidebar, Header, Layout)
  pages/               Login, Dashboard, Questions, Utilisateurs, Tournois,
                       Analytics, Transactions, ComingSoon
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
| Dashboard | (agrégats — mock en attendant un endpoint dédié) |
| Questions | `/admin/questions` CRUD · `/transition` · `/import` · `/force-sync` |
| Utilisateurs | `/admin/users` · suspend / ban / reset-password / delete |
| Tournois | `/admin/tournaments` create/start/cancel/payout |
| Analytics | `/admin/analytics` |
| Transactions | (mock — pas d'endpoint admin dédié pour l'instant) |

> Certains écrans (Dashboard agrégé, Transactions admin, liste admin des tournois)
> n'ont pas encore d'endpoint backend dédié : ils s'appuient sur `src/mocks/` et
> basculeront automatiquement sur les données réelles dès que les endpoints existeront.
