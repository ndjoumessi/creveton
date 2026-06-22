'use strict';

const H = require('./helpers/integration');
const request = require('supertest');
const app = require('../src/app');
const scoreService = require('../src/services/scoreService');
const questionModel = require('../src/models/question.model');
const { THEMES } = require('../src/utils/constants');

/**
 * Tests des modes Blitz (timer global 60 s, set mixte) et Marathon (180 s,
 * 20 questions mix, bonus thème consécutif).
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

// ── Unitaire (sans infra) : multiplicateur de streak thématique ──────────────
describe('scoreService.themeStreakMultiplier', () => {
  test('2 consécutives → 1, 3 → 1.5, 5 → 2', () => {
    expect(scoreService.themeStreakMultiplier(['culture', 'culture'])).toBe(1);
    expect(
      scoreService.themeStreakMultiplier(['geographie', 'culture', 'culture', 'culture'])
    ).toBe(1.5);
    expect(
      scoreService.themeStreakMultiplier(['culture', 'culture', 'culture', 'culture', 'culture'])
    ).toBe(2);
    // La série casse si le dernier thème diffère.
    expect(
      scoreService.themeStreakMultiplier(['culture', 'culture', 'culture', 'sport'])
    ).toBe(1);
  });
});

// ── pickRandom sans thème → mix de thèmes ────────────────────────────────────
t('pickRandom sans thème → questions de thèmes variés', async () => {
  await Promise.all(
    THEMES.flatMap((theme) => [
      H.createApprovedQuestion({ theme, level: 'beginner' }),
      H.createApprovedQuestion({ theme, level: 'intermediate' }),
    ])
  );
  const rows = await questionModel.pickRandom({ theme: null, level: null, count: 12, seed: 'mix' });
  expect(rows.length).toBeGreaterThan(1);
  const distinctThemes = new Set(rows.map((r) => r.theme));
  expect(distinctThemes.size).toBeGreaterThan(1);
});

// ── Blitz : score serveur sur set mixte (base par niveau réel de la question) ─
t('POST /sessions/submit mode=blitz → score calculé (base par question)', async () => {
  const user = await H.createUser({ role: 'player', total_xp: 0, level: 1 });
  const token = H.tokenFor(user);
  const beginner = await H.createApprovedQuestion({ level: 'beginner', theme: 'culture' });
  const intermediate = await H.createApprovedQuestion({ level: 'intermediate', theme: 'sport' });
  const expert = await H.createApprovedQuestion({ level: 'expert', theme: 'science' });

  const r = await submit(token, {
    mode: 'blitz',
    theme: null,
    level: null,
    started_at: new Date(Date.now() - 5000).toISOString(), // dans le timer (60 s)
    answers: [beginner, intermediate, expert].map((q) => ({
      question_id: q.id,
      selected_index: q.correct_index, // toutes correctes
      elapsed_ms: 2000, // ≤ 5000 → bonus vitesse
      skipped: false,
    })),
  });

  expect(r.status).toBe(200);
  // beginner 50+25 / intermediate 75+38 / expert 100+50 = 75 + 113 + 150 = 338
  expect(r.body.score).toBe(338);
  expect(r.body.correct_count).toBe(3);
  expect(r.body.theme_streak_bonus).toBe(0); // thèmes tous différents
});

// ── Blitz : session trop longue (> 62 s) → triche ────────────────────────────
t('POST /sessions/submit mode=blitz > 62 s → 422 CHEAT_DETECTED', async () => {
  const user = await H.createUser({ role: 'player', total_xp: 0, level: 1 });
  const token = H.tokenFor(user);
  const q = await H.createApprovedQuestion({ level: 'beginner', theme: 'culture' });

  const r = await submit(token, {
    mode: 'blitz',
    theme: null,
    level: null,
    started_at: new Date(Date.now() - 120000).toISOString(), // 2 min → hors timer
    answers: [
      { question_id: q.id, selected_index: q.correct_index, elapsed_ms: 2000, skipped: false },
    ],
  });

  expect(r.status).toBe(422);
  expect(r.body.error.code).toBe('CHEAT_DETECTED');
});

// ── Marathon : bonus thème appliqué (20 questions même thème d'affilée) ───────
t('POST /sessions/submit mode=marathon → bonus thème appliqué', async () => {
  const user = await H.createUser({ role: 'player', total_xp: 0, level: 1 });
  const token = H.tokenFor(user);
  const questions = await Promise.all(
    Array.from({ length: 20 }, () =>
      H.createApprovedQuestion({ level: 'beginner', theme: 'culture' })
    )
  );

  const r = await submit(token, {
    mode: 'marathon',
    theme: null,
    level: null,
    started_at: '2026-06-21T10:00:00Z',
    answers: questions.map((q) => ({
      question_id: q.id,
      selected_index: q.correct_index,
      elapsed_ms: 2000,
      skipped: false,
    })),
  });

  expect(r.status).toBe(200);
  expect(r.body.correct_count).toBe(20);
  // Sans bonus : 20 × (50 base + 25 vitesse) = 1500. Le bonus thème s'ajoute.
  expect(r.body.theme_streak_bonus).toBeGreaterThan(0);
  expect(r.body.score).toBe(1500 + r.body.theme_streak_bonus);
});

// ── Marathon : nombre de questions ≠ 20 → validation rejetée ─────────────────
t('POST /sessions/submit mode=marathon avec 5 réponses → 400 VALIDATION_ERROR', async () => {
  const user = await H.createUser({ role: 'player', total_xp: 0, level: 1 });
  const token = H.tokenFor(user);
  const questions = await Promise.all(
    Array.from({ length: 5 }, () => H.createApprovedQuestion({ level: 'beginner', theme: 'culture' }))
  );
  const r = await submit(token, {
    mode: 'marathon',
    theme: null,
    level: null,
    started_at: '2026-06-21T10:00:00Z',
    answers: questions.map((q) => ({
      question_id: q.id,
      selected_index: q.correct_index,
      elapsed_ms: 2000,
      skipped: false,
    })),
  });
  expect(r.status).toBe(400);
  expect(r.body.error.code).toBe('VALIDATION_ERROR');
});
