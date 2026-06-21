// ResultsScreen — révélation célébrative du score : trophée animé, score en or
// (count-up), stats, récapitulatif des réponses, barre d'XP et palier débloqué.
// Données issues de /sessions/submit (API §6), lues depuis le gameStore.

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';
import {
  Screen,
  Heading,
  Body,
  Label,
  AppCard,
  AppButton,
  ErrorScreen,
} from '../components';
import { useGameStore } from '../store/gameStore';
import { useAuthStore } from '../store/authStore';
import { colors, fonts, fontSizes, radius, spacing, motion } from '../constants/theme';

export default function ResultsScreen({ route, navigation }) {
  const { ok, error } = route.params || {};
  const result = useGameStore((s) => s.result);
  const reset = useGameStore((s) => s.reset);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  const goHome = () => {
    reset();
    navigation.navigate('Tabs', { screen: 'Home' });
  };
  const replay = () => {
    reset();
    navigation.navigate('Tabs', { screen: 'Play' });
  };

  const valid = ok !== false && !!result;

  // Rafraîchit le profil (XP / niveau) une seule fois après une partie réussie.
  useEffect(() => {
    if (valid) refreshProfile();
  }, [valid, refreshProfile]);

  if (!valid) {
    return (
      <ErrorScreen
        dark
        emoji="😕"
        title="Score non enregistré"
        message={error?.message || "La partie n'a pas pu être soumise. Réessaie."}
        onRetry={goHome}
        retryLabel="Retour à l'accueil"
      />
    );
  }

  return <ResultsContent result={result} onReplay={replay} onHome={goHome} />;
}

function ResultsContent({ result, onReplay, onHome }) {
  const total = result.total_questions || 0;
  const correct = result.correct_count || 0;
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const review = Array.isArray(result.review) ? result.review : [];

  const heroEmoji = pct > 70 ? '🏆' : pct >= 50 ? '🥈' : '🎯';

  // — Trophée : scale ressort + légère rotation à l'entrée.
  const heroScale = useRef(new Animated.Value(0)).current;
  const heroRotate = useRef(new Animated.Value(0)).current;

  // — Score : count-up de 0 → score (~900ms, value tween acceptable).
  const scoreAnim = useRef(new Animated.Value(0)).current;
  const [displayScore, setDisplayScore] = useState(0);

  // — Barre d'XP : remplissage gauche → droite.
  const xpFill = useRef(new Animated.Value(0)).current;

  // — Bloc palier débloqué : léger « pop » + lueur.
  const levelGlow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(heroScale, {
      toValue: 1,
      friction: 5,
      tension: 80,
      useNativeDriver: true,
    }).start();
    Animated.timing(heroRotate, {
      toValue: 1,
      duration: motion.enter,
      easing: Easing.out(Easing.back(2)),
      useNativeDriver: true,
    }).start();

    scoreAnim.addListener(({ value }) => {
      setDisplayScore(Math.round(value));
    });
    Animated.timing(scoreAnim, {
      toValue: result.score || 0,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    Animated.timing(xpFill, {
      toValue: 1,
      duration: motion.max,
      delay: 250,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    if (result.level_unlocked) {
      Animated.spring(levelGlow, {
        toValue: 1,
        friction: 4,
        tension: 70,
        delay: 400,
        useNativeDriver: true,
      }).start();
    }

    return () => scoreAnim.removeAllListeners();
  }, [heroScale, heroRotate, scoreAnim, xpFill, levelGlow, result]);

  const rotate = heroRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['-12deg', '0deg'],
  });
  const xpWidth = xpFill.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });
  const glowScale = levelGlow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1],
  });

  const avgSeconds =
    typeof result.avg_time_ms === 'number'
      ? `${(result.avg_time_ms / 1000).toFixed(1)} s`
      : '—';

  return (
    <Screen dark scroll contentStyle={styles.content}>
      {/* HERO — trophée + score en or */}
      <View style={styles.hero}>
        <Animated.Text
          style={[styles.trophy, { transform: [{ scale: heroScale }, { rotate }] }]}
        >
          {heroEmoji}
        </Animated.Text>
        <Label color={colors.textOnDarkMuted} style={styles.scoreLabel}>
          Score final
        </Label>
        <Text style={styles.score}>{displayScore}</Text>
        <Label color={colors.textOnDarkMuted}>
          {correct}/{total} bonnes réponses · {pct}%
        </Label>
      </View>

      {/* STATS */}
      <View style={styles.statsRow}>
        <Stat value={`${correct}/${total}`} label="Bonnes ✓" />
        <Stat value={`+${result.xp_earned ?? 0}`} label="XP gagnés ⚡" />
        <Stat value={avgSeconds} label="Temps moyen ⏱" />
      </View>

      {/* RÉCAP */}
      <Heading color={colors.cream} style={styles.sectionTitle}>
        Récapitulatif
      </Heading>
      <AppCard tone="light" padding="md" radius={radius.xl} style={styles.recapCard}>
        {review.length ? (
          review.map((item, i) => {
            const good = item.is_correct;
            return (
              <View
                key={item.question_id || i}
                style={[
                  styles.recapRow,
                  i < review.length - 1 && styles.recapRowDivider,
                  good ? styles.rowGood : styles.rowBad,
                ]}
              >
                <View style={[styles.pastille, good ? styles.pastilleGood : styles.pastilleBad]}>
                  <Text style={styles.pastilleText}>{good ? '✓' : '✗'}</Text>
                </View>
                <View style={styles.recapBody}>
                  <Body style={styles.recapTitle} numberOfLines={2}>
                    Question {i + 1}
                  </Body>
                  {item.explanation ? (
                    <Body muted style={styles.recapExpl} numberOfLines={2}>
                      {item.explanation}
                    </Body>
                  ) : null}
                </View>
                <Text
                  style={[styles.recapTag, good ? styles.tagGood : styles.tagBad]}
                >
                  {good ? 'Correct' : 'Faux'}
                </Text>
              </View>
            );
          })
        ) : (
          <Body muted>Récapitulatif indisponible.</Body>
        )}
      </AppCard>

      {/* XP */}
      <View style={styles.xpBlock}>
        <Label color={colors.cream} style={styles.xpLabel}>
          XP gagné : +{result.xp_earned ?? 0} XP
          {result.speed_bonus ? ` (dont +${result.speed_bonus} vitesse)` : ''}
        </Label>
        <View style={styles.xpTrack}>
          <Animated.View style={[styles.xpFill, { width: xpWidth }]} />
        </View>
      </View>

      {/* PALIER DÉBLOQUÉ */}
      {result.level_unlocked ? (
        <Animated.View style={[styles.levelUp, { transform: [{ scale: glowScale }] }]}>
          <Text style={styles.levelUpEmoji}>🎉</Text>
          <Heading color={colors.gold400}>Niveau supérieur !</Heading>
          {result.unlocked_difficulty ? (
            <Body color={colors.cream} style={styles.levelUpText}>
              Difficulté « {result.unlocked_difficulty} » débloquée
            </Body>
          ) : null}
        </Animated.View>
      ) : null}

      {/* ACTIONS */}
      <View style={styles.actions}>
        <AppButton title="Rejouer" variant="secondary" onPress={onReplay} fullWidth />
        <AppButton
          title="Retour à l'accueil"
          variant="primary"
          onPress={onHome}
          fullWidth
          style={styles.homeBtn}
        />
      </View>
    </Screen>
  );
}

