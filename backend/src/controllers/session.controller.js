'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const gameService = require('../services/gameService');

/**
 * Contrôleurs Sessions de jeu (spec §6).
 * /sessions/submit recalcule le score côté serveur via gameService (formule de
 * référence), crédite l'XP, met à jour niveau + classement, et renvoie le
 * review[] avec les bonnes réponses (révélation autorisée uniquement à ce moment).
 */

/** POST /sessions/submit → 200 (score recalculé serveur + review) */
const submit = asyncHandler(async (req, res) => {
  const { mode, theme, level, started_at, answers } = req.body;
  const result = await gameService.submitSession({
    userId: req.user.id,
    mode,
    theme,
    level,
    startedAt: started_at,
    answers,
  });
  return ok(res, result);
});

module.exports = { submit };
