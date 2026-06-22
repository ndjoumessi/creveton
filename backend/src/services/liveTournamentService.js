'use strict';

const crypto = require('crypto');
const db = require('../config/database');
const { redis } = require('../config/redis');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const scoreService = require('./scoreService');
const leaderboardService = require('./leaderboardService');
const pushService = require('./pushService');
const tournamentModel = require('../models/tournament.model');
const questionModel = require('../models/question.model');
const sessionModel = require('../models/session.model');
const userModel = require('../models/user.model');

/**
 * Moteur de tournoi en TEMPS RÉEL (spec §13) — chronomètre serveur-authoritative.
 *
 * Le déroulé d'une manche vit dans Redis (clé `tournament:live:<id>`) pour
 * survivre aux reconnexions ; la couche socket diffuse les questions et relaie
 * les réponses, mais TOUTE décision (deadline, bonne réponse, score) est prise
 * ici, jamais côté client.
 *
 *  - `start()`          tire les questions, charge les solutions (server-only),
 *                       passe le tournoi en `running`.
 *  - `runLiveTournament()` boucle d'animation : montre chaque question, attend la
 *                       deadline, révèle, puis clôture (créditXP + persistance).
 *  - `recordAnswer()`   enregistre une réponse (anti-rejeu, anti-retard, scoring).
 *  - `currentState()`   instantané pour la reconnexion (`reconnect:state`).
 *
 * La bonne réponse n'est diffusée qu'à l'expiration de chaque question
 * (`question:reveal`) — jamais dans l'accusé de réception (`answer:ack`).
 */

const STATE_TTL_SEC = 4 * 3600; // la manche la plus longue tient large dans 4 h.
const GRACE_MS = 1000; // tolérance réseau : une réponse reçue juste après la deadline reste valable.
const REVEAL_PAUSE_MS = 4000; // temps de lecture de la correction entre deux questions.
const LEADERBOARD_TOP = 10;

const room = (tournamentId) => `tournament:${tournamentId}`;
const stateKey = (id) => `tournament:live:${id}`;
const scoresKey = (id) => `tournament:live:${id}:scores`;
const participantsKey = (id) => `tournament:live:${id}:participants`;
const answeredKey = (id, index) => `tournament:live:${id}:answered:${index}`;
const streakKey = (id, userId) => `tournament:live:${id}:streak:${userId}`;
const bestStreakKey = (id, userId) => `tournament:live:${id}:beststreak:${userId}`;
const correctKey = (id, userId) => `tournament:live:${id}:correct:${userId}`;

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

