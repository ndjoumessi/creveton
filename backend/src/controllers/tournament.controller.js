'use strict';

const asyncHandler = require('../utils/asyncHandler');
const notImplemented = require('../utils/notImplemented');
const { ok } = require('../utils/response');
const tournamentModel = require('../models/tournament.model');

/**
 * Contrôleurs Tournois (spec §8).
 * join est derrière le flag tournaments.paid.enabled pour les tournois payants.
 */

/** GET /tournaments?status=&type= — liste des tournois vivants. */
const list = asyncHandler(async (req, res) => {
  const rows = await tournamentModel.findAll();
  let data = rows.map((r) => tournamentModel.toView(r));
  if (req.query.status) data = data.filter((t) => t.status === req.query.status);
  if (req.query.type) data = data.filter((t) => t.type === req.query.type);
  return ok(res, { data });
});

module.exports = {
  list,
  // GET /tournaments/:id
  get: notImplemented('GET /tournaments/:id'),
  // POST /tournaments/:id/join (flag)
  join: notImplemented('POST /tournaments/:id/join'),
};