function Stat({ value, label }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl },

  hero: { alignItems: 'center', paddingVertical: spacing.lg },
  trophy: { fontSize: 72, marginBottom: spacing.sm },
  scoreLabel: { marginBottom: spacing.xs },
  score: {
    fontFamily: fonts.titleBlack,
    fontSize: fontSizes.hero, // 64
    lineHeight: 72,
    color: colors.gold500,
    marginBottom: spacing.xs,
  },

  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  stat: { flex: 1, alignItems: 'center', gap: spacing.xxs },
  statValue: {
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.xl, // 24-ish → 22
    color: colors.white,
  },
  statLabel: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textOnDarkMuted,
    textAlign: 'center',
  },

  sectionTitle: { marginBottom: spacing.sm },
  recapCard: { gap: 0 },
  recapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
  },
  recapRowDivider: {},
  rowGood: { backgroundColor: colors.successBgSoft },
  rowBad: { backgroundColor: colors.errorBg },
  pastille: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pastilleGood: { backgroundColor: colors.green500 },
  pastilleBad: { backgroundColor: colors.red400 },
  pastilleText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.md,
    color: colors.white,
  },
  recapBody: { flex: 1, gap: spacing.xxs },
  recapTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.textDark,
  },
  recapExpl: { fontSize: fontSizes.xs },
  recapTag: { fontFamily: fonts.bodyBold, fontSize: fontSizes.xs },
  tagGood: { color: colors.successText },
  tagBad: { color: colors.errorText },

  xpBlock: { marginTop: spacing.xl },
  xpLabel: { fontFamily: fonts.bodySemiBold, marginBottom: spacing.sm },
  xpTrack: {
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.cardOnDark,
    borderWidth: 1,
    borderColor: colors.borderOnDark,
    overflow: 'hidden',
  },
  xpFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.gold500,
  },

  levelUp: {
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.goldVeil,
    borderWidth: 1,
    borderColor: colors.goldVeilBorder,
  },
  levelUpEmoji: { fontSize: 36 },
  levelUpText: { textAlign: 'center' },

  actions: { marginTop: spacing.xxl, gap: spacing.md },
  homeBtn: {},
});
