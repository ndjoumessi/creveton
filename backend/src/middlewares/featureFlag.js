'use strict';

const env = require('../config/env');
const ApiError = require('../utils/ApiError');

/**
 * Bloque l'accès à une route si le feature flag correspondant est désactivé.
 * Au lancement, le flag `tournaments.paid.enabled` est false → 403 FEATURE_DISABLED
 * (spec §8 / §11).
 *
 * @param {string} flagPath ex. 'tournaments.paid.enabled'
 */
const FLAGS = {
  'tournaments.paid.enabled': () => env.features.tournamentsPaidEnabled,
};

module.exports = function featureFlag(flagPath) {
  const resolver = FLAGS[flagPath];
  return function check(req, res, next) {
    if (!resolver || !resolver()) {
      return next(new ApiError('FEATURE_DISABLED', { message: `Fonctionnalité « ${flagPath} » désactivée.` }));
    }
    return next();
  };
};
