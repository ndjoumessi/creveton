'use strict';

const H = require('./helpers/integration');
const request = require('supertest');
const app = require('../src/app');

/**
 * Tests d'intégration — rapports agrégés (GROUP BY) de la console admin :
 *   GET /admin/analytics/reports/sessions?group_by=theme|level|mode&from=&to=
 *   GET /admin/analytics/reports/revenue?from=&to=
 * Postgres + Redis réels ; auto-skip si l'infra est absente.
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

const P = '/api/v1';

// Insère une partie (played_at = maintenant par défaut).
async function session(userId, over = {}) {
  const s = {
    mode: 'normal',
    theme: 'culture',
    level: 'beginner',
    score: 80,
    correct_count: 8,
    question_count: 10,
    xp_earned: 40,
    played_at: null,
    ...over,
  };
  await H.db.query(
    `INSERT INTO game_sessions
       (user_id, mode, theme, level, score, correct_count, question_count, xp_earned, answers, played_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'[]'::jsonb, COALESCE($9, now()))`,
    [userId, s.mode, s.theme, s.level, s.score, s.correct_count, s.question_count, s.xp_earned, s.played_at]
  );
}

async function tx(userId, over = {}) {
  const x = { type: 'entry_fee', amount: 1000, status: 'success', created_at: null, ...over };
  await H.db.query(
    `INSERT INTO transactions (user_id, type, amount, status, created_at)
     VALUES ($1,$2,$3,$4, COALESCE($5, now()))`,
    [userId, x.type, x.amount, x.status, x.created_at]
  );
}

// ── Mount-guards : toujours actifs, aucune infra requise (401 avant DB). ──────

test('GET /admin/analytics/reports/sessions sans token → 401 (route montée)', async () => {
  const r = await request(app).get(`${P}/admin/analytics/reports/sessions`);
  expect(r.status).toBe(401);
});

test('GET /admin/analytics/reports/revenue sans token → 401 (route montée)', async () => {
  const r = await request(app).get(`${P}/admin/analytics/reports/revenue`);
  expect(r.status).toBe(401);
});

// ── Sessions report ──────────────────────────────────────────────────────────

t('reports/sessions group_by=theme → 200, agrégat + catégories back-fillées', async () => {
  const admin = await H.createUser({ role: 'admin', phone: '+237690001001' });
  const p1 = await H.createUser({ role: 'player', phone: '+237690001002' });
  const p2 = await H.createUser({ role: 'player', phone: '+237690001003' });
  // culture : 2 parties (2 joueurs distincts), correct 8/10 + 6/10 → success 70
  await session(p1.id, { theme: 'culture', score: 80, correct_count: 8, question_count: 10, xp_earned: 40 });
  await session(p2.id, { theme: 'culture', score: 100, correct_count: 6, question_count: 10, xp_earned: 60 });
  // sport : 1 partie
  await session(p1.id, { theme: 'sport', score: 50, correct_count: 5, question_count: 10, xp_earned: 25 });

  const r = await request(app)
    .get(`${P}/admin/analytics/reports/sessions`)
    .query({ group_by: 'theme' })
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`);

  expect(r.status).toBe(200);
  expect(r.body.group_by).toBe('theme');
  expect(r.body.range).toHaveProperty('from');
  expect(r.body.range).toHaveProperty('to');
  // Tous les thèmes canoniques présents (back-fill à 0).
  const keys = r.body.rows.map((x) => x.key);
  for (const th of ['culture', 'geographie', 'histoire', 'industrie', 'sport', 'science']) {
    expect(keys).toContain(th);
  }
  const culture = r.body.rows.find((x) => x.key === 'culture');
  expect(culture).toMatchObject({ sessions: 2, players: 2, avg_score: 90, xp: 100, success_rate: 70 });
  const science = r.body.rows.find((x) => x.key === 'science');
  expect(science).toMatchObject({ sessions: 0, players: 0, xp: 0, success_rate: 0 });
  expect(r.body.totals).toMatchObject({ sessions: 3, xp: 125 });
  // Tri décroissant par sessions.
  expect(r.body.rows[0].sessions).toBeGreaterThanOrEqual(r.body.rows[1].sessions);
});

t('reports/sessions group_by=mode → agrège par mode de jeu', async () => {
  const admin = await H.createUser({ role: 'admin', phone: '+237690001010' });
  const p = await H.createUser({ role: 'player', phone: '+237690001011' });
  await session(p.id, { mode: 'blitz' });
  await session(p.id, { mode: 'blitz' });
  await session(p.id, { mode: 'marathon' });

  const r = await request(app)
    .get(`${P}/admin/analytics/reports/sessions`)
    .query({ group_by: 'mode' })
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`);

  expect(r.status).toBe(200);
  expect(r.body.rows.find((x) => x.key === 'blitz').sessions).toBe(2);
  expect(r.body.rows.find((x) => x.key === 'marathon').sessions).toBe(1);
  expect(r.body.rows.find((x) => x.key === 'tournament').sessions).toBe(0);
});

t('reports/sessions : theme NULL → bucket « (mixte) »', async () => {
  const admin = await H.createUser({ role: 'admin', phone: '+237690001020' });
  const p = await H.createUser({ role: 'player', phone: '+237690001021' });
  await session(p.id, { theme: null });

  const r = await request(app)
    .get(`${P}/admin/analytics/reports/sessions`)
    .query({ group_by: 'theme' })
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`);
  const mixte = r.body.rows.find((x) => x.key === '(mixte)');
  expect(mixte).toBeTruthy();
  expect(mixte.sessions).toBe(1);
});

t('reports/sessions : plage [from,to) exclut les parties hors fenêtre', async () => {
  const admin = await H.createUser({ role: 'admin', phone: '+237690001030' });
  const p = await H.createUser({ role: 'player', phone: '+237690001031' });
  await session(p.id, { theme: 'culture', played_at: new Date().toISOString() }); // dans la fenêtre
  await session(p.id, {
    theme: 'culture',
    played_at: new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString(), // il y a 40 j
  });

  const from = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const r = await request(app)
    .get(`${P}/admin/analytics/reports/sessions`)
    .query({ group_by: 'theme', from })
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`);
  expect(r.body.rows.find((x) => x.key === 'culture').sessions).toBe(1); // l'ancienne exclue
});

t('reports/sessions : moderator autorisé (analytics:read)', async () => {
  const mod = await H.createUser({ role: 'moderator', phone: '+237690001040' });
  const r = await request(app)
    .get(`${P}/admin/analytics/reports/sessions`)
    .set('Authorization', `Bearer ${H.tokenFor(mod)}`);
  expect(r.status).toBe(200);
});

t('reports/sessions : player → 403', async () => {
  const player = await H.createUser({ role: 'player', phone: '+237690001041' });
  const r = await request(app)
    .get(`${P}/admin/analytics/reports/sessions`)
    .set('Authorization', `Bearer ${H.tokenFor(player)}`);
  expect(r.status).toBe(403);
});

t('reports/sessions : group_by invalide → 400', async () => {
  const admin = await H.createUser({ role: 'admin', phone: '+237690001050' });
  const r = await request(app)
    .get(`${P}/admin/analytics/reports/sessions`)
    .query({ group_by: 'user_id' })
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`);
  expect(r.status).toBe(400);
  expect(r.body.error.code).toBe('VALIDATION_ERROR');
});

// ── Revenue report ───────────────────────────────────────────────────────────

t('reports/revenue → 200, sommes success par type + types back-fillés', async () => {
  const admin = await H.createUser({ role: 'admin', phone: '+237690002001' });
  const p = await H.createUser({ role: 'player', phone: '+237690002002' });
  await tx(p.id, { type: 'entry_fee', amount: 1000, status: 'success' });
  await tx(p.id, { type: 'entry_fee', amount: 500, status: 'success' });
  await tx(p.id, { type: 'entry_fee', amount: 999, status: 'pending' }); // hors total_success
  await tx(p.id, { type: 'deposit', amount: 2000, status: 'success' });

  const r = await request(app)
    .get(`${P}/admin/analytics/reports/revenue`)
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`);

  expect(r.status).toBe(200);
  const entry = r.body.rows.find((x) => x.type === 'entry_fee');
  expect(entry).toMatchObject({ count: 3, success_count: 2, total_success: 1500, pending: 1 });
  const deposit = r.body.rows.find((x) => x.type === 'deposit');
  expect(deposit).toMatchObject({ count: 1, total_success: 2000 });
  // Types canoniques back-fillés (payout jamais utilisé ici).
  expect(r.body.rows.find((x) => x.type === 'payout')).toMatchObject({ count: 0, total_success: 0 });
  expect(r.body.totals).toMatchObject({ total_success: 3500 });
});

t('reports/revenue : moderator → 403 (transactions:read = admin)', async () => {
  const mod = await H.createUser({ role: 'moderator', phone: '+237690002010' });
  const r = await request(app)
    .get(`${P}/admin/analytics/reports/revenue`)
    .set('Authorization', `Bearer ${H.tokenFor(mod)}`);
  expect(r.status).toBe(403);
});
