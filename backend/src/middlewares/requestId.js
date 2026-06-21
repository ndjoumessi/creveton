'use strict';

const { randomUUID } = require('crypto');

/**
 * Attache un identifiant unique à chaque requête (traçabilité support, spec §3).
 * Réutilise l'en-tête X-Request-Id s'il est fourni en amont (proxy/gateway).
 */
module.exports = function requestId(req, res, next) {
  const incoming = req.headers['x-request-id'];
  req.id = incoming || `req_${randomUUID()}`;
  res.setHeader('X-Request-Id', req.id);
  next();
};
