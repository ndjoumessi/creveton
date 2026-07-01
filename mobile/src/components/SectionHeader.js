// En-tête de section réutilisable : un titre (Heading) et, optionnellement, un
// lien « voir tout » aligné à droite (or, cible tactile ≥ MIN_TOUCH).
// Extrait de HomeScreen (motif répété ~5×). Thème-aware via useTheme, tokens only.

import React, { useMemo } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Heading, Body } from './Text';
import { fonts, spacing } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

export default function SectionHeader({ title, actionLabel, onAction, color }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const hasAction = !!actionLabel && !!onAction;
  return (
    <View style={styles.row}>
      <Heading color={color ?? colors.textDark}>{title}</Heading>
      {hasAction ? (
        <Pressable
          onPress={onAction}
          hitSlop={{ top: 15, bottom: 15, left: 12, right: 12 }} // cible tactile ≥MIN_TOUCH (lien texte inline)
          accessibilityRole="button"
        >
          <Body style={styles.seeAll}>{actionLabel}</Body>
        </Pressable>
      ) : null}
    </View>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.xl,
      marginBottom: spacing.md,
    },
    seeAll: { fontFamily: fonts.bodySemiBold, color: colors.gold500 },
  });
