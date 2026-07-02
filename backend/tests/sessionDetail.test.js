'use strict';

const H = require('./helpers/integration');
const request = require('supertest');
const app = require('../src/app');

/**
 * Tests d'intégration GET /sessions/:id — détail d'une partie (review post-partie).
 * Alimente l'écran « détail d'une partie » mobile (navigation depuis l'historique).
 * Règles : propriétaire uniquement (403 sinon), 404 si inexistante, review[] avec
 * énoncé FR/EN, options, selected/correct_index, temps et explications.
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

const submit = (token, body) =>
  request(app).post('/api/v1/sessions/submit').set('Authorization', `Bearer ${token}`).send(body);

const detail = (token, id) =>
  request(app).get(`/api/v1/sessions/${id}`).set('Authorization', `Bearer ${token}`);

async function playSession() {
  const user = await H.createUser({ role: 'player', total_xp: 0, level: 1 });
  const token = H.tokenFor(user);
  const questions = await Promise.all([
    H.createApprovedQuestion({ level: 'beginner', theme: 'geographie' }),
    H.createApprovedQuestion({ level: 'beginner', theme: 'geographie' }),
    H.createApprovedQuestion({ level: 'beginner', theme: 'geographie' }),
  ]);
  const answers = [
    // 1 bonne, 1 mauvaise, 1 passée (skip).
    { question_id: questions[0].id, selected_index: questions[0].correct_index, elapsed_ms: 2000, skipped: false },
    { question_id: questions[1].id, selected_index: 0, elapsed_ms: 4000, skipped: false },
    { question_id: questions[2].id, selected_index: null, elapsed_ms: 9000, skipped: true },
  ];
  const sub = await submit(token, {
    mode: 'normal',
    theme: 'geographie',
    level: 'beginner',
    started_at: '2026-06-21T10:00:00Z',
    answers,
  });
  expect(sub.status).toBe(200);
  return { user, token, questions, answers, sessionId: sub.body.session_id };
}

t('200 propriétaire : en-tête de partie + review[] complet par question', async () => {
  const { token, questions, sessionId } = await playSession();

  const r = await detail(token, sessionId);
  expect(r.status).toBe(200);

  // En-tête : mêmes champs que l'historique (toView).
  expect(r.body.session_id).toBe(sessionId);
  expect(r.body.mode).toBe('normal');
  expect(r.body.theme).toBe('geographie');
  expect(r.body.level).toBe('beginner');
  expect(r.body.correct_count).toBe(1);
  expect(r.body.question_count).toBe(3);
  expect(r.body.score).toBeGreaterThan(0);
  expect(r.body.xp_earned).toBeGreaterThan(0);
  expect(r.body.played_at).toBeTruthy();

  // Review : une entrée par réponse, dans l'ordre joué.
  expect(r.body.review).toHaveLength(3);

  const [good, bad, skipped] = r.body.review;
  expect(good.question_id).toBe(questions[0].id);
  expect(good.text_fr).toBe(questions[0].text_fr);
  expect(good.text).toBe(questions[0].text_fr); // rétro-compat : text = FR
  expect(good.options).toHaveLength(2);
  expect(good.options[0]).toMatchObject({ index: 0, text: 'A', text_fr: 'A' });
  expect(good.selected_index).toBe(questions[0].correct_index);
  expect(good.correct_index).toBe(questions[0].correct_index);
  expect(good.is_correct).toBe(true);
  expect(good.elapsed_ms).toBe(2000);
  expect(good.explanation).toBe('Explication.');

  expect(bad.is_correct).toBe(false);
  expect(bad.selected_index).toBe(0);
  expect(bad.correct_index).toBe(questions[1].correct_index);

  expect(skipped.is_correct).toBe(false);
  expect(skipped.selected_index).toBeNull();
});

t("403 : la partie d'un autre joueur n'est pas consultable", async () => {
  const { sessionId } = await playSession();
  const intruder = await H.createUser({ role: 'player' });

  const r = await detail(H.tokenFor(intruder), sessionId);
  expect(r.status).toBe(403);
  expect(r.body.error.code).toBe('FORBIDDEN');
});

t('404 : partie inexistante', async () => {
  const user = await H.createUser({ role: 'player' });
  const r = await detail(H.tokenFor(user), '00000000-0000-4000-8000-000000000000');
  expect(r.status).toBe(404);
  expect(r.body.error.code).toBe('SESSION_NOT_FOUND');
});

t('400 : id non UUID rejeté par la validation', async () => {
  const user = await H.createUser({ role: 'player' });
  const r = await detail(H.tokenFor(user), 'not-a-uuid');
  expect(r.status).toBe(400);
  expect(r.body.error.code).toBe('VALIDATION_ERROR');
});
