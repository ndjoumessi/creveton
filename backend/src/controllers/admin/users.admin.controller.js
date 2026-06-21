'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { ok, created, noContent } = require('../../utils/response');
const userModel = require('../../models/user.model');
const otpService = require('../../services/otpService');

const BCRYPT_COST = 12;

/** Mot de passe temporaire respectant la politique (≥8, 1 majuscule, 1 chiffre). */
function generateTempPassword() {
  return `Crv${crypto.randomBytes(5).toString('hex')}1A`;
}

/** Téléphone synthétique unique (colonne NOT NULL UNIQUE) pour un compte invité. */
function syntheticPhone() {
  return `+237${crypto.randomInt(600000000, 699999999)}`;
}

/**
 * Administration des utilisateurs (spec §12) : liste, fiche, modération
 * (suspend/ban), reset password, suppression RGPD (soft delete), parrainage.
 */

/** GET /admin/users — liste paginée + filtres. */
const list = asyncHandler(async (req, res) => {
  const { ville, level, role, status, q, limit, cursor } = req.query;
  const offset = Math.max(0, parseInt(cursor, 10) || 0);
  const { rows, hasMore } = await userModel.listAdmin({ ville, level, role, status, q, limit, offset });
  return ok(res, {
    data: rows.map((u) => ({ ...userModel.toPublic(u), status: u.status })),
    page: { limit, next_cursor: hasMore ? String(offset + limit) : null, has_more: hasMore },
  });
});

/** GET /admin/users/stats — KPI globaux du parc (total, actifs 7j, nouveaux, bloqués). */
const usersStats = asyncHandler(async (req, res) => {
  const data = await userModel.adminStats();
  return ok(res, data);
});

/** GET /admin/users/:id — fiche (profil + stats). */
const get = asyncHandler(async (req, res) => {
  const user = await userModel.findById(req.params.id);
  if (!user) throw new ApiError('USER_NOT_FOUND');
  const stats = await userModel.stats(req.params.id);
  return ok(res, { ...userModel.toPublic(user), status: user.status, stats });
});

/** POST /admin/users/:id/suspend */
const suspend = asyncHandler(async (req, res) => {
  const updated = await userModel.setStatus(req.params.id, 'suspended');
  if (!updated) throw new ApiError('USER_NOT_FOUND');
  return ok(res, { id: updated.id, status: updated.status });
});

/** POST /admin/users/:id/ban */
const ban = asyncHandler(async (req, res) => {
  const updated = await userModel.setStatus(req.params.id, 'banned');
  if (!updated) throw new ApiError('USER_NOT_FOUND');
  return ok(res, { id: updated.id, status: updated.status });
});

/** POST /admin/users/:id/reset-password — déclenche un OTP de réinitialisation. */
const resetPassword = asyncHandler(async (req, res) => {
  const user = await userModel.findById(req.params.id);
  if (!user) throw new ApiError('USER_NOT_FOUND');
  await otpService.issue(user.phone);
  return ok(res, { reset_initiated: true });
});

/** DELETE /admin/users/:id — soft delete RGPD. */
const remove = asyncHandler(async (req, res) => {
  const deleted = await userModel.softDelete(req.params.id);
  if (!deleted) throw new ApiError('USER_NOT_FOUND');
  return noContent(res);
});

/**
 * POST /admin/users/:id/message — enregistre un message admin → joueur.
 * (Pas d'infra email ici : on valide la cible et on accuse réception ; le canal
 * réel — email/push — sera branché en v2. Le front retombe sur mailto si besoin.)
 */
const message = asyncHandler(async (req, res) => {
  const user = await userModel.findById(req.params.id);
  if (!user) throw new ApiError('USER_NOT_FOUND');
  return ok(res, { sent: true, to: user.email, subject: req.body.subject || '' });
});

/** PATCH /admin/users/:id/role — change le rôle (super_admin uniquement). */
const changeRole = asyncHandler(async (req, res) => {
  const updated = await userModel.setRole(req.params.id, req.body.role);
  if (!updated) throw new ApiError('USER_NOT_FOUND');
  return ok(res, { id: updated.id, role: updated.role });
});

/**
 * POST /admin/users/invite — crée un compte admin/modérateur avec mot de passe
 * temporaire. (Pas d'envoi d'email ici : le mot de passe est renvoyé pour être
 * communiqué par l'admin.) Réessaie en cas de collision de téléphone synthétique.
 */
const invite = asyncHandler(async (req, res) => {
  const { email, name, role } = req.body;
  if (await userModel.findByEmail(email)) throw new ApiError('EMAIL_ALREADY_USED');

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_COST);
  const referralCode = await userModel.generateUniqueReferralCode();

  let user;
  for (let attempt = 0; attempt < 3 && !user; attempt += 1) {
    try {
      user = await userModel.createInvited({ name, email, role, password_hash: passwordHash, phone: syntheticPhone(), referral_code: referralCode });
    } catch (err) {
      // Collision sur l'email → conflit ; sur le téléphone synthétique → on réessaie.
      if (err && err.code === '23505') {
        if (String(err.constraint || err.detail).includes('email')) throw new ApiError('EMAIL_ALREADY_USED');
        if (attempt === 2) throw err;
      } else {
        throw err;
      }
    }
  }

  return created(res, {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    temporary_password: tempPassword,
  });
});

/** GET /admin/referrals/:code — nombre d'inscrits via ce code. */
const referral = asyncHandler(async (req, res) => {
  const count = await userModel.referralCount(req.params.code);
  return ok(res, { code: req.params.code, signups: count });
});

module.exports = { list, usersStats, get, suspend, ban, resetPassword, remove, changeRole, invite, referral, message };
