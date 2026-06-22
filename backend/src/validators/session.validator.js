'use strict';

const Joi = require('joi');
const { GAME_MODES, THEMES, LEVELS } = require('../utils/constants');

const answer = Joi.object({
  question_id: Joi.string().uuid().required(),
  selected_index: Joi.number().integer().min(0).allow(null).required(),
  elapsed_ms: Joi.number().integer().min(0).required(),
  skipped: Joi.boolean().default(false),
});

/**
 * POST /sessions/submit (et corps de /challenges/:id/submit).
 *
 * Modes mixtes (blitz/marathon) : pas de thème/niveau de session unique (set
 * mélangé) → theme/level optionnels et nullables. Marathon : exactement 20
 * réponses attendues. Le contrôle « blitz < 62 s » est fait côté service
 * (gameService), car il dépend de l'horloge serveur.
 */
const MIXED_MODES = ['blitz', 'marathon'];
const submit = Joi.object({
  mode: Joi.string().valid(...GAME_MODES).default('normal'),
  theme: Joi.when('mode', {
    is: Joi.valid(...MIXED_MODES),
    then: Joi.string().valid(...THEMES).allow(null).optional(),
    otherwise: Joi.string().valid(...THEMES).required(),
  }),
  level: Joi.when('mode', {
    is: Joi.valid(...MIXED_MODES),
    then: Joi.string().valid(...LEVELS).allow(null).optional(),
    otherwise: Joi.string().valid(...LEVELS).required(),
  }),
  started_at: Joi.date().iso().required(),
  answers: Joi.when('mode', {
    is: 'marathon',
    then: Joi.array().items(answer).length(20).required(),
    otherwise: Joi.array().items(answer).min(1).max(50).required(),
  }),
});

/**
 * POST /sessions/answer — une seule réponse (mode normal, feedback immédiat).
 * `mode` reste validé contre GAME_MODES : un mode interdit passe la validation
 * puis est rejeté en 403 par le service (et non en 400).
 */
const answerOne = Joi.object({
  session_id: Joi.string().uuid().optional(),
  question_id: Joi.string().uuid().required(),
  selected_index: Joi.number().integer().min(0).max(3).allow(null).required(),
  elapsed_ms: Joi.number().integer().min(0).required(),
  mode: Joi.string().valid(...GAME_MODES).default('normal'),
});

module.exports = { submit, answer, answerOne };
