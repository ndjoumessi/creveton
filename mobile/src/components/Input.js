// Champ de saisie avec label, message d'erreur et fond clair.

import React from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { Label, Body } from './Text';
import { colors, fonts, fontSizes, radius, spacing } from '../constants/theme';

export default function Input({
  label,
  error,
  style,
  containerStyle,
  ...props
}) {
  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Label style={styles.label}>{label}</Label> : null}
      <TextInput
        placeholderTextColor={colors.textMuted}
        style={[styles.input, error && styles.inputError, style]}
        {...props}
      />
      {error ? (
        <Body style={styles.error} color={colors.red400}>
          {error}
        </Body>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  label: { marginBottom: spacing.xs },
  input: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.md,
    color: colors.textDark,
  },
  inputError: { borderColor: colors.red400 },
  error: { marginTop: spacing.xs, fontSize: fontSizes.xs },
});
