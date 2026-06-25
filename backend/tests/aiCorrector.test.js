'use strict';

// Tests du correcteur IA (proxy Anthropic serveur). `fetch` global est mocké —
// AUCUN appel réseau réel. La clé est simulée via process.env le temps des tests.

const request = require('supertest');
const H = require('./helpers/integration');
const app = require('../src/app');

const P = '/api/v1/admin/questions/improve-text';

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
});

const t = (name, fn) =>
  test(name, async () => {
    if (!ready) {
      console.warn(`[skip] ${name}`);
      return;
    }
    await fn();
  });

function mockAnthropic(text) {
  fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ content: [{ text }] }) });
}
async function modToken() {
  const mod = await H.createUser({ role: 'moderator' });
  return H.tokenFor(mod);
}
const post = (token, body) =>
  request(app).post(P).set('Authorization', `Bearer ${token}`).send(body);

// ── Happy path FR → 200 { suggestion, changed } ──────────────────────────────
t('FR statement → 200 + suggestion corrigée (changed=true)', async () => {
  mockAnthropic('Quelle est la capitale du Cameroun ?');
  const token = await modToken();

  const r = await post(token, { text: 'quel est la capital du cameroun', lang: 'fr', type: 'statement' });

  expect(r.status).toBe(200);
  expect(r.body.suggestion).toBe('Quelle est la capitale du Cameroun ?');
  expect(r.body.changed).toBe(true);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  // Le prompt FR + la clé sont bien envoyés à Anthropic.
  const [, opts] = fetchSpy.mock.calls[0];
  expect(opts.headers['x-api-key']).toBe('sk-ant-test-key');
  expect(opts.body).toContain('correcteur de quiz');
});

// ── Happy path EN ────────────────────────────────────────────────────────────
t('EN explanation → 200 + prompt anglais', async () => {
  mockAnthropic('The capital of Cameroon is Yaoundé.');
  const token = await modToken();

  const r = await post(token, { text: 'capital of cameroon is yaounde', lang: 'en', type: 'explanation' });

  expect(r.status).toBe(200);
  expect(r.body.suggestion).toBe('The capital of Cameroon is Yaoundé.');
  const [, opts] = fetchSpy.mock.calls[0];
  expect(opts.body).toContain('educational quiz corrector');
});

// ── changed=false quand la suggestion == le texte ────────────────────────────
t('suggestion identique → changed=false', async () => {
  mockAnthropic('Texte déjà correct.');
  const token = await modToken();

  const r = await post(token, { text: 'Texte déjà correct.', lang: 'fr', type: 'statement' });

  expect(r.status).toBe(200);
  expect(r.body.changed).toBe(false);
});

// ── Texte manquant → 400 (validation) ────────────────────────────────────────
t('texte manquant → 400', async () => {
  const token = await modToken();
  const r = await post(token, { lang: 'fr', type: 'statement' });
  expect(r.status).toBe(400);
  expect(r.body.error.code).toBe('VALIDATION_ERROR');
  expect(fetchSpy).not.toHaveBeenCalled();
});

// ── Texte trop court (< 3) → 400 ─────────────────────────────────────────────
t('texte trop court → 400', async () => {
  const token = await modToken();
  const r = await post(token, { text: 'ab' });
  expect(r.status).toBe(400);
  expect(r.body.error.code).toBe('VALIDATION_ERROR');
  expect(fetchSpy).not.toHaveBeenCalled();
});

// ── Non authentifié → 401 ────────────────────────────────────────────────────
t('non authentifié → 401', async () => {
  const r = await request(app).post(P).send({ text: 'quel est la capital' });
  expect(r.status).toBe(401);
  expect(fetchSpy).not.toHaveBeenCalled();
});

// ── Anthropic en erreur → 503 AI_UNAVAILABLE ─────────────────────────────────
t('Anthropic non-OK → 503 AI_UNAVAILABLE', async () => {
  fetchSpy.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
  const token = await modToken();

  const r = await post(token, { text: 'quel est la capital du cameroun' });

  expect(r.status).toBe(503);
  expect(r.body.error.code).toBe('AI_UNAVAILABLE');
});
