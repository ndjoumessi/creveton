// StatusBadge — pastille de statut d'un tournoi (open / running / scheduled / closed…).
// Fond teinté + texte assortis au statut ; point pulsant quand le tournoi est en
// cours (live). Tokens de la charte via useTheme (theme-aware clair/sombre).
// Le libellé (i18n) est fourni par l'appelant.

import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, StyleSheet } from 'react-native';
import { fonts, fontSizes, radius, spacing } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

// Statut → paire { fond teinté, texte/point }. `running` reproduit à l'identique
// l'ancienne « RunningPill » (errorBg + red600).
function statusTone(status, colors) {
  switch (status) {
    case 'running':
      return { bg: colors.errorBg, fg: colors.red600 };
    case 'open':
      return { bg: colors.successBg, fg: colors.successText };
    case 'scheduled':
      return { bg: colors.goldVeil, fg: colors.gold500 };
    case 'closed':
    case 'paid':
      return { bg: colors.border, fg: colors.textMuted };
    default:
      return { bg: colors.errorBg, fg: colors.red600 };
  }
}

export default function StatusBadge({ status, label, live = false }) {
  const { colors } = useTheme();
  const tone = statusTone(status, colors);
  const pulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    if (!live) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, live]);

  return (
    <Animated.View style={[styles.badge, { backgroundColor: tone.bg }, live && { opacity: pulse }]}>
      {live ? <View style={[styles.dot, { backgroundColor: tone.fg }]} /> : null}
      <Text style={[styles.text, { color: tone.fg }]}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
  },
  text: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.xs,
    letterSpacing: 0.5,
  },
});
