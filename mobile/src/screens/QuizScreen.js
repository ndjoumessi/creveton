// QuizScreen — immersif (#0b2e1a).
// BUG 2 : timer prominent (barre animée + compte à rebours 28px or, rouge ≤10s,
//          pulsation ≤5s, durée selon niveau, reset par question).
// BUG 3 : feedback immédiat via POST /sessions/answer (mode normal). La réponse
//          serveur fournit correct/correct_index/explanation/points_earned/
//          streak. Bonne réponse révélée, options bloquées, explication + Suivant.
//          Timeout → answer(selected_index:null) + révélation 2 s puis auto-next.
// Anti-triche : en tournoi/challenge on n'appelle PAS l'endpoint ; simple
// surbrillance de sélection, sans rien révéler. /sessions/submit reste appelé
// à la fin pour le score officiel (avec le session_id mémorisé).

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Easing,
  BackHandler,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingScreen, ProgressDots, AppButton, useToast } from '../components';
import { useGameStore } from '../store/gameStore';
import { sessions as sessionsApi } from '../services/endpoints';
import { parseApiError } from '../services/api';
import { colors, fonts, fontSizes, radius, spacing, shadow, motion } from '../constants/theme';

const LETTERS = ['A', 'B', 'C', 'D'];
const TIME_BY_LEVEL = { beginner: 30, intermediate: 20, expert: 15 };
const BLOCK_MS = 1500;
const TIMEOUT_REVEAL_MS = 2000;

