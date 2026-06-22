'use strict';

const Joi = require('joi');
const {
  PAYMENT_PROVIDERS,
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
} = require('../utils/constants');

/** GET /admin/transactions (+ /export) — filtres + pagination curseur. */
const list = Joi.object({
  status: Joi.string().valid(...TRANSACTION_STATUSES).optional(),
  type: Joi.string().valid(...TRANSACTION_TYPES).optional(),
  provider: Joi.string().valid(...PAYMENT_PROVIDERS).optional(),
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
  limit: Joi.number().integer().min(1).max(100).default(20),
  cursor: Joi.string().uuid().optional(),
});

/** GET /admin/analytics/finances/daily */
const daily = Joi.object({
  days: Joi.number().integer().min(1).max(365).default(30),
});

/** POST /admin/transactions/:id/reject */
const reject = Joi.object({
  reason: Joi.string().max(500).allow('', null).optional(),
});

module.exports = { list, daily, reject };
