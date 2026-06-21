'use strict';

const express = require('express');
const ctrl = require('../../controllers/admin/dashboard.admin.controller');
const { requirePermission } = require('../../middlewares/admin.middleware');

const router = express.Router();

// Auth admin minimum (synthèse opérationnelle de la plateforme).
router.get('/', requirePermission('dashboard:read'), ctrl.overview);

module.exports = router;
