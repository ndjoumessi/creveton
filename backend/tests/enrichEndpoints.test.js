'use strict';

const H = require('./helpers/integration');
const request = require('supertest');
const app = require('../src/app');

/**
 * Tests d'intégration des endpoints d'enrichissement console :
 * /admin/users/:id/message, analytics (série journalière), dashboard
 * (online_now + success_rate), /health. Postgres + Redis réels.
 * (Les tests /auth/change-password vivent dans auth.test.js.)
 */

let ready = false;
beforeAll(async () => { ready = await H.ensureReady(); });
afterAll(async () => { await H.teardown(); });
beforeEach(async () => { if (ready) await H.resetState(); });

const t = (name, fn) =>
  test(name, async () => { if (!ready) { console.warn(`[skip] ${name}`); return; } await fn(); });

const P = '/api/v1';

t('POST /admin/users/:id/message : accuse réception (admin)', async () => {
  const admin = await H.createUser({ role: 'admin', phone: '+237690000060' });
  const target = await H.createUser({ role: 'player', phone: '+237690000061' });
  await H.db.query('UPDATE users SET email = $2 WHERE id = $1', [target.id, 'cible@creveton.cm']);
  const r = await request(app).post(`${P}/admin/users/${target.id}/message`)
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`)
    .send({ subject: 'Bonjour', body: 'Merci de jouer à Creveton !' });
  expect(r.status).toBe(200);
  expect(r.body).toMatchObject({ sent: true, to: 'cible@creveton.cm' });
});

t('POST /admin/users/:id/message : corps vide → 400', async () => {
  const admin = await H.createUser({ role: 'admin', phone: '+237690000062' });
  const target = await H.createUser({ role: 'player', phone: '+237690000063' });
  const r = await request(app).post(`${P}/admin/users/${target.id}/message`)
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`).send({ body: '' });
  expect(r.status).toBe(400);
});

t('GET /admin/analytics?period=7d : série journalière de 7 points', async () => {
  const mod = await H.createUser({ role: 'moderator', phone: '+237690000064' });
  const r = await request(app).get(`${P}/admin/analytics?period=7d`).set('Authorization', `Bearer ${H.tokenFor(mod)}`);
  expect(r.status).toBe(200);
  expect(Array.isArray(r.body.daily)).toBe(true);
  expect(r.body.daily).toHaveLength(7);
  expect(r.body.daily[0]).toHaveProperty('signups');
  expect(r.body.daily[0]).toHaveProperty('games');
});

t('GET /admin/dashboard : expose online_now et success_rate', async () => {
  const admin = await H.createUser({ role: 'admin', phone: '+237690000065' });
  const r = await request(app).get(`${P}/admin/dashboard`).set('Authorization', `Bearer ${H.tokenFor(admin)}`);
  expect(r.status).toBe(200);
  expect(typeof r.body.kpis.online_now).toBe('number');
  expect(typeof r.body.kpis.success_rate).toBe('number');
});

t('GET /health : expose system.uptime_s, node, postgres', async () => {
  const r = await request(app).get('/health');
  expect(r.body.system).toBeDefined();
  expect(typeof r.body.system.uptime_s).toBe('number');
  expect(r.body.system.node).toMatch(/^v\d/);
});
