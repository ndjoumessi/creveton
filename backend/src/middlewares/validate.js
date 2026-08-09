'use strict';

const ApiError = require('../utils/ApiError');

/**
 * Valide une partie de la requête contre un schéma Joi.
 * Convertit les erreurs Joi en VALIDATION_ERROR avec `details[]` (spec §3).
 *
 * ─ Pourquoi `details[]` ne porte plus de phrase ─
 * Il exposait `expected: d.message`, soit le message Joi. Résultat : un
 * mélange incohérent — anglais pour les règles natives de Joi, français pour
 * celles dont nos validateurs surchargent `.messages()`. Depuis que le
 * catalogue d'erreurs est bilingue, la phrase destinée à un humain vit dans
 * `error.message`, traduite à la sérialisation ; `details[]` n'a donc plus à
 * en porter une deuxième, à moitié localisée.
 *
 * Il porte à la place la CONTRAINTE brute (`d.context`), qui n'a pas de langue
 * et vaut mieux pour un client : `{ field: 'password', issue: 'string.min',
 * constraint: { limit: 8 } }` permet de composer son propre message, ce qu'une
 * phrase anglaise figée ne permettait pas.
 *
 * ⚠️ La contrainte est extraite par LISTE BLANCHE, pas en écartant quelques
 * clés. Écarter `value` ne suffit pas : `d.context` renvoie aussi `invalids` /
 * `valids`, qui contiennent l'entrée refusée — vérifié, un email invalide
 * ressortait tel quel dans la réponse. La forme de `context` varie par règle,
 * donc une liste noire aurait toujours un train de retard ; seules les clés
 * ci-dessous, toutes des bornes ou des types, sont laissées passer.
 *
 * @param {import('joi').Schema} schema
 * @param {'body'|'query'|'params'} source
 */
// Clés de `d.context` laissées passer : des bornes et des types, jamais une
// valeur soumise. Tout le reste (`value`, `invalids`, `valids`, `label`, `key`)
// est écarté par construction.
const CONSTRAINT_KEYS = ['limit', 'min', 'max', 'length', 'precision', 'multiple', 'type', 'base', 'peer', 'peers', 'name'];

module.exports = function validate(schema, source = 'body') {
  return function run(req, res, next) {
    const { value, error } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const details = error.details.map((d) => {
        const ctx = d.context || {};
        const constraint = {};
        for (const k of CONSTRAINT_KEYS) {
          if (ctx[k] !== undefined) constraint[k] = ctx[k];
        }
        return {
          field: d.path.join('.'),
          issue: d.type,
          ...(Object.keys(constraint).length ? { constraint } : {}),
        };
      });
      return next(new ApiError('VALIDATION_ERROR', { details }));
    }

    // Remplace par la valeur nettoyée/typée.
    req[source] = value;
    return next();
  };
};
