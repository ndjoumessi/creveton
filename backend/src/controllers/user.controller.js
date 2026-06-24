'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok, noContent } = require('../utils/response');
const walletService = require('../services/walletService');
const avatarService = require('../services/avatarService');
const userModel = require('../models/user.model');
const sessionModel = require('../models/session.model');

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
  // POST /users/me/avatar — téléverse un avatar vers Cloudinary (recadrage 200×200
  // côté Cloudinary) puis enregistre l'URL HTTPS. Le mime est filtré en amont par
  // multer (image/*) ; ici on vérifie seulement la présence du fichier.
  uploadAvatar: asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) {
      throw new ApiError('VALIDATION_ERROR', { message: 'Champ « avatar » (image) requis.' });
    }
    const userId = req.user.id;
    // public_id de l'avatar courant → supprimé après l'upload du nouveau
    // (delete-before-replace : un seul asset Cloudinary par user).
    const current = await userModel.findById(userId);
    const { url, publicId } = await avatarService.uploadAvatar({
      buffer: file.buffer,
      mimetype: file.mimetype,
      userId,
      oldPublicId: current?.avatar_public_id,
    });
    await userModel.setAvatar(userId, url, publicId);
    return ok(res, { avatar_url: url });
  }),
  // DELETE /users/me/avatar — supprime l'avatar (asset Cloudinary + colonnes).
  deleteAvatar: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const current = await userModel.findById(userId);
    await avatarService.deleteAvatar(current?.avatar_public_id);
    await userModel.clearAvatar(userId);
    return noContent(res);
  }),
  // GET /users/me/history — historique paginé des parties du joueur (cursor = offset).
  // Alimente les stats rapides + « dernières parties » de l'accueil mobile.
  history: asyncHandler(async (req, res) => {
    const { limit, cursor } = req.query;
    const offset = Math.max(0, parseInt(cursor, 10) || 0);
    const { rows, hasMore } = await sessionModel.listByUser(req.user.id, { limit, offset });
    return ok(res, {
      data: rows.map(sessionModel.toView),
      page: {
        limit,
        next_cursor: hasMore ? String(offset + limit) : null,
        has_more: hasMore,
      },
    });
  }),
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
