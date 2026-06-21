'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { ok, created } = require('../../utils/response');
const questionService = require('../../services/questionService');
const questionModel = require('../../models/question.model');
const importService = require('../../services/importService');
const pushService = require('../../services/pushService');
const userModel = require('../../models/user.model');

/**
 * Administration des questions (spec §12) : CRUD, workflow de statut, import CSV
 * et retrait d'urgence (force-sync). Rôles vérifiés au niveau des routes.
 */

/** GET /admin/questions */
const list = asyncHandler(async (req, res) => {
  const { status, theme, level, q, limit, cursor } = req.query;
  const result = await questionService.listForAdmin({ status, theme, level, q, limit, cursor });
  return ok(res, result);
});

/** GET /admin/questions/:id */
const get = asyncHandler(async (req, res) => {
  const row = await questionModel.findByIdAny(req.params.id);
  if (!row) throw new ApiError('QUESTION_NOT_FOUND');
  return ok(res, questionModel.toAdminView(row));
});

/** POST /admin/questions → 201 */
const create = asyncHandler(async (req, res) => {
  const question = await questionService.createByAdmin(req.body, req.user.id);
  return created(res, question);
});

/** PATCH /admin/questions/:id */
const update = asyncHandler(async (req, res) => {
  const question = await questionService.updateByAdmin(req.params.id, req.body);
  return ok(res, question);
});

/** POST /admin/questions/:id/transition */
const transition = asyncHandler(async (req, res) => {
  const question = await questionService.transitionStatus(req.params.id, req.body.to, req.body.reason);
  return ok(res, question);
});

/** DELETE /admin/questions/:id (soft delete) */
const remove = asyncHandler(async (req, res) => {
  const question = await questionService.softDeleteByAdmin(req.params.id);
  return ok(res, question);
});

/** POST /admin/questions/import — rapport { total_rows, accepted, rejected, errors[] } */
const importCsv = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError('VALIDATION_ERROR', { message: 'Fichier CSV requis (champ « file »).' });
  }
  const report = await importService.importCsv(req.file.buffer, { createdBy: req.user.id });
  // Mappe vers le contrat §12 (total_rows + errors[{row, issue}]).
  return ok(res, {
    total_rows: report.total,
    accepted: report.accepted,
    rejected: report.rejected,
    errors: report.rejected_rows.map((r) => ({ row: r.line, issue: r.errors.join(' ; ') })),
  });
});

/** POST /admin/questions/force-sync → 202 { pushed, devices_targeted } */
const forceSync = asyncHandler(async (req, res) => {
  const { question_ids: questionIds } = req.body;
  const [result, devices] = await Promise.all([
    pushService.sendForceSync(questionIds),
    userModel.countActive(),
  ]);
  return res.status(202).json({ pushed: result.pushed, devices_targeted: devices });
});

module.exports = { list, get, create, update, transition, remove, importCsv, forceSync };
