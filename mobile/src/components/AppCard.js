// AppCard — surface arrondie. tone: light | dark | cream. padding: none|sm|md|lg.
// elevation: soft | card | floating. Optionnellement pressable (feedback scale).

import React, { useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { colors, radius, spacing, shadow } from '../constants/theme';

const PADS = {
  none: 0,
  sm: spacing.md,
  md: spacing.lg,
  lg: spacing.xl,
};

export default function AppCard({
  children,
  tone = 'light',
  padding = 'md',
  elevation = 'card',
  radius: r = radius.lg,
  onPress,
  style,
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const toneStyle =
    tone === 'dark' ? styles.dark : tone === 'cream' ? styles.cream : styles.light;
  const pad = PADS[padding] ?? PADS.md;

  const content = (
    <Animated.View
      style={[
        styles.card,
        toneStyle,
        shadow[elevation],
        { padding: pad, borderRadius: r, transform: [{ scale }] },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() =>
        Animated.spring(scale, { toValue: 0.985, useNativeDriver: true, speed: 50 }).start()
      }
      onPressOut={() =>
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 4 }).start()
      }
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  light: { backgroundColor: colors.white },
  cream: { backgroundColor: colors.cream },
  dark: {
    backgroundColor: colors.cardOnDark,
    borderWidth: 1,
    borderColor: colors.borderOnDark,
  },
});
