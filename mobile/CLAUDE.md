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
  - `database.js` — cache SQLite des questions (vue joueur ; bilingue `text`/`text_en` + options `text_en` ; `correct_index`/`explanation`/`explanation_en` présents **en mode normal uniquement**). Migration douce (ALTER TABLE … ADD COLUMN) au démarrage.
  - `sync.js` — delta sync CDC §2.8 (snapshot complet au 1er lancement via `/questions/all`, puis `/questions/delta`), non bloquant ; `handleForceSync` (push silencieux).
  - `notifications.js`, `socket.js`.
- `store/` — `authStore`, `questionsStore`, `gameStore`, `leaderboardStore`, `networkStore` (état réseau), `offlineQueue` (parties jouées hors ligne, persistée AsyncStorage) (zustand).
- `components/` — bibliothèque : `AppButton`, `AppInput`, `AuthField`, `AppCard`, `Avatar`, `Logo`, `ThemeBadge`, `LevelBadge`, `CircularTimer`, `ProgressDots`, `Confetti`, `MiniLineChart`, `LoadingScreen`, `ErrorScreen`, `Skeleton`, `Toast`/`useToast`, `OfflineBanner`, `NetworkWatcher`, `PendingSyncBadge`, typographie (`Title/Heading/Body/Label`), `Screen`. Tout est ré-exporté par `components/index.js`.
- `navigation/` — `AppNavigator` (AuthStack si non authentifié, sinon MainStack) → `AuthStack` (Splash/Register/OTP/Login), `MainStack` (Tabs + Quiz/Results/Challenge), `BottomTabs` (Accueil/Jouer/Tournois/Stats/Profil).
- `screens/` — 12 écrans.
- `hooks/` — `usePushNotifications`, `useTheme`, `useTournamentSocket`, `useNetworkStatus` (lit `networkStore`).
- `utils/` — `format.js` (FCFA, dates fr, **courbe XP**), `validation.js`, `haptics.js`, `i18n.js` (`getQuestionText`/`getOptionText`/`normalizeLang` — localisation du contenu des questions).

## Conventions & règles à respecter

- **Charte « Cockpit Émeraude »** : vert profond (#0b2e1a/#1a5230/#2a8a4f/#5eca84), **or rare ≤ 10% de l'écran** (CTA primaires, rewards, podium, timer, états actifs), crème (#fdf6e9), rouge (#e74c3c). Toujours utiliser les tokens de `theme.js`, jamais de couleurs en dur.
- **Fonts** : Outfit (titres/scores), Space Grotesk (corps). Contraste ≥ 4.5:1.
- **Logo** : Logo = `assets/logo.png` (cœur drapeau camerounais). Composant : `src/components/Logo.js` → `<Image source={require('../../assets/logo.png')} />`.
- **Animations** : `Animated` (RN), slide+fade ≤ 300ms (max 500), ease-out, retour haptique < 120ms sur les boutons.
- **Anti-triche (CDC §2.8)** : `correct_index` n'est **jamais** dans la vue joueur des questions de tournoi/challenge. Le feedback immédiat du quiz passe par **`POST /sessions/answer`** (mode normal seulement) ; `/sessions/submit` reste l'autorité finale du score. Ne jamais fabriquer de bonne réponse côté client.
- **Courbe XP** : paliers `[0, 200, 500, 1200, 3000]` (`levelProgress`/`levelForXp` dans `format.js`). Le niveau effectif est dérivé de `total_xp` (robuste si `user.level` est périmé). Tout est borné ≥ 0.
- **Formulaires & clavier** : pour les écrans avec inputs (Login/Register), utiliser `AuthField` (label statique, champ non contrôlé via ref) + `KeyboardAvoidingView` (padding iOS / height Android), **sans ScrollView** — évite le reset du formulaire à l'ouverture du clavier.
- **Listes** : `FlatList` (pas `ScrollView`) pour les listes de données.
- **Honnêteté des données** : ne pas afficher de données factices. Un élément sans endpoint (badge « NOUVEAU », tendance classement, record) ne s'affiche que si la donnée réelle existe (ou est marqué placeholder en commentaire).
- **Hors ligne** : `@react-native-community/netinfo`. **Un seul** listener (`NetworkWatcher`, monté dans `App` sous le `ToastProvider`) alimente `networkStore` ; les écrans lisent via `useNetworkStatus()`. Les parties jouées hors ligne (ou sur échec réseau) sont mises en file dans `offlineQueue` puis **rejouées** via `/sessions/submit` au retour de connexion (toast récap). `OfflineBanner` (overlay haut, slide) + `PendingSyncBadge` (Accueil/Stats). **Dégradation gracieuse** (jamais de crash) : Tournois/Défis désactivés, Login/Register bloqués hors ligne, avatar/mot de passe désactivés dans Profil. `ResultsScreen` affiche « sauvegardé hors ligne » quand la partie est mise en file.
- **Bilingue FR/EN (contenu)** : localiser énoncés/options via `utils/i18n.js` (`getQuestionText`/`getOptionText`, repli FR **toujours** — jamais de texte vide). Le cache porte `text`/`text_en` + options `text_en`. L'explication localisée vient du **serveur** (feedback `/sessions/answer` `explanation_en`, `review[].explanation_en`), pas du cache (anti-triche). `QuizScreen`/`ResultsScreen` recalculent l'affichage selon `i18n.language` (bascule à chaud).

## Branding assets (NE PAS écraser)

- `icon.png` (1024×1024) : logo Creveton (cœur camerounais) centré sur fond `#0b2e1a` green900.
- `adaptive-icon.png` (1024×1024) : même traitement, zone de sécurité Android ~66 %.
- `splash-icon.png` : logo centré sur green900.
- Source : `mobile/assets/logo.png` (416×416, vrai PNG RGBA).
- ⚠️ Si `generate-assets.js` existe ou est régénéré, il peut produire l'ancien design
  (tile « C » doré) — vérifier avant de committer.

## Build local APK (quand EAS cloud quota épuisé)

- EAS Free : 30 builds Android/mois, reset le 1er.
- Bug `npx EINVALIDTAGNAME` : npm < 10.9 — fix : `npm install -g npm@latest`.
- `ANDROID_HOME` requis : `export ANDROID_HOME=~/Library/Android/sdk`.
- Commande : `cd mobile && eas build --local --platform android --profile preview`.
- APK sorti dans `mobile/build-<TIMESTAMP>.apk` (~81–85 Mo).
- Skill dédié installé : `expo-eas-local-build`.

## Références

- API : `../docs/Creveton_API_Spec.md` (contrat backend, codes d'erreur, schémas).
- CDC : `../docs/Creveton_CDC.docx` (§9 charte, §2.8 sync/anti-triche).
- Backend par défaut : `EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1` (voir `.env.example` ; sur appareil physique, pointer l'IP LAN, pas `localhost`).

## Workflow git

- Les commits de l'app mobile doivent être **scopés à `mobile/`** : `git add .` depuis ce dossier (le `.git` est à la racine du monorepo et contient aussi `backend/` et `creveton-admin/`). Vérifier qu'aucun fichier non-`mobile/` n'est stagé avant de commiter.
- Committer/pousser uniquement sur demande explicite.
