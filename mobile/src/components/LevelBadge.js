// LevelBadge — pill « Niv. 3 · 3 500 XP ». Or réservé (reward), donc utilisé
// avec parcimonie ; variante « soft » pour un rendu discret sur fond clair.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Star } from 'lucide-react-native';
import Icon from './Icon';
import { colors, fonts, fontSizes, radius, spacing } from '../constants/theme';
import { levelForXp, formatNumber } from '../utils/format';

export default function LevelBadge({ level = 1, xp, variant = 'gold', style }) {
  const { t } = useTranslation();
  const gold = variant === 'gold';
  // Niveau dérivé de l'XP (cohérent même si le `level` reçu est périmé / en avance
  // sur total_xp — évite tout affichage incohérent).
  const displayLevel = xp !== undefined ? levelForXp(xp) : level;
  return (
    <View style={[styles.badge, gold ? styles.gold : styles.soft, style]}>
      <Icon icon={Star} size={11} color={colors.green900} strokeWidth={2.5} />
      {/* « Niv. » et le séparateur de milliers étaient écrits en dur : en anglais
          l'accueil affichait « Niv. 5 · 70 290 XP » au milieu d'une interface
          traduite. La clé `common.level` existait déjà (« Niv. » / « Lvl »). */}
      <Text style={[styles.text, gold ? styles.textGold : styles.textSoft]}>
        {t('common.level')} {displayLevel}
        {xp !== undefined
          ? ` · ${formatNumber(xp)} ${t('common.xp')}`
          : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 4,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  gold: { backgroundColor: colors.gold400 },
  soft: { backgroundColor: colors.goldVeil, borderWidth: 1, borderColor: colors.goldVeilBorder },
  text: { fontFamily: fonts.bodyBold, fontSize: fontSizes.xs },
  textGold: { color: colors.green900 },
  textSoft: { color: colors.gold500 },
});
