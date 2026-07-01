// FillBar — barre de progression (piste + remplissage animé). Sert la jauge
// « joueurs inscrits » des cartes tournoi. Tokens via useTheme (theme-aware).
// `pct` = pourcentage de remplissage (0–100) ; la largeur anime jusqu'à pct%.
// `delay` (défaut 0) = retard avant l'animation, sert au décalage (stagger) d'une
// liste de barres. Défaut 0 → comportement identique à l'usage historique.
// `useReduceMotion` a11y : largeur finale instantanée (ni durée ni delay).

import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import { radius, spacing } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { useReduceMotion } from '../hooks/useReduceMotion';

export default function FillBar({ pct, color, trackColor, height = 8, delay = 0 }) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const target = Math.max(0, Math.min(100, Number(pct) || 0));
  const grow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(grow, {
      toValue: target,
      duration: reduceMotion ? 0 : 600,
      delay: reduceMotion ? 0 : delay,
      useNativeDriver: false,
    }).start();
  }, [grow, target, delay, reduceMotion]);

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
