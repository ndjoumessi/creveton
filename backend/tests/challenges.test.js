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
  // Réponse complétée auto-suffisante côté joueur soumettant (opponent ici, perdant) :
  // son propre score + l'XP + l'issue du duel, sans avoir à connaître son camp.
  expect(s2.body.your_score).toBe(s2.body.score_opponent);
  expect(s2.body.opponent_score).toBe(s2.body.score_challenger);
  expect(s2.body.won).toBe(false);
  expect(typeof s2.body.xp_earned).toBe('number');
  expect(s2.body.total_questions).toBe(10);
  expect(typeof s2.body.correct_count).toBe('number');

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

/** Crée un défi pending de challenger → opponent et renvoie son id. */
async function createPending(ctok, opponent) {
  const c = await request(app)
    .post('/api/v1/challenges/create')
    .set('Authorization', `Bearer ${ctok}`)
    .send({ opponent_id: opponent.id, theme: 'geographie', level: 'beginner' });
  return c.body.challenge_id;
}

// ─── GET /challenges?status= (onglets Défis) ────────────────────────────────

t('GET /challenges?status=received → 200, défi reçu + infos adversaire', async () => {
  const { ctok, otok, challenger, opponent } = await setup();
  await createPending(ctok, opponent);

  const r = await request(app)
    .get('/api/v1/challenges?status=received')
    .set('Authorization', `Bearer ${otok}`);
  expect(r.status).toBe(200);
  expect(r.body.data).toHaveLength(1);
  expect(r.body.data[0].status).toBe('awaiting_challenger_play');
  // L'adversaire affiché côté opponent = le challenger.
  expect(r.body.data[0].opponent.id).toBe(challenger.id);
  expect(r.body.data[0].opponent.name).toBe(challenger.name);
  expect(r.body.page).toEqual({ page: 1, limit: 20, has_more: false });
});

t('GET /challenges?status=sent → 200, défi envoyé', async () => {
  const { ctok, opponent } = await setup();
  await createPending(ctok, opponent);

  const r = await request(app)
    .get('/api/v1/challenges?status=sent')
    .set('Authorization', `Bearer ${ctok}`);
  expect(r.status).toBe(200);
  expect(r.body.data).toHaveLength(1);
  expect(r.body.data[0].opponent.id).toBe(opponent.id);
});

t('GET /challenges?status=completed → 200, score + résultat', async () => {
  const { ctok, otok, opponent } = await setup();
  const c = await request(app)
    .post('/api/v1/challenges/create')
    .set('Authorization', `Bearer ${ctok}`)
    .send({ opponent_id: opponent.id, theme: 'geographie', level: 'beginner' });
  const id = c.body.challenge_id;
  const questions = c.body.questions;
  await request(app).post(`/api/v1/challenges/${id}/submit`).set('Authorization', `Bearer ${ctok}`).send(submitBody(questions, 1.0));
  await request(app).post(`/api/v1/challenges/${id}/submit`).set('Authorization', `Bearer ${otok}`).send(submitBody(questions, 0.5));

  // Onglet « received » ne doit plus contenir le défi terminé.
  const recv = await request(app).get('/api/v1/challenges?status=received').set('Authorization', `Bearer ${otok}`);
  expect(recv.body.data).toHaveLength(0);

  const r = await request(app).get('/api/v1/challenges?status=completed').set('Authorization', `Bearer ${ctok}`);
  expect(r.status).toBe(200);
  expect(r.body.data).toHaveLength(1);
  expect(r.body.data[0].status).toBe('completed');
  expect(r.body.data[0].your_score).toBeGreaterThan(r.body.data[0].opponent_score);
  expect(r.body.data[0].won).toBe(true);
});

t('GET /challenges sans status → 400 VALIDATION_ERROR', async () => {
  const { ctok } = await setup();
  const r = await request(app).get('/api/v1/challenges').set('Authorization', `Bearer ${ctok}`);
  expect(r.status).toBe(400);
  expect(r.body.error.code).toBe('VALIDATION_ERROR');
});

// ─── DELETE /challenges/:id/decline ─────────────────────────────────────────

t('DELETE /challenges/:id/decline → 200 (destinataire) + retiré de received', async () => {
  const { ctok, otok, opponent } = await setup();
  const id = await createPending(ctok, opponent);

  const r = await request(app)
    .delete(`/api/v1/challenges/${id}/decline`)
    .set('Authorization', `Bearer ${otok}`);
  expect(r.status).toBe(200);
  expect(r.body.status).toBe('declined');

  const recv = await request(app).get('/api/v1/challenges?status=received').set('Authorization', `Bearer ${otok}`);
  expect(recv.body.data).toHaveLength(0);
});

t('DELETE /challenges/:id/decline par le challenger → 403 FORBIDDEN', async () => {
  const { ctok, opponent } = await setup();
  const id = await createPending(ctok, opponent);

  const r = await request(app)
    .delete(`/api/v1/challenges/${id}/decline`)
    .set('Authorization', `Bearer ${ctok}`);
  expect(r.status).toBe(403);
  expect(r.body.error.code).toBe('FORBIDDEN');
});

// ─── GET /users/search ──────────────────────────────────────────────────────

t('GET /users/search?q=Nel → 200, trouve le joueur (sans données sensibles)', async () => {
  const searcher = await H.createUser({ role: 'player', phone: '+237690000010' });
  const target = await H.createUser({ role: 'player', phone: '+237690000011', name: 'Nelson Test' });

  const r = await request(app)
    .get('/api/v1/users/search?q=Nel')
    .set('Authorization', `Bearer ${H.tokenFor(searcher)}`);
  expect(r.status).toBe(200);
  const hit = r.body.data.find((u) => u.id === target.id);
  expect(hit).toBeTruthy();
  expect(hit.name).toBe('Nelson Test');
  expect(hit).toHaveProperty('level');
  expect(hit).toHaveProperty('total_xp');
  expect(hit).not.toHaveProperty('phone');
  expect(hit).not.toHaveProperty('email');
  // On ne se retourne jamais soi-même.
  expect(r.body.data.some((u) => u.id === searcher.id)).toBe(false);
});

t('GET /users/search?q=N → 400 VALIDATION_ERROR (trop court)', async () => {
  const searcher = await H.createUser({ role: 'player', phone: '+237690000012' });
  const r = await request(app)
    .get('/api/v1/users/search?q=N')
    .set('Authorization', `Bearer ${H.tokenFor(searcher)}`);
  expect(r.status).toBe(400);
  expect(r.body.error.code).toBe('VALIDATION_ERROR');
});
