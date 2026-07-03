'use strict';

// Réponse de génération renvoyée par le proxy Anthropic mocké (settable par test).
const mockGen = { items: [] };

// Mock du proxy Anthropic : callAnthropic renvoie le lot `mockGen.items` (en
// respectant la garde de clé pour tester le cas AI_NOT_CONFIGURED) ; autoTranslate
// est neutralisé (pas de fire-and-forget réseau). Aucun appel HTTP réel.
jest.mock('../src/services/aiCorrectorService', () => {
  const actual = jest.requireActual('../src/services/aiCorrectorService');
  const ApiError = jest.requireActual('../src/utils/ApiError');
  return {
    ...actual,
    callAnthropic: jest.fn(async () => {
      if (!process.env.ANTHROPIC_API_KEY) throw new ApiError('AI_NOT_CONFIGURED');
      return JSON.stringify({ questions: mockGen.items });
    }),
    autoTranslate: jest.fn(async () => ({ translated: false })),
  };
});

const H = require('./helpers/integration');
const request = require('supertest');
const app = require('../src/app');
const aiCorrector = require('../src/services/aiCorrectorService'); // mocké ci-dessus

/**
 * Tests d'intégration — génération assistée IA + workflow de relecture des
 * brouillons (generate / drafts / approve / reject / édition). Proxy Anthropic
 * mocké (clé factice). Postgres + Redis réels ; auto-skip sans infra.
 */

let ready = false;
const KEY = process.env.ANTHROPIC_API_KEY;

beforeAll(async () => {
  ready = await H.ensureReady();
  process.env.ANTHROPIC_API_KEY = 'test-fake-key';
});
afterAll(async () => {
  if (KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = KEY;
  await H.teardown();
});
beforeEach(async () => {
  if (ready) await H.resetState();
  mockGen.items = [];
});

const t = (name, fn) =>
  test(name, async () => {
    if (!ready) return;
    await fn();
  });

const P = '/api/v1';
const q = (over = {}) => ({
  text_fr: 'Quelle est la capitale du Cameroun ?',
  options: ['Douala', 'Yaoundé', 'Garoua', 'Bafoussam'],
  correct_index: 1,
  explanation: 'Yaoundé est la capitale politique.',
  ...over,
});

// ── Mount-guards (toujours actifs, sans infra) ──────────────────────────────

test('POST /admin/questions/generate sans token → 401', async () => {
  const r = await request(app).post(`${P}/admin/questions/generate`).send({ theme: 'geographie', level: 'beginner' });
  expect(r.status).toBe(401);
});
test('GET /admin/questions/drafts sans token → 401', async () => {
  const r = await request(app).get(`${P}/admin/questions/drafts`);
  expect(r.status).toBe(401);
});

// ── Génération ───────────────────────────────────────────────────────────────

t('generate → crée des brouillons (draft + ai_generated), skip invalides/doublons', async () => {
  const admin = await H.createUser({ role: 'admin', phone: '+237690003001' });
  mockGen.items = [
    q({ text_fr: 'Q unique une ?' }),
    q({ text_fr: 'Q unique une ?' }), // doublon (même texte) → skipped_duplicates
    q({ text_fr: 'Q unique deux ?' }),
    { text_fr: 'Q invalide', options: ['a', 'b', 'c'], correct_index: 0 }, // 3 options → skipped_invalid
  ];

  const r = await request(app)
    .post(`${P}/admin/questions/generate`)
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`)
    .send({ theme: 'geographie', level: 'beginner', count: 4 });

  expect(r.status).toBe(200);
  expect(r.body.requested).toBe(4);
  expect(r.body.created.length).toBe(2);
  expect(r.body.skipped_duplicates).toBe(1);
  expect(r.body.skipped_invalid).toBe(1);
  const d = r.body.created[0];
  expect(d.status).toBe('draft');
  expect(d.source).toBe('ai_generated');
  expect(d.options.filter((o) => o.is_correct).length).toBe(1);
  expect(d.theme).toBe('geographie');

  // Invisibles pour l'app : aucun approved créé.
  const { rows } = await H.db.query("SELECT count(*)::int AS n FROM questions WHERE status='approved'");
  expect(rows[0].n).toBe(0);
});

t('generate → timeout dédié (> 15 s du correcteur) passé à callAnthropic', async () => {
  const admin = await H.createUser({ role: 'admin', phone: '+237690003005' });
  mockGen.items = [q({ text_fr: 'Q timeout ?' })];
  aiCorrector.callAnthropic.mockClear();
  await request(app)
    .post(`${P}/admin/questions/generate`)
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`)
    .send({ theme: 'geographie', level: 'beginner', count: 10 });

  expect(aiCorrector.callAnthropic).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ timeoutMs: expect.any(Number) }),
  );
  const opts = aiCorrector.callAnthropic.mock.calls.at(-1)[1];
  expect(opts.timeoutMs).toBeGreaterThan(15000); // ≠ le timeout court du correcteur
  expect(opts.timeoutMs).toBe(80000); // 40s + 4s × 10 questions
});

