'use strict';

const { redis } = require('../config/redis');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');

/**
 * Rate limiting fixe par fenêtre, adossé à Redis (spec §1).
 * Pose les en-têtes X-RateLimit-* et renvoie 429 RATE_LIMITED + Retry-After.
 *
 * Fail-open : si Redis est indisponible, on laisse passer la requête plutôt
 * que de bloquer tout le service.
 *
 * @param {object} opts
 * @param {number} opts.max        Nombre max de requêtes dans la fenêtre.
 * @param {number} opts.windowSec  Taille de la fenêtre en secondes (défaut 60).
 * @param {function} [opts.keyGenerator] (req) => string identifiant le client.
 * @param {string} [opts.prefix]   Préfixe de clé Redis.
 */
module.exports = function rateLimit(opts) {
  const max = opts.max;
  const windowSec = opts.windowSec || 60;
  const prefix = opts.prefix || 'rl';
  const keyGenerator =
    opts.keyGenerator ||
    ((req) => (req.user && req.user.id ? `u:${req.user.id}` : `ip:${req.ip}`));

  return async function limiter(req, res, next) {
    const bucket = Math.floor(Date.now() / 1000 / windowSec);
    const key = `${prefix}:${keyGenerator(req)}:${bucket}`;

    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSec);
      }

      const remaining = Math.max(0, max - count);
      const resetAt = (bucket + 1) * windowSec;
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', resetAt);

      if (count > max) {
        const retryAfter = resetAt - Math.floor(Date.now() / 1000);
        res.setHeader('Retry-After', Math.max(1, retryAfter));
        return next(new ApiError('RATE_LIMITED'));
      }

      return next();
    } catch (err) {
      logger.warn('Rate limiter indisponible, fail-open', { error: err.message });
      return next();
    }
  };
};
