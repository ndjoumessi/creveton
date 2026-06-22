// Orchestration Socket.io d'une manche de tournoi : branche les événements
// serveur sur le store et expose submitAnswer. Un seul socket (singleton du
// service) ; on n'attache/détache que les listeners selon le cycle de vie.
//
// Payloads serveur réels (cf. backend/src/services/liveTournamentService.js) :
//   reconnect:state { index, total, question, deadline_at, remaining_ms, your_score, your_rank }
//   question:show   { index, total, question, deadline_at, duration_ms }
//   answer:ack      { index, accepted, error? }
//   question:reveal { index, correct_index, leaderboard }   (pas d'explication sur le fil)
//   score:update    { leaderboard }
//   tournament:end  { tournament_id, status, leaderboard }  (pas de my_score/xp sur le fil)
// → mon score/rang sont DÉRIVÉS du leaderboard via mon user_id.

import { useEffect, useRef, useCallback } from 'react';
import {
  connectSocket,
  disconnectSocket,
  subscribeTournament,
  sendAnswer,
  SOCKET_EVENTS,
} from '../services/socket';
import { useTournamentStore } from '../store/tournamentStore';
import { useAuthStore } from '../store/authStore';

// deadline_at est un epoch ms côté serveur ; on tolère aussi une string ISO.
function toMs(value) {
  if (value == null) return 0;
  return typeof value === 'number' ? value : new Date(value).getTime();
}

// Retrouve mon score/rang dans un classement live { user_id, score, rank }.
function standingFor(board, myId) {
  const me = Array.isArray(board) ? board.find((e) => e.user_id === myId) : null;
  return me ? { score: me.score, rank: me.rank } : null;
}

function mapQuestion(index, total, question, deadlineAt, durationMs) {
  return {
    index,
    total,
    text: question?.text ?? '',
    options: question?.options || [],
    theme: question?.theme ?? null,
    level: question?.level ?? null,
    deadlineAt: toMs(deadlineAt),
    durationMs: durationMs || 0,
  };
}

export function useTournamentSocket(tournamentId) {
  const socketRef = useRef(null);

  useEffect(() => {
    let active = true;
    const store = useTournamentStore.getState;
    const myId = useAuthStore.getState().user?.id;

    store().reset();
    store().setTournamentId(tournamentId);
    store().setPhase('waiting');

    const onReconnectState = (data) => {
      if (data?.question) {
        store().setQuestion(
          mapQuestion(data.index, data.total, data.question, data.deadline_at, data.remaining_ms)
        );
        store().setPhase('question');
      }
      if (typeof data?.your_score === 'number') {
        store().setMyStanding(data.your_score, data.your_rank ?? null);
      }
    };

    const onQuestionShow = (data) => {
      store().setQuestion(
        mapQuestion(data.index, data.total, data.question, data.deadline_at, data.duration_ms)
      );
      store().setPhase('question');
    };

    const onAnswerAck = (data) => {
      // accepted:true → on attend question:reveal. Rejet (trop tard / anti-triche)
      // → on le signale discrètement sans révéler la justesse.
      if (data && data.accepted === false && data.error) {
        console.warn('Réponse rejetée', data.error);
      }
    };

    const onQuestionReveal = (data) => {
      const board = data.leaderboard || [];
      store().setReveal({
        correctIndex: data.correct_index,
        explanation: data.explanation ?? null, // non émis aujourd'hui ; toléré si ajouté
        leaderboard: board,
      });
      store().setLeaderboard(board);
      const s = standingFor(board, myId);
      if (s) store().setMyStanding(s.score, s.rank);
      store().setPhase('reveal');
    };

    const onScoreUpdate = (data) => {
      const board = data.leaderboard || [];
      store().setLeaderboard(board);
      const s = standingFor(board, myId);
      if (s) store().setMyStanding(s.score, s.rank);
    };

    const onTournamentEnd = (data) => {
      const board = data.leaderboard || [];
      const s = standingFor(board, myId) || {
        score: store().myScore,
        rank: store().myRank,
      };
      store().setEnded({ leaderboard: board, myScore: s.score, myRank: s.rank });
      store().setPhase('ended');
    };

    (async () => {
      const socket = await connectSocket();
      if (!active) return;
      socketRef.current = socket;
      socket.on(SOCKET_EVENTS.reconnectState, onReconnectState);
      socket.on(SOCKET_EVENTS.questionShow, onQuestionShow);
      socket.on(SOCKET_EVENTS.answerAck, onAnswerAck);
      socket.on(SOCKET_EVENTS.questionReveal, onQuestionReveal);
      socket.on(SOCKET_EVENTS.scoreUpdate, onScoreUpdate);
      socket.on(SOCKET_EVENTS.tournamentEnd, onTournamentEnd);
      subscribeTournament(tournamentId);
    })();

    return () => {
      active = false;
      const socket = socketRef.current;
      if (socket) {
        socket.off(SOCKET_EVENTS.reconnectState, onReconnectState);
        socket.off(SOCKET_EVENTS.questionShow, onQuestionShow);
        socket.off(SOCKET_EVENTS.answerAck, onAnswerAck);
        socket.off(SOCKET_EVENTS.questionReveal, onQuestionReveal);
        socket.off(SOCKET_EVENTS.scoreUpdate, onScoreUpdate);
        socket.off(SOCKET_EVENTS.tournamentEnd, onTournamentEnd);
      }
      // On quitte l'écran : on ferme la connexion (le seul consommateur, c'est
      // la manche live). Une re-visite rouvrira et restaurera via reconnect:state.
      disconnectSocket();
      useTournamentStore.getState().reset();
    };
  }, [tournamentId]);

  // Envoie le choix du joueur. `selectedIndex` null = pas de réponse (timeout).
  const submitAnswer = useCallback(
    (selectedIndex) => {
      const q = useTournamentStore.getState().question;
      if (!q) return;
      useTournamentStore.getState().setSelectedIndex(selectedIndex);
      sendAnswer({ tournamentId, index: q.index, selectedIndex });
    },
    [tournamentId]
  );

  return { submitAnswer };
}

export default useTournamentSocket;
