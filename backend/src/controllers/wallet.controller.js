'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const walletService = require('../services/walletService');

/** Contrôleurs Wallet & paiements (spec §11) — derrière le flag payant. */

/** GET /wallet → 200 { balance, currency, pending } */
const get = asyncHandler(async (req, res) => {
  const result = await walletService.getWallet(req.user.id);
  return ok(res, result);
});

/** POST /wallet/recharge → 202 { transaction_id, status, ..., reference } */
const recharge = asyncHandler(async (req, res) => {
  const result = await walletService.recharge({
    userId: req.user.id,
    amount: req.body.amount,
    provider: req.body.provider,
    phone: req.body.phone,
    idempotencyKey: req.headers['idempotency-key'],
  });
  return res.status(202).json(result);
});

module.exports = { get, recharge };
