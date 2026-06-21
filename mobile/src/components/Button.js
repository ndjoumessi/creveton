// Bouton principal — variantes primary (or), secondary (vert), ghost, danger.

import React from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
} from 'react-native';
import { colors, fonts, fontSizes, radius, spacing, shadow } from '../constants/theme';

export default function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon = null,
  style,
  fullWidth = true,
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        fullWidth && styles.fullWidth,
        variantStyles[variant]?.container,
        variant === 'primary' && shadow.gold,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? colors.green900 : colors.cream}
        />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text style={[styles.text, variantStyles[variant]?.text]}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 54,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  fullWidth: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: {
    fontFamily: fonts.titleSemiBold,
    fontSize: fontSizes.md,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.5 },
});

const variantStyles = {
  primary: {
    container: { backgroundColor: colors.gold400 },
    text: { color: colors.green900 },
  },
  secondary: {
    container: { backgroundColor: colors.green500 },
    text: { color: colors.cream },
  },
  ghost: {
    container: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: colors.gold400,
    },
    text: { color: colors.gold400 },
  },
  danger: {
    container: { backgroundColor: colors.red400 },
    text: { color: colors.white },
  },
};
