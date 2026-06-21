'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { ok } = require('../../utils/response');
const sessionModel = require('../../models/session.model');
const questionModel = require('../../models/question.model');

/** Administration des parties de jeu (game_sessions). Auth : admin. */

/** GET /admin/sessions — liste paginée (JOIN users) + filtres. */
const list = asyncHandler(async (req, res) => {
  const { user_id: userId, theme, level, date_from: dateFrom, limit, cursor } = req.query;
  const lim = limit || 20;
  const offset = Math.max(0, parseInt(cursor, 10) || 0);
  const { rows, hasMore } = await sessionModel.listAdmin({
    userId: userId || null,
    theme: theme || null,
    level: level || null,
    dateFrom: dateFrom || null,
    limit: lim,
    offset,
  });
  return ok(res, {
    data: rows.map((r) => sessionModel.toAdminView(r)),
    page: { limit: lim, next_cursor: hasMore ? String(offset + lim) : null, has_more: hasMore },
  });
});

/** GET /admin/sessions/:id — détail avec récap question par question. */
const get = asyncHandler(async (req, res) => {
  const session = await sessionModel.findByIdAdmin(req.params.id);
  if (!session) throw new ApiError('NOT_FOUND', { message: 'Partie introuvable.' });

  const answers = Array.isArray(session.answers) ? session.answers : [];
  const qMap = await questionModel.findManyBrief(answers.map((a) => a.question_id).filter(Boolean));

  const recap = answers.map((a) => {
    const q = qMap.get(a.question_id);
    return {
      question_id: a.question_id,
      question_text: q ? q.text_fr : null,
      options: q ? q.options : null,
      correct_index: q ? q.correct_index : null,
      your_index: a.selected_index ?? null,
      is_correct: a.is_correct ?? null,
      elapsed_ms: a.elapsed_ms ?? null,
    };
  });

  return ok(res, {
    id: session.id,
    user: { id: session.user_id, name: session.user_name, ville: session.user_ville ?? null, level: session.user_level },
    mode: session.mode,
    theme: session.theme ?? null,
    level: session.level ?? null,
    score: session.score,
    correct_count: session.correct_count,
    question_count: session.question_count,
    xp_earned: session.xp_earned,
    played_at: session.played_at,
    answers: recap,
  });
});

module.exports = { list, get };
