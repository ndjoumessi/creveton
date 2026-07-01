// XpBar — barre de progression d'XP partagée (Profil + Stats).
// Présentative : `current`/`max` → remplissage animé gauche→droite (clampé 0–1,
// donc robuste au niveau max où current dépasse max). Piste sur fond sombre
// (borderOnDark), remplissage or (gold500 par défaut). `height` ajuste l'épaisseur
// (Profil = fin, Stats = épais) ; `label` optionnel rendu sous la barre.

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { fonts, fontSizes, radius, spacing, motion } from '../constants/theme';

export default function XpBar({ current, max, label, color, height = 8 }) {
  const { colors } = useTheme();
  const pct = max > 0 ? Math.min(Math.max(current / max, 0), 1) : 0;
  const fill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fill, {
      toValue: pct,
      duration: motion.enter,
      useNativeDriver: false,
    }).start();
  }, [fill, pct]);
  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View>
      <View style={[styles.track, { height, backgroundColor: colors.borderOnDark }]}>
        <Animated.View style={[styles.fill, { width, backgroundColor: color || colors.gold500 }]} />
      </View>
      {label ? <Text style={[styles.label, { color: colors.textOnDarkMuted }]}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
  label: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.xs, marginTop: spacing.xs },
});
