'use strict';

const multer = require('multer');
const env = require('./env');
const ApiError = require('../utils/ApiError');

/**
 * Upload mémoire pour l'import de questions (CSV/Excel) — spec §12.
 * On garde le fichier en mémoire pour le parser à la volée (csv-parser) sans
 * écrire sur disque.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.uploads.maxSizeMb * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const allowed = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream',
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(csv|xlsx?|)$/i)) {
      return cb(null, true);
    }
    return cb(new Error('Format de fichier non supporté (CSV/Excel attendu).'));
  },
});

/**
 * Upload mémoire pour l'avatar de profil. Le buffer est ensuite poussé vers
 * Cloudinary (recadrage 200×200 côté service). Limite 5 Mo + filtre image/*.
 * Le rejet utilise une ApiError → le middleware d'erreurs renvoie un 400 propre
 * (un Error nu finirait en 500).
 */
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      return cb(null, true);
    }
    return cb(new ApiError('VALIDATION_ERROR', { message: 'Seules les images sont acceptées.' }));
  },
});

module.exports = upload;
module.exports.avatarUpload = avatarUpload;
