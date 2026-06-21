'use strict';

const db = require('../config/database');
const env = require('../config/env');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const hmac = require('../utils/hmac');
const { PAYMENT_PROVIDERS } = require('../utils/constants');
const transactionModel = require('../models/transaction.model');
const userModel = require('../models/user.model');

/**
 * Webhooks paiement prestataire → backend (réf. spec §14).
 *
 * Sécurité : signature HMAC-SHA256 (header X-Signature) vérifiée AVANT tout
 * traitement. Idempotence par `reference` (une transaction déjà finalisée n'est
 * jamais recréditée). Double vérification du montant. Sur `success` : crédit du
 * wallet (transaction atomique). Sur `failed` : transaction marquée échouée.
 */

// provider (URL/normalisé) → secret de webhook configuré (env).
const PROVIDER_SECRET = {
  orange_money: () => env.payments.orangeMoney.webhookSecret,
  mtn_momo: () => env.payments.mtnMomo.webhookSecret,
  campay: () => env.payments.campay.webhookSecret,
};

/**
 * Traite un webhook paiement.
 * @param {object} args
 * @param {string} args.provider          paramètre d'URL.
 * @param {Buffer|string} args.rawBody     corps brut (pour le HMAC).
 * @param {string} args.signature          header X-Signature.
 * @param {object} args.body               corps parsé (normalisé §14).
 * @returns {Promise<object>} accusé de réception (toujours 200 si signature OK).
 */
async function handlePayment({ provider, rawBody, signature, body }) {
  if (!PAYMENT_PROVIDERS.includes(provider)) {
    throw new ApiError('NOT_FOUND', { message: `Prestataire inconnu : ${provider}.` });
  }

  const secret = PROVIDER_SECRET[provider]();
  if (!hmac.verify(rawBody, signature, secret)) {
    throw new ApiError('TOKEN_INVALID', { message: 'Signature webhook invalide.' });
  }

  const { reference, status, amount } = body || {};
  if (!reference || !status) {
    throw new ApiError('VALIDATION_ERROR', { message: 'Webhook incomplet (reference/status requis).' });
  }

  const tx = await transactionModel.findByReference(reference);
  // Référence inconnue → on accuse réception pour stopper les retries (rien à faire).
  if (!tx) {
    logger.warn('Webhook : référence inconnue', { provider, reference });
    return { received: true, matched: false };
  }

  // Idempotence : transaction déjà finalisée → on ne retraite pas.
  if (tx.status !== 'pending') {
    return { received: true, idempotent: true };
  }

  if (status === 'success') {
    // Double vérification du montant (anti-fraude §11).
    if (Number(amount) !== Number(tx.amount)) {
      await transactionModel.setStatus(tx.id, 'failed');
      logger.error('Webhook : montant incohérent', { reference, expected: tx.amount, received: amount });
      return { received: true, amount_mismatch: true };
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      await transactionModel.setStatus(tx.id, 'success', client);
      await userModel.incrementWallet(tx.user_id, Number(tx.amount), client);
      // NB : si tx.tournament_id est présent (paiement d'inscription), c'est ici
      // qu'on confirmerait la participation au tournoi (module tournois).
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return { received: true, credited: true };
  }

  if (status === 'failed') {
    await transactionModel.setStatus(tx.id, 'failed');
    return { received: true, failed: true };
  }

  // Autres statuts : on accuse simplement réception.
  return { received: true };
}

module.exports = { handlePayment };
