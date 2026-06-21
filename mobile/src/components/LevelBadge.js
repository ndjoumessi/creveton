// LevelBadge — pill « Niv. 3 · 3 500 XP ». Or réservé (reward), donc utilisé
// avec parcimonie ; variante « soft » pour un rendu discret sur fond clair.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, fontSizes, radius, spacing } from '../constants/theme';

export default function LevelBadge({ level = 1, xp, variant = 'gold', style }) {
  const gold = variant === 'gold';
  return (
    <View style={[styles.badge, gold ? styles.gold : styles.soft, style]}>
      <Text style={styles.star}>★</Text>
      <Text style={[styles.text, gold ? styles.textGold : styles.textSoft]}>
        Niv. {level}
        {xp !== undefined ? ` · ${Number(xp).toLocaleString('fr-FR')} XP` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 4,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  gold: { backgroundColor: colors.gold400 },
  soft: { backgroundColor: colors.goldVeil, borderWidth: 1, borderColor: colors.goldVeilBorder },
  star: { fontSize: 11, color: colors.green900 },
  text: { fontFamily: fonts.bodyBold, fontSize: fontSizes.xs },
  textGold: { color: colors.green900 },
  textSoft: { color: colors.gold500 },
});
