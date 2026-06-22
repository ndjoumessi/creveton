'use strict';

const multer = require('multer');
const env = require('./env');

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
 * Upload mémoire pour l'avatar de profil. Le client envoie une image déjà
 * recadrée et redimensionnée (≤256px) ; le serveur ne fait que valider puis
 * écrire. Pas de dépendance image (sharp non installé) : on garde le buffer.
 * Limite stricte 2 Mo + filtre mime image (jpeg/png/webp).
 */
const AVATAR_MIME = ['image/jpeg', 'image/png', 'image/webp'];

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (AVATAR_MIME.includes(file.mimetype)) {
      return cb(null, true);
    }
    return cb(new Error('Format d’image non supporté (JPEG/PNG/WebP attendu).'));
  },
});

module.exports = upload;
module.exports.avatarUpload = avatarUpload;
module.exports.AVATAR_MIME = AVATAR_MIME;
