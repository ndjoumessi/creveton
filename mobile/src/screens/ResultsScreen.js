// ResultsScreen — révélation célébrative du score : trophée animé, score en or
// (count-up), stats, récapitulatif des réponses, barre d'XP et palier débloqué.
// Données issues de /sessions/submit (API §6), lues depuis le gameStore.

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  Pressable,
  Animated,
  Easing,
  StyleSheet,
  Share,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
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
  useToast,
} from '../components';
import { Lightbulb, WifiOff } from 'lucide-react-native';
import Icon from '../components/Icon';
import { useGameStore } from '../store/gameStore';
import { useQuestionsStore } from '../store/questionsStore';
import { useAuthStore } from '../store/authStore';
import { users } from '../services/endpoints';
import { TIMED_MODES } from '../constants/config';
import { hapticSuccess } from '../utils/haptics';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { getOptionText, normalizeLang } from '../utils/i18n';
import { colors, fonts, fontSizes, radius, spacing, motion } from '../constants/theme';

// Android : LayoutAnimation nécessite ce flag (no-op sous Fabric / iOS).
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Expand/collapse des cartes du récap — easeInEaseOut 150 ms.
const EXPAND_ANIM = {
  duration: 150,
  create: { type: 'easeInEaseOut', property: 'opacity' },
  update: { type: 'easeInEaseOut' },
  delete: { type: 'easeInEaseOut', property: 'opacity' },
};

// Texte localisé d'une option par son index (review[] enrichi côté store : les
// options portent `text` (FR) + `text_en`). null si absent.
function optionText(options, idx, lang) {
  if (!Array.isArray(options) || idx == null) return null;
  const byIndex = options.find((o) => o && o.index === idx);
  const opt = byIndex || options[idx];
  if (!opt) return null;
  return getOptionText(opt, lang) || null;
}

