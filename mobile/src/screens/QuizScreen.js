// QuizScreen — immersif (#0b2e1a).
// Timer CIRCULAIRE (SVG, or → orange → rouge) centré au-dessus de la question.
// Feedback immédiat via POST /sessions/answer (mode normal) : option verte/rouge,
// bonne réponse révélée, explication slide-up. AUTO-NEXT : après la réponse, une
// barre or se remplit en 1500ms puis passe à la question suivante (pas de bouton ;
// tap n'importe où = passer tout de suite). Timeout → révélation 2s puis auto-next.
// Anti-triche : tournoi/challenge n'appellent pas l'endpoint (repli surbrillance).
// /sessions/submit reste appelé à la fin (avec session_id).

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  Image,
  ActivityIndicator,
  StyleSheet,
  Pressable,
  Animated,
  Easing,
  BackHandler,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { Lightbulb } from 'lucide-react-native';
import Icon from '../components/Icon';
import { LoadingScreen, ProgressDots, CircularTimer, useToast } from '../components';
import { useGameStore } from '../store/gameStore';
import { sessions as sessionsApi } from '../services/endpoints';
import { hapticLight, hapticSuccess, hapticError } from '../utils/haptics';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { colors, fonts, fontSizes, radius, spacing, shadow } from '../constants/theme';
import { MODE_DURATION_S, TIMED_MODES } from '../constants/config';
import { getQuestionText, getOptionText, normalizeLang } from '../utils/i18n';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const LETTERS = ['A', 'B', 'C', 'D'];
const TIME_BY_LEVEL = { beginner: 30, intermediate: 20, expert: 15 };
// Timer global circulaire (montre) — distinct par mode.
const GT_SIZE = 80;
const GT_STROKE = { blitz: 4, marathon: 3 };
const GT_TRACK = { blitz: 'rgba(255,255,255,0.08)', marathon: 'rgba(255,255,255,0.06)' };
const ANSWER_DELAY_MS = 1500;
const TIMEOUT_DELAY_MS = 2000;
// Modes mixtes (blitz/marathon) : feedback neutre puis avance après 800 ms.
const MIXED_ADVANCE_MS = 800;

// Image optionnelle d'une question (au-dessus de l'énoncé). Skeleton pendant le
// chargement ; en cas d'échec (URL cassée, hors-ligne) on masque l'image en
// silence — le quiz ne doit jamais être bloqué par un média.
function QuestionMedia({ uri }) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // Réinitialise l'état quand la question change (nouvelle URL).
  useEffect(() => { setLoading(true); setFailed(false); }, [uri]);
  if (!uri || failed) return null;
  return (
    <View style={styles.qMediaWrap}>
      {loading ? (
        <View style={styles.qMediaSkeleton}>
          <ActivityIndicator color={colors.gold500} />
        </View>
      ) : null}
      <Image
        source={{ uri }}
        style={styles.qMediaImg}
        resizeMode="contain"
        onLoadEnd={() => setLoading(false)}
        onError={() => { setFailed(true); setLoading(false); }}
      />
    </View>
  );
}

