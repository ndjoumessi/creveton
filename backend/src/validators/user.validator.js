'use strict';

const Joi = require('joi');
const { SEXES, LANGS, ROLES } = require('../utils/constants');

/** PATCH /users/me */
const updateMe = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  ville: Joi.string().max(100).optional(),
  age: Joi.number().integer().min(6).max(99).optional(),
  sexe: Joi.string().valid(...SEXES).optional(),
  lang: Joi.string().valid(...LANGS).optional(),
  password: Joi.string()
    .min(8)
    .pattern(/[A-Z]/)
    .pattern(/\d/)
    .optional(),
  current_password: Joi.when('password', {
    is: Joi.exist(),
    then: Joi.string().required(),
    otherwise: Joi.forbidden(),
  }),
}).min(1);

/** Pagination générique (historique, transactions). */
const pagination = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(20),
  cursor: Joi.string().optional(),
});

/** GET /admin/users — liste + filtres (spec §12). */
const adminList = Joi.object({
  ville: Joi.string().max(100).optional(),
  level: Joi.number().integer().min(1).max(5).optional(),
  role: Joi.string().valid(...ROLES).optional(),
  status: Joi.string().valid('active', 'suspended', 'banned').optional(),
  q: Joi.string().max(100).optional(),
  limit: Joi.number().integer().min(1).max(100).default(20),
  cursor: Joi.string().optional(),
});

/** POST /admin/users/:id/suspend */
const adminSuspend = Joi.object({
  reason: Joi.string().max(500).optional(),
  until: Joi.date().iso().optional(),
});

/** POST /admin/users/:id/ban */
const adminBan = Joi.object({
  reason: Joi.string().max(500).optional(),
});

/** GET /admin/analytics */
const adminAnalytics = Joi.object({
  period: Joi.string().pattern(/^\d+\s*[dh]$/i).default('30d'),
  metrics: Joi.string().optional(),
});

module.exports = { updateMe, pagination, adminList, adminSuspend, adminBan, adminAnalytics };
