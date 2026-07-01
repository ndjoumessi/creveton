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
  Text,
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
import { CircularTimer } from '../components';
import { useTournamentSocket } from '../hooks/useTournamentSocket';
import { useTournamentStore } from '../store/tournamentStore';
import { useAuthStore } from '../store/authStore';
import { disconnectSocket } from '../services/socket';
import { fonts, fontSizes, radius, spacing, shadow, MIN_TOUCH } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { hapticLight } from '../utils/haptics';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };
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
    hapticLight();
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
            <Text style={styles.counter}>
              {t('tournamentLive.counter', { current: question.index + 1, total: question.total })}
            </Text>
            <Text style={styles.score}>⚡ {myScore} {t('tournamentLive.pts')}</Text>
          </View>

          {/* Timer circulaire serveur-autoritaire */}
          <View style={styles.timerWrap}>
            <CircularTimer size={84} strokeWidth={5} progress={timerAnim} seconds={secondsLeft} />
          </View>

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
                letter={LETTERS[i] || '•'}
                text={opt.text}
                optionIndex={opt.index ?? i}
                picked={picked}
                correctIndex={phase === 'reveal' ? reveal?.correctIndex : null}
                revealing={phase === 'reveal'}
                disabled={answered || phase === 'reveal'}
                onPress={() => onPick(opt.index ?? i)}
              />
            ))}
          </View>

          {/* État sous la question : envoyé / révélation */}
          {phase === 'reveal' ? (
            <RevealPanel t={t} reveal={reveal} myId={myId} />
          ) : answered ? (
            <Text style={styles.answeredHint}>✓ {t('tournamentLive.answered')}</Text>
          ) : null}
        </>
      )}
    </SafeAreaView>
  );
}