async function readState(id) {
  const raw = await redis.get(stateKey(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeState(id, state) {
  await redis.set(stateKey(id), JSON.stringify(state), 'EX', STATE_TTL_SEC);
}

/** Classement live (top N) lu depuis le sorted set Redis. */
async function leaderboard(id, top = LEADERBOARD_TOP) {
  const flat = await redis.zrevrange(scoresKey(id), 0, top - 1, 'WITHSCORES');
  const out = [];
  for (let i = 0; i < flat.length; i += 2) {
    out.push({ user_id: flat[i], score: Number(flat[i + 1]), rank: out.length + 1 });
  }
  return out;
}

/**
 * Démarre une manche live : tire `count` questions approuvées (thème du tournoi),
 * charge les solutions côté serveur, amorce l'état Redis et passe en `running`.
 * @returns {Promise<{tournament_id:string,total:number,status:string}>}
 */
async function start(tournamentId, { count, timePerQSec }) {
  const t = await tournamentModel.findById(tournamentId);
  if (!t || t.deleted_at) throw new ApiError('TOURNAMENT_NOT_FOUND');
  if (t.status === 'running') throw new ApiError('TOURNAMENT_ALREADY_RUNNING');
  if (t.status === 'closed' || t.status === 'paid' || t.status === 'cancelled') {
    throw new ApiError('TOURNAMENT_NOT_OPEN', { message: 'Tournoi déjà terminé ou annulé.' });
  }

  const rows = await questionModel.pickRandom({
    theme: t.theme ?? null,
    count,
    seed: `${tournamentId}:${crypto.randomUUID()}`,
  });
  if (rows.length < count) throw new ApiError('NOT_ENOUGH_QUESTIONS');

  const ids = rows.map((r) => r.id);
  const solutionsMap = await questionModel.findSolutions(ids);
  const solutions = {};
  solutionsMap.forEach((sol, qid) => { solutions[qid] = sol.correct_index; });

  const state = {
    status: 'running',
    theme: t.theme ?? null,
    total: rows.length,
    time_per_q_ms: timePerQSec * 1000,
    current_index: -1,
    shown_at: null,
    deadline_at: null,
    // Vue joueur (sans bonne réponse) — sûre à diffuser telle quelle.
    questions: rows.map((r) => questionModel.toPlayerView(r)),
    levels: rows.map((r) => r.level),
    solutions, // server-only : ne JAMAIS émettre.
  };

  // Set des inscrits : seuls eux peuvent répondre (les autres sont spectateurs).
  const userIds = await tournamentModel.participantUserIds(tournamentId);

  await tournamentModel.setStatus(tournamentId, 'running');
  await writeState(tournamentId, state);
  if (userIds.length) await redis.sadd(participantsKey(tournamentId), ...userIds);
  await redis.expire(participantsKey(tournamentId), STATE_TTL_SEC);

  // Notif « le tournoi démarre » aux inscrits (fire-and-forget, best-effort).
  if (userIds.length) {
    Promise.resolve()
      .then(() => userModel.findManyByIds(userIds))
      .then((users) => {
        const tokens = users.map((u) => u.push_token).filter(Boolean);
        if (tokens.length) {
          pushService.sendPush(tokens, {
            title: '🏆 Le tournoi commence !',
            body: `${t.name} démarre — rejoins la manche !`,
            data: { type: 'tournament_start', tournament_id: tournamentId },
          });
        }
      })
      .catch(() => {});
  }

  logger.info('Tournoi live démarré', { tournament_id: tournamentId, questions: rows.length });
  return { tournament_id: tournamentId, total: rows.length, status: 'running' };
}

/**
 * Affiche la question d'index donné : pose `shown_at`/`deadline_at` et renvoie le
 * payload à diffuser (`question:show`). Retourne null si la manche n'est plus active.
 */
async function showQuestion(tournamentId, index) {
  const state = await readState(tournamentId);
  if (!state || state.status !== 'running' || index >= state.total) return null;
  const now = Date.now();
  state.current_index = index;
  state.shown_at = now;
  state.deadline_at = now + state.time_per_q_ms;
  await writeState(tournamentId, state);
  return {
    index,
    total: state.total,
    question: state.questions[index],
    deadline_at: state.deadline_at,
    duration_ms: state.time_per_q_ms,
  };
}

/**
 * Enregistre la réponse d'un joueur à la question courante (serveur-authoritative).
 * Anti-rejeu (une réponse / question), anti-retard (deadline + grâce réseau),
 * `elapsed_ms` mesuré côté serveur. La justesse n'est PAS révélée ici.
 * @returns {Promise<{accepted:true,index:number}>}
 */
async function recordAnswer({ tournamentId, userId, index, selectedIndex }) {
  const state = await readState(tournamentId);
  if (!state || state.status !== 'running') throw new ApiError('TOURNAMENT_NOT_RUNNING');

  const isParticipant = await redis.sismember(participantsKey(tournamentId), userId);
  if (!isParticipant) throw new ApiError('NOT_PARTICIPANT');

  // La réponse doit viser la question en cours, dans les temps (deadline + grâce).
  if (index !== state.current_index || Date.now() > state.deadline_at + GRACE_MS) {
    throw new ApiError('ANSWER_TOO_LATE');
  }

  // Anti-rejeu : SADD renvoie 0 si l'utilisateur a déjà répondu à cette question.
  const added = await redis.sadd(answeredKey(tournamentId, index), userId);
  if (added === 0) throw new ApiError('ALREADY_ANSWERED');
  await redis.expire(answeredKey(tournamentId, index), STATE_TTL_SEC);

  const qid = state.questions[index].id;
  const correctIndex = state.solutions[qid];
  const isCorrect = selectedIndex !== null && selectedIndex !== undefined && selectedIndex === correctIndex;
  const elapsedMs = Date.now() - state.shown_at;

  if (isCorrect) {
    const base = scoreService.basePoints(state.levels[index]);
    const points = base + scoreService.speedBonus(base, elapsedMs);
    await redis.zincrby(scoresKey(tournamentId), points, userId);
    await redis.expire(scoresKey(tournamentId), STATE_TTL_SEC);
    await redis.incr(correctKey(tournamentId, userId));
    await redis.expire(correctKey(tournamentId, userId), STATE_TTL_SEC);
    const streak = await redis.incr(streakKey(tournamentId, userId));
    await redis.expire(streakKey(tournamentId, userId), STATE_TTL_SEC);
    const best = Math.max(streak, Number(await redis.get(bestStreakKey(tournamentId, userId))) || 0);
    await redis.set(bestStreakKey(tournamentId, userId), best, 'EX', STATE_TTL_SEC);
  } else {
    await redis.del(streakKey(tournamentId, userId));
  }

  return { accepted: true, index };
}

/**
 * Révèle la bonne réponse d'une question (fin de timer) + classement live.
 * @returns {Promise<{index:number,correct_index:number,leaderboard:object[]}>}
 */
async function revealQuestion(tournamentId, index) {
  const state = await readState(tournamentId);
  if (!state) return { index, correct_index: null, leaderboard: [] };
  const qid = state.questions[index]?.id;
  return {
    index,
    correct_index: qid != null ? state.solutions[qid] : null,
    leaderboard: await leaderboard(tournamentId),
  };
}

/** Instantané pour la reconnexion (`reconnect:state`). null si pas de manche live. */
async function currentState(tournamentId, userId) {
  const state = await readState(tournamentId);
  if (!state || state.status !== 'running') return null;
  const idx = state.current_index;
  const yourScore = Number(await redis.zscore(scoresKey(tournamentId), userId)) || 0;
  const yourRankRaw = await redis.zrevrank(scoresKey(tournamentId), userId);
  return {
    status: 'running',
    index: idx,
    total: state.total,
    question: idx >= 0 ? state.questions[idx] : null,
    deadline_at: state.deadline_at,
    remaining_ms: state.deadline_at ? Math.max(0, state.deadline_at - Date.now()) : 0,
    your_score: yourScore,
    your_rank: yourRankRaw != null ? yourRankRaw + 1 : null,
  };
}

/**
 * Clôture la manche : écrit `tournament_participants.score`, crédite l'XP et
 * insère un `game_sessions` (mode tournament) par joueur, le tout en transaction.
 * Met le tournoi en `closed` et purge l'état Redis. @returns le classement final.
 */
async function finish(tournamentId) {
  const state = await readState(tournamentId);
  const total = state ? state.total : 0;
  const theme = state ? state.theme : null;
  const userIds = await redis.smembers(participantsKey(tournamentId));

  const results = [];
  for (const userId of userIds) {
    const score = Number(await redis.zscore(scoresKey(tournamentId), userId)) || 0;
    const correct = Number(await redis.get(correctKey(tournamentId, userId))) || 0;
    const bestStreak = Number(await redis.get(bestStreakKey(tournamentId, userId))) || 0;
    const xp = Math.round(score * scoreService.streakMultiplier(bestStreak));
    results.push({ userId, score, correct, xp });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    for (const r of results) {
      await tournamentModel.setScore(tournamentId, r.userId, r.score, client);
      await sessionModel.create(
        {
          user_id: r.userId,
          mode: 'tournament',
          theme,
          level: null,
          score: r.score,
          correct_count: r.correct,
          question_count: total,
          xp_earned: r.xp,
          answers: [],
        },
        client
      );
      if (r.xp > 0) await userModel.creditSessionXp(r.userId, r.xp, client);
    }
    await tournamentModel.setStatus(tournamentId, 'closed', { endsAt: new Date() });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Classements globaux (best-effort, ne doit pas faire échouer la clôture).
  for (const r of results) {
    if (r.score <= 0) continue;
    try {
      await leaderboardService.recordScore({ userId: r.userId, theme, score: r.score });
    } catch (err) {
      logger.warn('Classement post-tournoi échoué (non bloquant)', { error: err.message });
    }
  }

  const finalBoard = await leaderboard(tournamentId, userIds.length || LEADERBOARD_TOP);
  await purge(tournamentId, total);
  return { tournament_id: tournamentId, status: 'closed', leaderboard: finalBoard };
}

/** Supprime toutes les clés Redis de la manche. */
async function purge(tournamentId, total) {
  const keys = [stateKey(tournamentId), scoresKey(tournamentId), participantsKey(tournamentId)];
  for (let i = 0; i < total; i += 1) keys.push(answeredKey(tournamentId, i));
  // Les clés par joueur (streak/best/correct) expirent seules via TTL.
  await redis.del(...keys).catch(() => {});
}

/**
 * Boucle d'animation serveur (détachée) : montre chaque question, attend sa
 * deadline (+ grâce), révèle la bonne réponse et le classement, puis clôture.
 * À lancer après `start()` avec l'instance `io` Socket.IO.
 */
async function runLiveTournament(io, tournamentId) {
  const r = room(tournamentId);
  try {
    const state = await readState(tournamentId);
    if (!state || state.status !== 'running') return;
    for (let i = 0; i < state.total; i += 1) {
      const q = await showQuestion(tournamentId, i);
      if (!q) break;
      io.to(r).emit('question:show', q);
      await sleep(q.duration_ms + GRACE_MS);
      const reveal = await revealQuestion(tournamentId, i);
      io.to(r).emit('question:reveal', reveal);
      io.to(r).emit('score:update', { leaderboard: reveal.leaderboard });
      await sleep(REVEAL_PAUSE_MS);
    }
    const summary = await finish(tournamentId);
    io.to(r).emit('tournament:end', summary);
  } catch (err) {
    logger.error('Boucle tournoi live interrompue', { tournament_id: tournamentId, error: err.message });
  }
}

module.exports = {
  room,
  start,
  showQuestion,
  recordAnswer,
  revealQuestion,
  currentState,
  finish,
  leaderboard,
  runLiveTournament,
  GRACE_MS,
  REVEAL_PAUSE_MS,
};
