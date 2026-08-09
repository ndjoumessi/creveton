// Checkbox — case à cocher avec libellé, cible tactile pleine largeur.
//
// La case seule fait 22 px, très en dessous du minimum tactile : c'est le
// Pressable ENTIER (case + libellé) qui est la cible, hauteur `MIN_TOUCH`.
// Viser un carré de 22 px est le défaut classique des cases à cocher mobiles.

import React, { useMemo } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { Check } from 'lucide-react-native';
import Icon from './Icon';
import { Body } from './Text';
import { radius, spacing, MIN_TOUCH } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

const BOX = 22;

export default function Checkbox({ checked, onChange, label, hint, disabled, style }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Pressable
      onPress={() => !disabled && onChange?.(!checked)}
      disabled={disabled}
      style={[styles.row, disabled && styles.disabled, style]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      accessibilityLabel={label}
      accessibilityHint={hint}
    >
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked ? <Icon icon={Check} size={15} color={colors.white} strokeWidth={3} /> : null}
      </View>
      {label ? (
        <Body size="md" color={colors.textBody} style={styles.label}>
          {label}
        </Body>
      ) : null}
    </Pressable>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: MIN_TOUCH,
      gap: spacing.sm,
    },
    disabled: { opacity: 0.5 },
    box: {
      width: BOX,
      height: BOX,
      borderRadius: radius.sm,
      borderWidth: 1.5,
      borderColor: colors.borderInput,
      backgroundColor: colors.white,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Vert et non or : la case n'est pas une action primaire, et l'or est
    // rationné (≤ 10 % de l'écran, déjà pris ici par le CTA « Se connecter »).
    boxChecked: {
      backgroundColor: colors.green500,
      borderColor: colors.green500,
    },
    label: { flexShrink: 1 },
  });
