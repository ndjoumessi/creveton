'use strict';

const notImplemented = require('../utils/notImplemented');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok } = require('../utils/response');
const walletService = require('../services/walletService');
const userModel = require('../models/user.model');

/** Contrôleurs Profil & utilisateur (spec §10/§11). */
module.exports = {
  // GET /users/me — profil de l'utilisateur authentifié.
  me: asyncHandler(async (req, res) => {
    const row = await userModel.findById(req.user.id);
    if (!row) throw new ApiError('USER_NOT_FOUND');
    return ok(res, userModel.toPublic(row));
  }),
  // PATCH /users/me — met à jour le profil (name, ville, age, sexe, lang).
  updateMe: asyncHandler(async (req, res) => {
    const { password, current_password: _cp, ...profile } = req.body;
    if (password) {
      throw new ApiError('VALIDATION_ERROR', { message: 'Utilisez POST /auth/change-password pour le mot de passe.' });
    }
    const row = await userModel.updateProfile(req.user.id, profile);
    if (!row) throw new ApiError('USER_NOT_FOUND');
    return ok(res, userModel.toPublic(row));
  }),
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
