'use strict';

/** Énumérations métier partagées (réf. spec §15 & §5). */

const THEMES = ['culture', 'geographie', 'histoire', 'industrie', 'sport', 'science'];
const LEVELS = ['beginner', 'intermediate', 'expert'];
const QUESTION_TYPES = ['mcq', 'true_false', 'open', 'order'];
const QUESTION_STATUSES = ['draft', 'pending_review', 'approved', 'rejected', 'archived'];

// blitz : 1 timer global (~60 s, tous thèmes/niveaux mélangés).
// marathon : 1 timer global (~180 s), 20 questions mix, bonus thème consécutif.
const GAME_MODES = ['normal', 'tournament', 'challenge', 'blitz', 'marathon'];
const SEXES = ['H', 'F', 'N'];
const LANGS = ['fr', 'en'];

const ROLES = ['player', 'moderator', 'admin', 'super_admin'];

const TOURNAMENT_TYPES = ['free', 'flash', 'mini', 'grand', 'premium'];
const TOURNAMENT_STATUSES = ['scheduled', 'open', 'running', 'closed', 'paid', 'cancelled'];

const PAYMENT_PROVIDERS = ['orange_money', 'mtn_momo', 'campay'];
const TRANSACTION_TYPES = ['deposit', 'withdraw', 'payout', 'entry_fee', 'refund'];
const TRANSACTION_STATUSES = ['pending', 'success', 'failed', 'reversed'];

const LEADERBOARD_SCOPES = ['global', 'theme', 'weekly', 'monthly'];

// Niveau joueur (1–5) calculé dynamiquement depuis total_xp (CDC §4.1).
// Distinct de la difficulté des questions (LEVELS). Seuil i ⇒ niveau i+1 atteint
// quand total_xp >= LEVEL_XP_THRESHOLDS[i]. Aligné sur les bandes XP de la
// console admin (Novice/Apprenti/Joueur/Expert/Champion).
const LEVEL_XP_THRESHOLDS = [0, 200, 500, 1200, 3000];

const CURRENCY = 'XAF';

// Format téléphone Cameroun : +237 suivi de 9 chiffres.
const PHONE_REGEX = /^\+237\d{9}$/;

module.exports = {
  THEMES,
  LEVELS,
  QUESTION_TYPES,
  QUESTION_STATUSES,
  GAME_MODES,
  SEXES,
  LANGS,
  ROLES,
  TOURNAMENT_TYPES,
  TOURNAMENT_STATUSES,
  PAYMENT_PROVIDERS,
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
  LEADERBOARD_SCOPES,
  LEVEL_XP_THRESHOLDS,
  CURRENCY,
  PHONE_REGEX,
};
