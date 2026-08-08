// ════════════════════════════════════════════════════════════════════════
// Design tokens — « Le Cockpit Émeraude »
// Vert profond, or rare (≤10% de l'écran), fierté camerounaise.
// Outfit (titres/scores) + Space Grotesk (corps).
// ════════════════════════════════════════════════════════════════════════

import { Platform } from 'react-native';

// Cible tactile minimale — WCAG 2.1 AA = 44px ; Material/Android = 48dp.
// À appliquer en minHeight/minWidth sur tout élément interactif compact.
export const MIN_TOUCH = Platform.OS === 'android' ? 48 : 44;

export const colors = {
  // — Verts (identité)
  green900: '#0b2e1a',
  green700: '#1a5230',
  green500: '#2a8a4f',
  green300: '#5eca84',

  // — Or (rare : CTA primaires, rewards, podium)
  gold500: '#d4a017',
  gold400: '#e8b830',

  // — Fond clair & accent
  cream: '#fdf6e9',
  red200: '#ffd2cd', // accent erreur du Toast (posé sur red600, figé)
  red400: '#e74c3c',
  red600: '#c0392b',
  orange: '#f97316', // timer 'ring' : étape intermédiaire or → orange → rouge

  // — Neutres
  white: '#ffffff',
  black: '#000000',
  grey: '#6b7280',

  // — Texte
  textDark: '#0b2e1a',
  textBody: '#374151', // gris ardoise — contraste ≥ 4.5:1 sur clair
  textMuted: '#6b7280', // gris moyen lisible
  textFaint: '#9ca3af', // labels secondaires / tabs inactifs
  textOnDark: '#fdf6e9',
  textOnDarkMuted: 'rgba(253, 246, 233, 0.72)',
  textOnDarkFaint: 'rgba(253, 246, 233, 0.5)',

  // — Bordures & séparateurs
  border: '#e5e7eb',
  borderInput: '#d1d5db',
  borderOnDark: 'rgba(94, 202, 132, 0.22)',
  divider: 'rgba(11, 46, 26, 0.08)',

  // — États (succès / erreur) sur fond clair
  successBg: '#dcfce7',
  successBgSoft: '#f0fdf4',
  successBorder: '#2a8a4f',
  successText: '#15803d',
  errorBg: '#fee2e2',
  errorBorder: '#e74c3c',
  errorText: '#c0392b',

  // — Surfaces
  surface: '#ffffff',
  surfaceCream: '#fdf6e9',
  surfaceElevated: '#ffffff', // surface « surélevée » (clair) ; en sombre, plus claire que les cartes
  cardOnDark: '#143d24',
  overlay: 'rgba(7, 28, 16, 0.62)',

  // — Voiles or (pour bannières/podium, jamais en aplat large)
  goldVeil: 'rgba(212, 160, 23, 0.14)',
  goldVeilBorder: 'rgba(212, 160, 23, 0.45)',

  // — Voile clair (boutons discrets posés sur les bandeaux vert nuit)
  whiteVeil: 'rgba(255, 255, 255, 0.15)',

  // — Voile vert (badge OTP : fond + bordure — pendant vert de goldVeil)
  greenVeil: 'rgba(42, 138, 79, 0.12)',
  greenVeilBorder: 'rgba(42, 138, 79, 0.22)',

  // — Tints résultat (SessionCard : fond alpha 0.06 sous bordure 1px pleine,
  //   couleur par taux de réussite). Pas de variante sombre : un voile aussi
  //   léger fonctionne tel quel sur la surface de carte sombre (comportement
  //   historique conservé).
  tintSuccess: 'rgba(42, 138, 79, 0.06)',
  tintGold: 'rgba(212, 160, 23, 0.06)',
  tintError: 'rgba(231, 76, 60, 0.06)',

  // — Pastels figés (pastilles d'icônes Profil/Stats/Accueil, fonds de réponse
  //   du récap Résultats). Décoratifs, non sémantiques — JAMAIS surchargés en
  //   sombre : l'icône green900 (marque, ne flippe pas) posée dessus doit
  //   rester lisible dans les deux thèmes (successBg/errorBg, eux, flippent).
  pastelGreen: '#e8f5ed',
  pastelYellow: '#fef9c3',
  pastelBlue: '#dbeafe',
  pastelRed: '#fee2e2',
  pastelIndigo: '#e0e7ff',
  pastelViolet: '#f3e8ff',
  pastelRose: '#fdecea', // fond « mauvaise réponse » (récap Résultats)

  // — Pistes sur fond vert nuit (quiz/loading — composants figés sur sombre,
  //   pas de variante dark)
  trackOnDark: 'rgba(255, 255, 255, 0.2)', // anneau timer 'ring' + points à venir (ProgressDots)
  trackOnDarkSoft: 'rgba(255, 255, 255, 0.08)', // piste 'watch' blitz
  trackOnDarkFaint: 'rgba(255, 255, 255, 0.06)', // piste 'watch' marathon
  goldTrack: 'rgba(232, 184, 48, 0.18)', // piste du spinner or (LoadingScreen)

  // — Skeleton (le composant choisit lui-même la variante selon thème/prop `dark`)
  skeletonOnLight: 'rgba(11, 46, 26, 0.08)', // = divider — pulse sur surfaces claires
  skeletonOnDark: 'rgba(94, 202, 132, 0.14)',
};

