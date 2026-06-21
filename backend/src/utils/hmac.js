'use strict';

const crypto = require('crypto');

/**
 * Signatures HMAC-SHA256 (webhooks paiement — spec §14).
 * La vérification est à temps constant pour éviter les attaques par timing.
 */

/** Signe un payload (Buffer|string) avec un secret → hex. */
function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Vérifie qu'une signature correspond au payload pour un secret donné.
 * @param {Buffer|string} payload  corps brut de la requête.
 * @param {string} signature       valeur du header X-Signature (hex).
 * @param {string} secret          secret partagé du prestataire.
 * @returns {boolean}
 */
function verify(payload, signature, secret) {
  if (!secret || !signature) return false;
  const expected = Buffer.from(sign(payload, secret), 'utf8');
  const provided = Buffer.from(String(signature), 'utf8');
  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(expected, provided);
}

module.exports = { sign, verify };
