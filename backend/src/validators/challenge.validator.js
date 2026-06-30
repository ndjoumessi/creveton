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

/** GET /challenges?status=&page=&limit= — onglets Défis mobile. */
const list = Joi.object({
  status: Joi.string().valid('received', 'sent', 'completed').required(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(20),
});

module.exports = { create, list };
