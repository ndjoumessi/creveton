// État vide générique (listes, écrans sans données).

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Heading, Body } from './Text';
import { colors, fontSizes, spacing } from '../constants/theme';

export default function EmptyState({ emoji = '🦐', title, message, action, dark }) {
  const color = dark ? colors.cream : colors.textDark;
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>{emoji}</Text>
      {title ? <Heading color={color} style={styles.title}>{title}</Heading> : null}
      {message ? (
        <Body
          muted={!dark}
          color={dark ? colors.textOnDarkMuted : undefined}
          style={styles.message}
        >
          {message}
        </Body>
      ) : null}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  emoji: { fontSize: 56, marginBottom: spacing.sm },
  title: { textAlign: 'center' },
  message: { textAlign: 'center', maxWidth: 280, fontSize: fontSizes.sm },
});