t('generate sans clé Anthropic → 503 AI_NOT_CONFIGURED', async () => {
  const admin = await H.createUser({ role: 'admin', phone: '+237690003002' });
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const r = await request(app)
      .post(`${P}/admin/questions/generate`)
      .set('Authorization', `Bearer ${H.tokenFor(admin)}`)
      .send({ theme: 'sport', level: 'beginner', count: 5 });
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe('AI_NOT_CONFIGURED');
  } finally {
    process.env.ANTHROPIC_API_KEY = saved;
  }
});

t('generate : player → 403 ; theme invalide → 400', async () => {
  const player = await H.createUser({ role: 'player', phone: '+237690003003' });
  const forbidden = await request(app)
    .post(`${P}/admin/questions/generate`)
    .set('Authorization', `Bearer ${H.tokenFor(player)}`)
    .send({ theme: 'geographie', level: 'beginner' });
  expect(forbidden.status).toBe(403);

  const admin = await H.createUser({ role: 'admin', phone: '+237690003004' });
  const bad = await request(app)
    .post(`${P}/admin/questions/generate`)
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`)
    .send({ theme: 'not_a_theme', level: 'beginner' });
  expect(bad.status).toBe(400);
});

// ── Relecture : liste / approve / reject / édition ──────────────────────────

t('drafts list → renvoie les brouillons IA ; approve publie ; reject retire', async () => {
  const admin = await H.createUser({ role: 'admin', phone: '+237690003010' });
  mockGen.items = [q({ text_fr: 'Draft A ?' }), q({ text_fr: 'Draft B ?' })];
  const gen = await request(app)
    .post(`${P}/admin/questions/generate`)
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`)
    .send({ theme: 'geographie', level: 'beginner', count: 2 });
  expect(gen.body.created.length).toBe(2);
  const [a, b] = gen.body.created;

  const list = await request(app)
    .get(`${P}/admin/questions/drafts`)
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`);
  expect(list.status).toBe(200);
  expect(list.body.data.length).toBe(2);
  expect(list.body.page.total).toBe(2);

  // Approve A → publié (approved)
  const approve = await request(app)
    .post(`${P}/admin/questions/drafts/${a.id}/approve`)
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`);
  expect(approve.status).toBe(200);
  expect(approve.body.status).toBe('approved');

  // Reject B → soft delete
  const reject = await request(app)
    .post(`${P}/admin/questions/drafts/${b.id}/reject`)
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`)
    .send({ reason: 'Ambiguë' });
  expect(reject.status).toBe(200);

  const after = await request(app)
    .get(`${P}/admin/questions/drafts`)
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`);
  expect(after.body.data.length).toBe(0);

  const { rows } = await H.db.query('SELECT status, deleted_at FROM questions WHERE id = $1', [b.id]);
  expect(rows[0].status).toBe('archived');
  expect(rows[0].deleted_at).not.toBeNull();
});

t('approve/reject sur un id non-brouillon → 404', async () => {
  const admin = await H.createUser({ role: 'admin', phone: '+237690003020' });
  const published = await H.createApprovedQuestion({ status: 'approved' });
  const r = await request(app)
    .post(`${P}/admin/questions/drafts/${published.id}/approve`)
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`);
  expect(r.status).toBe(404);
});

t('édition d\'un brouillon avant publication via PATCH /:id', async () => {
  const admin = await H.createUser({ role: 'admin', phone: '+237690003030' });
  mockGen.items = [q({ text_fr: 'Avant correction ?' })];
  const gen = await request(app)
    .post(`${P}/admin/questions/generate`)
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`)
    .send({ theme: 'geographie', level: 'beginner', count: 1 });
  const draft = gen.body.created[0];

  const edit = await request(app)
    .patch(`${P}/admin/questions/${draft.id}`)
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`)
    .send({ text_fr: 'Énoncé corrigé par l\'admin ?' });
  expect(edit.status).toBe(200);
  expect(edit.body.text_fr).toBe('Énoncé corrigé par l\'admin ?');
  expect(edit.body.status).toBe('draft');
});
