// Podium — top 3 du classement, ordre visuel 2e (gauche) · 1er (centre) · 3e
// (droite). Partagé Accueil ↔ Stats (onglet Classement) via deux variantes,
// chacune pixel-identical à l'implémentation d'origine :
//  · `compact` (Accueil) : marches nues sur fond crème — 1er surélevé, anneau
//    or autour de son avatar, score vert (green300 sur les côtés en sombre).
//    Prop `loading` → 3 colonnes squelette (état de chargement de l'Accueil).
//  · `card` (Stats) : cartes bordées à la couleur de la médaille (or/argent/
//    bronze), 1er sur voile doré, ville éventuelle, score 1er en or XL,
//    libellé « pts », photo de profil si `avatar_url` est présent.
// Divergences volontaires entre variantes (héritées des deux rendus source) :
// conteneur (space-around vs space-between+gap+marginTop), colonnes (nues vs
// cartes), avatar (52/44 sans uri vs 56/44 avec uri), nom (bodySemiBold
// maxWidth 88 vs titleBold tronqué à 14), score (vert vs textDark/or),
// ville + « pts » (card uniquement), squelette (compact uniquement).
// Aucun des deux rendus source ne met en avant le joueur courant → pas de
// prop `currentUserId`. Rien d'interactif (aucun Pressable dans les sources).

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Body } from './Text';
import Avatar from './Avatar';
import Skeleton from './Skeleton';
import { fonts, fontSizes, radius, spacing } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { medalEmoji, SILVER, BRONZE } from '../utils/rank';

const fmt = (n) => Number(n || 0).toLocaleString('fr-FR');

// Nom tronqué à 14 caractères max (ellipsis) pour les cartes podium (card).
function truncName(name, max = 14) {
  const s = String(name || '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// Ordre visuel des marches : index données 1 (2e) · 0 (1er) · 2 (3e).
const ORDER = [1, 0, 2];

export default function Podium({ players = [], variant = 'compact', loading = false }) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (loading) {
    return (
      <View style={styles.compactPodium}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.compactCol}>
            <Skeleton width={48} height={48} radius={radius.pill} />
            <Skeleton width={56} height={12} style={styles.compactGap} />
            <Skeleton width={32} height={14} style={styles.compactGap} />
          </View>
        ))}
      </View>
    );
  }

  if (variant === 'card') {
    return (
      <View style={styles.cardPodium}>
        {ORDER.map((position) => {
          const p = players[position];
          if (!p) return <View key={position} style={styles.cardCol} />;
          const isFirst = position === 0;
          // Rang réel (les lignes data portent `rank`) → médaille + bordure colorée.
          const rank = p.rank || position + 1;
          const borderColor = rank === 1 ? colors.gold400 : rank === 2 ? SILVER : BRONZE;
          return (
            <View
              key={p.user_id || position}
              style={[
                styles.cardCol,
                isFirst ? styles.cardFirst : styles.cardSide,
                { borderColor },
              ]}
            >
              <Text style={styles.cardMedal}>{medalEmoji(rank) || '🥉'}</Text>
              {/* avatar_url absent de la réponse leaderboard aujourd'hui → repli initiales
                  (Avatar gère uri→initiales). Prêt si le backend ajoute la photo. */}
              <Avatar name={p.name || ''} size={isFirst ? 56 : 44} gold={isFirst} uri={p.avatar_url || null} />
              <Text style={styles.cardName} numberOfLines={1}>
                {truncName(p.name)}
              </Text>
              {p.ville ? (
                <Text style={styles.cardVille} numberOfLines={1}>
                  {p.ville}
                </Text>
              ) : null}
              <Text style={[styles.cardScore, isFirst && styles.cardScoreFirst]}>
                {fmt(p.score)}
              </Text>
              <Text style={styles.cardPts}>{t('stats.leaderboard.pts')}</Text>
            </View>
          );
        })}
      </View>
    );
  }

  // Variante `compact` (Accueil).
  return (
    <View style={styles.compactPodium}>
      {ORDER.map((position) => {
        const row = players[position];
        if (!row) return <View key={position} style={styles.compactCol} />;
        const isFirst = position === 0;
        const rank = row.rank ?? position + 1;
        return (
          <View
            key={row.user_id || position}
            style={[styles.compactCol, isFirst && styles.compactColFirst]}
          >
            <Body style={styles.compactMedal}>{medalEmoji(rank) || '🥉'}</Body>
            <View style={isFirst ? styles.compactFirstRing : null}>
              <Avatar
                name={row.name}
                size={isFirst ? 52 : 44}
                gold={isFirst}
              />
            </View>
            <Body
              color={colors.textDark}
              numberOfLines={1}
              style={styles.compactName}
            >
              {row.name}
            </Body>
            <Body
              style={[
                styles.compactScore,
                isFirst && styles.compactScoreFirst,
                isDark && !isFirst && { color: colors.green300 },
              ]}
            >
              {fmt(row.score)}
            </Body>
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    // — compact (Accueil)
    compactPodium: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-around',
      paddingVertical: spacing.sm,
    },
    compactCol: { flex: 1, alignItems: 'center' },
    compactColFirst: { marginBottom: spacing.sm },
    compactMedal: { fontSize: 22, marginBottom: spacing.xs },
    compactFirstRing: {
      borderRadius: radius.pill,
      borderWidth: 2,
      borderColor: colors.gold500,
      padding: 3,
    },
    compactName: {
      fontFamily: fonts.bodySemiBold,
      fontSize: fontSizes.sm,
      marginTop: spacing.sm,
      maxWidth: 88,
      textAlign: 'center',
    },
    compactScore: {
      fontFamily: fonts.titleBold,
      fontSize: fontSizes.base,
      color: colors.green700,
      marginTop: 2,
    },
    compactScoreFirst: { color: colors.green700, fontSize: fontSizes.lg },
    compactGap: { marginTop: spacing.sm },

    // — card (Stats · onglet Classement)
    cardPodium: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginTop: spacing.lg,
    },
    cardCol: { flex: 1, alignItems: 'center', borderRadius: radius.lg, padding: spacing.md, gap: 2 },
    cardFirst: { backgroundColor: colors.goldVeil, borderWidth: 2, padding: spacing.xl },
    cardSide: { backgroundColor: colors.surface, borderWidth: 1 },
    cardMedal: { fontSize: 22, marginBottom: 2 },
    cardName: {
      fontFamily: fonts.titleBold,
      fontSize: fontSizes.sm,
      color: colors.textDark,
      marginTop: spacing.xs,
      textAlign: 'center',
    },
    cardVille: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.xs, color: colors.textMuted },
    cardScore: {
      fontFamily: fonts.titleBold,
      fontSize: fontSizes.base,
      color: colors.textDark,
      marginTop: 2,
    },
    cardScoreFirst: { fontFamily: fonts.titleExtraBold, fontSize: fontSizes.xl, color: colors.gold500 },
    cardPts: { fontFamily: fonts.bodyMedium, fontSize: 10, color: colors.textMuted, marginTop: -2 },
  });
