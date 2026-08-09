// ThemeBadge — pastille colorée d'un thème de quiz (emoji + label).
// Teinte dérivée de themeAccent ; variante solide (sur clair) ou voile (sur sombre).

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { fonts, fontSizes, radius, spacing, themeAccent, themeAccentOnDark } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { themeLabel, themeEmoji } from '../utils/format';

function hexToRgba(hex, a) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export default function ThemeBadge({ theme, size = 'md', showLabel = true, style }) {
  // `themeAccent` est une palette de FONDS (dégradés des cartes « Jouer ») :
  // saturée et sombre. Employée ici comme texte sur un voile de 14 % d'elle-même
  // posé sur la carte SOMBRE, elle donnait 1.42 à 2.37:1 — les six pastilles de
  // thème étaient illisibles en thème sombre. `themeAccentOnDark` garde la
  // teinte et remonte la luminosité au-dessus de 4.5:1.
  const { colors, isDark } = useTheme();
  const palette = isDark ? themeAccentOnDark : themeAccent;
  const accent = palette[theme] || (isDark ? colors.green300 : colors.green500);
  const small = size === 'sm';
  return (
    <View
      style={[
        styles.badge,
        {
          // 0.16 en sombre : les accents clairs y sont peu saturés, un voile
          // trop léger ne dessinerait plus la pastille. Le ratio est calculé
          // avec cette valeur (cf. themeAccentOnDark).
          backgroundColor: hexToRgba(accent, isDark ? 0.16 : 0.14),
          paddingVertical: small ? 3 : 5,
          paddingHorizontal: small ? spacing.sm : spacing.md,
        },
        style,
      ]}
    >
      <Text style={{ fontSize: small ? 12 : 14 }}>{themeEmoji(theme)}</Text>
      {showLabel ? (
        <Text
          style={[
            styles.label,
            { color: accent, fontSize: small ? fontSizes.xs : fontSizes.sm },
          ]}
        >
          {themeLabel(theme)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  label: { fontFamily: fonts.bodyBold },
});
