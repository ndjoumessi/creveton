// Petit badge / pastille (statut, niveau, thème).

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, fontSizes, radius, spacing } from '../constants/theme';

export default function Badge({ label, tone = 'gold', style }) {
  return (
    <View style={[styles.badge, tones[tone]?.bg, style]}>
      <Text style={[styles.text, tones[tone]?.text]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  text: { fontFamily: fonts.bodyBold, fontSize: fontSizes.xs },
});

const tones = {
  gold: { bg: { backgroundColor: colors.gold400 }, text: { color: colors.green900 } },
  green: { bg: { backgroundColor: colors.green500 }, text: { color: colors.cream } },
  light: {
    bg: { backgroundColor: 'rgba(94,202,132,0.18)' },
    text: { color: colors.green700 },
  },
  red: { bg: { backgroundColor: colors.red400 }, text: { color: colors.white } },
};
