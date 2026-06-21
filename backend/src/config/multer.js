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

module.exports = upload;
