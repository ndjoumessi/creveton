// ErrorScreen / état d'erreur — illustration emoji, message, bouton réessayer.
// Utilisable en plein écran (dark) ou en encart (inline, sur fond clair).

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import AppButton from './AppButton';
import Icon from './Icon';
import { colors, fonts, fontSizes, spacing } from '../constants/theme';

/**
 * Les libellés par défaut étaient écrits EN DUR en français : les huit écrans
 * qui s'en remettent à eux affichaient « Oups… / Une erreur est survenue /
 * Réessayer » au milieu d'une interface anglaise. Ils sont désormais résolus à
 * l'exécution — d'où `undefined` en valeur par défaut plutôt qu'une chaîne :
 * un défaut de paramètre est évalué avant que `t` n'existe.
 */
export default function ErrorScreen({
  emoji = '🦐',
  icon, // composant Lucide optionnel : remplace l'emoji par une icône vectorielle
  title,
  message,
  onRetry,
  retryLabel,
  dark = true,
  inline = false,
}) {
  const { t } = useTranslation();
  const heading = title ?? t('common.oops');
  const body = message ?? t('common.error');
  const retry = retryLabel ?? t('common.retry');
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
      <Text style={[styles.title, onDark && styles.onDarkText]}>{heading}</Text>
      <Text style={[styles.message, onDark ? styles.onDarkMuted : styles.muted]}>
        {body}
      </Text>
      {onRetry ? (
        <AppButton
          title={retry}
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
