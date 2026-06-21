// QuizScreen — question + 4 options (A–D), timer animé dégressif, progress dots,
// série d'engagement, score provisoire. Le serveur recalcule le score officiel à
// la soumission ; ici on ne révèle JAMAIS la bonne réponse (anti-triche, API §5) :
// l'appui ne fait que surligner la sélection puis enchaîne.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  Animated,
  Easing,
  BackHandler,
  Alert,
} from 'react-native';
import { Screen, AppCard, Body, ProgressDots, LoadingScreen } from '../components';
import { useGameStore } from '../store/gameStore';
import { GAME, LEVELS } from '../constants/config';
import { colors, fonts, fontSizes, radius, spacing } from '../constants/theme';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];
const DURATION_MS = GAME.timePerQuestionS * 1000;
const URGENT_S = 10;
const TRANSITION_MS = 220;

function provisionalPoints(answers, level) {
  const base = LEVELS.find((l) => l.key === level)?.points ?? 50;
  return answers.reduce((sum, a) => {
    if (a.skipped || a.selected_index === null) return sum;
    const bonus = a.elapsed_ms <= GAME.speedBonusThresholdMs ? 1.5 : 1;
    return sum + Math.round(base * bonus);
  }, 0);
}

export default function QuizScreen({ navigation }) {
  const questions = useGameStore((s) => s.questions);
  const currentIndex = useGameStore((s) => s.currentIndex);
  const level = useGameStore((s) => s.level);
  const streak = useGameStore((s) => s.streak);
  const answers = useGameStore((s) => s.answers);
  const answerCurrent = useGameStore((s) => s.answerCurrent);
  const next = useGameStore((s) => s.next);
  const isLastQuestion = useGameStore((s) => s.isLastQuestion);
  const submit = useGameStore((s) => s.submit);

  const question = questions[currentIndex];
  const total = questions.length;

  const [selected, setSelected] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(GAME.timePerQuestionS);
  const [locked, setLocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const questionStart = useRef(Date.now());
  const intervalRef = useRef(null);

  // Animations
  const barAnim = useRef(new Animated.Value(1)).current; // 1 → 0
  const pulse = useRef(new Animated.Value(1)).current; // pulse urgence
  const pulseLoop = useRef(null);
  const streakScale = useRef(new Animated.Value(0)).current; // bounce série
  const optScales = useRef(OPTION_LETTERS.map(() => new Animated.Value(1))).current;

  const elapsedMs = useCallback(() => Date.now() - questionStart.current, []);

  const stopPulse = useCallback(() => {
    if (pulseLoop.current) {
      pulseLoop.current.stop();
      pulseLoop.current = null;
    }
    pulse.setValue(1);
  }, [pulse]);

  // Avance : enregistre, court feedback, puis question suivante ou soumission.
  const advance = useCallback(
    async ({ selectedIndex, skipped }) => {
      if (locked) return;
      setLocked(true);
      clearInterval(intervalRef.current);
      barAnim.stopAnimation();
      stopPulse();
      answerCurrent({ selectedIndex, elapsedMs: elapsedMs(), skipped });

      if (isLastQuestion()) {
        setSubmitting(true);
        const res = await submit();
        setSubmitting(false);
        navigation.replace('Results', { ok: res.ok, error: res.error });
        return;
      }

      setTimeout(() => {
        next();
        setSelected(null);
        setSecondsLeft(GAME.timePerQuestionS);
        questionStart.current = Date.now();
        setLocked(false);
      }, TRANSITION_MS);
    },
    [
      locked,
      barAnim,
      stopPulse,
      answerCurrent,
      elapsedMs,
      isLastQuestion,
      submit,
      next,
      navigation,
    ],
  );

  const confirmQuit = useCallback(() => {
    Alert.alert('Quitter la partie ?', 'Ta progression sera perdue.', [
      { text: 'Continuer', style: 'cancel' },
      {
        text: 'Quitter',
        style: 'destructive',
        onPress: () => navigation.navigate('Tabs', { screen: 'Home' }),
      },
    ]);
  }, [navigation]);

  // Confirmation de sortie sur retour matériel Android.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      confirmQuit();
      return true;
    });
    return () => sub.remove();
  }, [confirmQuit]);

  // Timer par question : barre animée + décompte JS + timeout.
  useEffect(() => {
    questionStart.current = Date.now();
    barAnim.setValue(1);
    Animated.timing(barAnim, {
      toValue: 0,
      duration: DURATION_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    setSecondsLeft(GAME.timePerQuestionS);
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(intervalRef.current);
          advance({ selectedIndex: null, skipped: false });
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(intervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // Pulse rouge dans les dernières secondes.
  useEffect(() => {
    if (secondsLeft <= URGENT_S && secondsLeft > 0 && !pulseLoop.current) {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 0.4,
            duration: 500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 1,
            duration: 500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      pulseLoop.current.start();
    }
  }, [secondsLeft, pulse]);

  // Bounce du badge série quand il (ré)apparaît.
  const showStreak = streak >= GAME.streakX15;
  useEffect(() => {
    if (showStreak) {
      streakScale.setValue(0.6);
      Animated.spring(streakScale, {
        toValue: 1,
        speed: 16,
        bounciness: 12,
        useNativeDriver: true,
      }).start();
    } else {
      streakScale.setValue(0);
    }
  }, [showStreak, streak, streakScale]);

  // Nettoyage au démontage.
  useEffect(
    () => () => {
      clearInterval(intervalRef.current);
      if (pulseLoop.current) pulseLoop.current.stop();
    },
    [],
  );

  const onSelect = (optIndex, slot) => {
    if (locked || selected !== null) return;
    setSelected(optIndex);
    Animated.sequence([
      Animated.spring(optScales[slot], {
        toValue: 0.97,
        speed: 40,
        bounciness: 0,
        useNativeDriver: true,
      }),
      Animated.spring(optScales[slot], {
        toValue: 1,
        speed: 30,
        bounciness: 8,
        useNativeDriver: true,
      }),
    ]).start();
    setTimeout(() => advance({ selectedIndex: optIndex, skipped: false }), TRANSITION_MS);
  };

  const onSkip = () => {
    if (locked || selected !== null) return;
    advance({ selectedIndex: null, elapsedMs: elapsedMs(), skipped: true });
  };

  if (submitting) return <LoadingScreen message="Calcul du score…" />;
  if (!question) return <LoadingScreen message="Chargement…" />;

  const urgent = secondsLeft <= URGENT_S;
  const score = provisionalPoints(answers, level);

  // États des points (visuel « répondu », pas une révélation de justesse).
  const dotStates = answers.map((a) =>
    a.skipped ? 'skipped' : a.selected_index === null ? 'wrong' : 'correct',
  );

  return (
    <Screen dark edges={['top', 'bottom']}>
      {/* En-tête : progression + score provisoire + quitter */}
      <View style={styles.topBar}>
        <Body color={colors.textOnDarkMuted}>
          Question {currentIndex + 1}/{total}
        </Body>
        <View style={styles.topRight}>
          <Text style={styles.score}>{score} pts</Text>
          <Pressable onPress={confirmQuit} hitSlop={10} style={styles.close}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>
      </View>

      {showStreak ? (
        <Animated.View
          style={[styles.streakPill, { transform: [{ scale: streakScale }] }]}
        >
          <Text style={styles.streakText}>🔥 x{streak}</Text>
        </Animated.View>
      ) : null}

      <ProgressDots total={total} current={currentIndex} states={dotStates} />

      {/* Barre de temps */}
      <View style={styles.timerRow}>
        <View style={styles.timerTrack}>
          <Animated.View
            style={[
              styles.timerFill,
              {
                width: barAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
                backgroundColor: urgent ? colors.red400 : colors.gold400,
                opacity: urgent ? pulse : 1,
              },
            ]}
          />
        </View>
        <Text style={[styles.timerNum, urgent && styles.timerNumUrgent]}>
          {secondsLeft}s
        </Text>
      </View>

      {/* Question */}
      <AppCard tone="light" padding="lg" radius={radius.xl} style={styles.qCard}>
        <Text style={styles.qText}>{question.text}</Text>
        <View style={styles.qUnderline} />
      </AppCard>

      {/* Options A–D */}
      <View style={styles.options}>
        {(question.options || []).map((opt, i) => {
          const optIndex = opt.index ?? i;
          const active = selected === optIndex;
          return (
            <Animated.View
              key={optIndex}
              style={{ transform: [{ scale: optScales[i] }] }}
            >
              <Pressable
                onPress={() => onSelect(optIndex, i)}
                disabled={locked || selected !== null}
                style={[styles.option, active && styles.optionActive]}
              >
                <View style={[styles.letter, active && styles.letterActive]}>
                  <Text
                    style={[styles.letterText, active && styles.letterTextActive]}
                  >
                    {OPTION_LETTERS[i]}
                  </Text>
                </View>
                <Text style={styles.optionText}>{opt.text}</Text>
              </Pressable>
            </Animated.View>
          );
        })}
      </View>

      <Pressable
        onPress={onSkip}
        disabled={locked || selected !== null}
        style={styles.skip}
      >
        <Text style={styles.skipText}>Passer</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  score: {
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.lg,
    color: colors.gold400,
  },
  close: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontFamily: fonts.titleMedium,
    fontSize: fontSizes.lg,
    color: colors.cream,
  },
  streakPill: {
    alignSelf: 'flex-end',
    backgroundColor: colors.goldVeil,
    borderWidth: 1,
    borderColor: colors.goldVeilBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    marginBottom: spacing.sm,
  },
  streakText: {
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.md,
    color: colors.gold400,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  timerTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
  },
  timerFill: { height: '100%', borderRadius: 2 },
  timerNum: {
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.md,
    color: colors.cream,
    minWidth: 34,
    textAlign: 'right',
  },
  timerNumUrgent: { color: colors.red400 },
  qCard: { marginBottom: spacing.lg },
  qText: {
    fontFamily: fonts.titleSemiBold,
    fontSize: fontSizes.lg,
    lineHeight: 26,
    color: colors.green900,
  },
  qUnderline: {
    width: 48,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.gold500,
    marginTop: spacing.md,
  },
  options: { gap: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: 56,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.base,
  },
  optionActive: {
    backgroundColor: colors.successBgSoft,
    borderColor: colors.green500,
  },
  letter: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterActive: { backgroundColor: colors.green500 },
  letterText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.textBody,
  },
  letterTextActive: { color: colors.white },
  optionText: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.md,
    color: colors.textDark,
  },
  skip: { alignItems: 'center', paddingVertical: spacing.lg, marginTop: spacing.sm },
  skipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.md,
    color: 'rgba(253, 246, 233, 0.5)',
  },
});
