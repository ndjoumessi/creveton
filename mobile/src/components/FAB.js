// FAB — bouton d'action flottant (or rare, CTA principal d'un écran de liste).
// Ancré bas/droite (24), 56×56 (≥ MIN_TOUCH 44/48), ombre or. `icon` accepte un
// caractère (défaut « + ») ou un composant Lucide. Désactivé → opacité réduite
// + état d'accessibilité (pattern « hors ligne » du hub Défis).

import React, { useMemo } from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import Icon from './Icon';
import { fonts, radius, shadow, zIndex } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

const FAB_SIZE = 56; // ≥ MIN_TOUCH (44 iOS / 48 Android)

export default function FAB({
  onPress,
  icon = '+',
  accessibilityLabel,
  disabled = false,
  style,
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      style={[styles.fab, disabled && styles.disabled, style]}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={accessibilityLabel}
    >
      {typeof icon === 'string' ? (
        <Text style={styles.icon}>{icon}</Text>
      ) : (
        <Icon icon={icon} size={26} color={colors.textOnDark} />
      )}
    </Pressable>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: radius.pill,
    backgroundColor: colors.gold500,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: zIndex.header,
    ...shadow.gold,
  },
  disabled: { opacity: 0.45 },
  icon: { fontFamily: fonts.titleBold, fontSize: 30, color: colors.textOnDark, marginTop: -2 },
});
