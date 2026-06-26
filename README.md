# Creveton

Application de quiz mobile **compétitive** pour le marché camerounais (joueurs 12–30 ans).
Monorepo regroupant l'API, la console d'administration et l'application mobile.

> Personnalité de marque : **chaleureux · camerounais · fiable**. Direction visuelle
> « Le Cockpit Émeraude » (vert profond / or rare). Voir [`PRODUCT.md`](PRODUCT.md) et
> [`DESIGN.md`](DESIGN.md).

## Structure

| Dossier | Description | Stack |
|---|---|---|
| `backend/` | API REST + WebSocket | Node.js · Express · PostgreSQL · Redis |
| `mobile/` | Application mobile | React Native · Expo (SDK 54) |
| `creveton-admin/` | Console d'administration | React 19 · Vite |

## Démarrage local

### Backend
```bash
cd backend && npm start          # → http://localhost:4000
```
- API sous `/api/v1`, liveness sous `/health`.
- DB dev : `creveton_dev` (PostgreSQL `:5432`), Redis `:6379`.
- Tests : `npm test` (Jest `--runInBand` ; intégration contre un vrai Postgres + Redis,
  sautée proprement si l'infra est absente).

### Console admin
```bash
cd creveton-admin && npm run dev # → http://localhost:5174
```
- Vite proxifie `/api` et `/health` vers `:4000`.
- Login admin de dev : `admin@creveton.cm` / `Admin1234`.

### Application mobile
```bash
cd mobile && npm start           # expo start
npx expo start --clear           # après un changement d'assets
```
- Backend par défaut : `EXPO_PUBLIC_API_URL` (sur appareil physique, pointer l'IP LAN,
  pas `localhost`).
- Build APK local quand le quota EAS cloud est épuisé :
  `eas build --local --platform android --profile preview`.

## Fonctionnalités clés

- Quiz compétitif : sessions notées, modes `normal` / `blitz` / `marathon`, tournois et défis.
- XP & niveaux (1–5), classement, anti-triche côté serveur.
- Contenu **bilingue FR/EN** avec traduction IA des questions (énoncés, options, explications).
- Avatars stockés sur Cloudinary.
- Mode hors ligne sur mobile (file de rejeu des parties au retour de connexion).

## Documentation

- [`PRODUCT.md`](PRODUCT.md) — produit, utilisateurs, principes de design.
- [`DESIGN.md`](DESIGN.md) — système visuel « Cockpit Émeraude », tokens normatifs.
- [`CLAUDE.md`](CLAUDE.md) — conventions back-end / front-end et guide de contribution.
- `docs/` — cahier des charges (CDC) et spécification API.
