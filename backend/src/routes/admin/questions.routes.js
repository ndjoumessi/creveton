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
router.post('/import', requirePermission('questions:import'), upload.single('file'), ctrl.importCsv);
router.post('/force-sync', requirePermission('questions:force-sync'), validate(schemas.forceSync), ctrl.forceSync);
router.delete('/:id', requirePermission('questions:delete'), ctrl.remove);

module.exports = router;
