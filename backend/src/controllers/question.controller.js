'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const questionService = require('../services/questionService');

/**
 * Contrôleurs Questions & synchronisation (spec §5).
 * Règle anti-triche : correct_index/explanation ne sont JAMAIS exposés ici —
 * la projection est faite par le modèle (toPlayerView). Les query sont déjà
 * validées/typées par le middleware `validate`.
 */

/** GET /questions?theme=&level=&count=&seed= → 200 { data, seed } */
const list = asyncHandler(async (req, res) => {
  const { theme, level, count, seed } = req.query;
  const result = await questionService.getQuestionSet({
    userId: req.user.id,
    theme,
    level,
    count,
    seed,
  });
  return ok(res, result);
});

/** GET /questions/delta?since= → 200 { new, updated, deleted_ids, synced_at } */
const delta = asyncHandler(async (req, res) => {
  const result = await questionService.getDelta(req.query.since);
  return ok(res, result);
});

/** GET /questions/all?limit=&cursor= → 200 { data, page, synced_at } */
const all = asyncHandler(async (req, res) => {
  const result = await questionService.getAll({
    limit: req.query.limit,
    cursor: req.query.cursor,
  });
  return ok(res, result);
});

module.exports = { list, delta, all };
