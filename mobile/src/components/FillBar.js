// FillBar — barre de progression (piste + remplissage animé). Sert la jauge
// « joueurs inscrits » des cartes tournoi. Tokens via useTheme (theme-aware).
// `pct` = pourcentage de remplissage (0–100) ; la largeur anime jusqu'à pct%.

import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import { radius, spacing } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

export default function FillBar({ pct, color, trackColor, height = 8 }) {
  const { colors } = useTheme();
  const target = Math.max(0, Math.min(100, Number(pct) || 0));
  const grow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(grow, {
      toValue: target,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [grow, target]);

  const width = grow.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });

  return (
    <View style={[styles.track, { height, backgroundColor: trackColor || colors.border }]}>
      <Animated.View style={[styles.bar, { width, backgroundColor: color || colors.green500 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    borderRadius: radius.pill,
    overflow: 'hidden',
    marginVertical: spacing.xxs,
  },
  bar: { height: '100%', borderRadius: radius.pill },
});
