'use strict';

const express = require('express');
const ctrl = require('../../controllers/admin/users.admin.controller');
const validate = require('../../middlewares/validate');
const { requirePermission } = require('../../middlewares/admin.middleware');
const schemas = require('../../validators/user.validator');

const router = express.Router();

router.get('/', requirePermission('users:read'), validate(schemas.adminList, 'query'), ctrl.list);
router.get('/stats', requirePermission('users:read'), ctrl.usersStats);
router.post('/invite', requirePermission('users:invite'), validate(schemas.adminInvite), ctrl.invite);
router.get('/:id', requirePermission('users:read'), ctrl.get);
router.patch('/:id/role', requirePermission('users:role'), validate(schemas.adminRole), ctrl.changeRole);
router.post('/:id/suspend', requirePermission('users:manage'), validate(schemas.adminSuspend), ctrl.suspend);
router.post('/:id/ban', requirePermission('users:manage'), validate(schemas.adminBan), ctrl.ban);
router.post('/:id/reset-password', requirePermission('users:manage'), ctrl.resetPassword);
router.delete('/:id', requirePermission('users:manage'), ctrl.remove);

module.exports = router;
