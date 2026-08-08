// EmptyState — état vide centré : emoji/icône + titre + message + CTA optionnels.
// Fond transparent : se pose tel quel dans un corps d'écran ou en
// ListEmptyComponent de FlatList. `icon` accepte un emoji (string) ou un
// composant Lucide. Les écarts propres à un écran (padding du conteneur,
// graisse/taille du titre, interligne du message) passent par `style`,
// `titleStyle` et `messageStyle` — le squelette (centrage, ordre, CTA primaire)
// reste partagé.
//
// `secondaryLabel`/`onSecondary` ajoutent une seconde action en ghost sous le CTA.
// Un état vide n'a pas toujours une seule sortie : quand la liste est filtrée ET
// paginée, « retirer le filtre » et « charger la page suivante » sont deux issues
// légitimes, et n'en offrir qu'une transforme le filtre en cul-de-sac.

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
  secondaryLabel,
  onSecondary,
  secondaryLoading = false,
  style,
  titleStyle,
  messageStyle,
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.container, style]}>
      {typeof icon === 'string' ? (
        // intentional: emoji à pleine opacité (l'ancien état vide Challenges
        // utilisait 0.9 — delta entériné, audit d'équivalence P1).
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
      {secondaryLabel && onSecondary ? (
        <AppButton
          variant="ghost"
          title={secondaryLabel}
          size={ctaSize}
          fullWidth={ctaFullWidth}
          loading={secondaryLoading}
          onPress={onSecondary}
          style={styles.secondary}
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
  // Collée au CTA (pas de nouvelle respiration) : c'est une alternative à
  // l'action principale, pas un troisième bloc.
  secondary: { marginTop: spacing.xs },
});
