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
  red400: '#e74c3c',
  red600: '#c0392b',

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
  background: '#0d1f14', // page (vert très sombre, = cream sombre)
  backgroundSecondary: '#162a1e', // en-têtes / barre d'onglets (= niveau carte)
  backgroundTertiary: '#1e3328', // surfaces élevées
  cardOnDark: '#162a1e',

  // Inversions de surface (ce qui était clair devient sombre)
  white: '#162a1e', // « cartes » blanches → surface sombre (niveau 1)
  cream: '#0d1f14', // fond de page (niveau 0)
  surface: '#162a1e',
  surfaceCream: '#1e3328', // surface secondaire tintée (niveau 2)
  surfaceElevated: '#22382a', // plus claire que les cartes (#162a1e) → tuiles « mode » (niveau 3)

  // Textes : clairs sur sombre (mêmes clés que la palette claire)
  textDark: '#f0faf4', // primaire — blanc cassé verdâtre (~15:1 sur la page)
  textBody: '#e8f5ed', // paragraphes — légèrement plus chaud que textDark
  textMuted: '#9dbfaa', // secondaire / labels (~7.4–8.6:1 sur toutes surfaces sombres)
  textFaint: '#7da88a', // dé-emphasé : AA corps (≥5.5:1) — relevé de #6a9070 (échouait 4.1:1 sur cartes)
  textOnDark: '#ffffff', // texte sur en-têtes vert profond → blanc pur

  // Bordures & séparateurs
  border: '#2a3d30',
  borderInput: '#2a3d30',
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
