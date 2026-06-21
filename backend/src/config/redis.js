'use strict';

const Redis = require('ioredis');
const env = require('./env');
const logger = require('./logger');

/**
 * Client Redis partagé : cache, état des sessions de tournoi en temps réel,
 * rate limiting, idempotence et stockage des OTP.
 *
 * lazyConnect : on ne se connecte qu'au premier usage, ce qui évite de
 * bloquer le démarrage si Redis n'est pas encore prêt.
 */

const redis = new Redis(env.redis.url, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 2000);
    return delay;
  },
});

redis.on('connect', () => logger.info('Redis connecté'));
redis.on('error', (err) => logger.error('Erreur Redis', { error: err.message }));

async function connect() {
  if (redis.status === 'ready' || redis.status === 'connecting') return redis;
  await redis.connect();
  return redis;
}

async function ping() {
  const res = await redis.ping();
  return res === 'PONG';
}

async function close() {
  await redis.quit();
}

module.exports = { redis, connect, ping, close };
