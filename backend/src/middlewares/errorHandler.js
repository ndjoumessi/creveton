'use strict';

const env = require('../config/env');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');

/**
 * Middleware terminal de gestion des erreurs.
 * Produit l'enveloppe d'erreur normalisée (spec §3) quel que soit l'origine.
 */
// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
  let apiError = err;

  // Erreurs JWT remontées par les middlewares d'auth.
  if (err && err.name === 'TokenExpiredError') {
    apiError = new ApiError('TOKEN_EXPIRED');
  } else if (err && err.name === 'JsonWebTokenError') {
    apiError = new ApiError('TOKEN_INVALID');
  } else if (err && (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && err.status === 400))) {
    // Corps JSON malformé (express.json) → erreur de validation, pas un 500.
    apiError = new ApiError('VALIDATION_ERROR', { message: 'Corps JSON invalide.' });
  } else if (err && err.type === 'entity.too.large') {
    apiError = new ApiError('VALIDATION_ERROR', { message: 'Corps de requête trop volumineux.' });
  } else if (err && err.name === 'MulterError') {
    // Erreur d'upload (taille, champ inattendu…) lors de l'import de questions.
    apiError = new ApiError('VALIDATION_ERROR', { message: `Upload invalide : ${err.message}` });
  } else if (err instanceof ApiError) {
    apiError = err;
  } else {
    // Erreur non maîtrisée → 500 générique (on ne fuite pas le détail interne).
    apiError = new ApiError('INTERNAL_ERROR');
  }

  // NOT_IMPLEMENTED (501) est un statut de scaffold attendu, pas un incident.
  if (apiError.httpStatus >= 500 && apiError.code !== 'NOT_IMPLEMENTED') {
    logger.error('Erreur non gérée', {
      request_id: req.id,
      method: req.method,
      url: req.originalUrl,
      error: err && err.message,
      stack: err && err.stack,
    });
  } else {
    logger.debug('Erreur applicative', { request_id: req.id, code: apiError.code });
  }

  const body = {
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details ? { details: apiError.details } : {}),
      request_id: req.id,
    },
  };

  // En dev, on expose la stack pour le 500 afin de faciliter le debug.
  if (!env.isProd && apiError.httpStatus >= 500 && err && err.stack) {
    body.error.stack = err.stack;
  }

  res.status(apiError.httpStatus).json(body);
};
