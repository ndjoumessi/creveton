'use strict';

const asyncHandler = require('../utils/asyncHandler');
const db = require('../config/database');
const redisClient = require('../config/redis');
const env = require('../config/env');

/** GET /health — liveness + dépendances (DB, Redis) + infos système. */
const health = asyncHandler(async (req, res) => {
  const checks = { db: 'unknown', redis: 'unknown' };
  let pgVersion = null;

  try {
    // version() valide la connexion ET fournit la version pour la console.
    const { rows } = await db.query('SELECT version() AS v');
    checks.db = 'up';
    const m = /PostgreSQL\s+([\d.]+)/i.exec(rows[0]?.v || '');
    pgVersion = m ? `PostgreSQL ${m[1]}` : 'PostgreSQL';
  } catch {
    checks.db = 'down';
  }

  try {
    await redisClient.ping();
    checks.redis = 'up';
  } catch {
    checks.redis = 'down';
  }

  const healthy = Object.values(checks).every((s) => s === 'up');
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    env: env.nodeEnv,
    version: '1.0.0',
    checks,
    system: {
      uptime_s: Math.round(process.uptime()),
      node: process.version,
      postgres: pgVersion,
    },
    time: new Date().toISOString(),
  });
});

module.exports = { health };
