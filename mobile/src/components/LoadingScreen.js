// LoadingScreen — spinner circulaire or (arc SVG en rotation) sur fond vert.

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { colors, fonts, fontSizes, spacing } from '../constants/theme';

function GoldSpinner({ size = 56, strokeWidth = 5 }) {
  const spin = useRef(new Animated.Value(0)).current;
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View style={{ width: size, height: size, transform: [{ rotate }] }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgba(232,184,48,0.18)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.gold500}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * 0.7}
        />
      </Svg>
    </Animated.View>
  );
}

export default function LoadingScreen({ message, fullScreen = true }) {
  const inner = (
    <View style={styles.center}>
      <GoldSpinner />
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
  if (!fullScreen) return <View style={styles.fill}>{inner}</View>;
  return (
    <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
      {inner}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.green900 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  message: {
    marginTop: spacing.lg,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.md,
    color: colors.textOnDarkMuted,
  },
});