// ════════════════════════════════════════════════════════════════════════
// Palette SOMBRE — mêmes CLÉS que `colors` (sinon styles → undefined).
// On part de `...colors` puis on inverse la sémantique des surfaces/textes :
//   blanc → surface sombre, cream → fond quasi-noir, textes clairs, etc.
// L'or et le vert profond restent (fonctionnent en sombre). Les clés
// `background*` servent au thème de navigation (NavigationContainer).
// ════════════════════════════════════════════════════════════════════════
export const darkColors = {
  ...colors,

  // Fonds — rampe verte tintée (pas de noir pur) : page < carte < secondaire < élevé.
  //
  // RECALIBRAGE LISIBILITÉ (08-2026) — rampe alignée sur le thème sombre de l'admin
  // (`creveton-admin/src/index.css`, bloc `[data-theme="dark"]`). L'ancienne rampe
  // empilait des verts à luminance quasi égale : la carte ne se détachait pas du fond
  // (1.13:1) et la bordure 1px — qui PORTE tout le système d'élévation — était
  // invisible (1.31:1). Deux principes, repris tels quels de l'admin :
  //   1. Les SURFACES gardent la teinte verte mais s'écartent en luminance : c'est
  //      l'écart qui fait lire une carte, pas la teinte.
  //   2. Les TEXTES se désaturent vers le neutre. Le vert reste porté par les accents
  //      de marque (green300/gold), jamais par le corps de texte.
  // Ratios mesurés sur la carte (`surface`) sauf mention contraire.
  background: '#0a1b10', // page (niveau 0) — laisse les surfaces monter au-dessus
  backgroundSecondary: '#16331f', // en-têtes / barre d'onglets (= niveau carte)
  backgroundTertiary: '#1d4128', // surfaces élevées (= niveau 2)
  cardOnDark: '#16331f',

  // Inversions de surface (ce qui était clair devient sombre)
  white: '#16331f', // « cartes » blanches → surface sombre (niveau 1) — 1.30:1 sur la page (était 1.13:1)
  cream: '#0a1b10', // fond de page (niveau 0)
  surface: '#16331f',
  surfaceCream: '#1d4128', // surface secondaire tintée (niveau 2) — 1.20:1 sur la carte
  surfaceElevated: '#234f30', // niveau 3 (tuiles « mode » Home, chips, recherche d'ami) — 1.21:1 sur le niveau 2.
  //   Sans équivalent admin (qui n'a que 2 niveaux) : dérivé en reprenant son pas de luminance.

  // Textes : clairs sur sombre (mêmes clés que la palette claire)
  textDark: '#f0f7f1', // primaire / titres — 12.62:1
  textBody: '#d6e4d8', // paragraphes — 10.44:1
  textMuted: '#bdcfc1', // secondaire / labels — 8.42:1 (5.76:1 au niveau 3)
  textFaint: '#a7bbac', // dé-emphasé : méta / placeholders — 6.77:1 (4.63:1 au niveau 3)
  //   `textMuted`/`textFaint` sont un cran plus clairs que leurs homologues admin
  //   (#a3b8a8 / #8fa695) : le mobile a un niveau d'élévation de plus, et les deux y
  //   sont réellement posés (description des tuiles « mode » Home, placeholder de la
  //   recherche d'ami). Les valeurs admin y tomberaient à 4.47:1 et 3.61:1, sous AA.
  textOnDark: '#ffffff', // texte sur en-têtes vert profond → blanc pur

  // Bordures & séparateurs
  border: '#356b45', // 2.19:1 sur la carte (était 1.31:1) — la bordure 1px existe enfin
  borderInput: '#356b45',
  divider: 'rgba(240, 250, 244, 0.08)',

  // États (fonds sombres)
  successBg: '#0d2318',
  errorBg: '#2d1515',

  // Voile sombre plus opaque
  overlay: 'rgba(0, 0, 0, 0.72)',
};

