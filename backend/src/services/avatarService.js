'use strict';

// Service d'avatars — upload/suppression via Cloudinary (remplace le stockage
// disque local, éphémère sur Railway). L'image est recadrée/redimensionnée en
// 200×200 côté Cloudinary (crop « fill » centré sur le visage si détecté).

const cloudinary = require('../config/cloudinary');

const FOLDER = 'creveton/avatars';
const publicId = (userId) => `${FOLDER}/user_${userId}`;

/**
 * Téléverse le buffer image d'un avatar vers Cloudinary.
 * @param {{ buffer: Buffer, mimetype: string, userId: string }} p
 * @returns {Promise<string>} URL HTTPS sécurisée de l'avatar.
 */
async function uploadAvatar({ buffer, mimetype, userId }) {
  const b64 = Buffer.from(buffer).toString('base64');
  const dataUri = `data:${mimetype};base64,${b64}`;
  const result = await cloudinary.uploader.upload(dataUri, {
    public_id: `user_${userId}`,
    folder: FOLDER,
    overwrite: true,
    transformation: [{ width: 200, height: 200, crop: 'fill', gravity: 'face' }],
  });
  return result.secure_url;
}

/** Supprime l'avatar Cloudinary d'un user (best-effort, ne lève pas). */
async function deleteAvatar(userId) {
  try {
    await cloudinary.uploader.destroy(publicId(userId));
  } catch (_) {
    /* avatar absent ou Cloudinary indisponible : best-effort */
  }
}

module.exports = { uploadAvatar, deleteAvatar };
