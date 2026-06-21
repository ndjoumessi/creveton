'use strict';

/**
 * Enveloppe un contrôleur async pour router toute promesse rejetée vers next(),
 * évitant les try/catch répétitifs.
 *
 * Usage : router.get('/x', asyncHandler(async (req, res) => { ... }))
 */
module.exports = function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
