'use strict';

const express = require('express');
const ctrl = require('../controllers/webhook.controller');

const router = express.Router();

/**
 * Webhooks paiement (prestataire → backend). Pas d'auth JWT : la légitimité
 * est prouvée par la signature HMAC vérifiée dans le contrôleur (spec §14).
 */
router.post('/payments/:provider', ctrl.payment);

module.exports = router;
