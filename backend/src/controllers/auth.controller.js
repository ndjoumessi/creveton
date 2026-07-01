'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ok, created, noContent } = require('../utils/response');
const authService = require('../services/authService');

/**
 * Contrôleurs Auth (spec §4). Fins : ils délèguent toute la logique à
 * authService et se contentent de mapper requête → réponse selon le contrat.
 * Les corps de requête sont déjà validés/nettoyés par le middleware `validate`.
 */

/** POST /auth/register → 201 { user_id, phone, otp_sent, otp_expires_at } */
const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  return created(res, result);
});

/** POST /auth/verify-otp → 200 { access_token, refresh_token, token_type, expires_in, user } */
const verifyOtp = asyncHandler(async (req, res) => {
  const result = await authService.verifyOtp(req.body.phone, req.body.code);
  return ok(res, result);
});

/** POST /auth/resend-otp → 200 { otp_sent, otp_expires_at } */
const resendOtp = asyncHandler(async (req, res) => {
  const result = await authService.resendOtp(req.body.phone);
  return ok(res, result);
});

/** POST /auth/login → 200 (identique à verify-otp) */
const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body.email, req.body.password);
  return ok(res, result);
});

/** POST /auth/refresh → 200 { access_token, expires_in } */
const refresh = asyncHandler(async (req, res) => {
  const result = await authService.refresh(req.body.refresh_token);
  return ok(res, result);
});

/** POST /auth/change-password → 200 (vérifie l'actuel, applique le nouveau) */
const changePassword = asyncHandler(async (req, res) => {
  const result = await authService.changePassword(
    req.user.id,
    req.body.current_password,
    req.body.new_password,
    req.user.sid
  );
  return ok(res, result);
});

/** POST /auth/logout → 204 (révoque la session courante) */
const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.user.id, req.user.sid);
  return noContent(res);
});

/** GET /auth/sessions — sessions actives de l'utilisateur courant. */
const sessions = asyncHandler(async (req, res) => {
  const list = await authService.listSessions(req.user.id, req.user.sid);
  return ok(res, { sessions: list });
});

/** POST /auth/sessions/revoke-others — ferme toutes les autres sessions. */
const revokeOtherSessions = asyncHandler(async (req, res) => {
  const result = await authService.revokeOtherSessions(req.user.id, req.user.sid);
  return ok(res, result);
});

module.exports = { register, verifyOtp, resendOtp, login, refresh, changePassword, logout, sessions, revokeOtherSessions };
