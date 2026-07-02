// SegmentedTabs — barre d'onglets partagée (Tournois / Défis / Stats).
// Deux variantes visuelles préservées à l'identique :
//   - 'underline' (défaut) : libellé sur en-tête sombre, actif = or + soulignement
//     or 3px (motif Tournois / Défis).
//   - 'pills' : pilules pleine largeur sur bandeau vert profond, actif = pilule or /
//     texte vert, icône optionnelle (motif Stats).
// Chaque onglet : cible tactile ≥ MIN_TOUCH, accessibilityRole="tab" +
// accessibilityState.selected. `count` > 0 ajoute un suffixe « •N » au libellé
// (pastille compteur des défis reçus).
//
// Tokens uniquement — les rgba en dur de l'ancien StatsScreen
// ('rgba(255,255,255,0.14)' / 'rgba(255,255,255,0.88)') sont remplacés par
// colors.whiteVeil (voile clair des bandeaux sombres) et colors.textOnDark.
//
// Props :
//   tabs      : [{ key, label, icon?, count? }] (label déjà localisé par l'appelant)
//   activeKey : clé de l'onglet actif
//   onChange  : (key) => void
//   variant   : 'underline' | 'pills'
//   style     : style additionnel du conteneur (ex. fond/padding du bandeau Stats)

import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Icon from './Icon';
import { fonts, fontSizes, radius, spacing, MIN_TOUCH } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

export default function SegmentedTabs({ tabs, activeKey, onChange, variant = 'underline', style }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const pills = variant === 'pills';

  return (
    <View style={[pills ? styles.pillsRow : styles.underlineRow, style]}>
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        const label = tab.count > 0 ? `${tab.label} •${tab.count}` : tab.label;

        if (pills) {
          return (
            <Pressable
              key={tab.key}
              onPress={() => onChange(tab.key)}
              style={[styles.pill, active && styles.pillActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              {tab.icon ? (
                <Icon
                  icon={tab.icon}
                  size={16}
                  color={active ? colors.green900 : colors.textOnDark}
                />
              ) : null}
              <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
            </Pressable>
          );
        }

        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={styles.underlineTab}
            hitSlop={6}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.underlineLabel, active && styles.underlineLabelActive]}>
              {label}
            </Text>
            <View style={[styles.underline, active && styles.underlineActive]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  // — Variante 'underline' (en-têtes sombres Tournois / Défis)
  underlineRow: { flexDirection: 'row', gap: spacing.xl },
  underlineTab: {
    minHeight: MIN_TOUCH, // cible tactile ≥ 44/48
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: spacing.xs,
  },
  underlineLabel: {
    fontFamily: fonts.titleSemiBold,
    fontSize: fontSizes.base,
    color: colors.textOnDarkMuted,
  },
  underlineLabelActive: { color: colors.gold400 },
  underline: {
    height: 3,
    width: '100%',
    marginTop: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: 'transparent',
  },
  underlineActive: { backgroundColor: colors.gold500 },

  // — Variante 'pills' (bandeau vert profond Stats)
  pillsRow: { flexDirection: 'row', gap: spacing.sm },
  pill: {
    flex: 1,
    minHeight: MIN_TOUCH, // cible tactile ≥ 44/48
    paddingVertical: spacing.xs,
    flexDirection: 'row',
    gap: 6,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.whiteVeil,
  },
  pillActive: { backgroundColor: colors.gold500 },
  pillText: {
    fontFamily: fonts.titleSemiBold,
    fontSize: fontSizes.md,
    // Inactif sur bandeau vert profond : voile clair bien lisible. Actif = vert
    // sur or (contraste fort).
    color: colors.textOnDark,
  },
  pillTextActive: { fontFamily: fonts.titleBold, color: colors.green900 },
});
