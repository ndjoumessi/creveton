'use strict';

// Configuration Cloudinary (stockage des avatars). Les identifiants viennent de
// l'environnement (Railway → Variables) ; en local/dev ils peuvent être absents
// (l'upload échouera alors à l'exécution, ce qui est attendu hors prod). Les
// tests mockent entièrement le module « cloudinary », ce code n'y est pas exécuté.
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

module.exports = cloudinary;
