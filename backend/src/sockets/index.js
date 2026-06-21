'use strict';

const { Server } = require('socket.io');
const { verifyAccessToken } = require('../utils/jwt');
const env = require('../config/env');
const logger = require('../config/logger');

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

    // Rejoindre la room d'un tournoi.
    socket.on('tournament:subscribe', ({ tournament_id } = {}) => {
      if (!tournament_id) return;
      socket.join(`tournament:${tournament_id}`);
      // TODO: émettre `reconnect:state` depuis Redis si une session est en cours.
    });

    // Réception d'une réponse joueur (chronomètre serveur-authoritative).
    socket.on('answer', (payload) => {
      // TODO: valider deadline_at, calculer le score, émettre answer:ack + score:update.
      logger.debug('answer reçu', { user_id: socket.user.id, payload });
    });

    socket.on('disconnect', (reason) => {
      logger.debug('Socket déconnecté', { user_id: socket.user.id, reason });
    });
  });

  return io;
}

module.exports = { initSockets };
