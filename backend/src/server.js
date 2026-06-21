'use strict';

const http = require('http');

const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
const db = require('./config/database');
const redisClient = require('./config/redis');
const { initSockets } = require('./sockets');

const server = http.createServer(app);

// Attache Socket.io au serveur HTTP partagé.
const io = initSockets(server);
// Rendu accessible aux contrôleurs via req.app.get('io') si besoin.
app.set('io', io);

async function start() {
  // Connexion Redis (lazy) — non bloquante pour le démarrage HTTP, mais on
  // tente la connexion tôt pour détecter les problèmes de config.
  try {
    await redisClient.connect();
  } catch (err) {
    logger.warn('Redis indisponible au démarrage (fonctionnera en mode dégradé)', { error: err.message });
  }

  server.listen(env.port, () => {
    logger.info(`Creveton API démarrée`, {
      env: env.nodeEnv,
      port: env.port,
      base_url: `http://localhost:${env.port}${env.apiPrefix}`,
    });
  });
}

// --- Arrêt gracieux ---
async function shutdown(signal) {
  logger.info(`Signal ${signal} reçu, arrêt en cours…`);
  server.close(async () => {
    try {
      await Promise.allSettled([db.close(), redisClient.close()]);
    } finally {
      logger.info('Arrêt terminé.');
      process.exit(0);
    }
  });
  // Filet de sécurité : forcer la sortie si la fermeture traîne.
  setTimeout(() => process.exit(1), 10000).unref();
}

['SIGTERM', 'SIGINT'].forEach((sig) => process.on(sig, () => shutdown(sig)));

process.on('unhandledRejection', (reason) => {
  logger.error('Rejet de promesse non géré', { reason: reason && reason.message ? reason.message : String(reason) });
});
process.on('uncaughtException', (err) => {
  logger.error('Exception non capturée', { error: err.message, stack: err.stack });
  process.exit(1);
});

start();

module.exports = server;
