// Skeleton — placeholder pulsé pour les états de chargement.
// <Skeleton width={120} height={16} radius={8} dark />

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { radius as R } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

export default function Skeleton({ width = '100%', height = 16, radius = R.sm, dark = false, style }) {
  const { isDark } = useTheme();
  const onDark = dark || isDark;
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        styles.base,
        onDark ? styles.dark : styles.light,
        { width, height, borderRadius: radius, opacity: pulse },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {},
  light: { backgroundColor: 'rgba(11,46,26,0.08)' },
  dark: { backgroundColor: 'rgba(94,202,132,0.14)' },
});
