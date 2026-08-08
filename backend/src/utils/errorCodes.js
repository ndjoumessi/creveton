'use strict';

/**
 * Catalogue des codes d'erreur (réf. spec API §16).
 * Chaque code mappe vers son statut HTTP et un message PAR LANGUE.
 *
 * ─ Pourquoi bilingue ICI et pas côté client ─
 * L'app affichait « Email ou mot de passe incorrect. » à un joueur anglophone :
 * ce catalogue était monolingue et le client se contente de relayer
 * `error.message`. Traduire côté client aurait supposé une table code → texte
 * dupliquée dans le mobile ET la console, qui dériverait du serveur au premier
 * code ajouté. La source reste donc ici ; c'est le SERVEUR qui choisit la
 * langue, à partir de la requête (cf. utils/lang.js).
 *
 * La résolution se fait à la SÉRIALISATION (errorHandler), jamais à la
 * construction : au moment où un service lève une erreur, la requête n'est pas
 * accessible. `ApiError` transporte donc un code, pas une chaîne figée.
 *
 * Ajouter un code = renseigner `fr` ET `en`. `tests/errorCodes.test.js` refuse
 * un code incomplet — une traduction oubliée ne doit pas se découvrir en prod.
 */

const ERROR_CODES = {
  VALIDATION_ERROR: { http: 400, fr: 'Champ(s) invalide(s).', en: 'Invalid field(s).' },
  INVALID_TIMESTAMP: { http: 400, fr: "Le paramètre « since » est mal formé.", en: 'The "since" parameter is malformed.' },
  OTP_INVALID: { http: 400, fr: 'Code OTP incorrect.', en: 'Incorrect OTP code.' },
  // Réinitialisation de mot de passe : codes DISTINCTS des OTP_* — le canal
  // (email) et le sens diffèrent, et « Code OTP incorrect » serait faux pour un
  // code reçu par email. Sépare aussi les deux flux dans les journaux.
  RESET_CODE_INVALID: { http: 400, fr: 'Code de réinitialisation incorrect.', en: 'Incorrect reset code.' },
  VERIFY_CODE_INVALID: { http: 400, fr: 'Code de vérification incorrect.', en: 'Incorrect verification code.' },
  INVALID_CURRENT_PASSWORD: { http: 400, fr: 'Mot de passe actuel incorrect.', en: 'Incorrect current password.' },

  AUTH_INVALID_CREDENTIALS: { http: 401, fr: 'Email ou mot de passe incorrect.', en: 'Incorrect email or password.' },
  TOKEN_EXPIRED: { http: 401, fr: "Le token d'accès a expiré.", en: 'The access token has expired.' },
  TOKEN_INVALID: { http: 401, fr: "Token d'authentification invalide.", en: 'Invalid authentication token.' },
  TOKEN_MISSING: { http: 401, fr: "Token d'authentification absent.", en: 'Missing authentication token.' },
  REFRESH_TOKEN_INVALID: { http: 401, fr: 'Refresh token invalide ou révoqué.', en: 'Invalid or revoked refresh token.' },
  REFRESH_TOKEN_EXPIRED: { http: 401, fr: 'Refresh token expiré.', en: 'Refresh token expired.' },

  PAYMENT_REQUIRED: { http: 402, fr: 'Paiement nécessaire.', en: 'Payment required.' },

  PHONE_NOT_VERIFIED: { http: 403, fr: "Numéro non vérifié (OTP requis).", en: 'Phone number not verified (OTP required).' },
  ACCOUNT_SUSPENDED: { http: 403, fr: 'Compte suspendu ou banni.', en: 'Account suspended or banned.' },
  FORBIDDEN: { http: 403, fr: 'Rôle insuffisant.', en: 'Insufficient role.' },
  FEATURE_DISABLED: { http: 403, fr: 'Fonctionnalité indisponible.', en: 'Feature unavailable.' },
  MODE_NOT_ALLOWED: { http: 403, fr: 'Action réservée au mode normal.', en: 'Action restricted to normal mode.' },
  NOT_PARTICIPANT: { http: 403, fr: "Vous n'êtes pas inscrit à ce tournoi.", en: 'You are not registered for this tournament.' },

  USER_NOT_FOUND: { http: 404, fr: 'Utilisateur introuvable.', en: 'User not found.' },
  QUESTION_NOT_FOUND: { http: 404, fr: 'Question introuvable.', en: 'Question not found.' },
  TOURNAMENT_NOT_FOUND: { http: 404, fr: 'Tournoi introuvable.', en: 'Tournament not found.' },
  CHALLENGE_NOT_FOUND: { http: 404, fr: 'Challenge introuvable.', en: 'Duel not found.' },
  JOB_NOT_FOUND: { http: 404, fr: 'Tâche planifiée introuvable.', en: 'Scheduled job not found.' },
  SESSION_NOT_FOUND: { http: 404, fr: 'Partie introuvable.', en: 'Game not found.' },
  NO_QUESTIONS_AVAILABLE: { http: 404, fr: 'Aucune question disponible pour ce filtre.', en: 'No questions available for this filter.' },
  INVITATION_NOT_FOUND: { http: 404, fr: 'Invitation introuvable.', en: 'Invitation not found.' },
  NOT_FOUND: { http: 404, fr: 'Ressource introuvable.', en: 'Resource not found.' },

  EMAIL_ALREADY_USED: { http: 409, fr: 'Cet email est déjà utilisé.', en: 'This email is already in use.' },
  EMAIL_ALREADY_VERIFIED: { http: 409, fr: 'Cette adresse est déjà vérifiée.', en: 'This address is already verified.' },
  JOB_ALREADY_RUNNING: { http: 409, fr: 'Cette tâche est déjà en cours.', en: 'This job is already running.' },
  PHONE_ALREADY_USED: { http: 409, fr: 'Ce numéro est déjà utilisé.', en: 'This phone number is already in use.' },
  DUPLICATE_QUESTION: { http: 409, fr: 'Une question identique existe déjà.', en: 'An identical question already exists.' },
  SESSION_ALREADY_SUBMITTED: { http: 409, fr: 'Cette session a déjà été soumise.', en: 'This game has already been submitted.' },
  ALREADY_REGISTERED: { http: 409, fr: 'Déjà inscrit à ce tournoi.', en: 'Already registered for this tournament.' },
  TOURNAMENT_FULL: { http: 409, fr: 'Tournoi complet.', en: 'Tournament full.' },
  ALREADY_PLAYED: { http: 409, fr: 'Challenge déjà joué.', en: 'Duel already played.' },
  ALREADY_ANSWERED: { http: 409, fr: 'Réponse déjà enregistrée pour cette question.', en: 'An answer is already recorded for this question.' },
  TOURNAMENT_ALREADY_RUNNING: { http: 409, fr: 'Le tournoi est déjà en cours.', en: 'The tournament is already running.' },
  INVITATION_NOT_PENDING: { http: 409, fr: "Cette invitation n'est plus en attente.", en: 'This invitation is no longer pending.' },

  OTP_EXPIRED: { http: 410, fr: 'Le code OTP a expiré.', en: 'The OTP code has expired.' },
  RESET_CODE_EXPIRED: { http: 410, fr: 'Le code de réinitialisation a expiré.', en: 'The reset code has expired.' },
  VERIFY_CODE_EXPIRED: { http: 410, fr: 'Le code de vérification a expiré.', en: 'The verification code has expired.' },
  INVITE_EXPIRED: { http: 410, fr: "L'invitation est invalide ou a expiré.", en: 'The invitation is invalid or has expired.' },

  INVALID_CORRECT_OPTION_COUNT: { http: 422, fr: 'Il doit y avoir exactement une bonne réponse.', en: 'There must be exactly one correct answer.' },
  TOURNAMENT_NOT_OPEN: { http: 422, fr: "Le tournoi n'est pas ouvert aux inscriptions.", en: 'The tournament is not open for registration.' },
  TOURNAMENT_NOT_RUNNING: { http: 422, fr: "Le tournoi n'est pas en cours.", en: 'The tournament is not running.' },
  NOT_ENOUGH_QUESTIONS: { http: 422, fr: 'Pas assez de questions approuvées pour lancer ce tournoi.', en: 'Not enough approved questions to start this tournament.' },
  ANSWER_TOO_LATE: { http: 422, fr: 'Le temps imparti pour cette question est écoulé.', en: 'Time is up for this question.' },
  CHALLENGE_EXPIRED: { http: 422, fr: 'Challenge expiré.', en: 'Duel expired.' },
  CHEAT_DETECTED: { http: 422, fr: 'Comportement suspect détecté.', en: 'Suspicious behaviour detected.' },

  OTP_TOO_MANY_ATTEMPTS: { http: 429, fr: "Trop de tentatives OTP.", en: 'Too many OTP attempts.' },
  RESET_TOO_MANY_ATTEMPTS: { http: 429, fr: 'Trop de tentatives, demandez un nouveau code.', en: 'Too many attempts, request a new code.' },
  VERIFY_TOO_MANY_ATTEMPTS: { http: 429, fr: 'Trop de tentatives, demandez un nouveau code.', en: 'Too many attempts, request a new code.' },
  RATE_LIMITED: { http: 429, fr: 'Trop de requêtes, réessayez plus tard.', en: 'Too many requests, try again later.' },

  INTERNAL_ERROR: { http: 500, fr: 'Erreur serveur.', en: 'Server error.' },
  NOT_IMPLEMENTED: { http: 501, fr: 'Endpoint non encore implémenté (scaffold).', en: 'Endpoint not implemented yet (scaffold).' },
  SMS_PROVIDER_UNAVAILABLE: { http: 503, fr: 'Service SMS temporairement indisponible.', en: 'SMS service temporarily unavailable.' },
  PAYMENT_PROVIDER_UNAVAILABLE: { http: 503, fr: 'Service de paiement temporairement indisponible.', en: 'Payment service temporarily unavailable.' },
  EMAIL_SEND_FAILED: { http: 503, fr: "L'envoi de l'email a échoué, réessayez plus tard.", en: 'Sending the email failed, try again later.' },
  AI_NOT_CONFIGURED: { http: 503, fr: 'Correcteur IA non configuré (clé absente).', en: 'AI corrector not configured (missing key).' },
  AI_TIMEOUT: { http: 503, fr: 'Le correcteur IA a expiré, réessayez.', en: 'The AI corrector timed out, try again.' },
  AI_UNAVAILABLE: { http: 503, fr: 'Le correcteur IA est temporairement indisponible.', en: 'The AI corrector is temporarily unavailable.' },
};

/** Langues servies. `fr` est le repli (public cible camerounais). */
const SUPPORTED_LANGS = ['fr', 'en'];
const DEFAULT_LANG = 'fr';

/**
 * Message d'un code dans la langue demandée. Repli en cascade :
 * langue demandée → français → le code lui-même (un code inconnu doit produire
 * quelque chose d'exploitable, pas `undefined`).
 */
function messageFor(code, lang = DEFAULT_LANG) {
  const entry = ERROR_CODES[code];
  if (!entry) return code;
  return entry[lang] || entry[DEFAULT_LANG] || code;
}

module.exports = ERROR_CODES;
module.exports.messageFor = messageFor;
module.exports.SUPPORTED_LANGS = SUPPORTED_LANGS;
module.exports.DEFAULT_LANG = DEFAULT_LANG;
