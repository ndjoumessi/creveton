'use strict';

const H = require('./helpers/integration');
const request = require('supertest');
const app = require('../src/app');

/**
 * Tests d'intégration POST /sessions/answer (spec §6 — feedback immédiat mode
 * normal solo) : feedback, points/bonus vitesse, streak conservé en Redis,
 * anti-triche < 300 ms, mode tournoi/challenge interdit. Postgres + Redis réels.
 */

let ready = false;
beforeAll(async () => { ready = await H.ensureReady(); });
afterAll(async () => { await H.teardown(); });
beforeEach(async () => { if (ready) await H.resetState(); });

const t = (name, fn) =>
  test(name, async () => {
    if (!ready) { console.warn(`[skip] ${name}`); return; }
    await fn();
  });

const answer = (token, body) =>
  request(app).post('/api/v1/sessions/answer').set('Authorization', `Bearer ${token}`).send(body);

/** Joueur + N questions beginner approuvées (correct_index connu = 1). */
async function setup(nb = 3) {
  const user = await H.createUser({ role: 'player', total_xp: 0, level: 1 });
  const token = H.tokenFor(user);
  const questions = await Promise.all(
    Array.from({ length: nb }, () => H.createApprovedQuestion({ level: 'beginner', theme: 'geographie' }))
  );
  return { user, token, questions };
}

t('bonne réponse rapide → feedback + points + bonus vitesse + session_id créé', async () => {
  const { token, questions } = await setup(1);
  const q = questions[0];
  const r = await answer(token, {
    question_id: q.id, selected_index: q.correct_index, elapsed_ms: 2000, mode: 'normal',
  });
  expect(r.status).toBe(200);
  expect(r.body).toMatchObject({
    correct: true,
    correct_index: q.correct_index, // révélé après soumission
    points_earned: 50, // beginner base
    speed_bonus: 25, // 50 × 50 %
    streak: 1,
  });
  expect(r.body.explanation).toBe('Explication.');
  expect(typeof r.body.session_id).toBe('string');
});

t('streak conservé entre appels via session_id (2 bonnes → streak 2)', async () => {
  const { token, questions } = await setup(2);
  const a = await answer(token, { question_id: questions[0].id, selected_index: 1, elapsed_ms: 2000, mode: 'normal' });
  expect(a.body.streak).toBe(1);
  const sid = a.body.session_id;
  const b = await answer(token, { question_id: questions[1].id, selected_index: 1, elapsed_ms: 2000, session_id: sid, mode: 'normal' });
  expect(b.status).toBe(200);
  expect(b.body.session_id).toBe(sid);
  expect(b.body.streak).toBe(2);
});

t('mauvaise réponse → correct=false, 0 point, streak remis à 0', async () => {
  const { token, questions } = await setup(2);
  const a = await answer(token, { question_id: questions[0].id, selected_index: 1, elapsed_ms: 2000 });
  expect(a.body.streak).toBe(1);
  const sid = a.body.session_id;
  const b = await answer(token, { question_id: questions[1].id, selected_index: 0, elapsed_ms: 2000, session_id: sid }); // 0 ≠ correct 1
  expect(b.body.correct).toBe(false);
  expect(b.body.points_earned).toBe(0);
  expect(b.body.speed_bonus).toBe(0);
  expect(b.body.streak).toBe(0);
  expect(b.body.correct_index).toBe(1); // la bonne réponse reste révélée
});

t('bonne réponse lente → pas de bonus de vitesse', async () => {
  const { token, questions } = await setup(1);
  const r = await answer(token, { question_id: questions[0].id, selected_index: 1, elapsed_ms: 9000 });
  expect(r.body.correct).toBe(true);
  expect(r.body.points_earned).toBe(50);
  expect(r.body.speed_bonus).toBe(0);
});

t('anti-triche : réponse < 200 ms → 422 CHEAT_DETECTED', async () => {
  const { token, questions } = await setup(1);
  const r = await answer(token, { question_id: questions[0].id, selected_index: 1, elapsed_ms: 150 });
  expect(r.status).toBe(422);
  expect(r.body.error.code).toBe('CHEAT_DETECTED');
});

t('skip (selected_index null) rapide → pas de triche, correct=false, streak 0', async () => {
  const { token, questions } = await setup(1);
  const r = await answer(token, { question_id: questions[0].id, selected_index: null, elapsed_ms: 150 });
  expect(r.status).toBe(200);
  expect(r.body.correct).toBe(false);
  expect(r.body.points_earned).toBe(0);
  expect(r.body.streak).toBe(0);
});

t('mode tournament → 403 MODE_NOT_ALLOWED', async () => {
  const { token, questions } = await setup(1);
  const r = await answer(token, { question_id: questions[0].id, selected_index: 1, elapsed_ms: 2000, mode: 'tournament' });
  expect(r.status).toBe(403);
  expect(r.body.error.code).toBe('MODE_NOT_ALLOWED');
});

t('question inexistante → 404 QUESTION_NOT_FOUND', async () => {
  const { token } = await setup(0);
  const r = await answer(token, { question_id: '00000000-0000-0000-0000-000000000000', selected_index: 1, elapsed_ms: 2000 });
  expect(r.status).toBe(404);
  expect(r.body.error.code).toBe('QUESTION_NOT_FOUND');
});

t('sans token → 401', async () => {
  const r = await request(app).post('/api/v1/sessions/answer').send({ question_id: '00000000-0000-0000-0000-000000000000', selected_index: 1, elapsed_ms: 2000 });
  expect(r.status).toBe(401);
});
