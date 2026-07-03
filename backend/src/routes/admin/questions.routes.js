'use strict';

const express = require('express');
const ctrl = require('../../controllers/admin/questions.admin.controller');
const validate = require('../../middlewares/validate');
const { requirePermission } = require('../../middlewares/admin.middleware');
const upload = require('../../config/multer');
const schemas = require('../../validators/question.validator');

const router = express.Router();

router.get('/', requirePermission('questions:read'), validate(schemas.adminList, 'query'), ctrl.list);
// `/stats` AVANT `/:id` (sinon « stats » serait interprété comme un id).
router.get('/stats', requirePermission('questions:read'), ctrl.globalStats);

// Génération assistée IA + relecture des brouillons. `/generate` et `/drafts`
// AVANT `/:id` (sinon capturés comme un id). L'édition d'un brouillon réutilise
// PATCH /:id ; approbation/rejet ont leurs endpoints dédiés ci-dessous.
router.post('/generate', requirePermission('questions:create'), validate(schemas.adminGenerate), ctrl.generate);
router.get('/drafts', requirePermission('questions:read'), validate(schemas.adminDrafts, 'query'), ctrl.listDrafts);
router.post('/drafts/:id/approve', requirePermission('questions:transition'), ctrl.approveDraft);
router.post(
  '/drafts/:id/reject',
  requirePermission('questions:transition'),
  validate(schemas.adminRejectDraft),
  ctrl.rejectDraft
);

router.get('/:id', requirePermission('questions:read'), ctrl.get);
router.get('/:id/stats', requirePermission('questions:read'), ctrl.stats);
router.get('/:id/history', requirePermission('questions:read'), ctrl.history);
router.post('/', requirePermission('questions:create'), validate(schemas.adminCreate), ctrl.create);
router.patch('/:id', requirePermission('questions:update'), validate(schemas.adminUpdate), ctrl.update);
router.post(
  '/:id/transition',
  requirePermission('questions:transition'),
  validate(schemas.adminTransition),
  ctrl.transition
);
// Image de question (upload signé Cloudinary). `questions:manage` n'existe pas —
// on réutilise la permission granulaire `questions:update` (modifier la question).
router.post(
  '/:id/image',
  requirePermission('questions:update'),
  upload.questionImageUpload.single('image'),
  ctrl.uploadImage
);
router.delete('/:id/image', requirePermission('questions:update'), ctrl.deleteImage);
// Correcteur IA (proxy Anthropic serveur). `questions:manage` n'existe pas → on
// réutilise `questions:update`. La clé reste côté serveur (jamais dans le frontend).
router.post('/improve-text', requirePermission('questions:update'), validate(schemas.improveText), ctrl.improveText);
// Traduction IA d'une question (FR↔EN). `questions:manage` n'existe pas → on
// réutilise `questions:update` (cohérent avec improve-text / image).
router.post('/:id/translate', requirePermission('questions:update'), validate(schemas.translate), ctrl.translate);
router.post('/import', requirePermission('questions:import'), upload.single('file'), ctrl.importCsv);
router.post('/force-sync', requirePermission('questions:force-sync'), validate(schemas.forceSync), ctrl.forceSync);
router.delete('/:id', requirePermission('questions:delete'), ctrl.remove);

module.exports = router;