// Alias clair (symétrie avec darkColors) — `colors` reste la source.
export const lightColors = colors;

// Dégradés par thème (fond de cartes thème — fonds, jamais texte).
export const themeGradients = {
  geographie: ['#1e3a5f', '#2d5a8e'], // bleu
  culture: ['#2d1b4e', '#5b2d8e'], // violet
  histoire: ['#4a2000', '#8b4513'], // brun
  industrie: ['#0b2e1a', '#1a5230'], // vert
  sport: ['#3a1212', '#8e2d2d'], // rouge profond
  science: ['#063b3a', '#0f7b75'], // sarcelle
};

// Voiles assortis (badges/accents discrets liés au thème).
export const themeAccent = {
  geographie: '#2d5a8e',
  culture: '#5b2d8e',
  histoire: '#8b4513',
  industrie: '#1a5230',
  sport: '#8e2d2d',
  science: '#0f7b75',
};

// Dégradé signature (header sombre, carte « Jouer »).
export const emeraldGradient = ['#0b2e1a', '#1a5230'];

export const fonts = {
  // Titres / scores : Outfit
  titleRegular: 'Outfit_400Regular',
  titleMedium: 'Outfit_500Medium',
  titleSemiBold: 'Outfit_600SemiBold',
  titleBold: 'Outfit_700Bold',
  titleExtraBold: 'Outfit_800ExtraBold',
  titleBlack: 'Outfit_900Black',
  // Corps : Space Grotesk
  bodyRegular: 'SpaceGrotesk_400Regular',
  bodyMedium: 'SpaceGrotesk_500Medium',
  bodySemiBold: 'SpaceGrotesk_600SemiBold',
  bodyBold: 'SpaceGrotesk_700Bold',

  // Fallbacks « System » si une famille custom n'est pas encore chargée.
  regular: 'System',
  medium: 'System',
  heavy: 'System',
};

export const fontSizes = {
  xs: 12,
  sm: 13,
  md: 14,
  base: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  xxxl: 36,
  display: 48,
  hero: 64,
};

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 8,
  md: 12,
  base: 14,
  lg: 16,
  xl: 20,
  xxl: 24,
  pill: 999,
};

// Ombres — douces sur clair, profondes pour cartes flottantes.
export const shadow = {
  soft: {
    shadowColor: '#0b2e1a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  card: {
    shadowColor: '#0b2e1a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 4,
  },
  floating: {
    shadowColor: '#0b2e1a',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 12,
  },
  gold: {
    shadowColor: '#d4a017',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
  },
  tabBar: {
    shadowColor: '#0b2e1a',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 16,
  },
};

// Motion — slide+fade ≤ 300ms, jamais > 500ms. Ease-out exponentiel.
export const motion = {
  fast: 120, // feedback tactile < 100-120ms
  base: 220,
  enter: 300,
  max: 500,
  // Courbes (Easing importé là où on anime)
  easeOut: 'ease-out',
};

// Échelle z-index sémantique.
export const zIndex = {
  base: 0,
  sticky: 10,
  header: 20,
  overlay: 100,
  modal: 200,
  toast: 300,
  tooltip: 400,
};

export default {
  colors,
  themeGradients,
  themeAccent,
  emeraldGradient,
  fonts,
  fontSizes,
  spacing,
  radius,
  shadow,
  motion,
  zIndex,
};
