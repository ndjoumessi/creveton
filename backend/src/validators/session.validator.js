'use strict';

const Joi = require('joi');
const { GAME_MODES, THEMES, LEVELS } = require('../utils/constants');

const answer = Joi.object({
  question_id: Joi.string().uuid().required(),
  selected_index: Joi.number().integer().min(0).allow(null).required(),
  elapsed_ms: Joi.number().integer().min(0).required(),
  skipped: Joi.boolean().default(false),
});

/** POST /sessions/submit (et corps de /challenges/:id/submit) */
const submit = Joi.object({
  mode: Joi.string().valid(...GAME_MODES).default('normal'),
  theme: Joi.string().valid(...THEMES).required(),
  level: Joi.string().valid(...LEVELS).required(),
  started_at: Joi.date().iso().required(),
  answers: Joi.array().items(answer).min(1).max(50).required(),
});

module.exports = { submit, answer };
