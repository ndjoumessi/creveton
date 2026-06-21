'use strict';

const express = require('express');
const ctrl = require('../../controllers/admin/questions.admin.controller');
const validate = require('../../middlewares/validate');
const { requirePermission } = require('../../middlewares/admin.middleware');
const upload = require('../../config/multer');
const schemas = require('../../validators/question.validator');

const router = express.Router();

router.get('/', requirePermission('questions:read'), validate(schemas.adminList, 'query'), ctrl.list);
router.get('/:id', requirePermission('questions:read'), ctrl.get);
router.post('/', requirePermission('questions:create'), validate(schemas.adminCreate), ctrl.create);
router.patch('/:id', requirePermission('questions:update'), validate(schemas.adminUpdate), ctrl.update);
router.post(
  '/:id/transition',
  requirePermission('questions:transition'),
  validate(schemas.adminTransition),
  ctrl.transition
);
router.post('/import', requirePermission('questions:import'), upload.single('file'), ctrl.importCsv);
router.post('/force-sync', requirePermission('questions:force-sync'), validate(schemas.forceSync), ctrl.forceSync);
router.delete('/:id', requirePermission('questions:delete'), ctrl.remove);

module.exports = router;
