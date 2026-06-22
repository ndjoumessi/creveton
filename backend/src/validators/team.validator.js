'use strict';

const Joi = require('joi');

/** POST /admin/team/invite — super_admin non invitable. */
const invite = Joi.object({
  email: Joi.string().email().required(),
  name: Joi.string().min(2).max(100).required(),
  role: Joi.string().valid('moderator', 'admin').required(),
  message: Joi.string().max(2000).allow('').optional(),
});

/** PATCH /admin/team/:id/role */
const role = Joi.object({
  role: Joi.string().valid('moderator', 'admin', 'super_admin').required(),
});

/** POST /admin/team/accept-invite — activation publique (token Redis + mot de passe). */
const acceptInvite = Joi.object({
  token: Joi.string().uuid().required(),
  password: Joi.string().min(8).pattern(/[A-Z]/).pattern(/\d/).required(),
});

/**
 * PATCH /admin/team/roles/:role/permissions
 * Matrice { [module]: { [action]: bool } } — valeurs booléennes uniquement.
 */
const permissions = Joi.object({
  permissions: Joi.object()
    .pattern(
      Joi.string(),
      Joi.object().pattern(Joi.string(), Joi.boolean())
    )
    .required(),
});

module.exports = { invite, role, acceptInvite, permissions };
