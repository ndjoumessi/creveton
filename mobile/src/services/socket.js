// Socket.io — namespace tournois temps réel (API §13).
// Handshake authentifié par JWT : auth: { token }. Rooms par tournoi.

import { io } from 'socket.io-client';
import { SOCKET_URL } from '../constants/config';
import { getAccessToken } from './storage';

let socket = null;

export async function connectSocket() {
  if (socket?.connected) return socket;
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

export function joinTournament(tournamentId, handlers = {}) {
  if (!socket) return;
  socket.emit('join', { room: `tournament:${tournamentId}` });
  // Événements serveur → client (§13)
  const map = {
    'tournament:lobby': handlers.onLobby,
    question: handlers.onQuestion,
    'answer:ack': handlers.onAnswerAck,
    'score:update': handlers.onScoreUpdate,
    'tournament:end': handlers.onEnd,
    'reconnect:state': handlers.onReconnectState,
  };
  Object.entries(map).forEach(([event, fn]) => {
    if (fn) socket.on(event, fn);
  });
  return () => {
    Object.keys(map).forEach((event) => socket.off(event));
  };
}

// Client → serveur : réponse à une question diffusée.
export function sendAnswer({ index, selectedIndex, elapsedMs }) {
  socket?.emit('answer', {
    index,
    selected_index: selectedIndex,
    elapsed_ms: elapsedMs,
  });
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export default {
  connectSocket,
  getSocket,
  joinTournament,
  sendAnswer,
  disconnectSocket,
};
