// Confetti — particules vert/or tombant depuis le haut (~2 s). Animated Views
// (pas de dépendance lourde). Monter conditionnellement (ex. score > 70%).

import React, { useEffect, useRef, useMemo } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { colors } from '../constants/theme';

const PALETTE = [colors.green500, colors.green300, colors.gold500, colors.gold400, colors.cream];

// Pseudo-aléatoire déterministe (Math.random est indispo dans certains
// contextes ; on en garde une version locale simple, suffisante ici).
function rng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export default function Confetti({ count = 28, duration = 2000, originSeed = 7 }) {
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReduceMotion();

  const particles = useMemo(() => {
    const rand = rng(originSeed * 1000 + count);
    return Array.from({ length: count }).map((_, i) => ({
      key: i,
      x: rand() * width,
      delay: rand() * 350,
      size: 6 + rand() * 8,
      color: PALETTE[Math.floor(rand() * PALETTE.length)],
      drift: (rand() - 0.5) * 80,
      spin: rand() > 0.5 ? 1 : -1,
    }));
  }, [count, width, originSeed]);

  // a11y : le confetti est purement décoratif — on ne le rend pas du tout si
  // « réduire les animations » est activé.
  if (reduceMotion) return null;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      {particles.map((p) => (
        <Particle key={p.key} p={p} height={height} duration={duration} />
      ))}
    </View>
  );
}

function Particle({ p, height, duration }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, {
      toValue: 1,
      duration,
      delay: p.delay,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [t, duration, p.delay]);

  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [-40, height + 40] });
  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] });
  const rotate = t.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', `${p.spin * 540}deg`],
  });
  const opacity = t.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: p.x,
        width: p.size,
        height: p.size * 1.4,
        borderRadius: 2,
        backgroundColor: p.color,
        opacity,
        transform: [{ translateY }, { translateX }, { rotate }],
      }}
    />
  );
}
