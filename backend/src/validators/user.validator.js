'use strict';

const Joi = require('joi');
const { SEXES, LANGS, ROLES, THEMES, LEVELS, LEADERBOARD_SCOPES } = require('../utils/constants');

/** PATCH /users/me */
const updateMe = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  ville: Joi.string().max(100).optional(),
  age: Joi.number().integer().min(6).max(99).optional(),
  sexe: Joi.string().valid(...SEXES).optional(),
  lang: Joi.string().valid(...LANGS).optional(),
  timezone: Joi.string().max(64).optional(),
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

/** POST /admin/users/:id/message — message admin → joueur. */
const adminMessage = Joi.object({
  subject: Joi.string().max(200).allow('').default(''),
  body: Joi.string().min(1).max(5000).required(),
});

/** PATCH /admin/users/:id/role (super_admin) — pas de super_admin via l'UI. */
const adminRole = Joi.object({
  role: Joi.string().valid('player', 'moderator', 'admin').required(),
});

/** POST /admin/users/invite */
const adminInvite = Joi.object({
  email: Joi.string().email().required(),
  name: Joi.string().min(2).max(100).required(),
  role: Joi.string().valid('moderator', 'admin').required(),
});

/** GET /admin/sessions?user_id=&theme=&level=&date_from=&limit=&cursor= */
const adminSessions = Joi.object({
  user_id: Joi.string().uuid().optional(),
  theme: Joi.string().valid(...THEMES).optional(),
  level: Joi.string().valid(...LEVELS).optional(),
  date_from: Joi.date().iso().optional(),
  limit: Joi.number().integer().min(1).max(100).default(20),
  cursor: Joi.string().optional(),
});

/** GET /admin/leaderboard?scope=&theme= */
const adminLeaderboard = Joi.object({
  scope: Joi.string().valid(...LEADERBOARD_SCOPES).default('global'),
  theme: Joi.string().valid(...THEMES).optional(),
});

module.exports = {
  updateMe,
  pagination,
  adminList,
  adminSuspend,
  adminBan,
  adminAnalytics,
  adminMessage,
  adminRole,
  adminInvite,
  adminSessions,
  adminLeaderboard,
};
