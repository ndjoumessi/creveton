'use strict';

const express = require('express');
const ctrl = require('../controllers/question.controller');
const validate = require('../middlewares/validate');
const authenticate = require('../middlewares/authenticate');
const schemas = require('../validators/question.validator');

const router = express.Router();

router.use(authenticate);

router.get('/', validate(schemas.list, 'query'), ctrl.list);
router.get('/delta', validate(schemas.delta, 'query'), ctrl.delta);
router.get('/all', validate(schemas.all, 'query'), ctrl.all);

module.exports = router;
