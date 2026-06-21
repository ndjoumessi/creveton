'use strict';

const ApiError = require('./ApiError');

/**
 * Fabrique un handler de scaffold qui renvoie 501 NOT_IMPLEMENTED avec un
 * libellé clair. À remplacer au fur et à mesure que la couche DB est branchée.
 *
 * @param {string} label ex. 'GET /leaderboard'
 */
module.exports = function notImplemented(label) {
  return function handler(req, res, next) {
    next(new ApiError('NOT_IMPLEMENTED', { message: `${label} — à brancher sur la base de données.` }));
  };
};
