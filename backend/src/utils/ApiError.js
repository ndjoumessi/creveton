'use strict';

const ERROR_CODES = require('./errorCodes');

/**
 * Erreur applicative normalisée, alignée sur le modèle d'erreur de la spec (§3).
 * Levée partout dans les services/contrôleurs ; capturée par le middleware
 * d'erreurs qui produit l'enveloppe JSON finale.
 */
class ApiError extends Error {
  /**
   * @param {string} code    Code stable du catalogue (§16).
   * @param {object} [opts]
   * @param {string} [opts.message] Message lisible (sinon message par défaut du code).
   * @param {Array}  [opts.details] Détails par champ : [{ field, issue, expected }].
   * @param {number} [opts.http]    Surcharge du statut HTTP.
   */
  constructor(code, opts = {}) {
    const known = ERROR_CODES[code] || ERROR_CODES.INTERNAL_ERROR;
    super(opts.message || known.message);
    this.name = 'ApiError';
    this.code = ERROR_CODES[code] ? code : 'INTERNAL_ERROR';
    this.httpStatus = opts.http || known.http;
    this.details = opts.details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  /** Raccourci de construction. */
  static from(code, opts) {
    return new ApiError(code, opts);
  }
}

module.exports = ApiError;
