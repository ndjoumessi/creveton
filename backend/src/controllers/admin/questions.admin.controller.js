'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { ok, created, noContent } = require('../../utils/response');
const questionService = require('../../services/questionService');
const questionModel = require('../../models/question.model');
const questionMediaService = require('../../services/questionMediaService');
const aiCorrectorService = require('../../services/aiCorrectorService');
const importService = require('../../services/importService');
const pushService = require('../../services/pushService');
const userModel = require('../../models/user.model');
const questionEvent = require('../../models/questionEvent.model');

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
  const question = await questionService.updateByAdmin(req.params.id, req.body, req.user.id);
  return ok(res, question);
});

/** POST /admin/questions/:id/transition */
const transition = asyncHandler(async (req, res) => {
  const question = await questionService.transitionStatus(req.params.id, req.body.to, req.body.reason, req.user.id);
  return ok(res, question);
});

/** DELETE /admin/questions/:id (soft delete) */
const remove = asyncHandler(async (req, res) => {
  const question = await questionService.softDeleteByAdmin(req.params.id, req.user.id);
  return ok(res, question);
});

/** POST /admin/questions/:id/image — upload image (multipart, champ « image »). */
const uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError('VALIDATION_ERROR', { message: 'Champ « image » (fichier) requis.' });
  }
  const current = await questionModel.findByIdAny(req.params.id);
  if (!current) throw new ApiError('QUESTION_NOT_FOUND');
  const { url, publicId } = await questionMediaService.uploadQuestionImage({
    buffer: req.file.buffer,
    mimetype: req.file.mimetype,
    questionId: req.params.id,
    oldPublicId: current.media_public_id, // delete-before-replace (best-effort)
  });
  await questionModel.setMedia(req.params.id, url, publicId);
  return ok(res, { media_url: url });
});

/** POST /admin/questions/improve-text — correcteur IA (proxy Anthropic serveur). */
const improveText = asyncHandler(async (req, res) => {
  const { text, lang, type } = req.body;
  const suggestion = await aiCorrectorService.improveText({ text, lang, type });
  return ok(res, { suggestion, changed: suggestion !== text });
});

/** DELETE /admin/questions/:id/image — supprime l'asset Cloudinary + colonnes. */
const deleteImage = asyncHandler(async (req, res) => {
  const current = await questionModel.findByIdAny(req.params.id);
  if (!current) throw new ApiError('QUESTION_NOT_FOUND');
  await questionMediaService.deleteQuestionImage(current.media_public_id);
  await questionModel.removeMedia(req.params.id);
  return noContent(res);
});

/** GET /admin/questions/stats — stats globales (par thème + extrêmes). */
const globalStats = asyncHandler(async (req, res) => {
  const result = await questionService.globalStats();
  return ok(res, result);
});

/** GET /admin/questions/:id/stats — distribution des choix + comparaison thème. */
const stats = asyncHandler(async (req, res) => {
  const result = await questionService.statsForQuestion(req.params.id);
  return ok(res, result);
});

/** GET /admin/questions/:id/history — journal d'audit. */
const history = asyncHandler(async (req, res) => {
  const result = await questionService.historyForQuestion(req.params.id);
  return ok(res, result);
});

/**
 * POST /admin/questions/import — rapport multi-niveaux (CDC §3.3).
 * { total_rows, accepted, rejected, warnings, errors[], warnings_list[] }.
 * Champ `force=true` (multipart) : insère aussi les lignes en avertissement.
 */
const importCsv = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError('VALIDATION_ERROR', { message: 'Fichier CSV requis (champ « file »).' });
  }
  const force = req.body?.force === 'true' || req.body?.force === true;
  const report = await importService.importCsv(req.file.buffer, { createdBy: req.user.id, force });
  return ok(res, {
    total_rows: report.total,
    accepted: report.accepted,
    rejected: report.rejected,
    warnings: report.warnings,
    inserted: report.inserted,
    errors: report.errors,
    warnings_list: report.warnings_list,
  });
});

/** POST /admin/questions/force-sync → 202 { pushed, devices_targeted } */
const forceSync = asyncHandler(async (req, res) => {
  const { question_ids: questionIds } = req.body;
  const [result, devices] = await Promise.all([
    pushService.sendForceSync(questionIds),
    userModel.countActive(),
  ]);
  // Trace l'opération dans l'historique de chaque question (best-effort).
  await Promise.all(
    (questionIds || []).map((id) =>
      questionEvent.record({ questionId: id, event: 'force_sync', actorId: req.user.id, meta: { devices_targeted: devices } }).catch(() => {})
    )
  );
  return res.status(202).json({ pushed: result.pushed, devices_targeted: devices });
});

module.exports = { list, get, create, update, transition, remove, uploadImage, deleteImage, improveText, importCsv, forceSync, globalStats, stats, history };
