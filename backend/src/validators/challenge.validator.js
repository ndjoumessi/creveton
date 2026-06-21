'use strict';

const Joi = require('joi');
const { THEMES, LEVELS } = require('../utils/constants');

/** POST /challenges/create */
const create = Joi.object({
  opponent_id: Joi.string().uuid().allow(null).default(null),
  theme: Joi.string().valid(...THEMES).required(),
  level: Joi.string().valid(...LEVELS).required(),
  stake: Joi.number().integer().min(0).default(0),
});

module.exports = { create };
