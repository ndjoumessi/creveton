// TournamentLiveScreen — manche de tournoi en temps réel (API §13).
// Le serveur est autoritaire : il diffuse les questions, fixe la deadline,
// révèle la bonne réponse et le classement. L'écran ne fait que refléter les
// phases du store (waiting / question / reveal / ended) et envoyer le choix.
//
// Timer : alimenté par `deadlineAt` (epoch ms serveur). À l'expiration sans
// réponse → on soumet selected_index null (le serveur a déjà tranché de son côté).
// Anti double-submit : les boutons se verrouillent dès la sélection.

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  Animated,
  Easing,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lightbulb, Check, WifiOff, X } from 'lucide-react-native';
import Icon from '../components/Icon';
import { AnswerOption, CircularTimer, Title, Heading, Body, Label } from '../components';
import { useTournamentSocket } from '../hooks/useTournamentSocket';
import { useTournamentStore } from '../store/tournamentStore';
import { useAuthStore } from '../store/authStore';
import { disconnectSocket } from '../services/socket';
import { radius, spacing, shadow, MIN_TOUCH } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { medalEmoji } from '../utils/rank';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const toMs = (v) => (v == null ? 0 : typeof v === 'number' ? v : new Date(v).getTime());

// Watchdog de connexion : si la manche n'a pas démarré après ce délai, on bascule
// l'écran d'attente en état d'erreur (plutôt que de laisser le spinner tourner).
const WAIT_TIMEOUT_MS = 30000;

