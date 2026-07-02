// ChoiceChips — groupe de puces de sélection partagé (niveaux GameStart,
// sexe/langue Register, thème + difficulté du sheet Challenges).
// Motif visuel unifié (issu du diagnostic des 3 écrans, pattern Challenges) :
//   - inactif : surfaceElevated, bordure 1.5 `border`, texte textDark ;
//   - actif   : fond green900, bordure or (gold400, 2px), texte textOnDark.
// (L'aplat or gold500/texte green900 reste réservé aux pilules d'onglets —
// voir SegmentedTabs — pour respecter le budget « or ≤ 10 % » de la charte.)
//
// Chaque puce : cible tactile ≥ MIN_TOUCH, accessibilityRole="button" +
// accessibilityState.selected. Tokens uniquement.
//
// Props :
//   options  : [{ key, label, emoji? }] (label déjà localisé par l'appelant ;
//              emoji optionnel, empilé au-dessus du libellé)
//   value    : clé sélectionnée (string) — ou tableau de clés si `multiple`
//   onChange : (key) => void — ou (keys[]) => void si `multiple`
//   multiple : sélection multiple (toggle) — défaut false
//   layout   : 'row' (pilules égales sur une ligne, défaut)
//            | 'grid' (tuiles en grille ~3 colonnes, motif sheet Challenges)
//   haptic   : hapticLight au tap (défaut false — activé sur Challenges,
//              comportement d'origine préservé écran par écran)
//   style    : style additionnel du conteneur

import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { fonts, fontSizes, radius, spacing, MIN_TOUCH } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { hapticLight } from '../utils/haptics';

export default function ChoiceChips({
  options,
  value,
  onChange,
  multiple = false,
  layout = 'row',
  haptic = false,
  style,
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const grid = layout === 'grid';

  const isSelected = (key) =>
    multiple ? Array.isArray(value) && value.includes(key) : key === value;

  const select = (key) => {
    if (haptic) hapticLight();
    if (!multiple) {
      onChange(key);
      return;
    }
    const current = Array.isArray(value) ? value : [];
    onChange(
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
    );
  };

  return (
    <View style={[grid ? styles.grid : styles.row, style]}>
      {options.map((o) => {
        const active = isSelected(o.key);
        return (
          <Pressable
            key={o.key}
            onPress={() => select(o.key)}
            style={[
              styles.chip,
              grid ? styles.chipGrid : styles.chipRow,
              active && styles.chipActive,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            {o.emoji ? <Text style={styles.emoji}>{o.emoji}</Text> : null}
            <Text
              style={[styles.label, active && styles.labelActive]}
              // En grille (tuiles étroites), le libellé reste sur une ligne
              // (motif d'origine du sheet Challenges).
              numberOfLines={grid ? 1 : undefined}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: MIN_TOUCH, // cible tactile ≥ 44/48
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  chipRow: { flex: 1 },
  chipGrid: {
    flexBasis: '30%',
    flexGrow: 1,
    minWidth: 96,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  chipActive: { backgroundColor: colors.green900, borderColor: colors.gold400, borderWidth: 2 },
  emoji: { fontSize: 20 },
  label: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, color: colors.textDark },
  labelActive: { color: colors.textOnDark },
});
