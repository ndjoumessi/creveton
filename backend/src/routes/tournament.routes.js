'use strict';

const express = require('express');
const ctrl = require('../controllers/tournament.controller');
const validate = require('../middlewares/validate');
const authenticate = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/admin.middleware');
const schemas = require('../validators/tournament.validator');

const router = express.Router();

router.use(authenticate);

router.get('/', validate(schemas.list, 'query'), ctrl.list);
router.get('/:id', ctrl.get);

// Démarrer la manche live (réservé admin : tournaments:manage).
router.post('/:id/start', requirePermission('tournaments:manage'), validate(schemas.start), ctrl.start);

// Rejoindre un tournoi. Les tournois gratuits restent joignables même flag off ;
// le contrôleur renvoie 403 FEATURE_DISABLED pour un tournoi payant tant que
// `tournaments.paid.enabled` est false (spec §8). Gratuit → 201, payant → 202.
router.post('/:id/join', validate(schemas.join), ctrl.join);

module.exports = router;
