'use strict';

// Service d'images de question — upload/suppression via Cloudinary.
//
// Différences avec avatarService : ici l'upload est SIGNÉ (admin authentifié,
// pas de preset public unsigned) et applique une transformation 800px de large
// (quiz : 16:9 recommandé). Les public_id sont timestampés
// (question_<id>_<ts>) pour casser le cache CDN à chaque remplacement ; comme
// l'ancien asset n'est donc pas écrasé, on applique un « delete-before-replace »
// best-effort (l'appelant passe l'ancien public_id).

const cloudinary = require('../config/cloudinary');

const FOLDER = 'creveton/questions';

/**
 * Téléverse (signé) l'image d'une question vers Cloudinary, puis supprime
 * l'ancien asset (best-effort).
 * @param {{ buffer: Buffer, mimetype: string, questionId: string, oldPublicId?: string|null }} p
 * @returns {Promise<{ url: string, publicId: string }>} URL HTTPS + public_id.
 */
async function uploadQuestionImage({ buffer, mimetype, questionId, oldPublicId }) {
  const b64 = Buffer.from(buffer).toString('base64');
  const dataUri = `data:${mimetype};base64,${b64}`;
  const result = await cloudinary.uploader.upload(dataUri, {
    folder: FOLDER,
    public_id: `question_${questionId}_${Date.now()}`,
    // Borne la largeur à 800px (jamais d'agrandissement), format/qualité auto.
    transformation: [{ width: 800, crop: 'limit', quality: 'auto', fetch_format: 'auto' }],
  });
  if (oldPublicId) {
    cloudinary.uploader.destroy(oldPublicId).catch(() => {
      /* asset absent ou Cloudinary indisponible : best-effort */
    });
  }
  return { url: result.secure_url, publicId: result.public_id };
}

/**
 * Supprime une image de question par son public_id (best-effort, ne lève pas).
 * @param {string|null|undefined} publicId public_id stocké en base.
 */
async function deleteQuestionImage(publicId) {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (_) {
    /* asset absent ou Cloudinary indisponible : best-effort */
  }
}

module.exports = { uploadQuestionImage, deleteQuestionImage };
