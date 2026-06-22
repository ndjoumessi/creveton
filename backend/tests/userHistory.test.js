'use strict';

const H = require('./helpers/integration');
const request = require('supertest');
const app = require('../src/app');

/**
 * Tests d'intégration GET /users/me/history (spec §10).
 * Alimente les stats rapides + « dernières parties » de l'accueil mobile :
 * une partie soumise doit apparaître immédiatement dans l'historique avec
 * score / streak_max / played_at, en ordre récent → ancien.
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

async function setup(nb = 5) {
  const user = await H.createUser({ role: 'player', total_xp: 0, level: 1 });
  const token = H.tokenFor(user);
  const questions = await Promise.all(
    Array.from({ length: nb }, () =>
      H.createApprovedQuestion({ level: 'beginner', theme: 'geographie' })
    )
  );
  return { user, token, questions };
}

const submit = (token, body) =>
  request(app).post('/api/v1/sessions/submit').set('Authorization', `Bearer ${token}`).send(body);

const history = (token, query = {}) =>
  request(app).get('/api/v1/users/me/history').query(query).set('Authorization', `Bearer ${token}`);

t('historique vide → data: [] (et non 501)', async () => {
  const { token } = await setup(1);
  const r = await history(token);
  expect(r.status).toBe(200);
  expect(Array.isArray(r.body.data)).toBe(true);
  expect(r.body.data).toHaveLength(0);
  expect(r.body.page.has_more).toBe(false);
});

t('une partie soumise apparaît dans l’historique avec score + streak_max', async () => {
  const { token, questions } = await setup(5);
  const sub = await submit(token, {
    mode: 'normal',
    theme: 'geographie',
    level: 'beginner',
    started_at: '2026-06-21T10:00:00Z',
    answers: questions.map((q) => ({
      question_id: q.id,
      selected_index: q.correct_index,
      elapsed_ms: 2000,
      skipped: false,
    })),
  });
  expect(sub.status).toBe(200);

  const r = await history(token);
  expect(r.status).toBe(200);
  expect(r.body.data).toHaveLength(1);
  const g = r.body.data[0];
  expect(g.session_id).toBe(sub.body.session_id);
  expect(g.score).toBe(375);
  expect(g.correct_count).toBe(5);
  expect(g.question_count).toBe(5);
  expect(g.streak_max).toBe(5);
  expect(g.theme).toBe('geographie');
  expect(g.level).toBe('beginner');
  expect(g.played_at).toBeTruthy();
});

t('plusieurs parties → ordre récent → ancien + pagination cursor', async () => {
  const { token, questions } = await setup(2);
  const play = (startedAt) =>
    submit(token, {
      mode: 'normal',
      theme: 'geographie',
      level: 'beginner',
      started_at: startedAt,
      answers: questions.map((q) => ({
        question_id: q.id,
        selected_index: q.correct_index,
        elapsed_ms: 2000,
        skipped: false,
      })),
    });
  await play('2026-06-20T10:00:00Z');
  await play('2026-06-21T10:00:00Z');

  const page1 = await history(token, { limit: 1 });
  expect(page1.status).toBe(200);
  expect(page1.body.data).toHaveLength(1);
  expect(page1.body.page.has_more).toBe(true);
  expect(page1.body.page.next_cursor).toBe('1');

  const page2 = await history(token, { limit: 1, cursor: page1.body.page.next_cursor });
  expect(page2.status).toBe(200);
  expect(page2.body.data).toHaveLength(1);
  expect(page2.body.page.has_more).toBe(false);
  // La 1re page est la plus récente, la 2e plus ancienne.
  expect(new Date(page1.body.data[0].played_at).getTime()).toBeGreaterThan(
    new Date(page2.body.data[0].played_at).getTime()
  );
});
