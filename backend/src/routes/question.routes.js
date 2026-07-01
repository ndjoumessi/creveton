'use strict';

const express = require('express');
const ctrl = require('../controllers/question.controller');
const validate = require('../middlewares/validate');
const authenticate = require('../middlewares/authenticate');
const rateLimit = require('../middlewares/rateLimit');
const schemas = require('../validators/question.validator');

const router = express.Router();

router.use(authenticate);

router.get('/', validate(schemas.list, 'query'), ctrl.list);
router.get('/delta', validate(schemas.delta, 'query'), ctrl.delta);
router.get('/all', validate(schemas.all, 'query'), ctrl.all);

// Sync des solutions vers le cache offline mobile. Coûteux (jusqu'à 500 questions)
// et sensible (correct_index) → 1 appel / heure / utilisateur. `validate` d'abord :
// un body malformé renvoie 400 sans consommer le quota horaire.
router.post(
  '/solutions',
  validate(schemas.solutions),
  rateLimit({ max: 1, windowSec: 3600, prefix: 'rl:solutions' }),
  ctrl.solutions
);

module.exports = router;
