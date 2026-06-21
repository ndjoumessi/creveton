// Composants texte typés à la charte.
// Outfit → Title/Heading (titres, scores). Space Grotesk → Body/Label (corps).
// Couleurs par défaut contrastées (≥ 4.5:1 sur fond clair).

import React from 'react';
import { Text as RNText, StyleSheet } from 'react-native';
import { colors, fonts, fontSizes } from '../constants/theme';

export function Title({ style, children, color, ...props }) {
  return (
    <RNText style={[styles.title, color && { color }, style]} {...props}>
      {children}
    </RNText>
  );
}

export function Heading({ style, children, color, ...props }) {
  return (
    <RNText style={[styles.heading, color && { color }, style]} {...props}>
      {children}
    </RNText>
  );
}

export function Body({ style, children, color, muted, ...props }) {
  return (
    <RNText
      style={[styles.body, muted && styles.muted, color && { color }, style]}
      {...props}
    >
      {children}
    </RNText>
  );
}

export function Label({ style, children, color, ...props }) {
  return (
    <RNText style={[styles.label, color && { color }, style]} {...props}>
      {children}
    </RNText>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.xxl,
    color: colors.textDark,
  },
  heading: {
    fontFamily: fonts.titleSemiBold,
    fontSize: fontSizes.lg,
    color: colors.textDark,
  },
  body: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.base,
    color: colors.textBody,
  },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  muted: { color: colors.textMuted },
});

export default { Title, Heading, Body, Label };