export default function QuizScreen({ navigation }) {
  const toast = useToast();
  const questions = useGameStore((s) => s.questions);
  const currentIndex = useGameStore((s) => s.currentIndex);
  const answerCurrent = useGameStore((s) => s.answerCurrent);
  const next = useGameStore((s) => s.next);
  const isLastQuestion = useGameStore((s) => s.isLastQuestion);
  const submit = useGameStore((s) => s.submit);
  const level = useGameStore((s) => s.level);
  const mode = useGameStore((s) => s.mode);
  const sessionId = useGameStore((s) => s.sessionId);
  const setSessionId = useGameStore((s) => s.setSessionId);

  const question = questions[currentIndex];
  const total = questions.length;
  const timeLimit = TIME_BY_LEVEL[level] || 30;

  const [secondsLeft, setSecondsLeft] = useState(timeLimit);
  const [answered, setAnswered] = useState(null); // { selectedIndex, correctIndex, explanation, isCorrect, timedOut }
  const [dotStates, setDotStates] = useState([]);
  const [displayScore, setDisplayScore] = useState(0);
  const [correctStreak, setCorrectStreak] = useState(0);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const timerAnim = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const streakBounce = useRef(new Animated.Value(0)).current;
  const explainY = useRef(new Animated.Value(40)).current;
  const explainOpacity = useRef(new Animated.Value(0)).current;
  const scoreAnim = useRef(new Animated.Value(0)).current;
  const scoreTarget = useRef(0);
  const intervalRef = useRef(null);
  const advanceRef = useRef(null);
  const questionStart = useRef(Date.now());
  const pulseLoop = useRef(null);

  // Mode normal uniquement : le feedback immédiat passe par /sessions/answer.
  const feedbackEnabled = mode === 'normal';

  // Count-up du score à partir des points renvoyés par le serveur.
  useEffect(() => {
    const id = scoreAnim.addListener(({ value }) => setDisplayScore(Math.round(value)));
    return () => scoreAnim.removeListener(id);
  }, [scoreAnim]);

  const bumpScore = useCallback(
    (points) => {
      if (!points) return;
      scoreTarget.current += points;
      Animated.timing(scoreAnim, {
        toValue: scoreTarget.current,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    },
    [scoreAnim]
  );

  const clearTimers = useCallback(() => {
    clearInterval(intervalRef.current);
    clearTimeout(advanceRef.current);
    timerAnim.stopAnimation();
    pulseLoop.current?.stop();
  }, [timerAnim]);

  // Confirmation de sortie (✕ et bouton retour Android).
  const confirmQuit = useCallback(() => {
    Alert.alert('Quitter la partie ?', 'Ta progression sera perdue.', [
      { text: 'Continuer', style: 'cancel' },
      {
        text: 'Quitter',
        style: 'destructive',
        onPress: () => {
          clearTimers();
          navigation.navigate('Tabs', { screen: 'Home' });
        },
      },
    ]);
  }, [clearTimers, navigation]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      confirmQuit();
      return true;
    });
    return () => sub.remove();
  }, [confirmQuit]);

  // Avance à la question suivante ou soumet la partie.
  const goNext = useCallback(async () => {
    clearTimers();
    if (isLastQuestion()) {
      setSubmitting(true);
      const res = await submit();
      navigation.replace('Results', { ok: res.ok, error: res.error });
      return;
    }
    next();
  }, [clearTimers, isLastQuestion, submit, next, navigation]);

  const revealExplain = useCallback(() => {
    Animated.parallel([
      Animated.timing(explainY, {
        toValue: 0,
        duration: motion.enter,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(explainOpacity, {
        toValue: 1,
        duration: motion.enter,
        useNativeDriver: true,
      }),
    ]).start();
  }, [explainY, explainOpacity]);

  // Enregistre la réponse (tap, timeout ou passer) et déclenche le feedback.
  const handleAnswer = useCallback(
    async ({ selectedIndex, skipped = false, timedOut = false }) => {
      if (answered || checking) return;
      clearTimers();
      const elapsed = Date.now() - questionStart.current;

      // Mémorisation locale pour le submit final (le serveur recalcule tout).
      answerCurrent({ selectedIndex, elapsedMs: elapsed, skipped });

      // Passer : on avance tout de suite, sans rien révéler ni appeler l'API.
      if (skipped) {
        setDotStates((d) => {
          const copy = [...d];
          copy[currentIndex] = 'skipped';
          return copy;
        });
        goNext();
        return;
      }

      // Tournoi / challenge : pas d'endpoint de feedback (anti-triche) →
      // simple surbrillance puis avance.
      if (!feedbackEnabled) {
        setAnswered({ selectedIndex, correctIndex: null, isCorrect: false, timedOut });
        setDotStates((d) => {
          const copy = [...d];
          copy[currentIndex] = selectedIndex === null ? 'wrong' : 'correct';
          return copy;
        });
        advanceRef.current = setTimeout(goNext, timedOut ? TIMEOUT_REVEAL_MS : BLOCK_MS);
        return;
      }

      // Mode normal : feedback immédiat serveur.
      setChecking(true);
      try {
        const fb = await sessionsApi.answer({
          question_id: question.id,
          selected_index: selectedIndex,
          elapsed_ms: Math.round(elapsed),
          mode: 'normal',
          session_id: sessionId || undefined,
        });
        setSessionId(fb.session_id);

        bumpScore(fb.points_earned || 0);
        if (typeof fb.streak === 'number') setCorrectStreak(fb.streak);

        setDotStates((d) => {
          const copy = [...d];
          copy[currentIndex] = fb.correct ? 'correct' : 'wrong';
          return copy;
        });

        setAnswered({
          selectedIndex,
          correctIndex: Number.isInteger(fb.correct_index) ? fb.correct_index : null,
          explanation: fb.explanation || null,
          isCorrect: !!fb.correct,
          timedOut,
        });
        revealExplain();

        // Timeout : révélation 2 s puis auto-next. Tap : « Suivant » manuel.
        if (timedOut) advanceRef.current = setTimeout(goNext, TIMEOUT_REVEAL_MS);
      } catch (e) {
        // Échec réseau : on ne bloque pas la partie — surbrillance + avance.
        toast.show({ type: 'error', message: parseApiError(e).message });
        setAnswered({ selectedIndex, correctIndex: null, isCorrect: false, timedOut });
        setDotStates((d) => {
          const copy = [...d];
          copy[currentIndex] = 'wrong';
          return copy;
        });
        advanceRef.current = setTimeout(goNext, BLOCK_MS);
      } finally {
        setChecking(false);
      }
    },
    [
      answered,
      checking,
      clearTimers,
      answerCurrent,
      feedbackEnabled,
      question,
      sessionId,
      setSessionId,
      bumpScore,
      currentIndex,
      goNext,
      revealExplain,
      toast,
    ]
  );

  // Démarre le timer à chaque nouvelle question.
  useEffect(() => {
    setAnswered(null);
    setSecondsLeft(timeLimit);
    questionStart.current = Date.now();
    explainY.setValue(40);
    explainOpacity.setValue(0);

    timerAnim.setValue(1);
    Animated.timing(timerAnim, {
      toValue: 0,
      duration: timeLimit * 1000,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(intervalRef.current);
          handleAnswer({ selectedIndex: null, timedOut: true });
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => {
      clearInterval(intervalRef.current);
      clearTimeout(advanceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // Pulsation du timer sous les 5 s.
  useEffect(() => {
    if (secondsLeft <= 5 && secondsLeft > 0 && !answered) {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.05, duration: 400, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 400, useNativeDriver: true }),
        ])
      );
      pulseLoop.current.start();
      return () => pulseLoop.current?.stop();
    }
  }, [secondsLeft, answered, pulse]);

  // Bounce du badge de série.
  useEffect(() => {
    if (correctStreak >= 3) {
      streakBounce.setValue(0);
      Animated.spring(streakBounce, { toValue: 1, useNativeDriver: true, friction: 4 }).start();
    }
  }, [correctStreak, streakBounce]);

  if (submitting) return <LoadingScreen message="Calcul du score…" />;
  if (!question) return <LoadingScreen message="Chargement…" />;

  const danger = secondsLeft <= 10;
  const barWidth = timerAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const streakScale = streakBounce.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={confirmQuit} hitSlop={10} style={styles.quit}>
          <Text style={styles.quitText}>✕</Text>
        </Pressable>
        <Text style={styles.counter}>Q {currentIndex + 1}/{total}</Text>
        <Text style={styles.score}>{displayScore} pts ⚡</Text>
      </View>

      {/* TIMER prominent */}
      <View style={styles.timerRow}>
        <View style={styles.timerTrack}>
          <Animated.View
            style={[
              styles.timerFill,
              { width: barWidth, backgroundColor: danger ? colors.red400 : colors.gold500 },
            ]}
          />
        </View>
        <Animated.Text
          style={[
            styles.timerValue,
            { color: danger ? colors.red400 : colors.gold500, transform: [{ scale: pulse }] },
          ]}
        >
          {secondsLeft}s
        </Animated.Text>
      </View>

      {/* Progress dots */}
      <View style={styles.dots}>
        <ProgressDots total={total} current={currentIndex} states={dotStates} />
      </View>

      {/* Streak badge */}
      {correctStreak >= 3 && !answered ? (
        <Animated.View style={[styles.streak, { transform: [{ scale: streakScale }] }]}>
          <Text style={styles.streakText}>🔥 ×{correctStreak}</Text>
        </Animated.View>
      ) : null}

      {/* Question */}
      <View style={styles.card}>
        <Text style={styles.question}>{question.text}</Text>
        <View style={styles.underline} />
      </View>

      {/* Options */}
      <View style={styles.options}>
        {(question.options || []).map((opt, i) => (
          <OptionRow
            key={opt.index ?? i}
            letter={LETTERS[i]}
            text={opt.text}
            optionIndex={opt.index ?? i}
            answered={answered}
            onPress={() => handleAnswer({ selectedIndex: opt.index ?? i })}
          />
        ))}
      </View>

      {/* Passer (avant réponse) */}
      {!answered ? (
        <Pressable
          onPress={() => handleAnswer({ selectedIndex: null, skipped: true })}
          style={styles.skip}
          hitSlop={8}
        >
          <Text style={styles.skipText}>Passer</Text>
        </Pressable>
      ) : null}

      {/* Explication + Suivant (slide-up) */}
      {answered && answered.correctIndex !== null ? (
        <Animated.View
          style={[
            styles.explain,
            { opacity: explainOpacity, transform: [{ translateY: explainY }] },
          ]}
        >
          {answered.explanation ? (
            <Text style={styles.explainText}>💡 {answered.explanation}</Text>
          ) : (
            <Text style={styles.explainText}>
              {answered.isCorrect ? '✓ Bonne réponse !' : '✗ Mauvaise réponse.'}
            </Text>
          )}
          {!answered.timedOut ? (
            <AppButton
              title="Suivant →"
              variant="primary"
              size="md"
              onPress={goNext}
              style={styles.nextBtn}
            />
          ) : null}
        </Animated.View>
      ) : null}
    </SafeAreaView>
  );
}

// Option A–D avec états de feedback bien visibles.
function OptionRow({ letter, text, optionIndex, answered, onPress }) {
  const scale = useRef(new Animated.Value(1)).current;

  const isSelected = answered && answered.selectedIndex === optionIndex;
  const isCorrectOpt = answered && answered.correctIndex === optionIndex;
  const revealing = answered && answered.correctIndex !== null;

  let container = styles.optDefault;
  let badge = styles.badgeDefault;
  let badgeText = styles.badgeTextDefault;
  let label = styles.optTextDefault;
  let glyph = letter;
  let showGoodLabel = false;

  if (revealing) {
    if (isCorrectOpt) {
      container = styles.optCorrect;
      badge = styles.badgeCorrect;
      badgeText = styles.badgeTextOnColor;
      label = styles.optTextCorrect;
      glyph = '✓';
      showGoodLabel = !isSelected; // bonne réponse non choisie
    } else if (isSelected) {
      container = styles.optWrong;
      badge = styles.badgeWrong;
      badgeText = styles.badgeTextOnColor;
      label = styles.optTextWrong;
      glyph = '✗';
    }
  } else if (isSelected) {
    // Sans réponse connue (anti-triche) : simple surbrillance de sélection.
    container = styles.optSelected;
  }

  const onPressIn = () =>
    Animated.timing(scale, { toValue: 0.97, duration: 50, useNativeDriver: true }).start();
  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={!!answered}
        style={[styles.option, container]}
      >
        <View style={[styles.badge, badge]}>
          <Text style={[styles.badgeText, badgeText]}>{glyph}</Text>
        </View>
        <View style={styles.optBody}>
          {showGoodLabel ? <Text style={styles.goodLabel}>✓ Bonne réponse</Text> : null}
          <Text style={[styles.optText, label]}>{text}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.green900, paddingHorizontal: spacing.lg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  quit: { width: 32 },
  quitText: { fontSize: fontSizes.lg, color: colors.textOnDarkMuted },
  counter: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.md, color: colors.textOnDarkMuted },
  score: { fontFamily: fonts.titleBold, fontSize: fontSizes.lg, color: colors.gold500 },

  timerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xs },
  timerTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  timerFill: { height: '100%', borderRadius: 4 },
  timerValue: { fontFamily: fonts.titleBold, fontSize: 28, minWidth: 56, textAlign: 'right' },

  dots: { marginTop: spacing.lg },

  streak: {
    position: 'absolute',
    top: 64,
    right: spacing.lg,
    backgroundColor: colors.gold500,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    zIndex: 5,
    ...shadow.gold,
  },
  streakText: { fontFamily: fonts.titleBold, fontSize: fontSizes.md, color: colors.green900 },

  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: 20,
    marginTop: spacing.xl,
  },
  question: {
    fontFamily: fonts.titleSemiBold,
    fontSize: 17,
    lineHeight: 26,
    color: colors.green900,
  },
  underline: { width: 44, height: 3, borderRadius: 2, backgroundColor: colors.gold500, marginTop: spacing.md },

  options: { marginTop: spacing.xl, gap: spacing.md },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    borderRadius: radius.base,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1.5,
  },
  optDefault: { backgroundColor: colors.white, borderColor: colors.border },
  optSelected: { backgroundColor: colors.successBgSoft, borderColor: colors.green500 },
  optCorrect: { backgroundColor: colors.successBg, borderWidth: 3, borderColor: colors.green500 },
  optWrong: { backgroundColor: colors.errorBg, borderWidth: 3, borderColor: colors.red400 },
  badge: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeDefault: { backgroundColor: '#f3f4f6' },
  badgeCorrect: { backgroundColor: colors.green500 },
  badgeWrong: { backgroundColor: colors.red400 },
  badgeText: { fontFamily: fonts.bodyBold, fontSize: fontSizes.md },
  badgeTextDefault: { color: '#374151' },
  badgeTextOnColor: { color: colors.white },
  optBody: { flex: 1 },
  optText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.md },
  optTextDefault: { color: '#374151' },
  optTextCorrect: { color: colors.successText, fontFamily: fonts.bodySemiBold },
  optTextWrong: { color: colors.red600 },
  goodLabel: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.successText, marginBottom: 2 },

  skip: { alignItems: 'center', paddingVertical: spacing.lg, marginTop: 'auto' },
  skipText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.md, color: 'rgba(253,246,233,0.4)' },

  explain: {
    marginTop: 'auto',
    marginBottom: spacing.md,
    backgroundColor: colors.cream,
    borderRadius: radius.lg,
    borderTopWidth: 3,
    borderTopColor: colors.gold500,
    padding: spacing.lg,
  },
  explainText: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.md, color: colors.textDark, lineHeight: 21 },
  nextBtn: { marginTop: spacing.md },
});
