'use strict';

const Joi = require('joi');
const {
  THEMES,
  TOURNAMENT_TYPES,
  TOURNAMENT_STATUSES,
  PAYMENT_PROVIDERS,
  PHONE_REGEX,
} = require('../utils/constants');

/** GET /tournaments?status=&type= */
const list = Joi.object({
  status: Joi.string().valid(...TOURNAMENT_STATUSES).optional(),
  type: Joi.string().valid(...TOURNAMENT_TYPES).optional(),
});

/** POST /tournaments/:id/start (admin) — lance la manche live. */
const start = Joi.object({
  count: Joi.number().integer().min(1).max(100).default(10),
  time_per_q_s: Joi.number().integer().min(5).max(120).default(15),
});

/** POST /tournaments/:id/join */
const join = Joi.object({
  payment: Joi.object({
    provider: Joi.string().valid(...PAYMENT_PROVIDERS).required(),
    phone: Joi.string().pattern(PHONE_REGEX).required(),
  }).optional(),
});

/** POST /admin/tournaments */
const adminCreate = Joi.object({
  name: Joi.string().min(2).max(120).required(),
  type: Joi.string().valid(...TOURNAMENT_TYPES).required(),
  entry_fee: Joi.number().integer().min(0).default(0),
  max_players: Joi.number().integer().min(2).max(1024).required(),
  theme: Joi.string().valid(...THEMES).required(),
  format: Joi.object({
    questions: Joi.number().integer().min(1).max(100).required(),
    time_per_q_s: Joi.number().integer().min(5).max(120).required(),
  }).required(),
  starts_at: Joi.date().iso().required(),
});

/** POST /admin/tournaments/:id/participants */
const adminAddParticipant = Joi.object({
  user_id: Joi.string().uuid().required(),
});

module.exports = { list, start, join, adminCreate, adminAddParticipant };
