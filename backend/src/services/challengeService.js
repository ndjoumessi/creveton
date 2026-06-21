'use strict';

const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const scoreService = require('./scoreService');
const questionService = require('./questionService');
const { levelFromXp } = require('./gameService');
const questionModel = require('../models/question.model');
const challengeModel = require('../models/challenge.model');
const userModel = require('../models/user.model');

/**
 * Défis 1v1 (réf. spec §9). Les deux joueurs répondent au MÊME set figé
 * (`question_ids` + `seed`). Le score est recalculé serveur (scoreService,
 * même logique que /sessions/submit). Le gagnant reçoit +25 % d'XP.
 *
 * Le statut exposé à l'API est dérivé des données (indépendant du label DB) :
 *   - completed                 → les deux ont joué
 *   - awaiting_challenger_play  → le challenger n'a pas encore soumis
 *   - awaiting_opponent_play    → en attente du second joueur
 */

const CHALLENGE_QUESTIONS = 10;
const CHALLENGE_TTL_MS = 24 * 3600 * 1000; // 24 h pour jouer
const WINNER_XP_BONUS_RATE = 0.25;

/** Statut « métier » exposé à l'app à partir de la ligne challenge. */
function apiStatus(ch) {
  if (ch.status === 'completed') return 'completed';
  if (ch.score_challenger == null) return 'awaiting_challenger_play';
  return 'awaiting_opponent_play';
}

function isExpired(ch) {
  return ch.status !== 'completed' && Date.now() - new Date(ch.created_at).getTime() > CHALLENGE_TTL_MS;
}

/** Camp du joueur dans le défi, ou null s'il n'y participe pas. */
function sideOf(ch, userId) {
  if (userId === ch.challenger_id) return 'challenger';
  if (userId === ch.opponent_id) return 'opponent';
  return null;
}

/** POST /challenges/create — challenger joue en premier (reçoit le set). */
async function create({ userId, opponentId, theme, level, stake = 0 }) {
  if (stake > 0 && !env.features.tournamentsPaidEnabled) {
    throw new ApiError('FEATURE_DISABLED', { message: 'Les mises (stake > 0) sont désactivées (v2).' });
  }
  if (opponentId) {
    if (opponentId === userId) {
      throw new ApiError('VALIDATION_ERROR', { message: 'Impossible de se défier soi-même.' });
    }
    const opponent = await userModel.findById(opponentId);
    if (!opponent) throw new ApiError('USER_NOT_FOUND');
  }

  const seed = questionService.generateSeed();
  const rows = await questionModel.pickRandom({ theme, level, count: CHALLENGE_QUESTIONS, excludeIds: [], seed });
  if (rows.length === 0) throw new ApiError('NO_QUESTIONS_AVAILABLE');

  const challenge = await challengeModel.create({
    challenger_id: userId,
    opponent_id: opponentId ?? null,
    seed,
    stake,
    theme,
    level,
    question_ids: rows.map((r) => r.id),
    status: 'pending',
  });

  return {
    challenge_id: challenge.id,
    status: 'awaiting_challenger_play',
    seed,
    questions: rows.map((r) => questionModel.toPlayerView(r)),
  };
}

/** POST /challenges/:id/accept — l'adversaire récupère le même set figé. */
async function accept({ userId, challengeId }) {
  let ch = await challengeModel.findById(challengeId);
  if (!ch) throw new ApiError('CHALLENGE_NOT_FOUND');
  if (isExpired(ch)) throw new ApiError('CHALLENGE_EXPIRED');
  if (userId === ch.challenger_id) {
    throw new ApiError('FORBIDDEN', { message: 'Le challenger ne peut pas accepter son propre défi.' });
  }
  if (ch.opponent_id && ch.opponent_id !== userId) {
    throw new ApiError('FORBIDDEN', { message: "Ce défi est destiné à un autre joueur." });
  }

  if (!ch.opponent_id) {
    ch = await challengeModel.assignOpponent(challengeId, userId); // matchmaking aléatoire
  } else if (ch.status === 'pending') {
    ch = await challengeModel.setStatus(challengeId, 'accepted');
  }

  const questions = await questionModel.findPlayerByIds(ch.question_ids);
  return { challenge_id: ch.id, status: apiStatus(ch), seed: ch.seed, questions };
}

/** POST /challenges/:id/submit — même logique de score que /sessions/submit. */
async function submit({ userId, challengeId, answers }) {
  const ch = await challengeModel.findById(challengeId);
  if (!ch) throw new ApiError('CHALLENGE_NOT_FOUND');
  if (isExpired(ch)) throw new ApiError('CHALLENGE_EXPIRED');

  const side = sideOf(ch, userId);
  if (!side) throw new ApiError('FORBIDDEN', { message: 'Vous ne participez pas à ce défi.' });
  const already = side === 'challenger' ? ch.score_challenger : ch.score_opponent;
  if (already != null) throw new ApiError('ALREADY_PLAYED');

  // Score serveur-authoritative : on utilise le `level` STOCKÉ sur le défi
  // (pas celui du corps client) et les solutions chargées côté serveur.
  const solutions = await questionModel.findSolutions(answers.map((a) => a.question_id));
  const result = scoreService.computeSession({ level: ch.level, answers, solutions });

  // L'XP de session du joueur est créditée immédiatement.
  await userModel.creditSessionXp(userId, result.xp_earned, levelFromXp);
  const updated = await challengeModel.recordScore(challengeId, side, result.score, result.xp_earned);

  const bothPlayed = updated.score_challenger != null && updated.score_opponent != null;
  if (!bothPlayed) {
    return {
      challenge_id: updated.id,
      status: apiStatus(updated),
      your_score: result.score,
      xp_earned: result.xp_earned,
      review: result.review,
    };
  }

  // Les deux ont joué → on désigne le gagnant (+25 % d'XP).
  let winnerId = null;
  let winnerXp = 0;
  if (updated.score_challenger > updated.score_opponent) {
    winnerId = updated.challenger_id;
    winnerXp = updated.xp_challenger;
  } else if (updated.score_opponent > updated.score_challenger) {
    winnerId = updated.opponent_id;
    winnerXp = updated.xp_opponent;
  }
  const xpBonus = winnerId ? Math.round(WINNER_XP_BONUS_RATE * winnerXp) : 0;
  if (xpBonus > 0) await userModel.creditSessionXp(winnerId, xpBonus, levelFromXp);

  const final = await challengeModel.finalize(challengeId, winnerId);
  return {
    challenge_id: final.id,
    status: 'completed',
    score_challenger: final.score_challenger,
    score_opponent: final.score_opponent,
    winner_id: winnerId,
    xp_bonus: xpBonus,
    review: result.review,
  };
}

/** GET /challenges/:id — détail (réservé aux participants, sans solutions). */
async function get({ userId, challengeId }) {
  const ch = await challengeModel.findById(challengeId);
  if (!ch || !sideOf(ch, userId)) throw new ApiError('CHALLENGE_NOT_FOUND');
  return {
    challenge_id: ch.id,
    status: apiStatus(ch),
    challenger_id: ch.challenger_id,
    opponent_id: ch.opponent_id ?? null,
    theme: ch.theme,
    level: ch.level,
    seed: ch.seed,
    stake: Number(ch.stake),
    score_challenger: ch.score_challenger ?? null,
    score_opponent: ch.score_opponent ?? null,
    winner_id: ch.winner_id ?? null,
    created_at: ch.created_at,
    played_at: ch.played_at ?? null,
  };
}

module.exports = { create, accept, submit, get, apiStatus, CHALLENGE_QUESTIONS };
