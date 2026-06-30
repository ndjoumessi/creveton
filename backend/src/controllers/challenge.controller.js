'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const challengeService = require('../services/challengeService');

/** Contrôleurs Challenges 1v1 (spec §9). Même seed/set pour les deux joueurs. */

/** POST /challenges/create → 201 { challenge_id, status, seed, questions } */
const create = asyncHandler(async (req, res) => {
  const result = await challengeService.create({
    userId: req.user.id,
    opponentId: req.body.opponent_id,
    theme: req.body.theme,
    level: req.body.level,
    stake: req.body.stake,
  });
  return created(res, result);
});

/** POST /challenges/:id/accept → 200 { challenge_id, status, seed, questions } */
const accept = asyncHandler(async (req, res) => {
  const result = await challengeService.accept({ userId: req.user.id, challengeId: req.params.id });
  return ok(res, result);
});

/** POST /challenges/:id/submit → 200 (score recalculé serveur ; completed quand 2 joueurs) */
const submit = asyncHandler(async (req, res) => {
  const result = await challengeService.submit({
    userId: req.user.id,
    challengeId: req.params.id,
    answers: req.body.answers,
  });
  return ok(res, result);
});

/** GET /challenges?status=received|sent|completed → 200 { data, page } */
const list = asyncHandler(async (req, res) => {
  const result = await challengeService.list({
    userId: req.user.id,
    status: req.query.status,
    page: req.query.page,
    limit: req.query.limit,
  });
  return ok(res, result);
});

/** GET /challenges/:id → 200 (détail, réservé aux participants) */
const get = asyncHandler(async (req, res) => {
  const result = await challengeService.get({ userId: req.user.id, challengeId: req.params.id });
  return ok(res, result);
});

/** DELETE /challenges/:id/decline → 200 (le destinataire refuse un défi en attente) */
const decline = asyncHandler(async (req, res) => {
  const result = await challengeService.decline({ userId: req.user.id, challengeId: req.params.id });
  return ok(res, result);
});

module.exports = { create, accept, submit, get, list, decline };