export default function TournamentLiveScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const tournamentId = route.params?.tournamentId;
  const { submitAnswer } = useTournamentSocket(tournamentId);

  const phase = useTournamentStore((s) => s.phase);
  const question = useTournamentStore((s) => s.question);
  const reveal = useTournamentStore((s) => s.reveal);
  const leaderboard = useTournamentStore((s) => s.leaderboard);
  const myScore = useTournamentStore((s) => s.myScore);
  const myRank = useTournamentStore((s) => s.myRank);
  const ended = useTournamentStore((s) => s.ended);
  const myId = useMemo(() => useAuthStore.getState().user?.id, []);

  // Choix local (source de vérité UI pour le verrouillage + la coloration reveal).
  const [picked, setPicked] = useState(null);
  const [answered, setAnswered] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  // La manche n'a jamais démarré (socket bloqué / room vide) → état d'erreur.
  const [connectionError, setConnectionError] = useState(false);

  const timerAnim = useRef(new Animated.Value(1)).current; // 1 → 0
  const intervalRef = useRef(null);
  const waitTimeoutRef = useRef(null);

  // Watchdog 30s : armé au montage tant qu'on est en attente. Désarmé au démontage.
  useEffect(() => {
    waitTimeoutRef.current = setTimeout(() => setConnectionError(true), WAIT_TIMEOUT_MS);
    return () => clearTimeout(waitTimeoutRef.current);
  }, []);

  // Dès qu'une question arrive (ou que la manche se termine), on ne « waiting » plus :
  // on désarme le watchdog pour qu'il ne se déclenche jamais après coup.
  useEffect(() => {
    if (question || phase === 'ended') {
      clearTimeout(waitTimeoutRef.current);
      waitTimeoutRef.current = null;
      setConnectionError(false);
    }
  }, [question, phase]);

  // (Re)démarre le timer à chaque nouvelle question.
  useEffect(() => {
    if (phase !== 'question' || !question) return undefined;
    setPicked(null);
    setAnswered(false);

    const deadlineMs = toMs(question.deadlineAt);
    const totalMs = Math.max(1, question.durationMs || deadlineMs - Date.now());
    const startRemaining = Math.max(0, deadlineMs - Date.now());

    timerAnim.setValue(Math.min(1, startRemaining / totalMs));
    Animated.timing(timerAnim, {
      toValue: 0,
      duration: startRemaining,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    let timedOut = false;
    const tick = () => {
      const remaining = Math.max(0, deadlineMs - Date.now());
      setSecondsLeft(Math.ceil(remaining / 1000));
      if (remaining <= 0 && !timedOut) {
        timedOut = true;
        clearInterval(intervalRef.current);
        // Timeout client : soumettre une non-réponse si le joueur n'a rien choisi.
        setAnswered((wasAnswered) => {
          if (!wasAnswered) submitAnswer(null);
          return true;
        });
      }
    };
    tick();
    intervalRef.current = setInterval(tick, 250);

    return () => {
      clearInterval(intervalRef.current);
      timerAnim.stopAnimation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, question?.index, question?.deadlineAt]);

  const onPick = (optionIndex) => {
    if (answered || phase !== 'question') return;
    setPicked(optionIndex);
    setAnswered(true);
    submitAnswer(optionIndex);
  };

  // Quitter la manche en cours : confirmation destructive puis fermeture socket +
  // retour. `disconnectSocket` est la même fermeture que celle du hook au démontage.
  const onQuit = () => {
    Alert.alert(t('tournament.quitTitle'), t('tournament.quitMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.quit'),
        style: 'destructive',
        onPress: () => {
          disconnectSocket();
          navigation.goBack();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {phase === 'ended' ? (
        <EndedView
          t={t}
          ended={ended}
          myScore={myScore}
          myRank={myRank}
          myId={myId}
          onBack={() => navigation.navigate('Tabs', { screen: 'Tournaments' })}
        />
      ) : phase === 'waiting' || !question ? (
        <WaitingView
          t={t}
          leaderboard={leaderboard}
          myId={myId}
          connectionError={connectionError}
          onBack={() => navigation.goBack()}
        />
      ) : (
        <>
          {/* Sortie de secours pendant la manche active (question / reveal) */}
          <Pressable
            onPress={onQuit}
            hitSlop={8}
            style={styles.quitBtn}
            accessibilityRole="button"
            accessibilityLabel={t('common.quit')}
          >
            <Icon icon={X} size={24} color={colors.textOnDarkMuted} />
          </Pressable>

          {/* Barre haute : compteur + score perso */}
          <View style={styles.topBar}>
            <Label size="md" style={styles.counter}>
              {t('tournamentLive.counter', { current: question.index + 1, total: question.total })}
            </Label>
            <Title size="lg" style={styles.score}>⚡ {myScore} {t('tournamentLive.pts')}</Title>
          </View>

          {/* Timer circulaire serveur-autoritaire */}
          <View style={styles.timerWrap}>
            <CircularTimer size={84} strokeWidth={5} progress={timerAnim} seconds={secondsLeft} />
          </View>

          {/* Question */}
          <View style={styles.card}>
            <Heading size={17} style={styles.question}>{question.text}</Heading>
            <View style={styles.underline} />
          </View>

          {/* Options — mapping picked/reveal → état visuel AnswerOption :
              au reveal, correct/incorrect (le serveur tranche) ; avant, sélection
              simple + autres options grisées dès que la réponse est envoyée. */}
          <View style={styles.options}>
            {(question.options || []).map((opt, i) => {
              const idx = opt.index ?? i;
              const revealing = phase === 'reveal';
              const isPicked = picked === idx;
              let state = 'idle';
              if (revealing) {
                if (reveal?.correctIndex === idx) state = 'correct';
                else if (isPicked) state = 'incorrect';
              } else if (isPicked) {
                state = 'selected';
              } else if (answered) {
                state = 'dimmed';
              }
              return (
                <AnswerOption
                  key={idx}
                  letter={LETTERS[i] || '•'}
                  text={opt.text}
                  state={state}
                  selected={isPicked}
                  disabled={answered || revealing}
                  onPress={() => onPick(idx)}
                />
              );
            })}
          </View>

          {/* État sous la question : envoyé / révélation */}
          {phase === 'reveal' ? (
            <RevealPanel t={t} reveal={reveal} myId={myId} />
          ) : answered ? (
            <Body weight="semibold" size="md" style={styles.answeredHint}>✓ {t('tournamentLive.answered')}</Body>
          ) : null}
        </>
      )}
    </SafeAreaView>
  );
}

function RevealPanel({ t, reveal, myId }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.revealPanel}>
      {reveal?.explanation ? (
        <View style={styles.explainBox}>
          <Icon icon={Lightbulb} size={18} color={colors.textDark} />
          <Body size="md" style={[styles.explainText, styles.explainTextFlex]}>{reveal.explanation}</Body>
        </View>
      ) : (
        <View style={styles.explainBox}>
          <Icon icon={Check} size={18} color={colors.textDark} />
          <Body size="md" style={[styles.explainText, styles.explainTextFlex]}>{t('tournamentLive.correctAnswer')}</Body>
        </View>
      )}
      <MiniLeaderboard t={t} board={reveal?.leaderboard} myId={myId} limit={5} />
    </View>
  );
}

function WaitingView({ t, leaderboard, myId, connectionError, onBack }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Le socket n'a jamais livré de manche : on remplace le spinner par un état
  // d'erreur avec une sortie explicite (le spinner ne tournera plus indéfiniment).
  if (connectionError) {
    return (
      <View style={styles.centered}>
        <Icon icon={WifiOff} size={48} color={colors.textOnDarkMuted} />
        <Title size="xl" style={styles.waitingTitle}>{t('tournament.connectionError')}</Title>
        <Body size="md" style={styles.waitingSubtitle}>{t('tournament.connectionErrorMsg')}</Body>
        <Pressable
          onPress={onBack}
          hitSlop={8}
          style={styles.errorBackBtn}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Title size="base" style={styles.errorBackText}>{t('common.back')}</Title>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.centered}>
      <Body size={56} style={styles.waitingEmoji}>🏆</Body>
      <Title size="xl" style={styles.waitingTitle}>{t('tournamentLive.waitingTitle')}</Title>
      <Body size="md" style={styles.waitingSubtitle}>{t('tournamentLive.waitingSubtitle')}</Body>
      <ActivityIndicator color={colors.gold500} style={styles.spinner} />
      {leaderboard?.length ? (
        <View style={styles.waitingBoard}>
          <MiniLeaderboard t={t} board={leaderboard} myId={myId} limit={5} />
        </View>
      ) : null}
    </View>
  );
}

function EndedView({ t, ended, myScore, myRank, myId, onBack }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const board = ended?.leaderboard || [];
  const podium = myRank != null && myRank <= 3;
  return (
    <ScrollView
      style={styles.endedScroll}
      contentContainerStyle={styles.endedContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.endedHero}>
        {podium ? (
          <Body size={64} style={styles.endedMedal}>{medalEmoji(myRank)}</Body>
        ) : (
          <Body size={56} style={styles.waitingEmoji}>🎉</Body>
        )}
        <Title style={styles.endedTitle}>{t('tournamentLive.endedTitle')}</Title>
        <View style={styles.endedStats}>
          <View style={styles.endedStat}>
            <Label style={styles.endedStatLabel}>{t('tournamentLive.rank')}</Label>
            <Title style={styles.endedStatValue}>{myRank != null ? `#${myRank}` : '—'}</Title>
          </View>
          <View style={styles.endedStatDivider} />
          <View style={styles.endedStat}>
            <Label style={styles.endedStatLabel}>{t('tournamentLive.score')}</Label>
            <Title style={styles.endedStatValue}>{myScore}</Title>
          </View>
        </View>
        <Body size="sm" style={styles.xpNote}>{t('tournamentLive.xpNote')}</Body>
      </View>

      <View style={styles.endedBoard}>
        <MiniLeaderboard t={t} board={board} myId={myId} limit={10} />
      </View>

      <Pressable style={styles.backButton} onPress={onBack}>
        <Title size="base" style={styles.backButtonText}>{t('tournamentLive.back')}</Title>
      </Pressable>
    </ScrollView>
  );
}

// Classement live. Les entrées n'ont pas de nom (anti-jointure temps réel) :
// on affiche le rang + le score, et on met en évidence la ligne du joueur.
function MiniLeaderboard({ t, board, myId, limit = 5 }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const rows = Array.isArray(board) ? board.slice(0, limit) : [];
  return (
    <View style={styles.board}>
      <Heading size="md" style={styles.boardTitle}>{t('tournamentLive.leaderboard')}</Heading>
      {rows.length === 0 ? (
        <Body size="sm" style={styles.boardEmpty}>{t('tournamentLive.leaderboardEmpty')}</Body>
      ) : (
        rows.map((e) => {
          const me = e.user_id === myId;
          const medal = medalEmoji(e.rank);
          return (
            <View key={e.user_id} style={[styles.boardRow, me && styles.boardRowMe]}>
              <Title size="md" style={[styles.boardRank, me && styles.boardTextMe]}>
                {medal || `#${e.rank}`}
              </Title>
              <Body weight="medium" size="md" style={[styles.boardName, me && styles.boardTextMe]} numberOfLines={1}>
                {me ? t('tournamentLive.you') : `${t('tournamentLive.player')} ${e.rank}`}
              </Body>
              <Body weight="bold" size="md" style={[styles.boardScore, me && styles.boardTextMe]}>
                {e.score} {t('tournamentLive.pts')}
              </Body>
            </View>
          );
        })
      )}
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.green900, paddingHorizontal: spacing.lg },

  quitBtn: {
    minWidth: MIN_TOUCH,
    minHeight: MIN_TOUCH,
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  counter: { color: colors.textOnDarkMuted },
  score: { color: colors.gold500 },

  timerWrap: { alignItems: 'center', marginTop: spacing.xs },

  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: 20,
    marginTop: spacing.lg,
  },
  question: { lineHeight: 26, color: colors.green900 },
  underline: { width: 32, height: 3, borderRadius: 2, backgroundColor: colors.gold500, marginTop: spacing.md },

  // Boutons réponse — rendus par <AnswerOption /> (états/feedback inclus).
  options: { marginTop: spacing.lg, gap: spacing.sm },

  answeredHint: {
    marginTop: spacing.lg,
    textAlign: 'center',
    color: colors.green300,
  },

  revealPanel: { marginTop: spacing.lg, gap: spacing.md },
  explainBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.cream,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  explainTextFlex: { flex: 1 },
  explainText: {
    color: colors.textDark,
    lineHeight: 21,
  },

  // Waiting
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  // Emojis (waitingEmoji/endedMedal) : taille via la prop `size`, couleur sans effet.
  waitingEmoji: {},
  waitingTitle: {
    color: colors.cream,
    textAlign: 'center',
  },
  waitingSubtitle: {
    color: colors.textOnDarkMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  spinner: { marginTop: spacing.md },
  waitingBoard: { alignSelf: 'stretch', marginTop: spacing.xl },
  errorBackBtn: {
    minHeight: MIN_TOUCH,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gold500,
    ...shadow.gold,
  },
  errorBackText: { color: colors.green900 },

  // Ended
  endedScroll: { flex: 1 },
  endedContent: { paddingVertical: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  endedMedal: {},
  endedHero: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl },
  endedTitle: { color: colors.gold500 },
  endedStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardOnDark,
    borderRadius: radius.xl,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.md,
    gap: spacing.xl,
  },
  endedStat: { alignItems: 'center', gap: spacing.xxs },
  endedStatDivider: { width: 1, height: 36, backgroundColor: colors.borderOnDark },
  endedStatLabel: { color: colors.textOnDarkMuted },
  endedStatValue: { color: colors.cream },
  xpNote: {
    color: colors.green300,
    marginTop: spacing.xs,
  },
  endedBoard: {},
  backButton: {
    backgroundColor: colors.gold500,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    ...shadow.gold,
  },
  backButtonText: { color: colors.green900 },

  // Leaderboard partagé
  board: {
    backgroundColor: colors.cardOnDark,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  boardTitle: {
    color: colors.gold400,
    marginBottom: spacing.xs,
  },
  boardEmpty: {
    color: colors.textOnDarkMuted,
    paddingVertical: spacing.sm,
  },
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  boardRowMe: { backgroundColor: colors.goldVeil },
  boardRank: { color: colors.cream, width: 36 },
  boardName: { flex: 1, color: colors.textOnDarkMuted },
  boardScore: { color: colors.cream },
  boardTextMe: { color: colors.gold400 },
});
