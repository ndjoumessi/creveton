// SessionCard — carte « partie jouée » enrichie, partagée par l'accueil
// (« Dernières parties »), l'écran Historique et l'onglet Stats. Thème-aware
// (useTheme), tokens only. Extrait et enrichi de l'ancien `LastGameRow` de
// HomeScreen. Prop opt-in `showIncomplete` (Accueil, Stats, Historique) : partie
// avortée (0 pt, 0 bonne réponse) → carte grisée neutre + pastille « Incomplet ».
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
import { View, Text, StyleSheet, Animated, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Check, Zap } from 'lucide-react-native';
import Icon from './Icon';
import { fonts, fontSizes, radius, spacing, motion } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { hapticLight } from '../utils/haptics';
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
  if (rate < 40) return { borderColor: colors.red400, backgroundColor: colors.tintError };
  if (rate < 70) return { borderColor: colors.gold500, backgroundColor: colors.tintGold };
  return { borderColor: colors.green500, backgroundColor: colors.tintSuccess };
}

// Couleur de la barre de progression selon le taux de réussite (remplissage).
function barColor(rate, colors) {
  if (rate >= 70) return colors.green500;
  if (rate >= 40) return colors.gold500;
  return colors.red400;
}

// `onPress` OPTIONNELLE (rétro-compat stricte : sans elle, rendu et arbre de vues
// inchangés — simple View). Fournie → la carte devient Pressable (navigation vers
// le détail de la partie) : chevron discret (textFaint), rôle bouton + libellé
// a11y récapitulatif, haptique légère. Cible tactile ≥ 44pt déjà couverte par la
// hauteur de carte (~92px).
export default function SessionCard({ game, style, showIncomplete = false, onPress }) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const reduceMotion = useReduceMotion();

  const total = Number(game.question_count ?? game.total_questions) || 0;
  const correct = Number(game.correct_count) || 0;
  const score = Number(game.score) || 0;
  const rate = total > 0 ? Math.round((correct / total) * 100) : null;

  // Partie ABANDONNÉE (aucune réponse donnée) → carte grisée neutre + pastille
  // « Incomplet ». On se base sur l'ENGAGEMENT (answered_count : réponses réelles,
  // non skip/timeout) et NON sur le succès : une partie jouée en entier mais
  // entièrement ratée (answered_count > 0, 0 bonne réponse) n'est PAS incomplète,
  // c'est un vrai 0 %. Repli legacy (score/correct) si answered_count absent
  // (ancienne réponse serveur / cache) pour ne pas régresser. Opt-in
  // (`showIncomplete`, activé sur Accueil / Stats / Historique) — défaut false.
  const answered = game.answered_count;
  const incomplete = showIncomplete && (answered != null
    ? Number(answered) === 0
    : score === 0 && correct === 0);

  // Ton de surface : bordure 1px pleine + tint faible, keyé sur le taux de réussite.
  const tone = incomplete ? null : surfaceTone(rate, colors);

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

  const pressable = typeof onPress === 'function';

  // Contenu de carte commun aux deux rendus (View inerte / Pressable).
  const content = (
    <>
      <View style={styles.row}>
        <Text style={styles.emoji}>{emoji}</Text>
        <View style={styles.mid}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {timeAgo(game.played_at)}
          </Text>
          {rate !== null && !incomplete ? (
            <View style={styles.detailRow}>
              <Icon icon={Check} size={12} color={colors.textMuted} strokeWidth={2.5} />
              <Text style={styles.detail} numberOfLines={1}>{correct}/{total}</Text>
              {game.xp_earned ? (
                <>
                  <Text style={styles.detail}>·</Text>
                  <Icon icon={Zap} size={12} color={colors.textMuted} strokeWidth={2.5} />
                  <Text style={styles.detail} numberOfLines={1}>+{fmt(game.xp_earned)}</Text>
                </>
              ) : null}
            </View>
          ) : null}
        </View>
        <View style={styles.right}>
          {incomplete ? (
            <View style={styles.incompleteBadge}>
              <Text style={styles.incompleteText}>{t('stats.misc.incomplete')}</Text>
            </View>
          ) : badge ? (
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
        {/* Chevron discret : uniquement quand la carte est tapable (détail). */}
        {pressable ? (
          <Icon icon={ChevronRight} size={18} color={colors.textFaint} />
        ) : null}
      </View>

      {/* Barre de progression pleine largeur, épinglée au bord bas de la carte. */}
      {rate !== null && !incomplete ? (
        <View style={styles.barTrack}>
          <Animated.View
            style={[styles.barFill, { width: barWidth, backgroundColor: barColor(rate, colors) }]}
          />
        </View>
      ) : null}
    </>
  );

  const cardStyle = [styles.card, tone, incomplete && styles.cardIncomplete, style];

  if (!pressable) {
    return <View style={cardStyle}>{content}</View>;
  }

  return (
    <Pressable
      onPress={() => {
        hapticLight();
        onPress();
      }}
      style={({ pressed }) => [...cardStyle, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={t('sessionDetail.cardA11y', {
        title,
        score: fmt(score),
        defaultValue: '{{title}}, {{score}} points — voir le détail',
      })}
    >
      {content}
    </Pressable>
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
    detailRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
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
    // Retour visuel du tap (carte tapable uniquement).
    cardPressed: { opacity: 0.75 },
    // Partie avortée (opt-in `showIncomplete`) : carte grisée + pastille neutre.
    cardIncomplete: { opacity: 0.85 },
    incompleteBadge: {
      backgroundColor: colors.border,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    incompleteText: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textMuted },
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
