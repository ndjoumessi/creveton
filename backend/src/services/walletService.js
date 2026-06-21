'use strict';

const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const userModel = require('../models/user.model');
const transactionModel = require('../models/transaction.model');

/**
 * Wallet & recharges Mobile Money (réf. spec §11). Tout ce module est derrière
 * le flag `tournaments.paid.enabled` (vérifié au niveau des routes).
 *
 * Le crédit effectif n'intervient PAS ici : la recharge crée une transaction
 * `pending` ; le wallet est crédité à réception du webhook signé (§14).
 */

const CURRENCY = 'XAF';

/** Référence métier unique (échangée avec le prestataire + le webhook). */
function generateReference() {
  return `CRV-TX-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
}

/** GET /wallet — solde + recharges en attente. */
async function getWallet(userId) {
  const user = await userModel.findById(userId);
  if (!user) throw new ApiError('USER_NOT_FOUND');
  const pending = await transactionModel.pendingTotal(userId);
  return {
    balance: Number(user.wallet_balance),
    currency: CURRENCY,
    pending,
  };
}

/**
 * POST /wallet/recharge — initie une recharge (transaction `pending`).
 * Idempotent : la clé `Idempotency-Key` sert de `reference` ; un rejeu renvoie
 * la transaction existante au lieu d'en créer une seconde.
 * @returns {{ transaction_id, status, amount, provider, ussd_prompt_sent, reference }}
 */
async function recharge({ userId, amount, provider, phone, idempotencyKey }) {
  const reference = idempotencyKey || generateReference();

  const existing = await transactionModel.findByReference(reference);
  if (existing) {
    return {
      transaction_id: existing.id,
      status: existing.status,
      amount: Number(existing.amount),
      provider: existing.provider,
      ussd_prompt_sent: true,
      reference,
    };
  }

  let tx;
  try {
    tx = await transactionModel.create({
      user_id: userId,
      type: 'deposit',
      amount,
      currency: CURRENCY,
      provider,
      status: 'pending',
      reference,
      metadata: { phone },
    });
  } catch (err) {
    // Course perdue sur la référence UNIQUE → on renvoie l'existante (idempotent).
    if (err && err.code === '23505') {
      const raced = await transactionModel.findByReference(reference);
      if (raced) {
        return {
          transaction_id: raced.id,
          status: raced.status,
          amount: Number(raced.amount),
          provider: raced.provider,
          ussd_prompt_sent: true,
          reference,
        };
      }
    }
    throw err;
  }

  // En prod, on déclencherait ici l'appel prestataire (USSD push). Simulé ici.
  return {
    transaction_id: tx.id,
    status: tx.status,
    amount: Number(tx.amount),
    provider: tx.provider,
    ussd_prompt_sent: true,
    reference,
  };
}

/** GET /users/me/transactions — historique paginé. */
async function listTransactions({ userId, limit = 20, cursor = null }) {
  const offset = Math.max(0, parseInt(cursor, 10) || 0);
  const { rows, hasMore } = await transactionModel.listByUser(userId, { limit, offset });
  return {
    data: rows.map((r) => transactionModel.toView(r)),
    page: { limit, next_cursor: hasMore ? String(offset + limit) : null, has_more: hasMore },
  };
}

module.exports = { getWallet, recharge, listTransactions, generateReference };
