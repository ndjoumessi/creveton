'use strict';

const H = require('./helpers/integration');
const request = require('supertest');
const app = require('../src/app');

/**
 * Tests d'intégration Challenges (spec §9) — création, set figé partagé,
 * accept, submit (score serveur + gagnant + bonus XP), GET — Postgres + Redis.
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
    if (!ready) return;
    await fn();
  });

/** Joueurs + 10 questions approuvées (beginner/geographie, correct_index=1). */
async function setup() {
  const challenger = await H.createUser({ role: 'player', phone: '+237690000001' });
  const opponent = await H.createUser({ role: 'player', phone: '+237690000002' });
  await Promise.all(
    Array.from({ length: 10 }, () =>
      H.createApprovedQuestion({
        theme: 'geographie',
        level: 'beginner',
        options: [
          { text: 'A', is_correct: false },
          { text: 'B', is_correct: true },
        ],
        correct_index: 1,
      })
    )
  );
  return { challenger, opponent, ctok: H.tokenFor(challenger), otok: H.tokenFor(opponent) };
}

const answersFor = (questions, correctRatio) =>
  questions.map((q, i) => ({
    question_id: q.id,
    selected_index: i / questions.length < correctRatio ? 1 : 0, // 1 = bonne réponse
    elapsed_ms: 3000,
    skipped: false,
  }));

const submitBody = (questions, ratio) => ({
  mode: 'challenge',
  theme: 'geographie',
  level: 'beginner',
  started_at: '2026-06-21T10:00:00Z',
  answers: answersFor(questions, ratio),
});

t('POST /challenges/create → 201, set figé + seed, sans solution', async () => {
  const { ctok, opponent } = await setup();
  const r = await request(app)
    .post('/api/v1/challenges/create')
    .set('Authorization', `Bearer ${ctok}`)
    .send({ opponent_id: opponent.id, theme: 'geographie', level: 'beginner', stake: 0 });

  expect(r.status).toBe(201);
  expect(r.body.status).toBe('awaiting_challenger_play');
  expect(typeof r.body.seed).toBe('string');
  expect(r.body.questions).toHaveLength(10);
  expect(r.body.questions[0]).not.toHaveProperty('correct_index');
  expect(r.body.questions[0].options.every((o) => !('is_correct' in o))).toBe(true);
});

t('accept renvoie le MÊME set (même seed, mêmes ids)', async () => {
  const { ctok, otok, opponent } = await setup();
  const c = await request(app)
    .post('/api/v1/challenges/create')
    .set('Authorization', `Bearer ${ctok}`)
    .send({ opponent_id: opponent.id, theme: 'geographie', level: 'beginner' });

  const a = await request(app)
    .post(`/api/v1/challenges/${c.body.challenge_id}/accept`)
    .set('Authorization', `Bearer ${otok}`);

  expect(a.status).toBe(200);
  expect(a.body.seed).toBe(c.body.seed);
  expect(a.body.questions.map((q) => q.id)).toEqual(c.body.questions.map((q) => q.id));
});

t('flux complet : challenger gagne → completed + winner + bonus XP', async () => {
  const { ctok, otok, challenger, opponent } = await setup();
  const c = await request(app)
    .post('/api/v1/challenges/create')
    .set('Authorization', `Bearer ${ctok}`)
    .send({ opponent_id: opponent.id, theme: 'geographie', level: 'beginner' });
  const id = c.body.challenge_id;
  const questions = c.body.questions;

  // challenger : 100% correct
  const s1 = await request(app)
    .post(`/api/v1/challenges/${id}/submit`)
    .set('Authorization', `Bearer ${ctok}`)
    .send(submitBody(questions, 1.0));
  expect(s1.status).toBe(200);
  expect(s1.body.status).toBe('awaiting_opponent_play');
  expect(s1.body.your_score).toBeGreaterThan(0);

  // opponent : 50% correct → perd
  const s2 = await request(app)
    .post(`/api/v1/challenges/${id}/submit`)
    .set('Authorization', `Bearer ${otok}`)
    .send(submitBody(questions, 0.5));
  expect(s2.status).toBe(200);
  expect(s2.body.status).toBe('completed');
  expect(s2.body.score_challenger).toBeGreaterThan(s2.body.score_opponent);
  expect(s2.body.winner_id).toBe(challenger.id);
  expect(s2.body.xp_bonus).toBeGreaterThan(0);

  // le bonus est crédité au gagnant en base
  const { rows } = await H.db.query('SELECT total_xp FROM users WHERE id = $1', [challenger.id]);
  expect(rows[0].total_xp).toBeGreaterThan(0);
});

t('submit deux fois (même camp) → 409 ALREADY_PLAYED', async () => {
  const { ctok, opponent } = await setup();
  const c = await request(app)
    .post('/api/v1/challenges/create')
    .set('Authorization', `Bearer ${ctok}`)
    .send({ opponent_id: opponent.id, theme: 'geographie', level: 'beginner' });
  const body = submitBody(c.body.questions, 1.0);
  await request(app).post(`/api/v1/challenges/${c.body.challenge_id}/submit`).set('Authorization', `Bearer ${ctok}`).send(body);
  const again = await request(app)
    .post(`/api/v1/challenges/${c.body.challenge_id}/submit`)
    .set('Authorization', `Bearer ${ctok}`)
    .send(body);
  expect(again.status).toBe(409);
  expect(again.body.error.code).toBe('ALREADY_PLAYED');
});

t('submit par un non-participant → 403 FORBIDDEN', async () => {
  const { ctok, opponent } = await setup();
  const intruder = await H.createUser({ role: 'player', phone: '+237690000003' });
  const c = await request(app)
    .post('/api/v1/challenges/create')
    .set('Authorization', `Bearer ${ctok}`)
    .send({ opponent_id: opponent.id, theme: 'geographie', level: 'beginner' });
  const r = await request(app)
    .post(`/api/v1/challenges/${c.body.challenge_id}/submit`)
    .set('Authorization', `Bearer ${H.tokenFor(intruder)}`)
    .send(submitBody(c.body.questions, 1.0));
  expect(r.status).toBe(403);
  expect(r.body.error.code).toBe('FORBIDDEN');
});

t('GET /challenges/:id : participant voit ; étranger → 404', async () => {
  const { ctok, otok, opponent } = await setup();
  const c = await request(app)
    .post('/api/v1/challenges/create')
    .set('Authorization', `Bearer ${ctok}`)
    .send({ opponent_id: opponent.id, theme: 'geographie', level: 'beginner' });
  const id = c.body.challenge_id;

  const seen = await request(app).get(`/api/v1/challenges/${id}`).set('Authorization', `Bearer ${otok}`);
  expect(seen.status).toBe(200);
  expect(seen.body.challenge_id).toBe(id);
  expect(seen.body).not.toHaveProperty('question_ids'); // pas de fuite des solutions

  const stranger = await H.createUser({ role: 'player', phone: '+237690000004' });
  const hidden = await request(app).get(`/api/v1/challenges/${id}`).set('Authorization', `Bearer ${H.tokenFor(stranger)}`);
  expect(hidden.status).toBe(404);
});

t('challenge inconnu → 404 CHALLENGE_NOT_FOUND', async () => {
  const u = await H.createUser({ role: 'player', phone: '+237690000005' });
  const r = await request(app)
    .get('/api/v1/challenges/00000000-0000-0000-0000-0000000000ff')
    .set('Authorization', `Bearer ${H.tokenFor(u)}`);
  expect(r.status).toBe(404);
  expect(r.body.error.code).toBe('CHALLENGE_NOT_FOUND');
});
