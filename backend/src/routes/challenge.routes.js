'use strict';

const express = require('express');
const ctrl = require('../controllers/challenge.controller');
const validate = require('../middlewares/validate');
const authenticate = require('../middlewares/authenticate');
const challengeSchemas = require('../validators/challenge.validator');
const sessionSchemas = require('../validators/session.validator');

const router = express.Router();

router.use(authenticate);

router.get('/', validate(challengeSchemas.list, 'query'), ctrl.list);
router.post('/create', validate(challengeSchemas.create), ctrl.create);
router.post('/:id/accept', ctrl.accept);
router.post('/:id/submit', validate(sessionSchemas.submit), ctrl.submit);
router.delete('/:id/decline', ctrl.decline);
router.delete('/:id', ctrl.cancel);
router.get('/:id', ctrl.get);

module.exports = router;
