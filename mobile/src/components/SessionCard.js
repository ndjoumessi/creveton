// SessionCard — carte « partie jouée » enrichie, partagée par l'accueil
// (« Dernières parties ») et l'écran Historique. Thème-aware (useTheme), tokens
// only. Extrait et enrichi de l'ancien `LastGameRow` de HomeScreen.
//
// Enrichissements :
//   · surface neutre + tint très léger (alpha 0.06) + bordure 1px pleine, couleur par
//     taux de réussite (<40 rouge / 40–69 or / ≥70 vert) — texte toujours lisible ;
//   · gros score (32px) coloré par palier (≥500 vert / <500 textDark) ;
//   · ligne détail « ✓ X/N » (+ « · ⚡ +XP » si xp_earned présent) ;
//   · pastille résultat « TOP » (score ≥800) / « BIEN » (≥500) ;
//   · barre de progression 3px pleine largeur en bas, clippée aux coins arrondis,
//     largeur = taux, couleur par taux (≥70 vert / 40–69 or / <40 rouge — remplissage).
//
// PAS de « side-stripe » colorée : la bordure 1px pleine + le tint faible signalent le
// résultat. Le score ≥500 passe en green300 en thème sombre (green500 échoue le 3:1 sur
// la surface de carte sombre tintée).

import React, { useMemo, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useTranslation } from 'react-i18next';
import { fonts, fontSizes, radius, spacing, motion } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { themeEmoji, themeLabel, levelLabel, timeAgo } from '../utils/format';

const fmt = (n) => Number(n || 0).toLocaleString('fr-FR');

// Emoji de repli pour les modes chronométrés (thème null → mix auto).
const MODE_EMOJI = { normal: '⚡', blitz: '⏱', marathon: '🏃' };

// Couleur du gros score par palier. ≥500 vert (green300 en sombre pour tenir le 3:1 sur
// la carte sombre tintée), sinon textDark — le rouge éventuel est déjà porté par la bordure.
function scoreColor(score, colors, isDark) {
  if (score >= 500) return isDark ? colors.green300 : colors.green500;
  return colors.textDark;
}

// Ton de surface (bordure 1px pleine + tint alpha ≤ 0.06) par taux de réussite.
// Aucune « side-stripe » : bordure complète, pas de borderLeft/Right coloré.
function surfaceTone(rate, colors) {
  if (rate === null) return null;
  if (rate < 40) return { borderColor: colors.red400, backgroundColor: 'rgba(231,76,60,0.06)' };
  if (rate < 70) return { borderColor: colors.gold500, backgroundColor: 'rgba(212,160,23,0.06)' };
  return { borderColor: colors.green500, backgroundColor: 'rgba(42,138,79,0.06)' };
}

// Couleur de la barre de progression selon le taux de réussite (remplissage).
function barColor(rate, colors) {
  if (rate >= 70) return colors.green500;
  if (rate >= 40) return colors.gold500;
  return colors.red400;
}

export default function SessionCard({ game, style }) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const reduceMotion = useReduceMotion();

  const total = Number(game.question_count ?? game.total_questions) || 0;
  const correct = Number(game.correct_count) || 0;
  const score = Number(game.score) || 0;
  const rate = total > 0 ? Math.round((correct / total) * 100) : null;

  // Ton de surface : bordure 1px pleine + tint faible, keyé sur le taux de réussite.
  const tone = surfaceTone(rate, colors);

  // Blitz/marathon : thème null → repli sur l'emoji + le nom du mode.
  const emoji = game.theme ? themeEmoji(game.theme) : MODE_EMOJI[game.mode] || '🎯';
  const label = game.theme
    ? themeLabel(game.theme)
    : t(`gameStart.modes.${game.mode}.name`, game.mode || '—');
  const title = game.theme && game.level ? `${label} · ${levelLabel(game.level)}` : label;

  // Pastille résultat : TOP (≥800) / BIEN (≥500) / rien.
  const badge =
    score >= 800
      ? { label: t('home.lastGames.badgeTop', 'TOP'), kind: 'top' }
      : score >= 500
        ? { label: t('home.lastGames.badgeGood', 'BIEN'), kind: 'good' }
        : null;

  // Barre de progression animée (largeur = taux). Honore « réduire les animations ».
  const fill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const to = rate == null ? 0 : rate / 100;
    if (reduceMotion) {
      fill.setValue(to);
      return;
    }
    Animated.timing(fill, {
      toValue: to,
      duration: motion.base,
      useNativeDriver: false,
    }).start();
  }, [fill, rate, reduceMotion]);
  const barWidth = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View
      style={[styles.card, tone, style]}
    >
      <View style={styles.row}>
        <Text style={styles.emoji}>{emoji}</Text>
        <View style={styles.mid}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {timeAgo(game.played_at)}
          </Text>
          {rate !== null ? (
            <Text style={styles.detail} numberOfLines={1}>
              ✓ {correct}/{total}
              {game.xp_earned ? ` · ⚡ +${fmt(game.xp_earned)}` : ''}
            </Text>
          ) : null}
        </View>
        <View style={styles.right}>
          {badge ? (
            <View style={[styles.badge, badge.kind === 'top' ? styles.badgeTop : styles.badgeGood]}>
              <Text
                style={[
                  styles.badgeText,
                  badge.kind === 'top' ? styles.badgeTextTop : styles.badgeTextGood,
                ]}
              >
                {badge.label}
              </Text>
            </View>
          ) : null}
          <Text style={[styles.score, { color: scoreColor(score, colors, isDark) }]}>
            {fmt(score)}
          </Text>
        </View>
      </View>

      {/* Barre de progression pleine largeur, épinglée au bord bas de la carte. */}
      {rate !== null ? (
        <View style={styles.barTrack}>
          <Animated.View
            style={[styles.barFill, { width: barWidth, backgroundColor: barColor(rate, colors) }]}
          />
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surfaceCream,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden', // clippe la barre pleine largeur aux coins arrondis
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.md + 4, // dégage la barre de 3px en bas
    },
    emoji: { fontSize: 24 },
    mid: { flex: 1 },
    title: {
      fontFamily: fonts.bodySemiBold,
      fontSize: fontSizes.md,
      color: colors.textDark,
    },
    sub: {
      fontFamily: fonts.bodyRegular,
      fontSize: fontSizes.xs,
      color: colors.textMuted,
      marginTop: 1,
    },
    detail: {
      fontFamily: fonts.bodyMedium,
      fontSize: fontSizes.xs,
      color: colors.textMuted,
      marginTop: 2,
    },
    right: { alignItems: 'flex-end', gap: spacing.xs },
    score: {
      fontFamily: fonts.bodyBold,
      fontSize: 32,
      lineHeight: 34,
    },
    badge: {
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    badgeTop: { backgroundColor: colors.gold500 }, // remplissage or (récompense) — pas du texte or
    badgeGood: { backgroundColor: colors.successBg },
    badgeText: { fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 0.4 },
    badgeTextTop: { color: colors.green900 }, // vert profond sur or → contraste fort (motif CTA)
    badgeTextGood: { color: colors.successText },
    barTrack: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 3,
      backgroundColor: 'transparent',
    },
    barFill: { height: 3 },
  });
