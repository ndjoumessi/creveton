// CircularTimer — minuteur circulaire SVG.
// Arc de progression animé via strokeDashoffset ; couleur or → orange → rouge
// pilotée par `progress` (Animated.Value 1 → 0). Chiffre centré même couleur.
// Pulsation scale dans les 5 dernières secondes.

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, fonts } from '../constants/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const GOLD = colors.gold500;
const ORANGE = '#f97316';
const RED = colors.red400;

export default function CircularTimer({
  size = 80,
  strokeWidth = 5,
  progress, // Animated.Value : 1 (plein) → 0 (écoulé)
  seconds, // valeur numérique affichée au centre
}) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const scale = useRef(new Animated.Value(1)).current;

  // strokeDashoffset : 0 = arc complet (progress 1), circ = vide (progress 0)
  const dashoffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });
  // Couleur de l'arc : rouge (≤0.2) → orange (0.5) → or (1).
  const strokeColor = progress.interpolate({
    inputRange: [0, 0.2, 0.5, 1],
    outputRange: [RED, RED, ORANGE, GOLD],
  });

  // Pulsation sous les 5 s.
  useEffect(() => {
    if (seconds <= 5 && seconds > 0) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.08, duration: 400, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 400, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => {
        loop.stop();
        scale.setValue(1);
      };
    }
  }, [seconds, scale]);

  return (
    <Animated.View style={[styles.wrap, { width: size, height: size, transform: [{ scale }] }]}>
      <Svg width={size} height={size}>
        {/* Cercle de fond */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgba(255,255,255,0.2)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Arc de progression (départ en haut : rotation -90°) */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Animated.Text style={[styles.value, { color: strokeColor }]}>{seconds}</Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  value: { fontFamily: fonts.titleBold, fontSize: 20 },
});
