'use strict';

const H = require('./helpers/integration');
const request = require('supertest');
const app = require('../src/app');

/**
 * Tests d'intégration Sessions (spec §6) — score serveur-authoritative, streak,
 * bonus vitesse, détection anti-triche, idempotence — Postgres + Redis réels.
 */

let ready = false;
beforeAll(async () => {
  ready = await H.ensureReady();
});
afterAll(async () => {
  await H.teardown();
});
beforeEach(async () => {
  if (ready) await H.resetState();
});

const t = (name, fn) =>
  test(name, async () => {
    if (!ready) {
      console.warn(`[skip] ${name}`);
      return;
    }
    await fn();
  });

/** Crée un joueur + N questions beginner approuvées (solution connue). */
async function setup(nb = 5) {
  const user = await H.createUser({ role: 'player', total_xp: 0, level: 1 });
  const token = H.tokenFor(user);
  const questions = await Promise.all(
    Array.from({ length: nb }, () => H.createApprovedQuestion({ level: 'beginner', theme: 'geographie' }))
  );
  return { user, token, questions };
}

const submit = (token, body) =>
  request(app).post('/api/v1/sessions/submit').set('Authorization', `Bearer ${token}`).send(body);

t('score serveur : 5 bonnes réponses rapides → base+vitesse, streak ×2', async () => {
  const { token, questions } = await setup(5);
  const body = {
    mode: 'normal',
    theme: 'geographie',
    level: 'beginner',
    started_at: '2026-06-21T10:00:00Z',
    answers: questions.map((q) => ({
      question_id: q.id,
      selected_index: q.correct_index, // toutes correctes
      elapsed_ms: 2000, // ≤ 5000 → bonus vitesse
      skipped: false,
    })),
  };
  const r = await submit(token, body);
  expect(r.status).toBe(200);
  // beginner base 50, +50% vitesse = 75 × 5 = 375
  expect(r.body.score).toBe(375);
  expect(r.body.speed_bonus).toBe(125); // 25 × 5
  expect(r.body.correct_count).toBe(5);
  expect(r.body.streak_max).toBe(5);
  // XP = 375 × niveau(beginner=1) × streak(≥5 → ×2) = 750
  expect(r.body.xp_earned).toBe(750);
  // réussite 100% ≥ 70% → déverrouille la difficulté supérieure
  expect(r.body.level_unlocked).toBe(true);
  expect(r.body.unlocked_difficulty).toBe('intermediate');
  // review révèle la solution (autorisé à ce moment)
  expect(r.body.review[0]).toHaveProperty('correct_index');
  expect(r.body.review[0]).toHaveProperty('explanation');
});

t('streak cassé par une mauvaise réponse + pas de bonus si lent', async () => {
  const { token, questions } = await setup(3);
  const body = {
    mode: 'normal',
    theme: 'geographie',
    level: 'beginner',
    started_at: '2026-06-21T11:00:00Z',
    answers: [
      { question_id: questions[0].id, selected_index: questions[0].correct_index, elapsed_ms: 9000, skipped: false }, // correct, lent
      { question_id: questions[1].id, selected_index: (questions[1].correct_index + 1) % 2, elapsed_ms: 3000, skipped: false }, // faux
      { question_id: questions[2].id, selected_index: questions[2].correct_index, elapsed_ms: 3000, skipped: false }, // correct rapide
    ],
  };
  const r = await submit(token, body);
  expect(r.body.correct_count).toBe(2);
  // q0 : 50 (lent, pas de bonus) ; q2 : 75 (rapide) = 125
  expect(r.body.score).toBe(125);
  expect(r.body.speed_bonus).toBe(25);
  expect(r.body.streak_max).toBe(1); // jamais 2 d'affilée
});

t('anti-triche : ≥3 réponses < 1 s → 422 CHEAT_DETECTED, rien persisté', async () => {
  const { token, user, questions } = await setup(3);
  const body = {
    mode: 'normal',
    theme: 'geographie',
    level: 'beginner',
    started_at: '2026-06-21T12:00:00Z',
    answers: [
      { question_id: questions[0].id, selected_index: 0, elapsed_ms: 300, skipped: false },
      { question_id: questions[1].id, selected_index: 1, elapsed_ms: 400, skipped: false },
      { question_id: questions[2].id, selected_index: 0, elapsed_ms: 450, skipped: false },
    ],
  };
  const r = await submit(token, body);
  expect(r.status).toBe(422);
  expect(r.body.error.code).toBe('CHEAT_DETECTED');
  const { rows } = await H.db.query('SELECT count(*)::int AS n FROM game_sessions WHERE user_id = $1', [user.id]);
  expect(rows[0].n).toBe(0);
});

t('idempotence : double soumission (même started_at) → 409', async () => {
  const { token, questions } = await setup(2);
  const body = {
    mode: 'normal',
    theme: 'geographie',
    level: 'beginner',
    started_at: '2026-06-21T13:00:00Z',
    answers: questions.map((q) => ({ question_id: q.id, selected_index: q.correct_index, elapsed_ms: 3000, skipped: false })),
  };
  const first = await submit(token, body);
  expect(first.status).toBe(200);
  const second = await submit(token, body);
  expect(second.status).toBe(409);
  expect(second.body.error.code).toBe('SESSION_ALREADY_SUBMITTED');
});

t('crédit XP + montée de niveau persistés en base', async () => {
  const { token, user, questions } = await setup(5);
  await submit(token, {
    mode: 'normal',
    theme: 'geographie',
    level: 'beginner',
    started_at: '2026-06-21T14:00:00Z',
    answers: questions.map((q) => ({ question_id: q.id, selected_index: q.correct_index, elapsed_ms: 2000, skipped: false })),
  });
  const { rows } = await H.db.query('SELECT total_xp, level FROM users WHERE id = $1', [user.id]);
  expect(rows[0].total_xp).toBe(750); // 0 + 750
  expect(rows[0].level).toBe(3); // 750 ≥ 500 → niveau 3 (bandes 0/200/500/1200/3000)
});
