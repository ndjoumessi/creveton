'use strict';

const asyncHandler = require('../utils/asyncHandler');
const notImplemented = require('../utils/notImplemented');
const { ok } = require('../utils/response');
const tournamentModel = require('../models/tournament.model');
const liveTournamentService = require('../services/liveTournamentService');

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

/**
 * POST /tournaments/:id/start (admin) — démarre la manche en temps réel : tire les
 * questions, passe le tournoi en `running` et lance la boucle d'animation serveur
 * (diffusion des questions / révélation / clôture) sur l'instance Socket.IO partagée.
 */
const start = asyncHandler(async (req, res) => {
  const result = await liveTournamentService.start(req.params.id, {
    count: req.body.count,
    timePerQSec: req.body.time_per_q_s,
  });
  const io = req.app.get('io');
  if (io) liveTournamentService.runLiveTournament(io, req.params.id);
  return ok(res, result);
});

module.exports = {
  list,
  start,
  // GET /tournaments/:id
  get: notImplemented('GET /tournaments/:id'),
  // POST /tournaments/:id/join (flag)
  join: notImplemented('POST /tournaments/:id/join'),
};
