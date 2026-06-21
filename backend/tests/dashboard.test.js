'use strict';

const H = require('./helpers/integration');
const request = require('supertest');
const app = require('../src/app');

/**
 * Tests d'intégration — GET /admin/dashboard (synthèse) et GET /tournaments
 * (liste). Postgres + Redis réels.
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

t('GET /admin/dashboard → 200, agrégat KPIs + activité + système', async () => {
  const admin = await H.createUser({ role: 'admin', phone: '+237690000010' });
  // Données : 2 joueurs, 1 question approuvée, 1 question en révision, 1 tournoi ouvert, 1 partie aujourd'hui
  const player = await H.createUser({ role: 'player', phone: '+237690000011' });
  await H.createUser({ role: 'player', phone: '+237690000012' });
  await H.createApprovedQuestion({ status: 'approved' });
  await H.createApprovedQuestion({ status: 'pending_review' });
  await H.db.query(
    `INSERT INTO tournaments (name, type, theme, max_players, status, created_by) VALUES ('Open Cup','free','sport',64,'open',$1)`,
    [admin.id]
  );
  await H.db.query(`INSERT INTO game_sessions (user_id, score, answers) VALUES ($1, 100, '[]'::jsonb)`, [player.id]);

  const r = await request(app).get(`${P}/admin/dashboard`).set('Authorization', `Bearer ${H.tokenFor(admin)}`);
  expect(r.status).toBe(200);

  // KPIs
  expect(r.body.kpis.total_users).toBe(3);
  expect(r.body.kpis.games_today).toBe(1);
  expect(r.body.kpis.active_questions).toBe(1);
  expect(r.body.kpis.open_tournaments).toBe(1);

  // Activité récente (5 max), questions à modérer, statut système
  expect(Array.isArray(r.body.recent_users)).toBe(true);
  expect(r.body.recent_users.length).toBe(3);
  expect(r.body.recent_users[0]).toHaveProperty('name');
  expect(r.body.recent_users[0]).toHaveProperty('ville');
  expect(r.body.pending_questions.length).toBe(1);
  expect(r.body.pending_questions[0].status).toBe('pending_review');
  expect(r.body.system).toMatchObject({ api: 'operational', db: 'operational', redis: 'operational' });
  expect(r.body.system.last_sync).toBeTruthy();
});

t('GET /admin/dashboard : moderator → 403 (admin minimum)', async () => {
  const mod = await H.createUser({ role: 'moderator', phone: '+237690000013' });
  const r = await request(app).get(`${P}/admin/dashboard`).set('Authorization', `Bearer ${H.tokenFor(mod)}`);
  expect(r.status).toBe(403);
  expect(r.body.error.code).toBe('FORBIDDEN');
});

t('GET /admin/dashboard : sans token → 401', async () => {
  const r = await request(app).get(`${P}/admin/dashboard`);
  expect(r.status).toBe(401);
});

t('GET /tournaments → 200, liste des tournois vivants (plus récent d’abord)', async () => {
  const user = await H.createUser({ role: 'player', phone: '+237690000014' });
  await H.db.query(`INSERT INTO tournaments (name, type, status) VALUES ('Ancien','free','closed')`);
  await H.db.query(`INSERT INTO tournaments (name, type, status) VALUES ('Récent','flash','open')`);

  const r = await request(app).get(`${P}/tournaments`).set('Authorization', `Bearer ${H.tokenFor(user)}`);
  expect(r.status).toBe(200);
  expect(r.body.data.length).toBe(2);
  expect(r.body.data[0].name).toBe('Récent'); // ORDER BY created_at DESC
  expect(r.body.data[0]).toMatchObject({ status: 'open', registered_players: 0, currency: 'XAF' });
});

t('GET /tournaments : soft-deleté exclu + filtre status', async () => {
  const user = await H.createUser({ role: 'player', phone: '+237690000015' });
  await H.db.query(`INSERT INTO tournaments (name, type, status) VALUES ('Vivant','free','open')`);
  await H.db.query(`INSERT INTO tournaments (name, type, status, deleted_at) VALUES ('Supprimé','free','open', now())`);

  const all = await request(app).get(`${P}/tournaments`).set('Authorization', `Bearer ${H.tokenFor(user)}`);
  expect(all.body.data.length).toBe(1); // le soft-deleté est exclu
  expect(all.body.data[0].name).toBe('Vivant');

  const filtered = await request(app).get(`${P}/tournaments`).query({ status: 'running' }).set('Authorization', `Bearer ${H.tokenFor(user)}`);
  expect(filtered.body.data.length).toBe(0);
});
