'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { ok, noContent } = require('../../utils/response');
const userModel = require('../../models/user.model');
const otpService = require('../../services/otpService');

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

/** GET /admin/referrals/:code — nombre d'inscrits via ce code. */
const referral = asyncHandler(async (req, res) => {
  const count = await userModel.referralCount(req.params.code);
  return ok(res, { code: req.params.code, signups: count });
});

module.exports = { list, get, suspend, ban, resetPassword, remove, referral };
