'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');

/**
 * Génération et vérification des JWT (réf. spec §2).
 * access_token (1 h) pour les requêtes authentifiées ; refresh_token (30 j)
 * pour renouveler l'access via /auth/refresh.
 */

/**
 * @param {object} user { id, role, level }
 * @param {string} [sid] identifiant de session — relie l'access au refresh
 *   et permet la révocation ciblée au logout (claim `sid`).
 * @returns {string} access_token signé
 */
function signAccessToken(user, sid) {
  const payload = {
    sub: user.id,
    role: user.role || 'player',
    lvl: user.level ?? 1,
    ...(sid ? { sid } : {}),
  };
  return jwt.sign(payload, env.jwt.accessSecret, { expiresIn: env.jwt.accessExpiresIn });
}

/**
 * @param {object} user { id }
 * @param {string} [sid] identifiant de session (allowlist côté Redis)
 */
function signRefreshToken(user, sid) {
  const payload = { sub: user.id, ...(sid ? { sid } : {}) };
  return jwt.sign(payload, env.jwt.refreshSecret, { expiresIn: env.jwt.refreshExpiresIn });
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.accessSecret);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwt.refreshSecret);
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
