// ResultsScreen — révélation célébrative du score : trophée animé, score en or
// (count-up), stats, récapitulatif des réponses, barre d'XP et palier débloqué.
// Données issues de /sessions/submit (API §6), lues depuis le gameStore.

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, Animated, Easing, StyleSheet, Share } from 'react-native';
import {
  Screen,
  Heading,
  Body,
  Label,
  AppCard,
  AppButton,
  ErrorScreen,
  Skeleton,
  Confetti,
  MiniLineChart,
} from '../components';
import { useGameStore } from '../store/gameStore';
import { useAuthStore } from '../store/authStore';
import { users } from '../services/endpoints';
import { hapticSuccess } from '../utils/haptics';
import { colors, fonts, fontSizes, radius, spacing, motion } from '../constants/theme';

export default function ResultsScreen({ route, navigation }) {
  const { t } = useTranslation();
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
        title={t('results.notify.notSavedTitle')}
        message={error?.message || t('results.notify.notSavedMessage')}
        onRetry={goHome}
        retryLabel={t('results.home')}
      />
    );
  }

  return <ResultsContent result={result} onReplay={replay} onHome={goHome} />;
}

function ResultsContent({ result, onReplay, onHome }) {
  const { t } = useTranslation();
  const total = result.total_questions || 0;
  const correct = result.correct_count || 0;
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const review = Array.isArray(result.review) ? result.review : [];

  const heroEmoji = pct > 70 ? '🏆' : pct >= 50 ? '🥈' : '🎯';
  const celebrate = pct > 70;

  // — Nouveau record : uniquement si l'API expose réellement l'info.
  const isRecord =
    result.is_record === true ||
    (typeof result.best_score === 'number' && (result.score || 0) >= result.best_score);

  // — Progression : 5 derniers scores (ancien → récent) via l'historique.
  const [history, setHistory] = useState(null); // null = chargement

  // — Trophée : scale ressort + légère rotation à l'entrée.
  const heroScale = useRef(new Animated.Value(0)).current;
  const heroRotate = useRef(new Animated.Value(0)).current;

  // — Bannière record : glisse depuis le haut + fondu.
  const recordSlide = useRef(new Animated.Value(0)).current;

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
      duration: 1200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    if (isRecord) {
      hapticSuccess();
      Animated.timing(recordSlide, {
        toValue: 1,
        duration: motion.enter,
        delay: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }

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
  }, [heroScale, heroRotate, scoreAnim, xpFill, levelGlow, recordSlide, isRecord, result]);

  // — Historique récent pour la mini-courbe de progression.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await users.history({ limit: 5 });
        if (alive) setHistory(res?.data || []);
      } catch {
        if (alive) setHistory([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const progressScores = (history || [])
    .slice()
    .reverse()
    .map((h) => Number(h.score) || 0);

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
  const recordTranslateY = recordSlide.interpolate({
    inputRange: [0, 1],
    outputRange: [-40, 0],
  });

  const onShare = () => {
    Share.share({
      message: t('results.shareMessage', { score: result.score || 0 }),
    });
  };

  const avgSeconds =
    typeof result.avg_time_ms === 'number'
      ? `${(result.avg_time_ms / 1000).toFixed(1)} s`
      : '—';

  return (
    <Screen dark scroll contentStyle={styles.content}>
      {celebrate ? (
        <View style={styles.confettiLayer} pointerEvents="none">
          <Confetti count={28} duration={2000} />
        </View>
      ) : null}

      {/* BANNIÈRE NOUVEAU RECORD — uniquement si réel */}
      {isRecord ? (
        <Animated.View
          style={[
            styles.recordBanner,
            { opacity: recordSlide, transform: [{ translateY: recordTranslateY }] },
          ]}
        >
          <Text style={styles.recordText}>{t('results.newRecord')}</Text>
        </Animated.View>
      ) : null}

      {/* HERO — trophée + score en or */}
      <View style={styles.hero}>
        <Animated.Text
          style={[styles.trophy, { transform: [{ scale: heroScale }, { rotate }] }]}
        >
          {heroEmoji}
        </Animated.Text>
        <Label color={colors.textOnDarkMuted} style={styles.scoreLabel}>
          {t('results.finalScore')}
        </Label>
        <Text style={styles.score}>{displayScore}</Text>
        <Label color={colors.textOnDarkMuted}>
          {t('results.misc.heroSubtitle', { correct, total, pct })}
        </Label>
      </View>

      {/* STATS */}
      <View style={styles.statsRow}>
        <Stat value={`${correct}/${total}`} label={t('results.correct')} />
        <Stat value={`+${result.xp_earned ?? 0}`} label={t('results.xpEarned')} />
        <Stat value={avgSeconds} label={t('results.avgTime')} />
      </View>

      {/* RÉCAP */}
      <Heading color={colors.cream} style={styles.sectionTitle}>
        {t('results.recap')}
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
                    {t('results.misc.questionN', { n: i + 1 })}
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
                  {good ? t('results.correct_label') : t('results.wrong_label')}
                </Text>
              </View>
            );
          })
        ) : (
          <Body muted>{t('results.empty.recap')}</Body>
        )}
      </AppCard>

      {/* XP */}
      <View style={styles.xpBlock}>
        <Label color={colors.cream} style={styles.xpLabel}>
          {t('results.xpGained', { xp: result.xp_earned ?? 0 })}
          {result.speed_bonus ? ` (${t('results.speedBonus', { bonus: result.speed_bonus })})` : ''}
        </Label>
        <View style={styles.xpTrack}>
          <Animated.View style={[styles.xpFill, { width: xpWidth }]} />
        </View>
      </View>

      {/* MA PROGRESSION — mini-courbe des derniers scores */}
      {history === null ? (
        <View style={styles.progressBlock}>
          <Heading color={colors.cream} style={styles.sectionTitle}>
            {t('results.misc.progression')}
          </Heading>
          <AppCard tone="light" padding="md" radius={radius.xl}>
            <Skeleton width="100%" height={80} radius={radius.md} />
          </AppCard>
        </View>
      ) : progressScores.length >= 2 ? (
        <View style={styles.progressBlock}>
          <Heading color={colors.cream} style={styles.sectionTitle}>
            {t('results.misc.progression')}
          </Heading>
          <AppCard tone="light" padding="md" radius={radius.xl} style={styles.progressCard}>
            <MiniLineChart data={progressScores} width={300} height={80} color={colors.gold500} />
          </AppCard>
        </View>
      ) : null}

      {/* PALIER DÉBLOQUÉ */}
      {result.level_unlocked ? (
        <Animated.View style={[styles.levelUp, { transform: [{ scale: glowScale }] }]}>
          <Text style={styles.levelUpEmoji}>🎉</Text>
          <Heading color={colors.gold400}>{t('results.misc.levelUpTitle')}</Heading>
          {result.unlocked_difficulty ? (
            <Body color={colors.cream} style={styles.levelUpText}>
              {t('results.misc.difficultyUnlocked', { difficulty: result.unlocked_difficulty })}
            </Body>
          ) : null}
        </Animated.View>
      ) : null}

      {/* ACTIONS */}
      <View style={styles.actions}>
        <AppButton title={t('results.share')} variant="ghost" onPress={onShare} fullWidth />
        <AppButton title={t('results.replay')} variant="secondary" onPress={onReplay} fullWidth />
        <AppButton
          title={t('results.home')}
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

  confettiLayer: { ...StyleSheet.absoluteFillObject, zIndex: 1 },

  recordBanner: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.goldVeil,
    borderWidth: 1,
    borderColor: colors.goldVeilBorder,
  },
  recordText: {
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.md,
    color: colors.gold400,
  },

  progressBlock: { marginTop: spacing.xl, zIndex: 2 },
  progressCard: { alignItems: 'center' },

  hero: { alignItems: 'center', paddingVertical: spacing.lg, zIndex: 2 },
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

  actions: { marginTop: spacing.xxl, gap: spacing.md, zIndex: 2 },
  homeBtn: {},
});
