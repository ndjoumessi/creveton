'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');
const tournamentService = require('../../services/tournamentService');

/**
 * Administration des tournois (spec §12) : création/programmation, lancement,
 * annulation, payout. Garde-fou tournois payants via le feature flag
 * `tournaments.paid.enabled` (appliqué dans tournamentService).
 */

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

module.exports = { create, start, cancel, payout };
