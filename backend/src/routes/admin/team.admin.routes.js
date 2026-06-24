'use strict';

const express = require('express');
const ctrl = require('../../controllers/admin/team.admin.controller');
const validate = require('../../middlewares/validate');
const { requirePermission } = require('../../middlewares/admin.middleware');
const schemas = require('../../validators/team.validator');

const router = express.Router();

// Rôles & matrice de permissions (routes statiques avant les routes /:id).
router.get('/roles', requirePermission('team:read'), ctrl.roles);
router.patch(
  '/roles/:role/permissions',
  requirePermission('team:manage'),
  validate(schemas.permissions),
  ctrl.patchRolePermissions
);

// Invitations (audit) — routes statiques AVANT les routes /:id.
router.get('/invitations', requirePermission('team:manage'), validate(schemas.listInvitations, 'query'), ctrl.invitations);
router.post('/invitations/:id/resend', requirePermission('team:manage'), validate(schemas.resendInvitation), ctrl.resendInvite);

// Membres de l'équipe.
router.get('/', requirePermission('team:read'), ctrl.list);
router.get('/stats', requirePermission('team:read'), ctrl.stats);
router.post('/invite', requirePermission('team:manage'), validate(schemas.invite), ctrl.invite);
router.get('/:id/activity', requirePermission('team:read'), ctrl.activity);
router.patch('/:id/role', requirePermission('team:manage'), validate(schemas.role), ctrl.changeRole);
router.delete('/:id', requirePermission('team:manage'), ctrl.remove);

module.exports = router;
