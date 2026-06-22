'use strict';

const { Server } = require('socket.io');
const { verifyAccessToken } = require('../utils/jwt');
const env = require('../config/env');
const logger = require('../config/logger');
const liveTournament = require('../services/liveTournamentService');

/**
 * Couche temps réel des tournois (spec §13).
 *  - handshake authentifié par JWT (auth: { token })
 *  - une room par tournoi : `tournament:<id>`
 *  - chronomètre serveur-authoritative ; état restauré depuis Redis à la reco
 *
 * Les handlers métier (diffusion des questions, scoring live) seront branchés
 * sur le service tournoi ; ici on pose l'authentification et le routage de base.
 */
function initSockets(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.corsOrigin === '*' ? '*' : env.corsOrigin.split(',').map((o) => o.trim()),
      credentials: true,
    },
  });

  // Authentification du handshake.
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token) return next(new Error('TOKEN_MISSING'));
      const payload = verifyAccessToken(token);
      socket.user = { id: payload.sub, role: payload.role, level: payload.lvl };
      return next();
    } catch {
      return next(new Error('TOKEN_INVALID'));
    }
  });

  io.on('connection', (socket) => {
    logger.debug('Socket connecté', { user_id: socket.user.id, socket_id: socket.id });

    // Rejoindre la room d'un tournoi + restaurer l'état courant à la reconnexion.
    socket.on('tournament:subscribe', async ({ tournament_id } = {}) => {
      if (!tournament_id) return;
      socket.join(liveTournament.room(tournament_id));
      try {
        const state = await liveTournament.currentState(tournament_id, socket.user.id);
        if (state) socket.emit('reconnect:state', { tournament_id, ...state });
      } catch (err) {
        logger.warn('reconnect:state échoué', { tournament_id, error: err.message });
      }
    });

    // Réception d'une réponse joueur (chronomètre serveur-authoritative). On
    // accuse réception SANS révéler la justesse — la bonne réponse et le
    // classement sont diffusés à toute la room à l'expiration (question:reveal).
    socket.on('answer', async ({ tournament_id, index, selected_index } = {}) => {
      if (!tournament_id) return;
      try {
        const ack = await liveTournament.recordAnswer({
          tournamentId: tournament_id,
          userId: socket.user.id,
          index,
          selectedIndex: selected_index ?? null,
        });
        socket.emit('answer:ack', { tournament_id, ...ack });
      } catch (err) {
        socket.emit('answer:ack', {
          tournament_id,
          index,
          accepted: false,
          error: err.code || 'INTERNAL_ERROR',
        });
      }
    });

    socket.on('disconnect', (reason) => {
      logger.debug('Socket déconnecté', { user_id: socket.user.id, reason });
    });
  });

  return io;
}

module.exports = { initSockets };
