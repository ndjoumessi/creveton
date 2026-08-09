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

// ⚠️ `POST /solutions` a été RETIRÉ (2026-08-09).
//
// Il renvoyait `correct_index` pour jusqu'à 500 questions d'un coup, afin
// d'alimenter le cache hors ligne du mobile. Autrement dit : n'importe quel
// jeton de joueur valide obtenait le corrigé de toute la banque en un appel,
// et le plafond d'un appel par heure n'y changeait rien — un seul suffit.
//
// La révélation reste servie par `POST /sessions/answer`, question par
// question, APRÈS que le joueur a répondu. Le mobile en garde une copie locale
// pour rejouer cette question-là hors ligne : le téléphone n'apprend donc que
// ce qui a déjà été joué, au lieu de tout précharger.
//
// Les applications déjà installées appellent encore cette route ; leur
// `syncSolutions` avale l'échec sans bruit (non bloquant) et conserve les
// solutions déjà en cache. Dégradation silencieuse, pas de casse.

module.exports = router;
