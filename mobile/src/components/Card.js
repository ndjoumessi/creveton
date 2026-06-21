// Carte — surface arrondie avec ombre. Variante claire ou sombre.

import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { colors, radius, spacing, shadow } from '../constants/theme';

export default function Card({
  children,
  dark = false,
  onPress,
  style,
  padded = true,
}) {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={onPress}
      style={({ pressed } = {}) => [
        styles.card,
        dark ? styles.dark : styles.light,
        padded && styles.padded,
        shadow.card,
        pressed && styles.pressed,
        style,
      ]}
    >
      {children}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg },
  light: { backgroundColor: colors.white },
  dark: {
    backgroundColor: colors.cardOnDark,
    borderWidth: 1,
    borderColor: colors.borderOnDark,
  },
  padded: { padding: spacing.md },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
