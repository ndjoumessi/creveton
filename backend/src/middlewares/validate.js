'use strict';

const ApiError = require('../utils/ApiError');

/**
 * Valide une partie de la requête contre un schéma Joi.
 * Convertit les erreurs Joi en VALIDATION_ERROR avec `details[]` (spec §3).
 *
 * @param {import('joi').Schema} schema
 * @param {'body'|'query'|'params'} source
 */
module.exports = function validate(schema, source = 'body') {
  return function run(req, res, next) {
    const { value, error } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const details = error.details.map((d) => ({
        field: d.path.join('.'),
        issue: d.type,
        expected: d.message,
      }));
      return next(new ApiError('VALIDATION_ERROR', { details }));
    }

    // Remplace par la valeur nettoyée/typée.
    req[source] = value;
    return next();
  };
};
