'use strict';

const ApiError = require('../utils/ApiError');

/**
 * Hiérarchie des rôles (spec §2 / §12). Un rôle satisfait toute exigence de
 * niveau inférieur ou égal.
 */
const ROLE_RANK = {
  player: 0,
  moderator: 1,
  admin: 2,
  super_admin: 3,
};

/**
 * Exige un rôle minimum. À placer après authenticate.
 * @param {string} minRole player | moderator | admin | super_admin
 */
module.exports = function requireRole(minRole) {
  const required = ROLE_RANK[minRole] ?? Number.POSITIVE_INFINITY;
  return function check(req, res, next) {
    const current = ROLE_RANK[req.user?.role] ?? -1;
    if (current < required) {
      return next(new ApiError('FORBIDDEN'));
    }
    return next();
  };
};

module.exports.ROLE_RANK = ROLE_RANK;
