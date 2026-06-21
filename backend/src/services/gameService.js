'use strict';

const crypto = require('crypto');
const db = require('../config/database');
const { redis } = require('../config/redis');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const { LEVEL_XP_THRESHOLDS } = require('../utils/constants');
const scoreService = require('./scoreService');
const leaderboardService = require('./leaderboardService');
const questionModel = require('../models/question.model');
const userModel = require('../models/user.model');
const sessionModel = require('../models/session.model');

/**
 * Logique serveur-authoritative des sessions de jeu (réf. spec §6).
 *
 * Le serveur RECALCULE tout (le client n'est jamais cru sur le score) :
 *   1. idempotence (un même envoi ne crédite qu'une fois)
 *   2. chargement des solutions (correct_index) côté serveur
 *   3. calcul score/XP/streak via scoreService (formule de référence)
 *   4. anti-triche (réponses < 1 s répétées → CHEAT_DETECTED)
 *   5. persistance partie + crédit XP/niveau (transaction)
 *   6. mise à jour des classements (Redis)
 *   7. réponse avec review[] (révélation des bonnes réponses autorisée ici)
 */

// ≥ 2 réponses sous 1 s ⇒ triche (« répétées », spec §6).
const CHEAT_FAST_REPEAT = 2;
const IDEMPOTENCY_TTL_SEC = 24 * 3600;
// Mode normal — feedback immédiat (POST /sessions/answer).
const ANSWER_CHEAT_MIN_MS = 500; // répondre sous 500 ms ⇒ triche
const LIVE_SESSION_TTL_SEC = 2 * 3600; // durée de vie de l'état live (streak)

/** Niveau joueur (1–5) à partir de l'XP cumulée (seuils CDC §4.1). */
function levelFromXp(totalXp) {
  let level = 1;
  for (let i = 0; i < LEVEL_XP_THRESHOLDS.length; i += 1) {
    if (totalXp >= LEVEL_XP_THRESHOLDS[i]) level = i + 1;
  }
  return level;
}

/**
 * POST /sessions/submit — soumet une partie complète.
 * @returns {Promise<object>} contrat de réponse §6.
 */
