'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, noContent } = require('../../utils/response');
const teamService = require('../../services/teamService');

/** Console §Équipe & Rôles : membres, invitations, rôles, matrice de permissions. */

/** GET /admin/team — liste des membres (rôles élevés). */
const list = asyncHandler(async (req, res) => {
  return ok(res, { data: await teamService.listMembers() });
});

/** GET /admin/team/stats — décompte par rôle élevé. */
const stats = asyncHandler(async (req, res) => {
  return ok(res, await teamService.memberStats());
});

/** POST /admin/team/invite — crée un compte modérateur/admin + lien d'invitation. */
const invite = asyncHandler(async (req, res) => {
  return created(res, await teamService.invite(req.body, req.user.id));
});

/** GET /admin/team/invitations — liste paginée des invitations (audit). */
const invitations = asyncHandler(async (req, res) => {
  return ok(res, await teamService.listInvitations(req.query));
});

/** POST /admin/team/invitations/:id/resend — renvoie l'email d'invitation. */
const resendInvite = asyncHandler(async (req, res) => {
  return ok(res, await teamService.resendInvitation(req.params.id, req.user.id, req.body.lang));
});

/** POST /admin/team/accept-invite (public) — active le compte via le token Redis. */
const acceptInvite = asyncHandler(async (req, res) => {
  return ok(res, await teamService.acceptInvite(req.body));
});

/** PATCH /admin/team/:id/role — change le rôle d'un membre (garde-fous dans le service). */
const changeRole = asyncHandler(async (req, res) => {
  return ok(res, await teamService.setRole(req.params.id, req.body.role, req.user.id));
});

/** DELETE /admin/team/:id — désactive un membre (garde-fous dans le service). */
const remove = asyncHandler(async (req, res) => {
  await teamService.remove(req.params.id, req.user.id);
  return noContent(res);
});

/** GET /admin/team/:id/activity — 20 derniers évènements d'audit du membre. */
const activity = asyncHandler(async (req, res) => {
  return ok(res, await teamService.memberActivity(req.params.id));
});

/** GET /admin/team/roles — descripteurs de rôles + matrice de permissions. */
const roles = asyncHandler(async (req, res) => {
  return ok(res, await teamService.listRoles());
});

/** PATCH /admin/team/roles/:role/permissions — met à jour la matrice d'un rôle. */
const patchRolePermissions = asyncHandler(async (req, res) => {
  return ok(res, await teamService.setRolePermissions(req.params.role, req.body.permissions, req.user.id));
});

module.exports = {
  list,
  stats,
  invite,
  invitations,
  resendInvite,
  acceptInvite,
  changeRole,
  remove,
  activity,
  roles,
  patchRolePermissions,
};
