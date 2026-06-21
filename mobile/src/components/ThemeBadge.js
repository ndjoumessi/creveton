// ThemeBadge — pastille colorée d'un thème de quiz (emoji + label).
// Teinte dérivée de themeAccent ; variante solide (sur clair) ou voile (sur sombre).

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, fontSizes, radius, spacing, themeAccent } from '../constants/theme';
import { themeLabel, themeEmoji } from '../utils/format';

function hexToRgba(hex, a) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export default function ThemeBadge({ theme, size = 'md', showLabel = true, style }) {
  const accent = themeAccent[theme] || colors.green500;
  const small = size === 'sm';
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: hexToRgba(accent, 0.14),
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
