'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');
const tournamentService = require('../../services/tournamentService');

/**
 * Administration des tournois (spec §12) : création/programmation, lancement,
 * annulation, payout. Garde-fou tournois payants via le feature flag
 * `tournaments.paid.enabled` (appliqué dans tournamentService).
 */

/** GET /admin/tournaments — liste + synthèse. */
const list = asyncHandler(async (req, res) => {
  return ok(res, await tournamentService.listAll());
});

/** GET /admin/tournaments/:id — détail + participants + stats. */
const detail = asyncHandler(async (req, res) => {
  return ok(res, await tournamentService.getDetail(req.params.id));
});

/** POST /admin/tournaments → 201 */
const create = asyncHandler(async (req, res) => {
  const tournament = await tournamentService.create(req.body, req.user.id);
  return created(res, tournament);
});

/** POST /admin/tournaments/:id/start */
const start = asyncHandler(async (req, res) => {
  const tournament = await tournamentService.start(req.params.id);
  return ok(res, tournament);
});

/** POST /admin/tournaments/:id/cancel */
const cancel = asyncHandler(async (req, res) => {
  const result = await tournamentService.cancel(req.params.id);
  return ok(res, result);
});

/** POST /admin/tournaments/:id/payout */
const payout = asyncHandler(async (req, res) => {
  const result = await tournamentService.payout(req.params.id);
  return ok(res, result);
});

/** POST /admin/tournaments/:id/participants */
const addParticipant = asyncHandler(async (req, res) => {
  const result = await tournamentService.adminAddParticipant(req.params.id, req.body.user_id);
  return created(res, result);
});

/** DELETE /admin/tournaments/:id/participants/:user_id */
const removeParticipant = asyncHandler(async (req, res) => {
  const result = await tournamentService.adminRemoveParticipant(req.params.id, req.params.user_id);
  return ok(res, result);
});

module.exports = { list, detail, create, start, cancel, payout, addParticipant, removeParticipant };
