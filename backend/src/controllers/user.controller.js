'use strict';

const fs = require('fs');
const path = require('path');
const notImplemented = require('../utils/notImplemented');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok, noContent } = require('../utils/response');
const walletService = require('../services/walletService');
const userModel = require('../models/user.model');

// Dossier de stockage des avatars (absolu, racine du projet backend).
const AVATARS_DIR = path.join(__dirname, '../../uploads/avatars');
const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_EXTS = ['jpg', 'png', 'webp'];

/** Supprime tout fichier avatar préexistant pour ce user (toutes extensions). */
function removeExistingAvatars(userId) {
  for (const ext of AVATAR_EXTS) {
    const p = path.join(AVATARS_DIR, `${userId}.${ext}`);
    try {
      fs.unlinkSync(p);
    } catch (_) {
      /* fichier absent : best-effort */
    }
  }
}

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
  // POST /users/me/avatar — téléverse un avatar (image déjà recadrée/redimensionnée
  // par le client ; le serveur valide mime + taille puis écrit le fichier).
  uploadAvatar: asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) {
      throw new ApiError('VALIDATION_ERROR', { message: 'Champ « avatar » (image) requis.' });
    }
    const ext = MIME_TO_EXT[file.mimetype];
    if (!ext) {
      throw new ApiError('VALIDATION_ERROR', {
        message: 'Format d’image non supporté (JPEG/PNG/WebP attendu).',
      });
    }
    if (file.size > MAX_AVATAR_BYTES) {
      throw new ApiError('VALIDATION_ERROR', { message: 'Image trop volumineuse (max 2 Mo).' });
    }

    const userId = req.user.id;
    fs.mkdirSync(AVATARS_DIR, { recursive: true });
    // Évite les orphelins lors d'un changement d'extension (ex. png → webp).
    removeExistingAvatars(userId);

    const filename = `${userId}.${ext}`;
    fs.writeFileSync(path.join(AVATARS_DIR, filename), file.buffer);

    const url = `/uploads/avatars/${filename}`;
    await userModel.setAvatar(userId, url);
    // Cache-buster pour forcer le rafraîchissement côté navigateur.
    return ok(res, { avatar_url: `${url}?v=${Date.now()}` });
  }),
  // DELETE /users/me/avatar — supprime l'avatar (fichier + colonne).
  deleteAvatar: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    removeExistingAvatars(userId);
    await userModel.clearAvatar(userId);
    return noContent(res);
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
