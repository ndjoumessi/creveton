'use strict';

const notImplemented = require('../utils/notImplemented');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const walletService = require('../services/walletService');

/** Contrôleurs Profil & utilisateur (spec §10/§11). */
module.exports = {
  // GET /users/me
  me: notImplemented('GET /users/me'),
  // PATCH /users/me
  updateMe: notImplemented('PATCH /users/me'),
  // GET /users/me/history
  history: notImplemented('GET /users/me/history'),
  // GET /users/me/transactions (derrière le flag payant) → historique paginé
  transactions: asyncHandler(async (req, res) => {
    const result = await walletService.listTransactions({
      userId: req.user.id,
      limit: req.query.limit,
      cursor: req.query.cursor,
    });
    return ok(res, result);
  }),
};
