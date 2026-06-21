'use strict';

/**
 * Catalogue des codes d'erreur (réf. spec API §16).
 * Chaque code mappe vers son statut HTTP et un message FR par défaut.
 * Le message peut être surchargé/localisé à la levée de l'erreur.
 */

const ERROR_CODES = {
  VALIDATION_ERROR: { http: 400, message: 'Champ(s) invalide(s).' },
  INVALID_TIMESTAMP: { http: 400, message: "Le paramètre « since » est mal formé." },
  OTP_INVALID: { http: 400, message: 'Code OTP incorrect.' },

  AUTH_INVALID_CREDENTIALS: { http: 401, message: 'Email ou mot de passe incorrect.' },
  TOKEN_EXPIRED: { http: 401, message: "Le token d'accès a expiré." },
  TOKEN_INVALID: { http: 401, message: "Token d'authentification invalide." },
  TOKEN_MISSING: { http: 401, message: "Token d'authentification absent." },
  REFRESH_TOKEN_INVALID: { http: 401, message: 'Refresh token invalide ou révoqué.' },
  REFRESH_TOKEN_EXPIRED: { http: 401, message: 'Refresh token expiré.' },

  PAYMENT_REQUIRED: { http: 402, message: 'Paiement nécessaire.' },

  PHONE_NOT_VERIFIED: { http: 403, message: "Numéro non vérifié (OTP requis)." },
  ACCOUNT_SUSPENDED: { http: 403, message: 'Compte suspendu ou banni.' },
  FORBIDDEN: { http: 403, message: 'Rôle insuffisant.' },
  FEATURE_DISABLED: { http: 403, message: 'Fonctionnalité indisponible.' },

  USER_NOT_FOUND: { http: 404, message: 'Utilisateur introuvable.' },
  QUESTION_NOT_FOUND: { http: 404, message: 'Question introuvable.' },
  TOURNAMENT_NOT_FOUND: { http: 404, message: 'Tournoi introuvable.' },
  CHALLENGE_NOT_FOUND: { http: 404, message: 'Challenge introuvable.' },
  NO_QUESTIONS_AVAILABLE: { http: 404, message: 'Aucune question disponible pour ce filtre.' },
  NOT_FOUND: { http: 404, message: 'Ressource introuvable.' },

  EMAIL_ALREADY_USED: { http: 409, message: 'Cet email est déjà utilisé.' },
  PHONE_ALREADY_USED: { http: 409, message: 'Ce numéro est déjà utilisé.' },
  DUPLICATE_QUESTION: { http: 409, message: 'Une question identique existe déjà.' },
  SESSION_ALREADY_SUBMITTED: { http: 409, message: 'Cette session a déjà été soumise.' },
  ALREADY_REGISTERED: { http: 409, message: 'Déjà inscrit à ce tournoi.' },
  TOURNAMENT_FULL: { http: 409, message: 'Tournoi complet.' },
  ALREADY_PLAYED: { http: 409, message: 'Challenge déjà joué.' },

  OTP_EXPIRED: { http: 410, message: 'Le code OTP a expiré.' },

  INVALID_CORRECT_OPTION_COUNT: { http: 422, message: 'Il doit y avoir exactement une bonne réponse.' },
  TOURNAMENT_NOT_OPEN: { http: 422, message: "Le tournoi n'est pas ouvert aux inscriptions." },
  CHALLENGE_EXPIRED: { http: 422, message: 'Challenge expiré.' },
  CHEAT_DETECTED: { http: 422, message: 'Comportement suspect détecté.' },

  OTP_TOO_MANY_ATTEMPTS: { http: 429, message: "Trop de tentatives OTP." },
  RATE_LIMITED: { http: 429, message: 'Trop de requêtes, réessayez plus tard.' },

  INTERNAL_ERROR: { http: 500, message: 'Erreur serveur.' },
  NOT_IMPLEMENTED: { http: 501, message: 'Endpoint non encore implémenté (scaffold).' },
  SMS_PROVIDER_UNAVAILABLE: { http: 503, message: 'Service SMS temporairement indisponible.' },
  PAYMENT_PROVIDER_UNAVAILABLE: { http: 503, message: 'Service de paiement temporairement indisponible.' },
};

module.exports = ERROR_CODES;
