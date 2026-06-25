'use strict';

const H = require('./helpers/integration');
const request = require('supertest');
const app = require('../src/app');

/**
 * Tests d'intégration Questions & sync (spec §5) — GET /questions, delta sync,
 * règle anti-triche — contre Postgres + Redis réels.
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

/** Crée un joueur authentifié + un lot de questions approuvées. */
async function setup(nbQuestions = 6) {
  const user = await H.createUser({ role: 'player' });
  const token = H.tokenFor(user);
  const ids = [];
  for (let i = 0; i < nbQuestions; i += 1) {
    const q = await H.createApprovedQuestion({ theme: 'geographie', level: 'beginner' });
    ids.push(q.id);
  }
  return { token, ids };
}

t('GET /questions : set filtré + seed, SANS solution (anti-triche)', async () => {
  const { token } = await setup(6);
  const r = await request(app)
    .get('/api/v1/questions')
    .query({ theme: 'geographie', level: 'beginner', count: 5 })
    .set('Authorization', `Bearer ${token}`);

  expect(r.status).toBe(200);
  expect(r.body.data).toHaveLength(5);
  expect(typeof r.body.seed).toBe('string');

  const q = r.body.data[0];
  expect(q).not.toHaveProperty('correct_index');
  expect(q).not.toHaveProperty('explanation');
  // options : uniquement { index, text }, jamais is_correct
  expect(q.options.every((o) => 'index' in o && 'text' in o && !('is_correct' in o))).toBe(true);
});

t('GET /questions : expose text_fr, text_en et options[].text_en (bilingue)', async () => {
  const user = await H.createUser({ role: 'player' });
  const token = H.tokenFor(user);
  await H.db.query(
    `INSERT INTO questions (text_fr, text_en, type, options, correct_index, theme, level, status)
     VALUES ($1, $2, 'mcq', $3::jsonb, 1, 'geographie', 'beginner', 'approved')`,
    [
      'Quelle est la capitale du Cameroun ?',
      'What is the capital of Cameroon?',
      JSON.stringify([
        { text: 'Douala', text_en: 'Douala', is_correct: false },
        { text: 'Yaoundé', text_en: 'Yaoundé', is_correct: true },
      ]),
    ]
  );

  const r = await request(app)
    .get('/api/v1/questions')
    .query({ theme: 'geographie', level: 'beginner', count: 1 })
    .set('Authorization', `Bearer ${token}`);

  expect(r.status).toBe(200);
  const q = r.body.data[0];
  expect(q.text_fr).toBe('Quelle est la capitale du Cameroun ?');
  expect(q.text_en).toBe('What is the capital of Cameroon?');
  expect(q.text).toBe('Quelle est la capitale du Cameroun ?'); // rétro-compat (FR)
  // text_en par option ; toujours sans is_correct (anti-triche).
  expect(q.options.every((o) => 'text_en' in o && !('is_correct' in o))).toBe(true);
  expect(q.options[1].text_en).toBe('Yaoundé');
});

t('GET /questions/delta : new[] inclut text_en', async () => {
  const user = await H.createUser({ role: 'player' });
  const token = H.tokenFor(user);
  await H.db.query(
    `INSERT INTO questions (text_fr, text_en, type, options, correct_index, theme, level, status)
     VALUES ('Énoncé FR', 'EN statement', 'mcq', $1::jsonb, 0, 'culture', 'beginner', 'approved')`,
    [JSON.stringify([{ text: 'A', text_en: 'A-en', is_correct: true }, { text: 'B', text_en: 'B-en', is_correct: false }])]
  );

  const r = await request(app)
    .get('/api/v1/questions/delta')
    .query({ since: '2000-01-01T00:00:00Z' })
    .set('Authorization', `Bearer ${token}`);

  expect(r.status).toBe(200);
  const q = r.body.new.find((x) => x.text_fr === 'Énoncé FR');
  expect(q).toBeTruthy();
  expect(q.text_en).toBe('EN statement');
  expect(q.options[0].text_en).toBe('A-en');
});

t('GET /questions : même seed → même tirage (équité challenge)', async () => {
  const { token } = await setup(8);
  const seed = 'challenge-seed-42';
  const a = await request(app).get('/api/v1/questions').query({ count: 5, seed }).set('Authorization', `Bearer ${token}`);
  const b = await request(app).get('/api/v1/questions').query({ count: 5, seed }).set('Authorization', `Bearer ${token}`);
  expect(a.body.data.map((q) => q.id)).toEqual(b.body.data.map((q) => q.id));
  expect(a.body.seed).toBe(seed);
});

t('GET /questions : pool vide → 404 NO_QUESTIONS_AVAILABLE', async () => {
  const user = await H.createUser({ role: 'player' });
  const token = H.tokenFor(user);
  const r = await request(app).get('/api/v1/questions').query({ count: 5 }).set('Authorization', `Bearer ${token}`);
  expect(r.status).toBe(404);
  expect(r.body.error.code).toBe('NO_QUESTIONS_AVAILABLE');
});

t('GET /questions/delta : new[] + synced_at, sans solution', async () => {
  const { token, ids } = await setup(4);
  const r = await request(app)
    .get('/api/v1/questions/delta')
    .query({ since: '2000-01-01T00:00:00Z' })
    .set('Authorization', `Bearer ${token}`);

  expect(r.status).toBe(200);
  expect(r.body.new).toHaveLength(ids.length);
  expect(r.body.deleted_ids).toEqual([]);
  expect(typeof r.body.synced_at).toBe('string');
  expect(r.body.new.every((q) => 'version' in q && !('correct_index' in q))).toBe(true);
});

t('GET /questions/delta : soft-delete → deleted_ids, hors new/updated', async () => {
  const { token, ids } = await setup(3);
  // Soft delete : pose deleted_at (le trigger bumpe updated_at).
  await H.db.query(`UPDATE questions SET deleted_at = now(), status = 'archived' WHERE id = $1`, [ids[0]]);

  const r = await request(app)
    .get('/api/v1/questions/delta')
    .query({ since: '2000-01-01T00:00:00Z' })
    .set('Authorization', `Bearer ${token}`);

  expect(r.body.deleted_ids).toContain(ids[0]);
  const present = r.body.new.concat(r.body.updated).map((q) => q.id);
  expect(present).not.toContain(ids[0]);
});

t('GET /questions/delta : timestamp invalide → 400 INVALID_TIMESTAMP', async () => {
  const user = await H.createUser({ role: 'player' });
  const token = H.tokenFor(user);
  const r = await request(app)
    .get('/api/v1/questions/delta')
    .query({ since: 'pas-une-date' })
    .set('Authorization', `Bearer ${token}`);
  expect(r.status).toBe(400);
  expect(r.body.error.code).toBe('INVALID_TIMESTAMP');
});
