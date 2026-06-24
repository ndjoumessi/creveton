'use strict';

// Service d'avatars — upload/suppression via Cloudinary (remplace le stockage
// disque local, éphémère sur Railway). L'image est recadrée/redimensionnée en
// 200×200 côté Cloudinary (crop « fill » centré sur le visage si détecté).
//
// Les public_id sont timestampés (user_<id>_<ts>) pour casser le cache CDN/RN à
// chaque changement de photo. Comme l'ancien asset n'est donc plus écrasé, on
// applique un « delete-before-replace » : l'appelant passe l'ancien public_id,
// qu'on supprime (best-effort) après l'upload du nouveau. Sans ça, les anciens
// avatars s'accumulent (orphelins) et la suppression ne cible jamais le bon asset.

const cloudinary = require('../config/cloudinary');

const FOLDER = 'creveton/avatars';

/**
 * Téléverse le buffer image d'un avatar vers Cloudinary, puis supprime l'ancien
 * asset (s'il existe) en best-effort.
 * @param {{ buffer: Buffer, mimetype: string, userId: string, oldPublicId?: string|null }} p
 * @returns {Promise<{ url: string, publicId: string }>} URL HTTPS + public_id du nouvel asset.
 */
async function uploadAvatar({ buffer, mimetype, userId, oldPublicId }) {
  const b64 = Buffer.from(buffer).toString('base64');
  const dataUri = `data:${mimetype};base64,${b64}`;
  const result = await cloudinary.uploader.unsigned_upload(
    dataUri,
    process.env.CLOUDINARY_UPLOAD_PRESET || 'creveton_avatar',
    {
      public_id: `user_${userId}_${Date.now()}`,
      folder: FOLDER,
    }
  );
  // Nettoyage de l'ancien avatar — non bloquant : un échec Cloudinary ne doit
  // pas faire échouer l'upload qui, lui, a réussi.
  if (oldPublicId) {
    cloudinary.uploader.destroy(oldPublicId).catch(() => {
      /* avatar absent ou Cloudinary indisponible : best-effort */
    });
  }
  return { url: result.secure_url, publicId: result.public_id };
}

/**
 * Supprime un avatar Cloudinary par son public_id (best-effort, ne lève pas).
 * @param {string|null|undefined} publicId public_id stocké en base.
 */
async function deleteAvatar(publicId) {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (_) {
    /* avatar absent ou Cloudinary indisponible : best-effort */
  }
}

module.exports = { uploadAvatar, deleteAvatar };