function OptionRow({ letter, text, optionIndex, picked, correctIndex, revealing, disabled, onPress }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isPicked = picked === optionIndex;
  const isCorrect = revealing && correctIndex === optionIndex;
  const isWrongPick = revealing && isPicked && correctIndex !== optionIndex;

  let container = styles.optDefault;
  let badge = styles.badgeDefault;
  let badgeText = styles.badgeTextDefault;
  let label = styles.optTextDefault;
  let glyph = letter;

  if (isCorrect) {
    container = styles.optCorrect;
    badge = styles.badgeCorrect;
    badgeText = styles.badgeTextOnColor;
    label = styles.optTextCorrect;
    glyph = '✓';
  } else if (isWrongPick) {
    container = styles.optWrong;
    badge = styles.badgeWrong;
    badgeText = styles.badgeTextOnColor;
    label = styles.optTextWrong;
    glyph = '✗';
  } else if (isPicked) {
    container = styles.optSelected;
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.option, container, disabled && !revealing && !isPicked && styles.optDimmed]}
    >
      <View style={[styles.badge, badge]}>
        <Text style={[styles.badgeTextBase, badgeText]}>{glyph}</Text>
      </View>
      <Text style={[styles.optText, label]}>{text}</Text>
    </Pressable>
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
          <Text style={[styles.explainText, styles.explainTextFlex]}>{reveal.explanation}</Text>
        </View>
      ) : (
        <View style={styles.explainBox}>
          <Icon icon={Check} size={18} color={colors.textDark} />
          <Text style={[styles.explainText, styles.explainTextFlex]}>{t('tournamentLive.correctAnswer')}</Text>
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
        <Text style={styles.waitingTitle}>{t('tournament.connectionError')}</Text>
        <Text style={styles.waitingSubtitle}>{t('tournament.connectionErrorMsg')}</Text>
        <Pressable
          onPress={onBack}
          hitSlop={8}
          style={styles.errorBackBtn}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Text style={styles.errorBackText}>{t('common.back')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.centered}>
      <Text style={styles.waitingEmoji}>🏆</Text>
      <Text style={styles.waitingTitle}>{t('tournamentLive.waitingTitle')}</Text>
      <Text style={styles.waitingSubtitle}>{t('tournamentLive.waitingSubtitle')}</Text>
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
          <Text style={styles.endedMedal}>{MEDALS[myRank]}</Text>
        ) : (
          <Text style={styles.waitingEmoji}>🎉</Text>
        )}
        <Text style={styles.endedTitle}>{t('tournamentLive.endedTitle')}</Text>
        <View style={styles.endedStats}>
          <View style={styles.endedStat}>
            <Text style={styles.endedStatLabel}>{t('tournamentLive.rank')}</Text>
            <Text style={styles.endedStatValue}>{myRank != null ? `#${myRank}` : '—'}</Text>
          </View>
          <View style={styles.endedStatDivider} />
          <View style={styles.endedStat}>
            <Text style={styles.endedStatLabel}>{t('tournamentLive.score')}</Text>
            <Text style={styles.endedStatValue}>{myScore}</Text>
          </View>
        </View>
        <Text style={styles.xpNote}>{t('tournamentLive.xpNote')}</Text>
      </View>

      <View style={styles.endedBoard}>
        <MiniLeaderboard t={t} board={board} myId={myId} limit={10} />
      </View>

      <Pressable style={styles.backButton} onPress={onBack}>
        <Text style={styles.backButtonText}>{t('tournamentLive.back')}</Text>
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
      <Text style={styles.boardTitle}>{t('tournamentLive.leaderboard')}</Text>
      {rows.length === 0 ? (
        <Text style={styles.boardEmpty}>{t('tournamentLive.leaderboardEmpty')}</Text>
      ) : (
        rows.map((e) => {
          const me = e.user_id === myId;
          const medal = MEDALS[e.rank];
          return (
            <View key={e.user_id} style={[styles.boardRow, me && styles.boardRowMe]}>
              <Text style={[styles.boardRank, me && styles.boardTextMe]}>
                {medal || `#${e.rank}`}
              </Text>
              <Text style={[styles.boardName, me && styles.boardTextMe]} numberOfLines={1}>
                {me ? t('tournamentLive.you') : `${t('tournamentLive.player')} ${e.rank}`}
              </Text>
              <Text style={[styles.boardScore, me && styles.boardTextMe]}>
                {e.score} {t('tournamentLive.pts')}
              </Text>
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
  counter: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.md, color: colors.textOnDarkMuted },
  score: { fontFamily: fonts.titleBold, fontSize: fontSizes.lg, color: colors.gold500 },

  timerWrap: { alignItems: 'center', marginTop: spacing.xs },

  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: 20,
    marginTop: spacing.lg,
  },
  question: { fontFamily: fonts.titleSemiBold, fontSize: 17, lineHeight: 26, color: colors.green900 },
  underline: { width: 32, height: 3, borderRadius: 2, backgroundColor: colors.gold500, marginTop: spacing.md },

  options: { marginTop: spacing.lg, gap: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 58,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1.5,
  },
  optDefault: { backgroundColor: colors.white, borderColor: colors.border },
  optDimmed: { opacity: 0.55 },
  optSelected: { backgroundColor: colors.successBgSoft, borderColor: colors.green500 },
  optCorrect: { backgroundColor: colors.successBg, borderWidth: 3, borderColor: colors.green500 },
  optWrong: { backgroundColor: colors.errorBg, borderWidth: 3, borderColor: colors.red400 },
  badge: { width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  badgeDefault: { backgroundColor: colors.border },
  badgeCorrect: { backgroundColor: colors.green500 },
  badgeWrong: { backgroundColor: colors.red400 },
  badgeTextBase: { fontFamily: fonts.bodyBold, fontSize: fontSizes.md },
  badgeTextDefault: { color: colors.textBody },
  badgeTextOnColor: { color: colors.white },
  optText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: fontSizes.md },
  optTextDefault: { color: colors.textBody },
  optTextCorrect: { color: colors.successText, fontFamily: fonts.bodySemiBold },
  optTextWrong: { color: colors.red600 },

  answeredHint: {
    marginTop: spacing.lg,
    textAlign: 'center',
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.md,
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
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.md,
    color: colors.textDark,
    lineHeight: 21,
  },

  // Waiting
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  waitingEmoji: { fontSize: 56 },
  waitingTitle: {
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.xl,
    color: colors.cream,
    textAlign: 'center',
  },
  waitingSubtitle: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.md,
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
  errorBackText: { fontFamily: fonts.titleBold, fontSize: fontSizes.base, color: colors.green900 },

  // Ended
  endedScroll: { flex: 1 },
  endedContent: { paddingVertical: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  endedMedal: { fontSize: 64 },
  endedHero: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl },
  endedTitle: { fontFamily: fonts.titleBold, fontSize: fontSizes.xxl, color: colors.gold500 },
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
  endedStatLabel: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, color: colors.textOnDarkMuted },
  endedStatValue: { fontFamily: fonts.titleBold, fontSize: fontSizes.xxl, color: colors.cream },
  xpNote: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.sm,
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
  backButtonText: { fontFamily: fonts.titleBold, fontSize: fontSizes.base, color: colors.green900 },

  // Leaderboard partagé
  board: {
    backgroundColor: colors.cardOnDark,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  boardTitle: {
    fontFamily: fonts.titleSemiBold,
    fontSize: fontSizes.md,
    color: colors.gold400,
    marginBottom: spacing.xs,
  },
  boardEmpty: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.sm,
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
  boardRank: { fontFamily: fonts.titleBold, fontSize: fontSizes.md, color: colors.cream, width: 36 },
  boardName: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: fontSizes.md, color: colors.textOnDarkMuted },
  boardScore: { fontFamily: fonts.bodyBold, fontSize: fontSizes.md, color: colors.cream },
  boardTextMe: { color: colors.gold400 },
});
