'use strict';

// Tests de l'auto-traduction IA des questions : endpoint bloquant
// POST /admin/questions/:id/translate + hook fire-and-forget après création.
// `fetch` global est mocké — AUCUN appel réseau réel.

const request = require('supertest');
const H = require('./helpers/integration');
const app = require('../src/app');
const aiCorrectorService = require('../src/services/aiCorrectorService');

let ready = false;
let prevKey;
let fetchSpy;

beforeAll(async () => {
  ready = await H.ensureReady();
  prevKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
});
afterAll(async () => {
  if (prevKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = prevKey;
  await H.teardown();
});
beforeEach(async () => {
  if (ready) await H.resetState();
  fetchSpy = jest.spyOn(global, 'fetch');
});
afterEach(() => {
  fetchSpy.mockRestore();
  jest.restoreAllMocks();
});

const t = (name, fn) =>
  test(name, async () => {
    if (!ready) {
      console.warn(`[skip] ${name}`);
      return;
    }
    await fn();
  });

function mockJson(obj) {
  fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ content: [{ text: JSON.stringify(obj) }] }) });
}
async function modToken() {
  const mod = await H.createUser({ role: 'moderator' });
  return H.tokenFor(mod);
}

t('POST /:id/translate (FR→EN) : remplit text_en + options[].text_en', async () => {
  const token = await modToken();
  const { rows } = await H.db.query(
    `INSERT INTO questions (text_fr, type, options, correct_index, theme, level, status)
     VALUES ('Quelle est la capitale du Cameroun ?', 'mcq', $1::jsonb, 1, 'geographie', 'beginner', 'approved')
     RETURNING id`,
    [JSON.stringify([{ text: 'Douala', is_correct: false }, { text: 'Yaoundé', is_correct: true }])]
  );
  const id = rows[0].id;
  mockJson({ text_en: 'What is the capital of Cameroon?', options_en: ['Douala', 'Yaoundé'] });

  const r = await request(app)
    .post(`/api/v1/admin/questions/${id}/translate`)
    .set('Authorization', `Bearer ${token}`)
    .send({ target_lang: 'en' });

  expect(r.status).toBe(200);
  expect(r.body.translated).toBe(true);
  expect(r.body.text_en).toBe('What is the capital of Cameroon?');

  // Persisté : text_en + chaque option a text_en.
  const { rows: after } = await H.db.query('SELECT text_en, options FROM questions WHERE id = $1', [id]);
  expect(after[0].text_en).toBe('What is the capital of Cameroon?');
  expect(after[0].options[1].text_en).toBe('Yaoundé');
});

t('POST /:id/translate (EN→FR) : remplit text_fr depuis text_en', async () => {
  const token = await modToken();
  const { rows } = await H.db.query(
    `INSERT INTO questions (text_fr, text_en, type, options, correct_index, theme, level, status)
     VALUES ('placeholder', 'What is the capital of Cameroon?', 'mcq', $1::jsonb, 1, 'geographie', 'beginner', 'approved')
     RETURNING id`,
    [JSON.stringify([{ text: 'x', text_en: 'Douala', is_correct: false }, { text: 'y', text_en: 'Yaounde', is_correct: true }])]
  );
  const id = rows[0].id;
  mockJson({ text_fr: 'Quelle est la capitale du Cameroun ?', options_fr: ['Douala', 'Yaoundé'] });

  const r = await request(app)
    .post(`/api/v1/admin/questions/${id}/translate`)
    .set('Authorization', `Bearer ${token}`)
    .send({ target_lang: 'fr' });

  expect(r.status).toBe(200);
  expect(r.body.translated).toBe(true);
  expect(r.body.text_fr).toBe('Quelle est la capitale du Cameroun ?');
  const { rows: after } = await H.db.query('SELECT text_fr, options FROM questions WHERE id = $1', [id]);
  expect(after[0].text_fr).toBe('Quelle est la capitale du Cameroun ?');
  expect(after[0].options[1].text).toBe('Yaoundé');
});

t('POST /:id/translate (target=en) sans text_fr source → 400', async () => {
  // Impossible d'avoir text_fr NULL (contrainte), donc on teste la validation du
  // body : target_lang invalide → 400.
  const token = await modToken();
  const q = await H.createApprovedQuestion();
  const r = await request(app)
    .post(`/api/v1/admin/questions/${q.id}/translate`)
    .set('Authorization', `Bearer ${token}`)
    .send({ target_lang: 'es' });
  expect(r.status).toBe(400);
});

t('POST /:id/translate (target=fr) sans text_en → 400 VALIDATION_ERROR', async () => {
  const token = await modToken();
  const q = await H.createApprovedQuestion(); // text_en absent
  const r = await request(app)
    .post(`/api/v1/admin/questions/${q.id}/translate`)
    .set('Authorization', `Bearer ${token}`)
    .send({ target_lang: 'fr' });
  expect(r.status).toBe(400);
  expect(r.body.error.code).toBe('VALIDATION_ERROR');
});

t('Création admin déclenche autoTranslate FR→EN (non bloquant)', async () => {
  const token = await modToken();
  const spy = jest.spyOn(aiCorrectorService, 'autoTranslate').mockResolvedValue({ translated: true, targetLang: 'en' });

  const r = await request(app)
    .post('/api/v1/admin/questions')
    .set('Authorization', `Bearer ${token}`)
    .send({
      text_fr: 'Une toute nouvelle question de test ?',
      options: [{ text: 'A', is_correct: true }, { text: 'B', is_correct: false }],
      theme: 'culture',
      level: 'beginner',
    });

  expect(r.status).toBe(201);
  expect(spy).toHaveBeenCalledWith(r.body.id, 'fr');
});
