'use strict';

const notImplemented = require('../utils/notImplemented');

/**
 * Webhooks paiement (spec §14).
 * Sécurité : vérifier la signature HMAC (header X-Signature) AVANT traitement,
 * idempotence par `reference`. Toujours répondre 200 à réception valide.
 */
module.exports = {
  // POST /webhooks/payments/:provider
  payment: notImplemented('POST /webhooks/payments/:provider'),
};
