// useTheme — renvoie la palette active (claire/sombre) selon themeStore.
// Usage écran : `const { colors } = useTheme(); const styles = useMemo(
//   () => makeStyles(colors), [colors]);`

import { useThemeStore } from '../store/themeStore';
import { colors as lightColors, darkColors } from '../constants/theme';

export function useTheme() {
  const isDark = useThemeStore((s) => s.isDark);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  return {
    colors: isDark ? darkColors : lightColors,
    isDark,
    toggleTheme,
  };
}
