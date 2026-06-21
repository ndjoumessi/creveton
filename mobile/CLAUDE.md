# Creveton — App mobile

Quiz compétitif pour le marché camerounais (12–30 ans). React Native + Expo.
Ce dossier (`mobile/`) est une app d'un monorepo : `backend/` (API REST + socket.io),
`creveton-admin/` (console admin Vite/React), `docs/` (CDC + spec API).

## Stack

- **Expo SDK 54** (RN 0.81, React 19.1) — pas SDK 56. JavaScript pur (pas de TS).
- Navigation : `@react-navigation/native` v7 (native-stack + bottom-tabs)
- State : `zustand` ; Réseau : `axios` ; Temps réel : `socket.io-client`
- Stockage : `@react-native-async-storage/async-storage` (tokens/user/sync) + `expo-sqlite` (cache questions)
- UI : `react-native-svg`, `expo-linear-gradient`, `expo-haptics`, polices `@expo-google-fonts/outfit` + `.../space-grotesk`
- Notifs : `expo-notifications`

## Commandes

```bash
npm start                 # expo start
npx expo start --clear    # avec cache vidé (à lancer après changement d'assets)
npm run lint              # expo lint (eslint-config-expo) — DOIT être propre
npx expo-doctor           # valide la config (doit afficher 18/18)
npx expo export --platform ios --output-dir /tmp/x   # valide le bundle (imports résolus)
node scripts/generate-assets.js                       # régénère icon/splash/adaptive depuis le SVG du logo
```

Pas de simulateur dispo ici : valider via `expo export` (build) + `expo start --clear`
(le serveur démarre en mode CI et confirme « Waiting on … » sans erreur).

## Architecture (`src/`)

- `constants/theme.js` — **tous les design tokens** (couleurs, dégradés par thème, fonts, spacing, radius, shadow, motion, zIndex). Source de vérité visuelle.
- `constants/config.js` — `API_URL` (env `EXPO_PUBLIC_API_URL`), `THEMES`, `LEVELS`, `GAME`, clés storage.
- `services/`
  - `api.js` — client axios + 3 intercepteurs : injection Bearer, refresh auto sur 401 (single-flight), retry exponentiel sur 503. `parseApiError`, `setOnAuthExpired`.
  - `endpoints.js` — appels groupés par domaine (auth, questions, sessions, leaderboard, tournaments, challenges, users, wallet).
  - `database.js` — cache SQLite des questions (vue joueur ; `correct_index`/`explanation` présents **en mode normal uniquement**).
  - `sync.js` — delta sync CDC §2.8 (snapshot au 1er lancement, puis `/questions/delta`), non bloquant ; `handleForceSync` (push silencieux).
  - `notifications.js`, `socket.js`.
- `store/` — `authStore`, `questionsStore`, `gameStore`, `leaderboardStore` (zustand).
- `components/` — bibliothèque : `AppButton`, `AppInput`, `AuthField`, `AppCard`, `Avatar`, `Logo`, `ThemeBadge`, `LevelBadge`, `CircularTimer`, `ProgressDots`, `Confetti`, `MiniLineChart`, `LoadingScreen`, `ErrorScreen`, `Skeleton`, `Toast`/`useToast`, typographie (`Title/Heading/Body/Label`), `Screen`. Tout est ré-exporté par `components/index.js`.
- `navigation/` — `AppNavigator` (AuthStack si non authentifié, sinon MainStack) → `AuthStack` (Splash/Register/OTP/Login), `MainStack` (Tabs + Quiz/Results/Challenge), `BottomTabs` (Accueil/Jouer/Tournois/Stats/Profil).
- `screens/` — 12 écrans.
- `utils/` — `format.js` (FCFA, dates fr, **courbe XP**), `validation.js`, `haptics.js`.

## Conventions & règles à respecter

- **Charte « Cockpit Émeraude »** : vert profond (#0b2e1a/#1a5230/#2a8a4f/#5eca84), **or rare ≤ 10% de l'écran** (CTA primaires, rewards, podium, timer, états actifs), crème (#fdf6e9), rouge (#e74c3c). Toujours utiliser les tokens de `theme.js`, jamais de couleurs en dur.
- **Fonts** : Outfit (titres/scores), Space Grotesk (corps). Contraste ≥ 4.5:1.
- **Logo** : composant `<Logo/>` (carré or + « C », pur View/Text). Aucune image externe ni drapeau.
- **Animations** : `Animated` (RN), slide+fade ≤ 300ms (max 500), ease-out, retour haptique < 120ms sur les boutons.
- **Anti-triche (CDC §2.8)** : `correct_index` n'est **jamais** dans la vue joueur des questions de tournoi/challenge. Le feedback immédiat du quiz passe par **`POST /sessions/answer`** (mode normal seulement) ; `/sessions/submit` reste l'autorité finale du score. Ne jamais fabriquer de bonne réponse côté client.
- **Courbe XP** : paliers `[0, 200, 500, 1200, 3000]` (`levelProgress`/`levelForXp` dans `format.js`). Le niveau effectif est dérivé de `total_xp` (robuste si `user.level` est périmé). Tout est borné ≥ 0.
- **Formulaires & clavier** : pour les écrans avec inputs (Login/Register), utiliser `AuthField` (label statique, champ non contrôlé via ref) + `KeyboardAvoidingView` (padding iOS / height Android), **sans ScrollView** — évite le reset du formulaire à l'ouverture du clavier.
- **Listes** : `FlatList` (pas `ScrollView`) pour les listes de données.
- **Honnêteté des données** : ne pas afficher de données factices. Un élément sans endpoint (badge « NOUVEAU », tendance classement, record) ne s'affiche que si la donnée réelle existe (ou est marqué placeholder en commentaire).

## Références

- API : `../docs/Creveton_API_Spec.md` (contrat backend, codes d'erreur, schémas).
- CDC : `../docs/Creveton_CDC.docx` (§9 charte, §2.8 sync/anti-triche).
- Backend par défaut : `EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1` (voir `.env.example` ; sur appareil physique, pointer l'IP LAN, pas `localhost`).

## Workflow git

- Les commits de l'app mobile doivent être **scopés à `mobile/`** : `git add .` depuis ce dossier (le `.git` est à la racine du monorepo et contient aussi `backend/` et `creveton-admin/`). Vérifier qu'aucun fichier non-`mobile/` n'est stagé avant de commiter.
- Committer/pousser uniquement sur demande explicite.