export default function ResultsScreen({ route, navigation }) {
  const { t } = useTranslation();
  const { ok, error, queued } = route.params || {};
  const [replaying, setReplaying] = useState(false);
  // On fige le résultat affiché : « Rejouer » réinitialise le store (startGame)
  // avant de naviguer ; sans ça, l'écran clignoterait en erreur le temps du replace.
  const storeResult = useGameStore((s) => s.result);
  const resultRef = useRef(storeResult);
  if (storeResult && !replaying) resultRef.current = storeResult;
  const result = resultRef.current;
  // Mode figé de la même façon (replay/startGame le réinitialise).
  const storeMode = useGameStore((s) => s.mode);
  const modeRef = useRef(storeMode);
  if (!replaying) modeRef.current = storeMode;
  const isMixed = TIMED_MODES.includes(modeRef.current);
  const reset = useGameStore((s) => s.reset);
  const startGame = useGameStore((s) => s.startGame);
  const drawForMode = useQuestionsStore((s) => s.drawForMode);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const toast = useToast();

  const goHome = () => {
    reset();
    navigation.navigate('Tabs', { screen: 'Home' });
  };

  // « Rejouer » = relancer immédiatement une partie avec les MÊMES réglages
  // (mode/theme/level de la partie précédente), en tirant de NOUVELLES questions
  // — même flux que l'écran « Jouer ». Repli sur l'écran de sélection si le
  // tirage échoue. On lit les réglages AVANT que startGame ne réinitialise le store.
  const replay = async () => {
    const { mode, theme, level } = useGameStore.getState();
    setReplaying(true);
    try {
      const { questions, error: drawError, warning } = await drawForMode({ mode, theme, level });
      if (drawError || !questions) {
        setReplaying(false);
        reset();
        navigation.navigate('Tabs', { screen: 'Play' });
        return;
      }
      // Top-up API impossible (hors-ligne) : on rejoue avec le cache, mais on prévient.
      if (warning === 'offline') {
        toast.show({ type: 'info', message: t('gameStart.notify.offline') });
      }
      const isMixed = TIMED_MODES.includes(mode);
      startGame({
        mode,
        theme: isMixed ? null : theme,
        level: isMixed ? null : level,
        questions,
      });
      navigation.replace('Quiz');
    } catch {
      setReplaying(false);
      reset();
      navigation.navigate('Tabs', { screen: 'Play' });
    }
  };

  const valid = ok !== false && !!result;

  // Suspense « Calcul en cours… » (blitz/marathon) : 800 ms avant la révélation
  // séquentielle. Le submit est déjà résolu — c'est un temps de mise en scène.
  const [intro, setIntro] = useState(valid && isMixed);
  useEffect(() => {
    if (!intro) return undefined;
    const id = setTimeout(() => setIntro(false), 800);
    return () => clearTimeout(id);
  }, [intro]);

  // Rafraîchit le profil (XP / niveau) une seule fois après une partie réussie.
  useEffect(() => {
    if (valid) refreshProfile();
  }, [valid, refreshProfile]);

  // Partie jouée hors ligne : pas de score serveur. On confirme la sauvegarde
  // locale (rejouée automatiquement au retour de la connexion).
  if (queued) {
    return (
      <ErrorScreen
        dark
        icon={WifiOff}
        title={t('offline.savedOffline')}
        message={t('offline.savedOfflineMessage')}
        onRetry={goHome}
        retryLabel={t('results.home')}
      />
    );
  }

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

  if (intro) {
    return (
      <Screen dark>
        <View style={styles.calcWrap}>
          <ActivityIndicator size="large" color={colors.gold500} />
          <Text style={styles.calcText}>{t('quiz.misc.submitting')}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <ResultsContent
      result={result}
      isMixed={isMixed}
      mode={modeRef.current}
      onReplay={replay}
      onHome={goHome}
      replaying={replaying}
    />
  );
}

function ResultsContent({ result, isMixed, mode, onReplay, onHome, replaying }) {
  const { t, i18n } = useTranslation();
  const lang = normalizeLang(i18n.language);
  const total = result.total_questions || 0;
  const correct = result.correct_count || 0;
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const review = Array.isArray(result.review) ? result.review : [];
  const modeBadge = mode === 'blitz' ? `⚡ ${t('gameStart.modes.blitz.name')}`
    : mode === 'marathon' ? `🏃 ${t('gameStart.modes.marathon.name')}`
      : null;

  // Cartes du récap expandables au tap (une carte = une question).
  const [openRows, setOpenRows] = useState({});
  const toggleRow = (i) => {
    LayoutAnimation.configureNext(EXPAND_ANIM);
    setOpenRows((m) => ({ ...m, [i]: !m[i] }));
  };

  // Reveal séquentiel des cartes du récap (stagger 80 ms) : slide-up + fondu.
  const rowAnims = useRef(review.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    Animated.stagger(
      80,
      rowAnims.map((a) =>
        Animated.timing(a, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        })
      )
    ).start();
  }, [rowAnims]);

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

  const reduceMotion = useReduceMotion();

  useEffect(() => {
    // a11y : « réduire les animations » → état final direct (pas d'entrée animée,
    // pas de count-up). Le confetti se neutralise lui-même (composant Confetti).
    if (reduceMotion) {
      heroScale.setValue(1);
      heroRotate.setValue(1);
      recordSlide.setValue(isRecord ? 1 : 0);
      xpFill.setValue(1);
      levelGlow.setValue(result.level_unlocked ? 1 : 0);
      scoreAnim.setValue(result.score || 0);
      setDisplayScore(result.score || 0);
      if (isRecord) hapticSuccess();
      return undefined;
    }

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
  }, [heroScale, heroRotate, scoreAnim, xpFill, levelGlow, recordSlide, isRecord, result, reduceMotion]);

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
        {modeBadge ? (
          <View style={styles.modeBadge}>
            <Text style={styles.modeBadgeText}>{modeBadge}</Text>
          </View>
        ) : null}
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
            const anim = rowAnims[i] || new Animated.Value(1);
            const open = !!openRows[i];
            const localizedTitle = lang === 'en'
              ? (item.question_text_en || item.question_text)
              : item.question_text;
            const title = localizedTitle || t('results.misc.questionN', { n: i + 1 });
            const correctText = optionText(item.options, item.correct_index, lang);
            const yourText = optionText(item.options, item.your_index, lang);
            return (
              <Animated.View
                key={item.question_id || i}
                style={[
                  styles.recapCardRow,
                  good ? styles.rowGood : styles.rowBad,
                  {
                    opacity: anim,
                    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
                  },
                ]}
              >
                {/* En-tête tappable */}
                <Pressable style={styles.recapRow} onPress={() => toggleRow(i)}>
                  <View style={[styles.pastille, good ? styles.pastilleGood : styles.pastilleBad]}>
                    <Text style={styles.pastilleText}>{good ? '✓' : '✗'}</Text>
                  </View>
                  <View style={styles.recapBody}>
                    <Body style={styles.recapTitle} numberOfLines={open ? undefined : 1}>
                      {title}
                    </Body>
                  </View>
                  <Text style={[styles.recapTag, good ? styles.tagGood : styles.tagBad]}>
                    {good ? t('results.correct_label') : t('results.wrong_label')}
                  </Text>
                  <Text style={styles.chevron}>{open ? '⌄' : '›'}</Text>
                </Pressable>

                {/* Détail déplié */}
                {open ? (
                  <View style={styles.detail}>
                    {correctText ? (
                      <View style={styles.ansGood}>
                        <Text style={styles.ansGoodText}>
                          ✓ {t('results.misc.correctAnswer')} : {correctText}
                        </Text>
                      </View>
                    ) : null}
                    {!good && yourText ? (
                      <View style={styles.ansBad}>
                        <Text style={styles.ansBadText}>
                          ✗ {t('results.misc.yourAnswer')} : {yourText}
                        </Text>
                      </View>
                    ) : null}
                    {(item.explanation || item.explanation_en) ? (
                      <View style={styles.detailExplRow}>
                        <Icon icon={Lightbulb} size={14} color={colors.textMuted} />
                        <Text style={[styles.detailExpl, styles.detailExplFlex]}>
                          {lang === 'en' && item.explanation_en ? item.explanation_en : item.explanation}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </Animated.View>
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

      {/* BONUS THÈME (marathon) — points gagnés par séries thématiques */}
      {result.theme_streak_bonus > 0 ? (
        <View style={styles.themeBonus}>
          <Text style={styles.themeBonusText}>
            {t('results.themeBonus', { bonus: result.theme_streak_bonus })}
          </Text>
        </View>
      ) : null}

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
        {isMixed ? (
          <>
            <AppButton
              title={t('results.replay')}
              variant="dark"
              onPress={onReplay}
              loading={replaying}
              fullWidth
            />
            <AppButton title={t('results.home')} variant="outlineGold" onPress={onHome} fullWidth />
          </>
        ) : (
          <>
            <AppButton title={t('results.share')} variant="ghost" onPress={onShare} fullWidth />
            <AppButton
              title={t('results.replay')}
              variant="secondary"
              onPress={onReplay}
              loading={replaying}
              fullWidth
            />
            <AppButton title={t('results.home')} variant="primary" onPress={onHome} fullWidth />
          </>
        )}
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
  recapCardRow: {
    borderRadius: radius.md,
    marginBottom: spacing.xs,
    overflow: 'hidden',
  },
  recapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
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
  recapBody: { flex: 1 },
  recapTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.textDark,
  },
  recapTag: { fontFamily: fonts.bodyBold, fontSize: fontSizes.xs },
  tagGood: { color: colors.successText },
  tagBad: { color: colors.errorText },
  chevron: { fontFamily: fonts.titleBold, fontSize: fontSizes.lg, color: colors.textMuted },

  // Détail déplié d'une carte du récap.
  detail: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
  ansGood: { backgroundColor: '#e8f5ed', borderRadius: radius.sm, padding: spacing.sm },
  ansGoodText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, color: colors.green500 },
  ansBad: { backgroundColor: '#fdecea', borderRadius: radius.sm, padding: spacing.sm },
  ansBadText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, color: colors.red400 },
  detailExpl: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  detailExplRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  detailExplFlex: { flex: 1 },

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

  themeBonus: {
    marginTop: spacing.lg,
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.goldVeil,
    borderWidth: 1,
    borderColor: colors.goldVeilBorder,
  },
  themeBonusText: { fontFamily: fonts.titleBold, fontSize: fontSizes.md, color: colors.gold400 },

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

  // Badge mode (blitz/marathon) sous le score.
  modeBadge: {
    marginTop: spacing.sm,
    backgroundColor: colors.green700,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  modeBadgeText: { fontFamily: fonts.titleBold, fontSize: fontSizes.sm, color: colors.white },

  // Écran « Calcul en cours… » (suspense 800 ms, blitz/marathon).
  calcWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  calcText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.base, color: colors.textOnDarkMuted },
});
