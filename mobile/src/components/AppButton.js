// AppButton — variant (primary/secondary/ghost/danger/dark/outlineGold) × size (sm/md/lg).
// Feedback tactile < 120ms (scale spring au press), état loading (spinner inline).
// L'or est réservé au variant primary (CTA).

import React, { useRef, useMemo } from 'react';
import {
  Animated,
  Pressable,
  Text,
  View,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { fonts, fontSizes, radius, spacing, shadow, MIN_TOUCH } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { hapticLight } from '../utils/haptics';

const SIZES = {
  sm: { height: Math.max(42, MIN_TOUCH), font: fontSizes.md, px: spacing.lg }, // ≥44 (WCAG) / 48 (Android)
  md: { height: 52, font: fontSizes.base, px: spacing.xl },
  lg: { height: 60, font: fontSizes.lg, px: spacing.xl },
};

export default function AppButton({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  iconLeft = null,
  iconRight = null,
  fullWidth = true,
  haptic = true,
  style,
  textStyle,
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const { colors, isDark } = useTheme();
  const VARIANTS = useMemo(() => makeVariants(colors, isDark), [colors, isDark]);
  const isDisabled = disabled || loading;
  const v = VARIANTS[variant] || VARIANTS.primary;
  const s = SIZES[size] || SIZES.md;

  const handlePress = (e) => {
    if (haptic) hapticLight();
    onPress?.(e);
  };

  const pressIn = () =>
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 50,
      bounciness: 0,
    }).start();
  const pressOut = () =>
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();

  return (
    <Animated.View
      style={[
        fullWidth && styles.fullWidth,
        { transform: [{ scale }] },
        variant === 'primary' && !isDisabled && shadow.gold,
        style,
      ]}
    >
      <Pressable
        onPress={handlePress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={isDisabled}
        style={[
          styles.base,
          { height: s.height, paddingHorizontal: s.px },
          v.container,
          isDisabled && styles.disabled,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={v.text.color} />
        ) : (
          <View style={styles.content}>
            {iconLeft}
            <Text style={[styles.text, { fontSize: s.font }, v.text, textStyle]}>
              {title}
            </Text>
            {iconRight}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fullWidth: { alignSelf: 'stretch' },
  base: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { fontFamily: fonts.titleBold, letterSpacing: 0.2 },
  disabled: { opacity: 0.45 },
});

// En sombre, `ghost` (contour vert) passe au vert clair (green300) pour rester
// lisible sur surface sombre ; `secondary` garde un libellé clair stable.
const makeVariants = (colors, isDark) => ({
  primary: {
    container: { backgroundColor: colors.gold500 },
    text: { color: colors.green900 },
  },
  secondary: {
    container: { backgroundColor: colors.green500 },
    text: { color: colors.textOnDark },
  },
  ghost: {
    container: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: isDark ? colors.green300 : colors.green700,
    },
    text: { color: isDark ? colors.green300 : colors.green700 },
  },
  danger: {
    container: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: colors.red400,
    },
    text: { color: colors.red400 },
  },
  // Fond vert profond, libellé or — CTA « Rejouer » sur écran résultat sombre.
  dark: {
    container: { backgroundColor: colors.green900 },
    text: { color: colors.gold500 },
  },
  // Contour or sur fond transparent — action secondaire sur écran sombre.
  outlineGold: {
    container: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: colors.gold500,
    },
    text: { color: colors.gold500 },
  },
});
