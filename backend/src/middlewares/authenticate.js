'use strict';

const ApiError = require('../utils/ApiError');
const { verifyAccessToken } = require('../utils/jwt');

/**
 * Vérifie le Bearer token et attache req.user = { id, role, level, sid }.
 * `sid` (identifiant de session) sert à révoquer le refresh courant au logout.
 * Les erreurs JWT (expiré/invalide) sont mappées par le errorHandler.
 */
module.exports = function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new ApiError('TOKEN_MISSING'));
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role, level: payload.lvl, sid: payload.sid };
    return next();
  } catch (err) {
    return next(err); // TokenExpiredError / JsonWebTokenError → mappés par errorHandler
  }
};