async function submitSession({ userId, mode = 'normal', theme, level, startedAt, answers }) {
  // 1. Idempotence : verrou (user, started_at). SET NX → 409 si déjà soumis.
  const idemKey = `session:idem:${userId}:${new Date(startedAt).getTime()}`;
  const acquired = await redis.set(idemKey, '1', 'EX', IDEMPOTENCY_TTL_SEC, 'NX');
  if (!acquired) {
    throw new ApiError('SESSION_ALREADY_SUBMITTED');
  }

  try {
    // 2. Solutions chargées côté serveur (jamais fournies par le client).
    const solutions = await questionModel.findSolutions(answers.map((a) => a.question_id));

    // 3. Calcul de référence (score, XP, streak, review).
    const result = scoreService.computeSession({ level, answers, solutions });

    // 4. Anti-triche : trop de réponses < 1 s.
    if (result.suspicious_fast_count >= CHEAT_FAST_REPEAT) {
      throw new ApiError('CHEAT_DETECTED');
    }

    // Réponses persistées : forme attendue par le batch success_rate
    // (question_id + is_correct) — cf. questionService.recomputeSuccessRates.
    const persistedAnswers = answers.map((a, i) => ({
      question_id: a.question_id,
      selected_index: a.selected_index,
      is_correct: result.review[i].is_correct,
      elapsed_ms: a.elapsed_ms,
    }));

    // 5. Persistance + crédit XP/niveau dans UNE transaction.
    const client = await db.getClient();
    let sessionId;
    let levels;
    try {
      await client.query('BEGIN');
      const session = await sessionModel.create(
        {
          user_id: userId,
          mode,
          theme,
          level,
          score: result.score,
          correct_count: result.correct_count,
          question_count: result.total_questions,
          xp_earned: result.xp_earned,
          answers: persistedAnswers,
        },
        client
      );
      sessionId = session.id;
      levels = await userModel.creditSessionXp(userId, result.xp_earned, client);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // 6. Classements (best-effort : ne doit pas faire échouer la partie).
    try {
      await leaderboardService.recordScore({ userId, theme, score: result.score });
    } catch (err) {
      logger.warn('Mise à jour classement échouée (non bloquant)', { error: err.message });
    }

    // 7. Réponse (contrat §6).
    return {
      session_id: sessionId,
      score: result.score,
      correct_count: result.correct_count,
      total_questions: result.total_questions,
      xp_earned: result.xp_earned,
      speed_bonus: result.speed_bonus,
      streak_max: result.streak_max,
      level_before: levels.level_before,
      level_after: levels.level_after,
      level_unlocked: result.level_unlocked,
      unlocked_difficulty: result.unlocked_difficulty,
      review: result.review,
    };
  } catch (err) {
    // Soumission rejetée/échouée : on libère le verrou pour autoriser un nouvel
    // essai légitime (le verrou ne protège que les soumissions abouties).
    await redis.del(idemKey).catch(() => {});
    throw err;
  }
}

/**
 * POST /sessions/answer — soumet UNE réponse (mode normal solo) et renvoie le
 * feedback immédiat. La bonne réponse n'est révélée qu'APRÈS soumission ici. La
 * session reste finalisée par /sessions/submit ; cet endpoint ne fait que tenir
 * l'état live (streak) en Redis et calculer les points de la réponse.
 *
 * @param {object} p
 * @param {string} p.userId
 * @param {string|null} [p.sessionId] créé au premier appel si absent.
 * @param {string} p.questionId
 * @param {number|null} p.selectedIndex 0–3, ou null (timeout/skip).
 * @param {number} p.elapsedMs temps de réponse.
 * @param {string} [p.mode='normal'] seul « normal » est autorisé.
 * @returns {Promise<object>} feedback (correct, correct_index, explanation,
 *          points_earned, speed_bonus, streak, session_id).
 */
async function answerSingle({ userId, sessionId = null, questionId, selectedIndex, elapsedMs, mode = 'normal' }) {
  // 1. Mode : feedback immédiat réservé au solo « normal ».
  if (mode !== 'normal') {
    throw new ApiError('MODE_NOT_ALLOWED', {
      message: 'Le feedback immédiat est réservé au mode normal (tournoi/challenge interdits).',
    });
  }

  // 2. Anti-triche : une réponse réelle sous 500 ms est impossible humainement.
  //    (Un skip/timeout `selected_index = null` n'est pas une « réponse ».)
  if (selectedIndex !== null && elapsedMs < ANSWER_CHEAT_MIN_MS) {
    throw new ApiError('CHEAT_DETECTED');
  }

  // 3. Solution chargée serveur (jamais fournie par le client).
  const info = await questionModel.findAnswerInfo(questionId);
  if (!info) throw new ApiError('QUESTION_NOT_FOUND');

  // 4. État live (streak) : créé au premier appel, conservé en Redis.
  const sid = sessionId || crypto.randomUUID();
  const key = `session:live:${userId}:${sid}`;
  let state = { streak: 0, answered: 0, correct_count: 0 };
  const raw = await redis.get(key);
  if (raw) {
    try { state = { ...state, ...JSON.parse(raw) }; } catch { /* état illisible → repart de zéro */ }
  }

  // 5. Calcul de la réponse.
  const isCorrect = selectedIndex !== null && selectedIndex === info.correct_index;
  const base = scoreService.basePoints(info.level);
  const speed = isCorrect ? scoreService.speedBonus(base, elapsedMs) : 0;
  const pointsEarned = isCorrect ? base : 0;
  const streak = isCorrect ? state.streak + 1 : 0;

  // 6. Persistance de l'état live (best-effort, TTL borné).
  const next = {
    streak,
    answered: state.answered + 1,
    correct_count: state.correct_count + (isCorrect ? 1 : 0),
  };
  await redis.set(key, JSON.stringify(next), 'EX', LIVE_SESSION_TTL_SEC);

  // 7. Feedback (révélation de la solution autorisée à ce moment).
  return {
    correct: isCorrect,
    correct_index: info.correct_index,
    explanation: info.explanation ?? null,
    points_earned: pointsEarned,
    speed_bonus: speed,
    streak,
    session_id: sid,
  };
}

module.exports = { submitSession, answerSingle, levelFromXp, CHEAT_FAST_REPEAT, ANSWER_CHEAT_MIN_MS };
