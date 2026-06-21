'use strict';

const asyncHandler = require('../utils/asyncHandler');
const webhookService = require('../services/webhookService');

/**
 * Webhooks paiement (spec §14).
 * Sécurité : signature HMAC (header X-Signature) vérifiée AVANT traitement,
 * idempotence par `reference`. Répond 200 dès lors que la signature est valide
 * (sinon le prestataire retente).
 */

/** POST /webhooks/payments/:provider → 200 (accusé de réception) */
const payment = asyncHandler(async (req, res) => {
  const result = await webhookService.handlePayment({
    provider: req.params.provider,
    rawBody: req.rawBody,
    signature: req.headers['x-signature'],
    body: req.body,
  });
  return res.status(200).json(result);
});

module.exports = { payment };
