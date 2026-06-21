// QuizScreen — question + 4 options (A–D), timer dégressif, progress dots,
// indicateur de série. Le serveur recalcule le score à la soumission ; ici on
// ne révèle pas la bonne réponse (anti-triche, API §5).

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, Pressable, Text, BackHandler, Alert } from 'react-native';
import { Screen, Title, Body, Loader, ProgressDots } from '../components';
import { useGameStore } from '../store/gameStore';
import { GAME } from '../constants/config';
import { colors, fonts, fontSizes, radius, spacing } from '../constants/theme';
import { themeEmoji, themeLabel } from '../utils/format';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

export default function QuizScreen({ navigation }) {
  const questions = useGameStore((s) => s.questions);
  const currentIndex = useGameStore((s) => s.currentIndex);
  const theme = useGameStore((s) => s.theme);
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
  const [locked, setLocked] = useState(false); // évite double-réponse pendant transition
  const [submitting, setSubmitting] = useState(false);
  const questionStart = useRef(Date.now());
  const timerRef = useRef(null);

  // Empêche de quitter une partie par le bouton retour Android.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      Alert.alert('Quitter la partie ?', 'Ta progression sera perdue.', [
        { text: 'Continuer', style: 'cancel' },
        { text: 'Quitter', style: 'destructive', onPress: () => navigation.navigate('Tabs') },
      ]);
      return true;
    });
    return () => sub.remove();
  }, [navigation]);

  const elapsedMs = useCallback(
    () => Date.now() - questionStart.current,
    []
  );

  // Avance vers la question suivante ou soumet la partie.
  const advance = useCallback(
    async ({ selectedIndex, skipped }) => {
      if (locked) return;
      setLocked(true);
      clearInterval(timerRef.current);
      answerCurrent({ selectedIndex, elapsedMs: elapsedMs(), skipped });

      if (isLastQuestion()) {
        setSubmitting(true);
        const res = await submit();
        setSubmitting(false);
        navigation.replace('Results', { ok: res.ok, error: res.error });
        return;
      }
      // Court délai de transition.
      setTimeout(() => {
        next();
        setSelected(null);
        setSecondsLeft(GAME.timePerQuestionS);
        questionStart.current = Date.now();
        setLocked(false);
      }, 250);
    },
    [locked, answerCurrent, elapsedMs, isLastQuestion, submit, next, navigation]
  );

  // Timer dégressif par question ; timeout → réponse nulle.
  useEffect(() => {
    questionStart.current = Date.now();
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current);
          advance({ selectedIndex: null, skipped: false });
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  const onSelect = (index) => {
    if (locked || selected !== null) return;
    setSelected(index);
    // Petit délai pour le feedback visuel avant d'enchaîner.
    setTimeout(() => advance({ selectedIndex: index, skipped: false }), 220);
  };

  const onSkip = () => advance({ selectedIndex: null, skipped: true });

  if (submitting) return <Loader dark message="Calcul du score…" />;
  if (!question) return <Loader dark message="Chargement…" />;

  const progress = (secondsLeft / GAME.timePerQuestionS) * 100;
  const urgent = secondsLeft <= 5;

  // États des points : répondu / passé / timeout (correct/faux inconnus ici).
  const dotStates = answers.map((a) =>
    a.skipped ? 'skipped' : a.selected_index === null ? 'wrong' : 'correct'
  );

  return (
    <Screen dark edges={['top', 'bottom']}>
      {/* Barre supérieure : compteur + série + timer */}
      <View style={styles.topBar}>
        <Body color={colors.textOnDarkMuted}>
          {themeEmoji(theme)} {themeLabel(theme)}
        </Body>
        {streak >= GAME.streakX15 ? (
          <View style={styles.streakPill}>
            <Text style={styles.streakText}>🔥 Série {streak}</Text>
          </View>
        ) : (
          <Body color={colors.textOnDarkMuted}>
            {currentIndex + 1}/{total}
          </Body>
        )}
        <View style={[styles.timer, urgent && styles.timerUrgent]}>
          <Text style={[styles.timerText, urgent && styles.timerTextUrgent]}>
            {secondsLeft}s
          </Text>
        </View>
      </View>

      {/* Barre de temps dégressive */}
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${progress}%` },
            urgent && styles.progressFillUrgent,
          ]}
        />
      </View>

      <ProgressDots total={total} current={currentIndex} states={dotStates} />

      {/* Question */}
      <View style={styles.questionBox}>
        <Title color={colors.cream} style={styles.questionText}>
          {question.text}
        </Title>
      </View>

      {/* Options A–D */}
      <View style={styles.options}>
        {(question.options || []).map((opt, i) => {
          const active = selected === opt.index;
          return (
            <Pressable
              key={opt.index ?? i}
              onPress={() => onSelect(opt.index ?? i)}
              disabled={locked || selected !== null}
              style={[styles.option, active && styles.optionActive]}
            >
              <View style={[styles.letter, active && styles.letterActive]}>
                <Text style={[styles.letterText, active && styles.letterTextActive]}>
                  {OPTION_LETTERS[i]}
                </Text>
              </View>
              <Text style={[styles.optionText, active && styles.optionTextActive]}>
                {opt.text}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable onPress={onSkip} disabled={locked} style={styles.skip}>
        <Body color={colors.textOnDarkMuted}>Passer ›</Body>
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
  streakPill: {
    backgroundColor: colors.gold400,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  streakText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.green900,
  },
  timer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.green300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerUrgent: { borderColor: colors.red400 },
  timerText: {
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.sm,
    color: colors.cream,
  },
  timerTextUrgent: { color: colors.red400 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.borderOnDark,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.green300,
    borderRadius: 3,
  },
  progressFillUrgent: { backgroundColor: colors.red400 },
  questionBox: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: spacing.lg,
  },
  questionText: { fontSize: fontSizes.xl, lineHeight: 32, textAlign: 'center' },
  options: { gap: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.cardOnDark,
    borderWidth: 1.5,
    borderColor: colors.borderOnDark,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  optionActive: { borderColor: colors.gold400, backgroundColor: colors.green700 },
  letter: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.green700,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterActive: { backgroundColor: colors.gold400 },
  letterText: {
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.md,
    color: colors.cream,
  },
  letterTextActive: { color: colors.green900 },
  optionText: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.md,
    color: colors.cream,
  },
  optionTextActive: { color: colors.cream },
  skip: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.sm },
});
