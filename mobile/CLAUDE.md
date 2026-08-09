# Creveton — App mobile

Quiz compétitif pour le marché camerounais (12–30 ans). React Native + Expo.
Ce dossier (`mobile/`) est une app d'un monorepo : `backend/` (API REST + socket.io),
`creveton-admin/` (console admin Vite/React), `docs/` (CDC + spec API).

## Stack

- **Expo SDK 54** (RN 0.81, React 19.1) — pas SDK 56. JavaScript pur (pas de TS).
- Navigation : `@react-navigation/native` v7 (native-stack + bottom-tabs)
- State : `zustand` ; Réseau : `axios` ; Temps réel : `socket.io-client`
- Stockage : `@react-native-async-storage/async-storage` (tokens/user/sync) + `expo-sqlite` (cache questions)
- UI : `react-native-svg`, `expo-linear-gradient`, `expo-haptics`, polices `@expo-google-fonts/outfit` (titres) + `.../inter` (corps, depuis 08-2026 ; `space-grotesk` reste installé mais n'est plus référencé)
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

- `constants/theme.js` — **tous les design tokens** (palettes `colors`/`darkColors` à clés symétriques, dégradés par thème, fonts, spacing, radius, shadow, motion, zIndex). Source de vérité visuelle. Voir **« Thème & tokens »** plus bas.
- `constants/config.js` — `API_URL` (env `EXPO_PUBLIC_API_URL`), `THEMES`, `LEVELS`, `GAME`, clés storage.
- `services/`
  - `api.js` — client axios + 3 intercepteurs : injection Bearer, refresh auto sur 401 (single-flight), retry exponentiel sur 503. `parseApiError`, `setOnAuthExpired`.
  - `endpoints.js` — appels groupés par domaine (auth, questions, sessions, leaderboard, tournaments, challenges, users, wallet).
  - `database.js` — cache SQLite des questions (vue joueur ; bilingue `text`/`text_en` + options `text_en` ; `correct_index`/`explanation`/`explanation_en` présents **en mode normal uniquement**, et seulement pour les questions DÉJÀ JOUÉES en ligne — cf. anti-triche ci-dessous). Migration douce (ALTER TABLE … ADD COLUMN) au démarrage.
  - `sync.js` — delta sync CDC §2.8 (snapshot complet au 1er lancement via `/questions/all`, puis `/questions/delta`), non bloquant ; `handleForceSync` (push silencieux).
  - `notifications.js`, `socket.js`.
- `store/` — `authStore`, `questionsStore`, `gameStore`, `leaderboardStore`, `networkStore` (état réseau), `offlineQueue` (parties jouées hors ligne, persistée AsyncStorage) (zustand).
- `components/` — bibliothèque partagée, l'essentiel ré-exporté par `components/index.js` (sauf `Icon`/`NetworkWatcher`/`OfflineBanner`, importés en direct). Voir **« Bibliothèque de composants partagés »** plus bas : **réutiliser avant de coder un nouvel écran**.
- `navigation/` — `AppNavigator` (AuthStack si non authentifié, sinon MainStack) → `AuthStack` (Splash/Register/OTP/Login), `MainStack` (Tabs + SessionsHistory/SessionDetail/ChangePassword/**Challenges**/**Stats**/Quiz/Results/Challenge/TournamentLive), `BottomTabs` (**4 onglets** : Accueil/Jouer/Tournois/Profil).
  · **6 onglets → 4 (2026-08-08).** Six dépassait la recommandation iOS/Android (3–5) et diluait
    l'action principale. `Challenges` et `Stats` sont passés en écrans de **pile** — aucun écran
    supprimé. Conséquences à connaître avant d'y toucher :
    – La navigation vers eux est **à plat** (`navigate('Challenges')`), plus imbriquée
      (`navigate('Tabs', { screen: 'Challenges' })`) : ils ne sont plus enfants du navigateur
      d'onglets. 4 appels ont été convertis (GameStart, Results, push, stub `Challenge`).
    – Les deux écrans ont reçu un **bouton retour** (`ArrowLeft` + `goBack`) : en tant qu'onglets
      ils n'en avaient pas besoin, en pile leur absence piégeait l'utilisateur.
    – Portes d'entrée : Défis ← « Défier un ami » (Jouer), fin de duel, notification push ;
      Stats ← bandeau de stats du Profil (pressable) et « Voir le classement » de l'Accueil.
- `screens/` — **17 écrans** :
  - Auth : `SplashScreen` (ouverture animée → Login), `LoginScreen`, `RegisterScreen` (inscription 3 étapes), `OTPScreen` (6 chiffres, timer, renvoi).
  - Tabs : `HomeScreen` (tableau de bord : Jouer, tournois, podium, stats), `GameStartScreen` (onglet Jouer : grille thèmes + niveau + mode), `TournamentScreen` (liste tournois par statut + inscription), `ChallengesScreen` (hub duels 1v1 : onglets + bottom sheet « Nouveau défi »), `StatsScreen` (« Mes stats » KPI/courbe/historique + « Classement »), `ProfileScreen` (photo, réglages, badges, wallet, déconnexion).
  - Stack jeu : `QuizScreen` (quiz immersif : timer, feedback, explication), `ResultsScreen` (révélation célébrative : trophée, XP, partage).
  - Stack secondaire : `SessionsHistoryScreen` (historique paginé + filtres), `SessionDetailScreen` (relecture d'une partie via `GET /sessions/:id` : en-tête score/XP + review par question, options colorées en lecture seule, atteint en tapant une `SessionCard` depuis Accueil/Stats/Historique), `ChangePasswordScreen`, `TournamentLiveScreen` (manche temps réel via socket), `ChallengeScreen` (stub de redirection vers `Challenges`).
- `hooks/` — `usePushNotifications`, `useTheme`, `useTournamentSocket`, `useNetworkStatus` (lit `networkStore`).
- `utils/` — `format.js` (FCFA, dates fr, **courbe XP**), `validation.js`, `haptics.js`, `i18n.js` (`getQuestionText`/`getOptionText`/`normalizeLang` — localisation du contenu des questions).

## Bibliothèque de composants partagés

Stabilisée après le refactor P1 (été 2026) : **13 composants + 1 hook** extraits/migrés.
Avant de coder un écran, chercher ici — la duplication inline est bannie. **Tous** suivent
le pattern `const { colors } = useTheme(); const styles = useMemo(() => makeStyles(colors),
[colors])` (ou `makeStyles(colors, isDark)`), tokens uniquement.

**Contrôles & formulaires**
- `SegmentedTabs({ tabs:[{key,label,icon?,count?}], activeKey, onChange, variant:'underline'|'pills' })` — onglets. `MIN_TOUCH` + `role=tab` intégrés. → Challenges, Tournament, Stats.
- `ChoiceChips({ options:[{key,label,emoji?}], value, onChange, multiple?, layout:'row'|'grid', haptic? })` — pilules de sélection (actif = vert nuit + bordure or). → GameStart (niveaux), Register (sexe/langue), Challenges (thème/niveau du sheet). *Cartes thème riches de GameStart = locales (gradient/compteur offline).* 
- `AppInput({ label, value, onChangeText, error, success?, helperText, rightIcon? })` — input flottant. *Aucun call-site aujourd'hui* ; pour Login/Register préférer `AuthField` (cf. règle formulaires).
- `Checkbox({ checked, onChange, label, hint?, disabled? })` — case à cocher ; la cible tactile est le Pressable ENTIER (case + libellé, `MIN_TOUCH`), la case seule ne fait que 22 px. → Login (« Enregistrer mon mot de passe »).
- `AuthField` — champ non contrôlé (ref) anti-reset clavier, pour les formulaires. `AppButton`, `AppCard`.
  · **Autofill** : poser TOUJOURS `autoComplete` **et** `textContentType`. Ce ne sont pas des synonymes — `textContentType` est ignoré sur Android, `autoComplete` sur iOS (RN ne s'en sert là que pour déduire un `textContentType` absent). N'en poser qu'un laisse une plateforme sans indice, et le gestionnaire de mots de passe ne propose alors jamais d'enregistrer. Identifiant de connexion = `username` (et non `emailAddress` : côté Apple c'est un champ de carnet d'adresses, seul `.username` déclenche l'invite d'enregistrement).

**Jeu**
- `AnswerOption({ letter, text, state:'idle'|'selected'|'correct'|'incorrect'|'neutral'|'dimmed', selected, disabled, showGoodLabel?, showCheck?, onPress })` — option de réponse, tous états quiz + `role=radio`. → Quiz, TournamentLive.
- `CircularTimer`, `ProgressDots`.

**Overlays & feedback**
- `BottomSheet({ visible, onClose, title?, children, snapPoint?, style })` — handle + backdrop + KeyboardAvoidingView + safe-area, slide-up reduce-motion-safe. → Profile (photo), Challenges (nouveau défi).
- `useConfirm()` → `confirm({ title, message, confirmLabel?, cancelLabel?, destructive? }) → Promise<bool>` — **toute action destructrice** passe par là (Alert natif). → Challenges (refus/annulation), Tournament (inscription), Profile (logout). (`ConfirmDialog` contrôlé aussi dispo.)
- `Toast`/`useToast` (`notify` via provider), `EmptyState({ icon, title, message?, ctaLabel?, onCta? })`, `ErrorScreen`, `LoadingScreen`, `Skeleton`, `OfflineBanner`, `PendingSyncBadge`.

**Identité, visualisations, structure**
- `Avatar({ name, size?, gold?, uri? })` — initiales colorées (hash → `themeAccent`) ou photo. → Home, Stats, Challenges, Profile.
- `Podium({ players, variant:'compact'|'card', loading? })` → Home (compact), Stats (card). `MiniLineChart({ data, width, height, color, fillArea?, showGrid?, scaleToData?, showLastValue?, … })` → Results (défauts inertes), Stats (courbe enrichie). `SessionCard({ game, showIncomplete? })` → Home, Stats, SessionsHistory. `FAB({ onPress, icon?, accessibilityLabel, disabled? })` → Challenges.
- `Logo`, `ThemeBadge`, `LevelBadge`, `StatusBadge`, `XpBar`, `FillBar`, `Confetti`, `GoldVeilBanner`, `SectionHeader`, `Screen`, `NetworkWatcher`.
- `Icon({ icon, size?, color?, strokeWidth? })` — fin wrapper des icônes **Lucide** (taille/couleur/épaisseur cohérentes, `color` = token theme obligatoire). Importé **en direct** (`components/Icon`), hors barrel — comme `NetworkWatcher`/`OfflineBanner`. → BottomTabs + la plupart des écrans.

> **Pas de `LeaderboardRow`** : volontairement non extrait (rendus Stats clair/riche et TournamentLive sombre/anonymisé trop divergents, 1 occurrence chacun).

## Thème & tokens

`useTheme()` (`hooks/useTheme.js`) renvoie `{ colors, isDark, toggleTheme }` ; `colors` =
`colors` (clair) **ou** `darkColors` (sombre) — **clés symétriques** : toute clé de `colors`
existe en sombre (héritée via `...colors`, surchargée seulement si le clair y serait cassé).

- **Base identité** : `green900/700/500/300`, `gold500/400`, `cream`, `red400/600`. L'or reste ≤ 10 % de l'écran.
- **Sémantiques texte/surface** : `textDark/textBody/textMuted/textFaint/textOnDark*`, `surface/surfaceCream/surfaceElevated/cardOnDark`, `border/borderInput/divider`, `successBg/successText/errorBg/errorText`, voiles `goldVeil/whiteVeil/greenVeil`.
- **Pastels & tints centralisés** (session été 2026, plus aucun hex pastel en dur) : `tintSuccess/tintGold/tintError` (voiles α0.06 SessionCard), `pastelGreen/Yellow/Blue/Red/Indigo/Violet/Rose` (pastilles d'icônes **décoratives, figées** — icône `green900` posée dessus, jamais surchargées en sombre), `orange` (timer), `trackOnDark*`/`goldTrack` (composants figés sur fond vert nuit), `red200` (accent Toast), `skeletonOnLight/OnDark`. **Valeurs light figées** (aucun delta clair) ; surcharges dark documentées au cas par cas dans `theme.js`.
- Certains composants sont **volontairement figés clair-sur-sombre** (CircularTimer, ProgressDots, LoadingScreen, Toast, Splash) : leurs tokens n'ont pas de variante dark, c'est normal.

**Typographie — `components/Text.js`** : `Title/Heading/Body/Label` (Outfit pour Title/Heading,
Inter pour Body/Label depuis 08-2026), **theme-aware**. Props opt-in `size` (clé de `fontSizes` ou
nombre px) et `weight` (poids dans la famille du variant) — **defaults inchangés** (rétro-compat
stricte), valeur inconnue ignorée sans crash. Ex. `<Title size="lg">⚡ 120 pts</Title>`,
`<Heading size={17}>…</Heading>`, `<Body weight="semibold" size="md">…</Body>`. Règle charte :
chiffres importants = Outfit ≥ 700 (Title/`weight="bold"+`).

**Migration — TERMINÉE (été 2026).** Tous les écrans théma-aware sont migrés : `<Text>` brut →
variants Text.js, `size`/`weight`/`color` portés en props, clés purement typographiques retirées
des StyleSheet, rendu **pixel-identical**. 14 écrans : `TournamentLiveScreen` (pilote), `Profile`,
`Results`, `Challenges`, `GameStart`, `Quiz`, `Register`, `Tournament`, `OTP`, `Login`,
`ChangePassword`, `Home`, `Stats`, `SessionsHistory`. Les seuls `<Text>` bruts restants sont des
**glyphes/emojis sans `fontFamily`** (flèches ←/✕/▾, chevrons, emojis d'icônes) : les convertir
imposerait une police → laissés bruts volontairement.

**Résiduels `fontFamily:` légitimes — liste fermée** (ne PAS les prendre pour des oublis) :
1. **`TextInput`** — ne peut pas être un variant `<Text>`. → `ProfileScreen` (`input`),
   `ChallengesScreen` (recherche d'ami), `OTPScreen` (cases `box`).
2. **Styles passés à `EmptyState`** — thématisation par écran d'un composant partagé (prop
   `titleStyle`). → `SessionsHistoryScreen` / `StatsScreen` (`emptyTitle`).
3. **`SplashScreen`** — écran **volontairement figé sombre** (même famille que CircularTimer /
   LoadingScreen / Toast, cf. « Thème & tokens » ci-dessus) : n'utilise pas `useTheme` **par
   conception**. Ses 3 `Animated.Text` (nom/slogan/tagline) restent sur tokens statiques, hors du
   système de variants (les variants Text.js appellent `useTheme()` → y basculer réintroduirait la
   théma-awareness que cet écran évite délibérément).

**Cas `Animated.Text`.** Les variants sont des `RNText` **sans `forwardRef`** → incompatibles avec
`Animated.createAnimatedComponent` + `useNativeDriver: true`. Pattern retenu : envelopper un variant
**statique** dans un `Animated.View` portant **uniquement** la prop animée (`opacity`/`scale`),
marges placées pour garder l'origine du `scale` centrée sur le texte (pixel-identical). Exemple :
`ResultsScreen` (score, titre de perf, ligne de comparaison).

## Conventions & règles à respecter

- **Charte « Cockpit Émeraude »** : vert profond (#0b2e1a/#1a5230/#2a8a4f/#5eca84), **or rare ≤ 10% de l'écran** (CTA primaires, rewards, podium, timer, états actifs), crème (#fdf6e9), rouge (#e74c3c). Toujours utiliser les tokens de `theme.js`, jamais de couleurs en dur.
- **Fonts** : Outfit (titres/scores), **Inter** (corps — ex-Space Grotesk, aligné sur la
  console admin `b6d6a77` : une police à fort caractère fatigue en texte courant ;
  l'identité reste portée par les titres). Bascule via les 4 tokens `fonts.body*` de
  `theme.js` — aucun écran ne nomme la famille en dur. Contraste ≥ 4.5:1.
- **Logo** : Logo = `assets/logo.png` (cœur drapeau camerounais). Composant : `src/components/Logo.js` → `<Image source={require('../../assets/logo.png')} />`.
- **Animations** : `Animated` (RN), slide+fade ≤ 300ms (max 500), ease-out, retour haptique < 120ms sur les boutons.
- **Anti-triche (CDC §2.8)** : `correct_index` n'est **jamais** dans la vue joueur des questions de tournoi/challenge. Le feedback immédiat du quiz passe par **`POST /sessions/answer`** (mode normal seulement) ; `/sessions/submit` reste l'autorité finale du score. Ne jamais fabriquer de bonne réponse côté client.
  · **`POST /questions/solutions` a été RETIRÉ (2026-08-09)**, avec le `syncSolutions()`
    qui l'appelait. Il téléchargeait `correct_index` pour TOUTES les questions en cache
    (jusqu'à 500) une fois par heure : n'importe quel jeton de joueur obtenait le corrigé
    de la banque entière, et le plafond horaire n'y changeait rien puisqu'un seul appel
    suffisait. Le cache n'apprend désormais une solution qu'APRÈS que le joueur a répondu
    en ligne (`patchQuestionSolution`, QuizScreen) : le téléphone ne connaît que ce qui a
    déjà été joué. Les APK déjà installés reçoivent un 404 avalé sans bruit.
  · **Ordre des options mélangé** (`utils/shuffle.js`) : `correct_index` étant figé en base,
    une question rejouée présentait sa bonne réponse à la même lettre. La permutation est
    DÉTERMINISTE (graine × question) — un tirage aléatoire remélangerait les options au
    changement de langue et juste après la réponse. Graine partagée en duel (celle du
    serveur) et en tournoi (l'id du tournoi) ; locale en solo. `selected_index` reste
    l'index canonique, donc le scoring, le cache et le rejeu hors ligne sont inchangés.
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

- EAS Free : quota de builds Android/mois (reset le 1er). La limite réelle appliquée par
  EAS peut être < 30 ; si le cloud refuse (`used its Android builds from the Free plan this
  month`), passer en build local. Sonder avant de supposer le cloud dispo : un submit
  `eas build … --no-wait` échoue en **pré-vol** si le quota est épuisé, **sans consommer**
  de build.
- **Le build cloud est MANUEL** (`.github/workflows/mobile-build.yml`, job `build`) :
  onglet Actions → *Mobile — Lint & EAS Build* → `Run workflow` → profil `preview` ou
  `production`. C'est le **seul** chemin qui consomme du quota. Un push sur `main` ne
  déclenche que le job `check` (lint + `expo export`), gratuit. ⚠️ Historique : ce
  workflow buildait à chaque push et vidait le quota mensuel tout seul en quelques jours
  (constaté 2026-07-04, quota de juillet mangé les 1–2) — ne pas remettre `push` sur le
  job `build`.
- **`npx EINVALIDTAGNAME` / `E400` au lancement du build local — RÉSOLU (2026-07-04).**
  Cause : un **npm 6.4.1 hérité dans `/usr/local`** dont le symlink `/usr/local/bin/npx`
  (placé **avant nvm dans le `PATH`**) pointait encore dessus, alors que `node`/`npm`
  avaient déjà été réalignés sur nvm (04-06). Quand eas-cli **spawn** `npx` (sous-process,
  sans les alias shell), il tombait sur ce 6.4.1 qui rejette l'argument base64 du job →
  échec avant Gradle. **Fix appliqué** : le symlink `npx` a été réaligné sur nvm, exactement
  comme `node`/`npm` — `sudo ln -sf /Users/nelson/.nvm/versions/node/v20.20.2/bin/npx
  /usr/local/bin/npx` (chirurgical ; l'arbre 6.4.1 a **depuis** été supprimé complètement (2026-07-04 ; `node-gyp`
  voisin intact) — build local **vc4** revalidé end-to-end sans aucun contournement `PATH`). Le `npx`
  spawné résout désormais vers npm 11.x → **le préfixe `PATH` nvm au moment du build n'est
  plus nécessaire.** Vérif si besoin : `which -a npx` + `/usr/local/bin/npx --version`
  (doit afficher 11.x, pas 6.4.1). (Les `npm --version` interactifs, aliasés vers nvm,
  restent trompeurs : c'est le `npx` **spawné** qu'il faut vérifier.)
- **Upload source-maps Sentry — RÉSOLU pour le cloud (2026-08-08).** La tâche Gradle
  `…SentryUpload` échoue faute d'identifiants (`error: An organization ID or slug is
  required`) et **fait échouer tout le build**, en local comme sur EAS cloud. Cause : le
  plugin `@sentry/react-native` est déclaré nu dans `app.json` (ni org ni projet) et il
  n'existe **aucun** `sentry.properties` versionné — `android/` est généré au prebuild.
  Le compte Sentry n'existe pas encore (`App.js` : `Sentry.init` est inerte sans DSN),
  donc l'upload n'a rien à alimenter. **Fix appliqué** : `SENTRY_DISABLE_AUTO_UPLOAD=true`
  posé dans `eas.json`, profils `preview` **et** `production` — le cloud n'avait jamais
  reçu le traitement qui était documenté ici pour le local seul, d'où un build cloud perdu
  le 2026-08-08. En local, la variable reste à exporter à la main (cf. commande plus bas).
  ⚠️ Le jour où Sentry est réellement branché, il ne suffira PAS de retirer cette variable :
  il faudra `SENTRY_ORG`, `SENTRY_PROJECT` et un `SENTRY_AUTH_TOKEN` en secret EAS
  (`eas secret:create`), sinon le build re-cassera exactement de la même façon.
- `ANDROID_HOME` requis : `export ANDROID_HOME=~/Library/Android/sdk`.
- devDep requise (résolue par `npx` sans repasser en mode install) :
  `eas-cli-local-build-plugin` — épinglée dans `mobile/package.json`.
- Commande complète :
  ```bash
  cd mobile
  export ANDROID_HOME=~/Library/Android/sdk
  export SENTRY_DISABLE_AUTO_UPLOAD=true
  eas build --local --platform android --profile preview --non-interactive
  ```
- APK sorti dans `mobile/build-<TIMESTAMP>.apk` (~81–86 Mo).
- Skill dédié : `expo-eas-local-build` (non présent sur ce poste au dernier build — la recette
  ci-dessus fait foi).

## Références

- API : `../docs/Creveton_API_Spec.md` (contrat backend, codes d'erreur, schémas).
- CDC : `../docs/Creveton_CDC.docx` (§9 charte, §2.8 sync/anti-triche).
- Backend par défaut : `EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1` (voir `.env.example` ; sur appareil physique, pointer l'IP LAN, pas `localhost`).

## Workflow git

- Les commits de l'app mobile doivent être **scopés à `mobile/`** : `git add .` depuis ce dossier (le `.git` est à la racine du monorepo et contient aussi `backend/` et `creveton-admin/`). Vérifier qu'aucun fichier non-`mobile/` n'est stagé avant de commiter.
- Committer/pousser uniquement sur demande explicite.