export default function QuizScreen({ navigation }) {
  const { t, i18n } = useTranslation();
  const lang = normalizeLang(i18n.language);
  const toast = useToast();
  const questions = useGameStore((s) => s.questions);
  const currentIndex = useGameStore((s) => s.currentIndex);
  const answerCurrent = useGameStore((s) => s.answerCurrent);
  const next = useGameStore((s) => s.next);
  const isLastQuestion = useGameStore((s) => s.isLastQuestion);
  const submit = useGameStore((s) => s.submit);
  const fillRemainingSkipped = useGameStore((s) => s.fillRemainingSkipped);
  const level = useGameStore((s) => s.level);
  const mode = useGameStore((s) => s.mode);
  const sessionId = useGameStore((s) => s.sessionId);
  const setSessionId = useGameStore((s) => s.setSessionId);
  const setQuizActive = useGameStore((s) => s.setQuizActive);

  const question = questions[currentIndex];
  const total = questions.length;
  const timeLimit = TIME_BY_LEVEL[level] || 30;
  const feedbackEnabled = mode === 'normal';
  // Blitz/Marathon : timer GLOBAL (et non par question), set mixte sans feedback
  // serveur (la correction vient du cache local, mode normal sync).
  const isTimed = TIMED_MODES.includes(mode);

  const [secondsLeft, setSecondsLeft] = useState(timeLimit);
  const [globalLeftMs, setGlobalLeftMs] = useState(
    isTimed ? MODE_DURATION_S[mode] * 1000 : 0
  );
  const [answered, setAnswered] = useState(null); // { selectedIndex, correctIndex, explanation, isCorrect, timedOut }
  const [dotStates, setDotStates] = useState([]);
  const [displayScore, setDisplayScore] = useState(0);
  const [correctStreak, setCorrectStreak] = useState(0);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reduceMotion = useReduceMotion();
  const timerAnim = useRef(new Animated.Value(1)).current; // 1 → 0
  const explainY = useRef(new Animated.Value(40)).current;
  const explainOpacity = useRef(new Animated.Value(0)).current;
  const autoNextAnim = useRef(new Animated.Value(0)).current; // 0 → 1 (barre de délai)
  const streakBounce = useRef(new Animated.Value(0)).current;
  const scoreAnim = useRef(new Animated.Value(0)).current;
  const scoreTarget = useRef(0);
  const intervalRef = useRef(null);
  const advanceRef = useRef(null);
  const advancedRef = useRef(false);
  const questionStart = useRef(Date.now());
  const globalIntervalRef = useRef(null);
  const submittedRef = useRef(false); // garde anti double-soumission (fin Q / expiration)
  const themeRun = useRef({ theme: null, count: 0 }); // série thématique locale (toast marathon)

  // Count-up du score.
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
        duration: reduceMotion ? 0 : 600, // a11y : score affiché direct, sans roulement
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    },
    [scoreAnim, reduceMotion]
  );

  const clearTimers = useCallback(() => {
    clearInterval(intervalRef.current);
    clearTimeout(advanceRef.current);
    timerAnim.stopAnimation();
  }, [timerAnim]);

  const confirmQuit = useCallback(() => {
    Alert.alert(t('quiz.quit'), t('quiz.quitConfirm'), [
      { text: t('quiz.quitConfirmNo'), style: 'cancel' },
      {
        text: t('quiz.quitConfirmYes'),
        style: 'destructive',
        onPress: () => {
          clearTimers();
          navigation.navigate('Tabs', { screen: 'Home' });
        },
      },
    ]);
  }, [clearTimers, navigation, t]);

  useEffect(() => {
    setQuizActive(true);
    return () => setQuizActive(false);
  }, [setQuizActive]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      confirmQuit();
      return true;
    });
    return () => sub.remove();
  }, [confirmQuit]);

  // Termine la session : soumet au serveur et bascule vers le résultat.
  // Idempotent (dernière question OU expiration du timer global). En mode
  // chronométré, on complète les questions non répondues en `skipped`.
  const endSession = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    clearTimers();
    clearInterval(globalIntervalRef.current);
    if (isTimed) fillRemainingSkipped();
    setSubmitting(true);
    const res = await submit();
    navigation.replace('Results', { ok: res.ok, error: res.error, queued: res.queued });
  }, [clearTimers, isTimed, fillRemainingSkipped, submit, navigation]);

  // Avance — idempotent (tap + timeout ne déclenchent qu'une fois).
  const goNext = useCallback(async () => {
    if (advancedRef.current) return;
    advancedRef.current = true;
    clearTimers();
    if (isLastQuestion()) {
      await endSession();
      return;
    }
    next();
  }, [clearTimers, isLastQuestion, endSession, next]);

  // Programme l'auto-next + barre de progression du délai.
  const scheduleAutoNext = useCallback(
    (delay) => {
      autoNextAnim.setValue(0);
      Animated.timing(autoNextAnim, {
        toValue: 1,
        duration: delay,
        easing: Easing.linear,
        useNativeDriver: false,
      }).start();
      advanceRef.current = setTimeout(goNext, delay);
    },
    [autoNextAnim, goNext]
  );

  const revealExplain = useCallback(() => {
    Animated.parallel([
      Animated.timing(explainY, {
        toValue: 0,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(explainOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [explainY, explainOpacity]);

  const handleAnswer = useCallback(
    async ({ selectedIndex, skipped = false, timedOut = false }) => {
      if (answered || checking) return;
      clearTimers();
      const elapsed = Date.now() - questionStart.current;
      answerCurrent({ selectedIndex, elapsedMs: elapsed, skipped });

      // Passer : avance immédiate, sans rien révéler ni appeler l'API.
      if (skipped) {
        setDotStates((d) => {
          const c = [...d];
          c[currentIndex] = 'skipped';
          return c;
        });
        goNext();
        return;
      }

      // Blitz/Marathon : timer global, pas d'appel /sessions/answer par question.
      // Feedback NEUTRE (le correct_index est server-only en mode mixte → on ne
      // révèle ni vert ni rouge) et AUCUN score local (on ne connaît pas la
      // justesse côté client → le compteur monterait même sur les erreurs). Le
      // score réel n'apparaît qu'au résultat, via review[]/score de
      // /sessions/submit (ResultsScreen). En partie, le ⚡ affiche « — pts ».
      if (isTimed) {
        hapticLight();
        // Pastille « répondue » (or, ni correct ni faux — cf. ProgressDots).
        setDotStates((d) => {
          const c = [...d];
          c[currentIndex] = selectedIndex === null ? 'wrong' : 'answered';
          return c;
        });
        setAnswered({ selectedIndex, neutral: true, timedOut });
        // Marathon : toast indicatif de série thématique — basé sur la SÉQUENCE
        // présentée (comme le serveur), pas sur la justesse (inconnue côté client).
        if (mode === 'marathon' && selectedIndex !== null) {
          const r = themeRun.current;
          if (r.theme === question.theme) r.count += 1;
          else {
            r.theme = question.theme;
            r.count = 1;
          }
          if (r.count >= 5) toast.show({ type: 'success', message: t('quiz.themeBonus.x2') });
          else if (r.count === 3) toast.show({ type: 'success', message: t('quiz.themeBonus.x15') });
        }
        scheduleAutoNext(MIXED_ADVANCE_MS);
        return;
      }

      // Tournoi/challenge : pas de feedback serveur (anti-triche).
      if (!feedbackEnabled) {
        setAnswered({ selectedIndex, correctIndex: null, isCorrect: false, timedOut });
        setDotStates((d) => {
          const c = [...d];
          c[currentIndex] = selectedIndex === null ? 'wrong' : 'correct';
          return c;
        });
        scheduleAutoNext(timedOut ? TIMEOUT_DELAY_MS : ANSWER_DELAY_MS);
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
        if (fb.correct) hapticSuccess();
        else hapticError();

        setDotStates((d) => {
          const c = [...d];
          c[currentIndex] = fb.correct ? 'correct' : 'wrong';
          return c;
        });
        setAnswered({
          selectedIndex,
          correctIndex: Number.isInteger(fb.correct_index) ? fb.correct_index : null,
          explanation: fb.explanation || null,
          explanation_en: fb.explanation_en || null,
          isCorrect: !!fb.correct,
          timedOut,
        });
        revealExplain();
        scheduleAutoNext(timedOut ? TIMEOUT_DELAY_MS : ANSWER_DELAY_MS);
      } catch {
        setAnswered({ selectedIndex, correctIndex: null, isCorrect: false, timedOut });
        setDotStates((d) => {
          const c = [...d];
          c[currentIndex] = 'wrong';
          return c;
        });
        scheduleAutoNext(ANSWER_DELAY_MS);
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
      isTimed,
      mode,
      question,
      sessionId,
      setSessionId,
      bumpScore,
      currentIndex,
      goNext,
      revealExplain,
      scheduleAutoNext,
      toast,
      t,
    ]
  );

  // (Re)démarre le timer à chaque nouvelle question. Dépendances : currentIndex
  // (la question) ET timeLimit (durée selon le niveau).
  //
  // `useLayoutEffect` (et non `useEffect`) : au changement de question, React rend
  // d'abord la nouvelle vue alors que `secondsLeft`/`timerAnim` portent ENCORE la
  // valeur figée de la question précédente → un effet post-paint laisserait voir une
  // « frame périmée » (l'ancien chiffre + l'arc figé) avant la réinit. Un effet de
  // layout s'exécute AVANT le paint : `setValue(1)` + `setSecondsLeft(timeLimit)`
  // sont appliqués dans le même cycle, le timer repart toujours plein et net.
  //
  // Le décompte est piloté par une DEADLINE absolue (et non un compteur décrémenté),
  // donc il repart toujours de la valeur correcte (timeLimit du niveau), sans dérive.
  useLayoutEffect(() => {
    advancedRef.current = false;
    setAnswered(null);
    questionStart.current = Date.now();
    explainY.setValue(40);
    explainOpacity.setValue(0);
    autoNextAnim.setValue(0);

    // Modes chronométrés : aucun timer par question (cercle remplacé par le timer
    // global) → on réinitialise seulement l'état de la question.
    if (!isTimed) {
      setSecondsLeft(timeLimit);
      const deadline = questionStart.current + timeLimit * 1000;
      timerAnim.setValue(1);
      Animated.timing(timerAnim, {
        toValue: 0,
        duration: timeLimit * 1000,
        easing: Easing.linear,
        useNativeDriver: false,
      }).start();

      const tick = () => {
        const remaining = Math.max(0, deadline - Date.now());
        setSecondsLeft(Math.ceil(remaining / 1000));
        if (remaining <= 0) {
          clearInterval(intervalRef.current);
          handleAnswer({ selectedIndex: null, timedOut: true });
        }
      };
      intervalRef.current = setInterval(tick, 250);
    }

    return () => {
      clearInterval(intervalRef.current);
      clearTimeout(advanceRef.current);
      // Stoppe l'animation en cours AVANT le re-déclenchement de l'effet.
      timerAnim.stopAnimation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, timeLimit, isTimed]);

  // Timer GLOBAL (blitz/marathon) : une seule deadline pour toute la session.
  // À l'expiration → soumission auto (questions restantes en `skipped`).
  useEffect(() => {
    if (!isTimed) return undefined;
    const deadline = Date.now() + MODE_DURATION_S[mode] * 1000;
    setGlobalLeftMs(MODE_DURATION_S[mode] * 1000);
    const id = setInterval(() => {
      const left = deadline - Date.now();
      setGlobalLeftMs(Math.max(0, left));
      if (left <= 0) {
        clearInterval(id);
        endSession();
      }
    }, 250);
    globalIntervalRef.current = id;
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTimed, mode]);

  // Bounce du badge de série.
  useEffect(() => {
    if (correctStreak >= 3) {
      streakBounce.setValue(0);
      Animated.spring(streakBounce, { toValue: 1, useNativeDriver: true, friction: 4 }).start();
    }
  }, [correctStreak, streakBounce]);

  // Localisation FR/EN — recalculée si la question change OU si la langue change
  // pendant la partie (toggle FR↔EN dans Profil) : le quiz en cours se met à jour.
  const displayText = useMemo(() => getQuestionText(question, lang), [question, lang]);
  const displayOptions = useMemo(
    () => (question?.options || []).map((opt, i) => ({
      ...opt,
      index: opt.index ?? i,
      label: getOptionText(opt, lang),
    })),
    [question, lang]
  );

  if (submitting) return <LoadingScreen message={t('quiz.misc.submitting')} />;
  if (!question) return <LoadingScreen message={t('common.loading')} />;

  const streakScale = streakBounce.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  const autoNextWidth = autoNextAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {/* Header — bandeau vert, coins bas arrondis */}
      <View style={styles.header}>
        <Pressable onPress={confirmQuit} hitSlop={10} style={styles.quitBtn}>
          <Text style={styles.quitText}>✕</Text>
        </Pressable>
        <View style={styles.qBadge}>
          <Text style={styles.qBadgeText}>
            {t('quiz.question', { current: currentIndex + 1, total })}
          </Text>
        </View>
        {isTimed ? (
          // Mode mixte : score serveur-only → on masque le slot (cale-droite pour
          // garder le badge « Q x/N » centré, comme le bouton ✕ à gauche).
          <View style={styles.headerSpacer} />
        ) : (
          <Text style={styles.score}>⚡ {displayScore} {t('quiz.pts')}</Text>
        )}
      </View>

      {/* Timer : global (blitz/marathon) ou circulaire par question (normal).
          Pas de `key` sur le cercle : la valeur est pilotée par le parent et
          réinitialisée à chaque question (un remount afficherait une frame périmée). */}
      <View style={styles.timerWrap}>
        {isTimed ? (
          <GlobalTimer mode={mode} leftMs={globalLeftMs} totalMs={MODE_DURATION_S[mode] * 1000} t={t} />
        ) : (
          <CircularTimer size={80} strokeWidth={5} progress={timerAnim} seconds={secondsLeft} />
        )}
      </View>

      {/* Progress dots */}
      <View style={styles.dots}>
        <ProgressDots total={total} current={currentIndex} states={dotStates} />
      </View>

      {/* Streak badge */}
      {correctStreak >= 3 && !answered ? (
        <Animated.View style={[styles.streak, { transform: [{ scale: streakScale }] }]}>
          <Text style={styles.streakText}>{t('quiz.streak', { n: correctStreak })}</Text>
        </Animated.View>
      ) : null}

      {/* Question */}
      <View style={styles.card}>
        {question.media_url ? <QuestionMedia uri={question.media_url} /> : null}
        <Text style={styles.question}>{displayText}</Text>
        <View style={styles.goldBar} />
      </View>

      {/* Options A–D */}
      <View style={styles.options}>
        {displayOptions.map((opt, i) => (
          <OptionRow
            key={opt.index}
            letter={LETTERS[i]}
            text={opt.label}
            optionIndex={opt.index}
            answered={answered}
            onPress={() => handleAnswer({ selectedIndex: opt.index })}
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
          <Text style={styles.skipText}>{t('quiz.skip')}</Text>
        </Pressable>
      ) : null}

      {/* Tap-to-skip : couvre la zone pour avancer immédiatement */}
      {answered ? (
        <Pressable style={styles.tapToSkip} onPress={goNext} />
      ) : null}

      {/* Explication + barre auto-next — uniquement hors modes chronométrés
          (en blitz/marathon, on reste minimal pour ne pas perdre de temps). */}
      {!isTimed && answered && answered.correctIndex !== null ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.explain, { opacity: explainOpacity, transform: [{ translateY: explainY }] }]}
        >
          {(() => {
            // Explication dans la langue active (repli FR si EN absent).
            const expl = lang === 'en' && answered.explanation_en
              ? answered.explanation_en
              : answered.explanation;
            if (expl) {
              return (
                <View style={styles.explainRow}>
                  <Icon icon={Lightbulb} size={16} color={colors.textDark} />
                  <Text style={[styles.explainText, styles.explainTextFlex]}>{expl}</Text>
                </View>
              );
            }
            return (
              <Text style={styles.explainText}>
                {answered.isCorrect ? t('quiz.goodAnswer') : t('quiz.misc.wrongAnswer')}
              </Text>
            );
          })()}
          <View style={styles.autoTrack}>
            <Animated.View style={[styles.autoFill, { width: autoNextWidth }]} />
          </View>
        </Animated.View>
      ) : null}
    </SafeAreaView>
  );
}

// Timer global des modes chronométrés — cercle SVG « montre » qui se vide, M:SS
// au centre, libellé du mode dessous. Blitz : anneau rouge. Marathon : anneau or.
// Pulse dans les 10 dernières secondes (chiffres en rouge).
function GlobalTimer({ mode, leftMs, totalMs, t }) {
  const seconds = Math.max(0, Math.ceil(leftMs / 1000));
  const urgent = seconds <= 10;
  const label = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const reduceMotion = useReduceMotion();
  const pulse = useRef(new Animated.Value(1)).current;
  const progress = useRef(new Animated.Value(1)).current; // 1 plein → 0 vide

  // Vidage régulier de l'anneau sur toute la durée (démarré une fois au montage).
  useEffect(() => {
    progress.setValue(1);
    const anim = Animated.timing(progress, {
      toValue: 0,
      duration: totalMs,
      easing: Easing.linear,
      useNativeDriver: false, // strokeDashoffset n'est pas pilotable en natif
    });
    anim.start();
    return () => anim.stop();
  }, [progress, totalMs]);

  // Pulsation sous les 10 s — emphase décorative, coupée si « réduire les animations ».
  useEffect(() => {
    if (!urgent || reduceMotion) {
      pulse.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 400, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 400, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
      pulse.setValue(1);
    };
  }, [urgent, pulse, reduceMotion]);

  const sw = GT_STROKE[mode] || 4;
  const r = (GT_SIZE - sw) / 2;
  const circumference = 2 * Math.PI * r;
  const dashoffset = progress.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] });
  const arcColor = mode === 'blitz' ? colors.red400 : colors.gold500;
  const labelColor = mode === 'blitz' ? colors.gold500 : colors.gold400;
  const labelText =
    mode === 'blitz' ? `⚡ ${t('gameStart.modes.blitz.name')}` : `🏃 ${t('gameStart.modes.marathon.name')}`;

  return (
    <Animated.View style={[styles.gtWrap, { transform: [{ scale: pulse }] }]}>
      <View style={styles.gtCircle}>
        <Svg width={GT_SIZE} height={GT_SIZE}>
          <Circle
            cx={GT_SIZE / 2}
            cy={GT_SIZE / 2}
            r={r}
            stroke={GT_TRACK[mode] || GT_TRACK.blitz}
            strokeWidth={sw}
            fill="none"
          />
          <AnimatedCircle
            cx={GT_SIZE / 2}
            cy={GT_SIZE / 2}
            r={r}
            stroke={arcColor}
            strokeWidth={sw}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={dashoffset}
            transform={`rotate(-90 ${GT_SIZE / 2} ${GT_SIZE / 2})`}
          />
        </Svg>
        <View style={styles.gtCenter} pointerEvents="none">
          <Text style={[styles.gtValue, urgent && styles.gtValueUrgent]}>{label}</Text>
        </View>
      </View>
      <Text style={[styles.gtLabel, { color: labelColor }]}>{labelText}</Text>
    </Animated.View>
  );
}

function OptionRow({ letter, text, optionIndex, answered, onPress }) {
  const { t } = useTranslation();
  const scale = useRef(new Animated.Value(1)).current;
  const checkScale = useRef(new Animated.Value(0)).current;

  const neutral = !!(answered && answered.neutral);
  const isSelected = answered && answered.selectedIndex === optionIndex;
  const isCorrectOpt = answered && answered.correctIndex === optionIndex;
  const revealing =
    !neutral && answered && answered.correctIndex !== null && answered.correctIndex !== undefined;

  // Mode mixte : ✓ qui « pop » sur le badge de l'option choisie (confirmation
  // visuelle du tap — pas de vert/rouge, la justesse reste serveur-only).
  const showCheck = !!(neutral && isSelected);
  useEffect(() => {
    if (!showCheck) {
      checkScale.setValue(0);
      return undefined;
    }
    Animated.sequence([
      Animated.timing(checkScale, { toValue: 1.2, duration: 120, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(checkScale, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();
    return undefined;
  }, [showCheck, checkScale]);

  let container = styles.optDefault;
  let badge = styles.badgeDefault;
  let badgeText = styles.badgeTextDefault;
  let label = styles.optTextDefault;
  let glyph = letter;
  let showGoodLabel = false;

  if (neutral) {
    // Mode mixte : pas de vert/rouge. Option choisie en or (badge blanc/or),
    // les autres grisées (opacité réduite).
    if (isSelected) {
      container = styles.optNeutral;
      badge = styles.badgeOnGold;
      badgeText = styles.badgeTextGold;
      label = styles.optTextNeutral;
    } else {
      container = styles.optDimmed;
    }
  } else if (revealing) {
    if (isCorrectOpt) {
      container = styles.optCorrect;
      badge = styles.badgeCorrect;
      badgeText = styles.badgeTextOnColor;
      label = styles.optTextCorrect;
      glyph = '✓';
      showGoodLabel = !isSelected;
    } else if (isSelected) {
      container = styles.optWrong;
      badge = styles.badgeWrong;
      badgeText = styles.badgeTextOnColor;
      label = styles.optTextWrong;
      glyph = '✗';
    }
  } else if (isSelected) {
    container = styles.optSelected;
  }

  const onPressIn = () =>
    Animated.timing(scale, { toValue: 0.97, duration: 50, useNativeDriver: true }).start();
  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={() => {
          hapticLight();
          onPress();
        }}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={!!answered}
        style={[styles.option, container]}
      >
        <View style={[styles.badge, badge]}>
          {showCheck ? (
            <Animated.Text style={[styles.badgeText, badgeText, { transform: [{ scale: checkScale }] }]}>
              ✓
            </Animated.Text>
          ) : (
            <Text style={[styles.badgeText, badgeText]}>{glyph}</Text>
          )}
        </View>
        <View style={styles.optBody}>
          {showGoodLabel ? <Text style={styles.goodLabel}>{t('quiz.goodAnswer')}</Text> : null}
          <Text style={[styles.optText, label]}>{text}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.green900, paddingHorizontal: spacing.lg },

  // A. Header — bandeau vert plein largeur, coins bas arrondis.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: -spacing.lg, // plein largeur (le root est paddé)
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
    backgroundColor: colors.green900,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderOnDark,
  },
  quitBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  quitText: { fontSize: fontSizes.base, color: colors.white },
  qBadge: {
    backgroundColor: colors.green700,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  qBadgeText: { fontFamily: fonts.titleBold, fontSize: fontSizes.md, color: colors.white },
  score: { fontFamily: fonts.titleExtraBold, fontSize: fontSizes.lg, color: colors.gold500 },
  headerSpacer: { width: 36 }, // équilibre le bouton ✕ → badge « Q x/N » centré

  timerWrap: { alignItems: 'center', marginTop: spacing.md, minHeight: 104, justifyContent: 'center' },
  dots: { marginTop: spacing.md },

  // B. Timer global circulaire (montre) — anneau par mode + M:SS + libellé.
  gtWrap: { alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  gtCircle: { width: GT_SIZE, height: GT_SIZE, alignItems: 'center', justifyContent: 'center' },
  gtCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  gtValue: { fontFamily: fonts.titleBlack, fontSize: 28, color: colors.white },
  gtValueUrgent: { color: colors.red400 },
  gtLabel: { fontFamily: fonts.titleBold, fontSize: 10 },

  streak: {
    position: 'absolute',
    top: 60,
    right: spacing.lg,
    backgroundColor: colors.gold500,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    zIndex: 5,
    ...shadow.gold,
  },
  streakText: { fontFamily: fonts.titleBold, fontSize: fontSizes.md, color: colors.green900 },

  // D. Carte question — surface flottante, barre or sous le texte.
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: 20,
    marginTop: spacing.lg,
    shadowColor: colors.green900,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  question: { fontFamily: fonts.titleSemiBold, fontSize: 17, lineHeight: 26, color: colors.green900 },
  goldBar: { width: 40, height: 3, borderRadius: 2, backgroundColor: colors.gold500, marginTop: spacing.sm },
  // Image optionnelle de la question (au-dessus de l'énoncé).
  qMediaWrap: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: spacing.md,
    backgroundColor: colors.cream,
  },
  qMediaImg: { width: '100%', height: '100%' },
  qMediaSkeleton: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },

  // E. Boutons réponse.
  options: { marginTop: spacing.lg, gap: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    borderRadius: radius.base, // 14
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1.5,
  },
  optDefault: { backgroundColor: colors.white, borderColor: colors.border },
  optSelected: { backgroundColor: colors.successBgSoft, borderColor: colors.green500 },
  optCorrect: { backgroundColor: colors.successBg, borderColor: colors.green500 },
  optWrong: { backgroundColor: colors.errorBg, borderColor: colors.red400 },
  // Mode mixte (blitz/marathon) : feedback neutre (or / grisé).
  optNeutral: { backgroundColor: colors.gold500, borderColor: colors.gold500 },
  optDimmed: { backgroundColor: colors.white, borderColor: colors.border, opacity: 0.4 },

  badge: { width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  badgeDefault: { backgroundColor: colors.green900 },
  badgeCorrect: { backgroundColor: colors.green500 },
  badgeWrong: { backgroundColor: colors.red400 },
  badgeOnGold: { backgroundColor: colors.white },
  badgeText: { fontFamily: fonts.titleBold, fontSize: fontSizes.md },
  badgeTextDefault: { color: colors.white },
  badgeTextOnColor: { color: colors.white },
  badgeTextGold: { color: colors.gold500 },
  optBody: { flex: 1 },
  optText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.md },
  optTextDefault: { color: colors.textBody },
  optTextCorrect: { color: colors.successText, fontFamily: fonts.bodySemiBold },
  optTextWrong: { color: colors.red600 },
  optTextNeutral: { color: colors.white, fontFamily: fonts.bodySemiBold },
  goodLabel: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.successText, marginBottom: 2 },

  skip: { alignItems: 'center', paddingVertical: spacing.lg, marginTop: 'auto' },
  skipText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.md, color: colors.textOnDarkFaint },

  tapToSkip: { ...StyleSheet.absoluteFillObject },

  // F. Explication (mode normal) — fond crème, liseré or à gauche.
  explain: {
    marginTop: 'auto',
    marginBottom: spacing.md,
    backgroundColor: colors.cream,
    borderRadius: radius.lg,
    borderLeftWidth: 3,
    borderLeftColor: colors.gold500,
    padding: spacing.lg,
    zIndex: 6,
  },
  explainText: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.sm, color: colors.textDark, lineHeight: 20 },
  explainRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  explainTextFlex: { flex: 1 },
  autoTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(11,46,26,0.1)',
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  autoFill: { height: '100%', borderRadius: 2, backgroundColor: colors.gold500 },
});
