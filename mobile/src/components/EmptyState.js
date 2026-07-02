// EmptyState — état vide centré : emoji/icône + titre + message + CTA optionnels.
// Fond transparent : se pose tel quel dans un corps d'écran ou en
// ListEmptyComponent de FlatList. `icon` accepte un emoji (string) ou un
// composant Lucide. Les écarts propres à un écran (padding du conteneur,
// graisse/taille du titre, interligne du message) passent par `style`,
// `titleStyle` et `messageStyle` — le squelette (centrage, ordre, CTA primaire)
// reste partagé.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import AppButton from './AppButton';
import Icon from './Icon';
import { Heading, Body } from './Text';
import { spacing } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

export default function EmptyState({
  icon = '🎮',
  iconSize = 56,
  title,
  message,
  ctaLabel,
  onCta,
  ctaSize = 'md',
  ctaFullWidth = false,
  style,
  titleStyle,
  messageStyle,
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.container, style]}>
      {typeof icon === 'string' ? (
        <Text style={{ fontSize: iconSize }}>{icon}</Text>
      ) : (
        <Icon icon={icon} size={iconSize} color={colors.textMuted} strokeWidth={1.5} />
      )}
      {title ? <Heading style={[styles.title, titleStyle]}>{title}</Heading> : null}
      {message ? (
        <Body muted style={[styles.message, messageStyle]}>
          {message}
        </Body>
      ) : null}
      {ctaLabel && onCta ? (
        <AppButton
          variant="primary"
          title={ctaLabel}
          size={ctaSize}
          fullWidth={ctaFullWidth}
          onPress={onCta}
          style={styles.cta}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  title: { textAlign: 'center' },
  message: { textAlign: 'center' },
  cta: { marginTop: spacing.md },
});
