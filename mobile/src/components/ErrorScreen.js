// ErrorScreen / état d'erreur — illustration emoji, message, bouton réessayer.
// Utilisable en plein écran (dark) ou en encart (inline, sur fond clair).

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import AppButton from './AppButton';
import Icon from './Icon';
import { colors, fonts, fontSizes, spacing } from '../constants/theme';

export default function ErrorScreen({
  emoji = '🦐',
  icon, // composant Lucide optionnel : remplace l'emoji par une icône vectorielle
  title = 'Oups…',
  message = 'Une erreur est survenue.',
  onRetry,
  retryLabel = 'Réessayer',
  dark = true,
  inline = false,
}) {
  const onDark = dark && !inline;
  return (
    <View style={[styles.container, onDark && styles.dark, inline && styles.inline]}>
      {icon ? (
        <View style={styles.iconWrap}>
          <Icon icon={icon} size={52} color={onDark ? colors.cream : colors.textDark} strokeWidth={1.5} />
        </View>
      ) : (
        <Text style={styles.emoji}>{emoji}</Text>
      )}
      <Text style={[styles.title, onDark && styles.onDarkText]}>{title}</Text>
      <Text style={[styles.message, onDark ? styles.onDarkMuted : styles.muted]}>
        {message}
      </Text>
      {onRetry ? (
        <AppButton
          title={retryLabel}
          onPress={onRetry}
          variant={onDark ? 'primary' : 'secondary'}
          size="md"
          fullWidth={false}
          style={styles.retry}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  inline: { flex: 0, paddingVertical: spacing.xxl },
  dark: { backgroundColor: colors.green900 },
  emoji: { fontSize: 56, marginBottom: spacing.lg },
  iconWrap: { marginBottom: spacing.lg },
  title: {
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.xl,
    color: colors.textDark,
    textAlign: 'center',
  },
  message: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.md,
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 300,
  },
  muted: { color: colors.textMuted },
  onDarkText: { color: colors.cream },
  onDarkMuted: { color: colors.textOnDarkMuted },
  retry: { marginTop: spacing.xl, minWidth: 180 },
});
