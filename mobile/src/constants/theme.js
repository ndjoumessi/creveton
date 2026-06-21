// Charte graphique Creveton — CDC §9
// Palette verte (drapeau camerounais) + or, sur fond crème.

export const colors = {
  // Verts
  green900: '#0b2e1a',
  green700: '#1a5230',
  green500: '#2a8a4f',
  green300: '#5eca84',

  // Or
  gold500: '#d4a017',
  gold400: '#e8b830',

  // Neutres & accents
  cream: '#fdf6e9',
  red400: '#e74c3c',

  // Dérivés utilitaires
  white: '#ffffff',
  black: '#000000',
  textDark: '#0b2e1a',
  textMuted: 'rgba(11, 46, 26, 0.6)',
  textOnDark: '#fdf6e9',
  textOnDarkMuted: 'rgba(253, 246, 233, 0.7)',
  overlay: 'rgba(11, 46, 26, 0.55)',
  border: 'rgba(11, 46, 26, 0.12)',
  borderOnDark: 'rgba(94, 202, 132, 0.25)',
  success: '#2a8a4f',
  error: '#e74c3c',
  warning: '#e8b830',
  cardOnDark: '#143d24',
};

export const fonts = {
  // Titres : Outfit
  titleRegular: 'Outfit_400Regular',
  titleMedium: 'Outfit_500Medium',
  titleSemiBold: 'Outfit_600SemiBold',
  titleBold: 'Outfit_700Bold',
  // Corps : Space Grotesk
  bodyRegular: 'SpaceGrotesk_400Regular',
  bodyMedium: 'SpaceGrotesk_500Medium',
  bodyBold: 'SpaceGrotesk_700Bold',
};

export const fontSizes = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  xxxl: 36,
  display: 48,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
};

export const shadow = {
  card: {
    shadowColor: '#0b2e1a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  gold: {
    shadowColor: '#d4a017',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
};

export default { colors, fonts, fontSizes, spacing, radius, shadow };
