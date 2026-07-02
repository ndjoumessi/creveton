// ResultsScreen — révélation célébrative du score : trophée animé, score en or
// (count-up), stats, récapitulatif des réponses, barre d'XP et palier débloqué.
// Données issues de /sessions/submit (API §6), lues depuis le gameStore.

import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Title,
  Heading,
  Body,
  Label,
  AppCard,
  AppButton,
  ErrorScreen,
  Skeleton,
  Confetti,
  MiniLineChart,
  GoldVeilBanner,
  useToast,
} from '../components';
import { Lightbulb, WifiOff } from 'lucide-react-native';
import Icon from '../components/Icon';
import { useGameStore } from '../store/gameStore';
import { useQuestionsStore } from '../store/questionsStore';
import { useAuthStore } from '../store/authStore';
import { users } from '../services/endpoints';
import { TIMED_MODES } from '../constants/config';
import { hapticSuccess, hapticLight } from '../utils/haptics';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { getOptionText, normalizeLang } from '../utils/i18n';
import { colors, radius, spacing, motion } from '../constants/theme';

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
  // Thème/niveau de la partie figés de la même façon — servent à comparer le
  // score à la partie précédente du MÊME thème+niveau (rejeu réinitialise le store).
  const storeTheme = useGameStore((s) => s.theme);
  const themeRef = useRef(storeTheme);
  if (!replaying) themeRef.current = storeTheme;
  const storeLevel = useGameStore((s) => s.level);
  const levelRef = useRef(storeLevel);
  if (!replaying) levelRef.current = storeLevel;
  const isMixed = TIMED_MODES.includes(modeRef.current);
  const reset = useGameStore((s) => s.reset);
  const startGame = useGameStore((s) => s.startGame);
  const localResult = useGameStore((s) => s.localResult);
  const drawForMode = useQuestionsStore((s) => s.drawForMode);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const toast = useToast();

  const goHome = () => {
    reset();
    navigation.navigate('Tabs', { screen: 'Home' });
  };

  // Défi : retour au hub « Défis » (pas de « Rejouer » — on ne reduelle pas le
  // même défi, et drawForMode ne sait pas tirer un set de défi).
  const goChallenges = () => {
    reset();
    navigation.navigate('Tabs', { screen: 'Challenges' });
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

  // Partie jouée hors ligne : pas de score serveur (rejouée automatiquement au
  // retour de la connexion). On confirme la sauvegarde locale et, si le set
  // jouait sur cache complet, on montre un récap honnête — score/justesse
  // calculés localement, identiques au recalcul serveur au rejeu de la file
  // (cf. gameStore.computeLocalResult). Sinon (localResult null), on masque les
  // chiffres plutôt que d'en inventer.
  if (queued) {
    return (
      <Screen dark contentStyle={styles.offlineContent}>
        <View style={styles.offlineHero}>
          <Icon icon={WifiOff} size={48} color={colors.gold500} />
          <Heading color={colors.cream} style={styles.offlineTitle}>
            {t('offline.savedOffline')}
          </Heading>
          <Body color={colors.textOnDarkMuted} style={styles.offlineSubtitle}>
            {t('offline.savedOfflineMessage')}
          </Body>
        </View>

        {localResult ? (
          <View style={styles.offlineScoreCard}>
            <Title weight="black" size="hero" color={colors.gold500} style={styles.offlineScoreValue}>{localResult.score}</Title>
            <Label color={colors.textOnDarkMuted}>{t('results.finalScore')}</Label>
            <View style={styles.offlineDivider} />
            <Title size="xl" color={colors.white}>
              {localResult.correct_count}/{localResult.total_questions} {t('results.correct')}
            </Title>
          </View>
        ) : null}

        <AppButton title={t('results.home')} variant="primary" onPress={goHome} fullWidth />
      </Screen>
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
          <Body weight="medium" color={colors.textOnDarkMuted}>{t('quiz.misc.submitting')}</Body>
        </View>
      </Screen>
    );
  }

  return (
    <ResultsContent
      result={result}
      isMixed={isMixed}
      mode={modeRef.current}
      theme={themeRef.current}
      level={levelRef.current}
      onReplay={replay}
      onHome={goHome}
      onBackToChallenges={goChallenges}
      replaying={replaying}
    />
  );
}

