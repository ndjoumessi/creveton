'use strict';

const express = require('express');
const ctrl = require('../../controllers/admin/tournaments.admin.controller');
const validate = require('../../middlewares/validate');
const { requirePermission } = require('../../middlewares/admin.middleware');
const schemas = require('../../validators/tournament.validator');

const router = express.Router();

// Toutes les opérations tournoi exigent le rôle admin (spec §12).
router.post('/', requirePermission('tournaments:manage'), validate(schemas.adminCreate), ctrl.create);
router.post('/:id/start', requirePermission('tournaments:manage'), ctrl.start);
router.post('/:id/cancel', requirePermission('tournaments:manage'), ctrl.cancel);
router.post('/:id/payout', requirePermission('tournaments:manage'), ctrl.payout);

module.exports = router;
