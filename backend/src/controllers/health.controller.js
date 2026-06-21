'use strict';

const asyncHandler = require('../utils/asyncHandler');
const db = require('../config/database');
const redisClient = require('../config/redis');
const env = require('../config/env');

/** GET /health — liveness + dépendances (DB, Redis). */
const health = asyncHandler(async (req, res) => {
  const checks = { db: 'unknown', redis: 'unknown' };

  try {
    await db.ping();
    checks.db = 'up';
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
    time: new Date().toISOString(),
  });
});

module.exports = { health };
