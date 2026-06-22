// Socket.io — couche temps réel des tournois (API §13).
// Singleton de connexion authentifié par JWT (auth: { token }). Une room par
// tournoi côté serveur ; ici on gère la connexion + les émissions joueur.
//
// Contrat serveur (cf. backend/src/sockets/index.js + liveTournamentService) :
//   émis par le client :
//     tournament:subscribe { tournament_id }   → rejoint la room (+ reconnect:state)
//     answer               { tournament_id, index, selected_index }
//   reçus du serveur :
//     reconnect:state, question:show, answer:ack, question:reveal,
//     score:update, tournament:end
//
// Le chronomètre est SERVEUR-autoritaire : aucune décision (deadline, bonne
// réponse, score) n'est prise ici. La justesse n'arrive qu'avec question:reveal.

import { io } from 'socket.io-client';
import { SOCKET_URL } from '../constants/config';
import { getAccessToken } from './storage';

let socket = null;

// Noms d'événements (source unique pour client + hook).
export const SOCKET_EVENTS = {
  subscribe: 'tournament:subscribe',
  answer: 'answer',
  reconnectState: 'reconnect:state',
  questionShow: 'question:show',
  answerAck: 'answer:ack',
  questionReveal: 'question:reveal',
  scoreUpdate: 'score:update',
  tournamentEnd: 'tournament:end',
};

/**
 * Ouvre (ou réutilise) la connexion socket authentifiée. Le token est lu depuis
 * le storage (AsyncStorage) — il n'est pas dans le store auth.
 * @returns {Promise<import('socket.io-client').Socket>}
 */
export async function connectSocket() {
  if (socket?.connected) return socket;
  // Une instance déconnectée traîne ? on repart proprement.
  if (socket) {
    socket.removeAllListeners();
    socket.connect();
    return socket;
  }
  const token = await getAccessToken();
  socket = io(SOCKET_URL, {
    transports: ['websocket'],
    auth: { token },
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
  });
  return socket;
}

export function getSocket() {
  return socket;
}

/** Rejoint la room d'un tournoi. Le serveur renvoie reconnect:state si une manche tourne. */
export function subscribeTournament(tournamentId) {
  socket?.emit(SOCKET_EVENTS.subscribe, { tournament_id: tournamentId });
}

/**
 * Envoie la réponse du joueur à la question courante. `selectedIndex` peut être
 * null (timeout côté client) ; le serveur tranche de toute façon sur sa deadline.
 */
export function sendAnswer({ tournamentId, index, selectedIndex }) {
  socket?.emit(SOCKET_EVENTS.answer, {
    tournament_id: tournamentId,
    index,
    selected_index: selectedIndex ?? null,
  });
}

export function disconnectSocket() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
}

export default {
  SOCKET_EVENTS,
  connectSocket,
  getSocket,
  subscribeTournament,
  sendAnswer,
  disconnectSocket,
};
