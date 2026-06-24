'use strict';

const Joi = require('joi');

/** POST /admin/team/invite — super_admin non invitable. */
const invite = Joi.object({
  email: Joi.string().email().required(),
  name: Joi.string().min(2).max(100).required(),
  role: Joi.string().valid('moderator', 'admin').required(),
  lang: Joi.string().valid('fr', 'en').default('fr'),
  message: Joi.string().max(2000).allow('').optional(),
});

/** GET /admin/team/invitations — liste paginée (filtre statut). */
const listInvitations = Joi.object({
  status: Joi.string().valid('pending', 'accepted', 'expired').optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

/** POST /admin/team/invitations/:id/resend — langue de l'email (optionnelle). */
const resendInvitation = Joi.object({
  lang: Joi.string().valid('fr', 'en').default('fr'),
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

module.exports = { invite, role, acceptInvite, permissions, listInvitations, resendInvitation };