function ResultsContent({ result, isMixed, mode, theme, level, onReplay, onHome, onBackToChallenges, replaying }) {
  const { t, i18n } = useTranslation();
  const lang = normalizeLang(i18n.language);
  const total = result.total_questions || 0;
  const correct = result.correct_count || 0;
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const review = Array.isArray(result.review) ? result.review : [];
  const modeBadge = mode === 'blitz' ? `⚡ ${t('gameStart.modes.blitz.name')}`
    : mode === 'marathon' ? `🏃 ${t('gameStart.modes.marathon.name')}`
      : null;

  // Défi 1v1 : issue du duel (le serveur renvoie le statut + scores des deux camps).
  const isChallenge = mode === 'challenge';
  const duelCompleted = isChallenge && result.status === 'completed';
  const duelWon = result.won; // true | false | null (égalité) — défini en completed
  const duelEmoji = duelWon == null ? '🤝' : duelWon ? '🏆' : '💔';
  const duelLabel = duelWon == null
    ? t('challengesHub.result.draw')
    : duelWon
      ? t('challengesHub.result.win')
      : t('challengesHub.result.loss');

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
  const celebrate = pct >= 80;

  // — Titre de performance selon la justesse (correct/total), donnée réelle.
  const perfTier = pct >= 80 ? 'excellent' : pct >= 50 ? 'good' : 'keepGoing';
  const perfColor = pct >= 80 ? colors.gold500 : pct >= 50 ? colors.green500 : colors.textMuted;

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

  // — Pulse du score à la fin du count-up (1 → 1.15 → 1), driver natif.
  const scorePulse = useRef(new Animated.Value(1)).current;
  // — Titre de perf : fondu APRÈS le score (~800ms).
  const perfFade = useRef(new Animated.Value(0)).current;
  // — Ligne de comparaison au précédent : fondu quand l'historique est arrivé.
  const compareFade = useRef(new Animated.Value(0)).current;

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
      scorePulse.setValue(1);
      perfFade.setValue(1);
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
    }).start(({ finished }) => {
      // Pulse d'accent quand le count-up se termine (1 → 1.15 → 1).
      if (finished) {
        Animated.sequence([
          Animated.timing(scorePulse, {
            toValue: 1.15,
            duration: 160,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.spring(scorePulse, {
            toValue: 1,
            friction: 3,
            tension: 120,
            useNativeDriver: true,
          }),
        ]).start();
      }
    });

    // Titre de perf : apparaît après le score.
    Animated.timing(perfFade, {
      toValue: 1,
      duration: motion.enter,
      delay: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
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
  }, [heroScale, heroRotate, scoreAnim, scorePulse, perfFade, xpFill, levelGlow, recordSlide, isRecord, result, reduceMotion]);

  // — Retour haptique selon la performance, une seule fois. Le record déclenche
  // déjà hapticSuccess (effet ci-dessus) → on ne double pas.
  const hapticFired = useRef(false);
  useEffect(() => {
    if (hapticFired.current) return;
    hapticFired.current = true;
    if (isRecord) return;
    if (pct >= 80) hapticSuccess();
    else if (pct < 50) hapticLight();
  }, [pct, isRecord]);

  // — Historique récent : mini-courbe de progression + comparaison à la partie
  // précédente du même thème/niveau. On tire large (20) pour trouver un match.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await users.history({ limit: 20 });
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
    .slice(0, 5)
    .reverse()
    .map((h) => Number(h.score) || 0);

  // — Comparaison au score précédent : dernière partie du MÊME mode+thème+niveau,
  // en excluant la partie courante (identifiée par son session_id). On masque la
  // ligne s'il n'existe pas d'antériorité comparable ou si les scores sont égaux
  // (aucune donnée inventée).
  const currentScore = result.score || 0;
  const priorSession = useMemo(() => {
    if (!Array.isArray(history)) return null;
    const curId = result.session_id ?? result.id ?? null;
    return (
      history.find((h) => {
        if (!h) return false;
        if (curId != null && (h.session_id === curId || h.id === curId)) return false;
        return (
          h.mode === mode &&
          (h.theme ?? null) === (theme ?? null) &&
          (h.level ?? null) === (level ?? null)
        );
      }) || null
    );
  }, [history, result, mode, theme, level]);

  const comparison = useMemo(() => {
    if (!priorSession) return null;
    const prev = Number(priorSession.score) || 0;
    if (currentScore === prev) return null;
    return { dir: currentScore > prev ? 'up' : 'down', pts: Math.abs(currentScore - prev) };
  }, [priorSession, currentScore]);

  useEffect(() => {
    if (!comparison) return undefined;
    if (reduceMotion) {
      compareFade.setValue(1);
      return undefined;
    }
    Animated.timing(compareFade, {
      toValue: 1,
      duration: motion.enter,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    return undefined;
  }, [comparison, reduceMotion, compareFade]);

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
            styles.recordBannerWrap,
            { opacity: recordSlide, transform: [{ translateY: recordTranslateY }] },
          ]}
        >
          <GoldVeilBanner style={styles.recordBanner} radius={radius.pill}>
            <Title size="md" color={colors.gold400}>{t('results.newRecord')}</Title>
          </GoldVeilBanner>
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
        <Animated.View style={{ transform: [{ scale: scorePulse }], marginBottom: spacing.xs }}>
          <Title weight="black" size="hero" color={colors.gold500} style={styles.score}>
            {displayScore}
          </Title>
        </Animated.View>
        <Label color={colors.textOnDarkMuted}>
          {t('results.misc.heroSubtitle', { correct, total, pct })}
        </Label>
        <Animated.View style={{ opacity: perfFade }}>
          <Title size="xl" style={[styles.perfTitle, { color: perfColor }]}>
            {t(`results.perf.${perfTier}`)}
          </Title>
        </Animated.View>
        {comparison ? (
          <Animated.View style={{ opacity: compareFade }}>
            <Body
              weight="semibold"
              size="md"
              style={[
                styles.compareLine,
                comparison.dir === 'up' ? styles.compareUp : styles.compareDown,
              ]}
            >
              {comparison.dir === 'up'
                ? t('results.compare.up', { pts: comparison.pts })
                : t('results.compare.down', { pts: comparison.pts })}
            </Body>
          </Animated.View>
        ) : null}
        {modeBadge ? (
          <View style={styles.modeBadge}>
            <Title size="sm" color={colors.white}>{modeBadge}</Title>
          </View>
        ) : null}
      </View>

      {/* STATS */}
      <View style={styles.statsRow}>
        <Stat value={`${correct}/${total}`} label={t('results.correct')} />
        <Stat value={`+${result.xp_earned ?? 0}`} label={t('results.xpEarned')} />
        <Stat value={avgSeconds} label={t('results.avgTime')} />
      </View>

      {/* ISSUE DU DUEL (défi) — résultat final si les deux ont joué, sinon attente */}
      {isChallenge ? (
        <GoldVeilBanner style={styles.duelBanner} radius={radius.xl}>
          {duelCompleted ? (
            <>
              <Text style={styles.duelEmoji}>{duelEmoji}</Text>
              <Title size="xl" color={colors.gold400}>{duelLabel}</Title>
              <Heading color={colors.white}>
                {result.your_score ?? 0} {t('challengesHub.card.vs')} {result.opponent_score ?? 0}
              </Heading>
            </>
          ) : (
            <Body weight="medium" color={colors.textOnDarkMuted}>⏳ {t('challengesHub.card.waiting')}</Body>
          )}
        </GoldVeilBanner>
      ) : null}

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
                    <Body weight="bold" size="md" color={colors.white}>{good ? '✓' : '✗'}</Body>
                  </View>
                  <View style={styles.recapBody}>
                    <Body weight="semibold" size="md" color={colors.textDark} numberOfLines={open ? undefined : 1}>
                      {title}
                    </Body>
                  </View>
                  <Label weight="bold" size="xs" color={good ? colors.successText : colors.errorText}>
                    {good ? t('results.correct_label') : t('results.wrong_label')}
                  </Label>
                  <Title size="lg" color={colors.textMuted}>{open ? '⌄' : '›'}</Title>
                </Pressable>

                {/* Détail déplié */}
                {open ? (
                  <View style={styles.detail}>
                    {correctText ? (
                      <View style={styles.ansGood}>
                        <Label color={colors.successText}>
                          ✓ {t('results.misc.correctAnswer')} : {correctText}
                        </Label>
                      </View>
                    ) : null}
                    {!good && yourText ? (
                      <View style={styles.ansBad}>
                        <Label color={colors.errorText}>
                          ✗ {t('results.misc.yourAnswer')} : {yourText}
                        </Label>
                      </View>
                    ) : null}
                    {(item.explanation || item.explanation_en) ? (
                      <View style={styles.detailExplRow}>
                        <Icon icon={Lightbulb} size={14} color={colors.textMuted} />
                        <Body size="xs" color={colors.textMuted} style={[styles.detailExpl, styles.detailExplFlex]}>
                          {lang === 'en' && item.explanation_en ? item.explanation_en : item.explanation}
                        </Body>
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
        <Label weight="semibold" color={colors.cream} style={styles.xpLabel}>
          {t('results.xpGained', { xp: result.xp_earned ?? 0 })}
          {result.speed_bonus ? ` (${t('results.speedBonus', { bonus: result.speed_bonus })})` : ''}
        </Label>
        <View style={styles.xpTrack}>
          <Animated.View style={[styles.xpFill, { width: xpWidth }]} />
        </View>
      </View>

      {/* BONUS THÈME (marathon) — points gagnés par séries thématiques */}
      {result.theme_streak_bonus > 0 ? (
        <GoldVeilBanner style={styles.themeBonus} radius={radius.pill}>
          <Title size="md" color={colors.gold400}>
            {t('results.themeBonus', { bonus: result.theme_streak_bonus })}
          </Title>
        </GoldVeilBanner>
      ) : null}

      {/* MA PROGRESSION — mini-courbe des derniers scores */}
      {history === null ? (
        <View style={styles.progressBlock}>
          <Heading color={colors.cream} style={styles.sectionTitle}>
            {t('results.misc.progression')}
          </Heading>
          <AppCard tone="light" padding="md" radius={radius.xl}>
            <Skeleton width="100%" height={120} radius={radius.md} />
          </AppCard>
        </View>
      ) : progressScores.length >= 2 ? (
        <View style={styles.progressBlock}>
          <Heading color={colors.cream} style={styles.sectionTitle}>
            {t('results.misc.progression')}
          </Heading>
          <AppCard tone="light" padding="md" radius={radius.xl} style={styles.progressCard}>
            {/* Même config riche que « Score evolution » (StatsScreen) : axe de
                valeurs (showGrid), aire, points cerclés, dernier point mis en avant
                (showLastValue), échelle sur les données réelles. Largeur responsive
                (onLayout) au lieu du 300 fixe. Palette VERTE de la charte — l'or est
                réservé aux récompenses (CDC), pas à une courbe de progression. Le
                tap→tooltip est intégré au composant (P3), reduce-motion respecté. */}
            <MiniLineChart
              data={progressScores}
              width="auto"
              height={120}
              color={colors.green500}
              paddingTop={14}
              paddingBottom={20}
              fillArea
              showGrid
              outlinedDots
              showLastValue
              scaleToData
              lastValueColor={colors.green700}
              formatValue={(v) => Number(v).toLocaleString('fr-FR')}
            />
          </AppCard>
        </View>
      ) : null}

      {/* PALIER DÉBLOQUÉ */}
      {result.level_unlocked ? (
        <Animated.View style={[styles.levelUpWrap, { transform: [{ scale: glowScale }] }]}>
          <GoldVeilBanner style={styles.levelUp} radius={radius.xl}>
            <Text style={styles.levelUpEmoji}>🎉</Text>
            <Heading color={colors.gold400}>{t('results.misc.levelUpTitle')}</Heading>
            {result.unlocked_difficulty ? (
              <Body color={colors.cream} style={styles.levelUpText}>
                {t('results.misc.difficultyUnlocked', { difficulty: result.unlocked_difficulty })}
              </Body>
            ) : null}
          </GoldVeilBanner>
        </Animated.View>
      ) : null}

      {/* ACTIONS */}
      <View style={styles.actions}>
        {isChallenge ? (
          <>
            <AppButton title={t('results.share')} variant="ghost" onPress={onShare} fullWidth />
            <AppButton title={t('results.backToChallenges')} variant="primary" onPress={onBackToChallenges} fullWidth />
            <AppButton title={t('results.home')} variant="outlineGold" onPress={onHome} fullWidth />
          </>
        ) : isMixed ? (
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
      <Title size="xl" color={colors.white}>{value}</Title>
      <Body size="xs" color={colors.textOnDarkMuted} style={styles.statLabel}>{label}</Body>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl },

  confettiLayer: { ...StyleSheet.absoluteFillObject, zIndex: 1 },

  // Enveloppe animée (slide + fondu) — porte les marges/alignement dans le parent ;
  // le voile d'or visuel vit dans GoldVeilBanner (styles.recordBanner).
  recordBannerWrap: {
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  recordBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  progressBlock: { marginTop: spacing.xl, zIndex: 2 },
  progressCard: { alignItems: 'center' },

  hero: { alignItems: 'center', paddingVertical: spacing.lg, zIndex: 2 },
  trophy: { fontSize: 72, marginBottom: spacing.sm },
  scoreLabel: { marginBottom: spacing.xs },
  perfTitle: {
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  compareLine: {
    textAlign: 'center',
    marginTop: spacing.xxs,
  },
  compareUp: { color: colors.green500 },
  compareDown: { color: colors.textMuted },
  score: {
    lineHeight: 72,
  },

  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  stat: { flex: 1, alignItems: 'center', gap: spacing.xxs },
  statLabel: { textAlign: 'center' },

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
  recapBody: { flex: 1 },

  // Détail déplié d'une carte du récap.
  detail: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
  ansGood: { backgroundColor: colors.pastelGreen, borderRadius: radius.sm, padding: spacing.sm },
  ansBad: { backgroundColor: colors.pastelRose, borderRadius: radius.sm, padding: spacing.sm },
  detailExpl: { fontStyle: 'italic' },
  detailExplRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  detailExplFlex: { flex: 1 },

  xpBlock: { marginTop: spacing.xl },
  xpLabel: { marginBottom: spacing.sm },
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

  // Bandeau issue du duel (défi 1v1).
  duelBanner: {
    alignItems: 'center',
    gap: spacing.xxs,
    marginBottom: spacing.xl,
    paddingVertical: spacing.lg,
  },
  duelEmoji: { fontSize: 40 },

  themeBonus: {
    marginTop: spacing.lg,
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },

  // Enveloppe animée (scale) — porte la marge parent hors du transform pour que
  // le « pop » reste centré sur le bandeau ; le voile d'or vit dans GoldVeilBanner.
  levelUpWrap: {
    marginTop: spacing.xl,
  },
  levelUp: {
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.lg,
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

  // Écran « Calcul en cours… » (suspense 800 ms, blitz/marathon).
  calcWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },

  // Écran de résultat hors-ligne (partie mise en file, sync au retour réseau).
  offlineContent: { flex: 1, justifyContent: 'center', gap: spacing.xl },
  offlineHero: { alignItems: 'center', gap: spacing.sm },
  offlineTitle: { textAlign: 'center' },
  offlineSubtitle: { textAlign: 'center' },
  offlineScoreCard: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xl,
    borderRadius: radius.xl,
    backgroundColor: colors.cardOnDark,
    borderWidth: 1,
    borderColor: colors.borderOnDark,
  },
  offlineScoreValue: { lineHeight: 72 },
  offlineDivider: {
    width: 40,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.gold500,
    marginVertical: spacing.sm,
  },
});
