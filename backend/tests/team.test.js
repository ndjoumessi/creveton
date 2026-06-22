'use strict';

const H = require('./helpers/integration');
const request = require('supertest');
const app = require('../src/app');

/**
 * Tests d'intégration « Équipe » (console §Équipe) — Postgres + Redis réels.
 * Liste des membres, invitation par lien (token Redis), acceptation, gestion des
 * rôles avec garde-fous (pas soi-même, pas un super_admin), désactivation, RBAC.
 */

let ready = false;
beforeAll(async () => { ready = await H.ensureReady(); });
afterAll(async () => { await H.teardown(); });
beforeEach(async () => { if (ready) await H.resetState(); });

const t = (name, fn) =>
  test(name, async () => {
    if (!ready) { console.warn(`[skip] ${name}`); return; }
    await fn();
  });

const API = '/api/v1';
const bearer = (user) => ({ Authorization: `Bearer ${H.tokenFor(user)}` });
const tokenFromUrl = (url) => new URL(url).searchParams.get('token');

t('GET /admin/team — liste les membres d’équipe (pas les players)', async () => {
  const superAdmin = await H.createUser({ role: 'super_admin' });
  await H.createUser({ role: 'admin' });
  await H.createUser({ role: 'moderator' });
  await H.createUser({ role: 'player' });

  const res = await request(app).get(`${API}/admin/team`).set(bearer(superAdmin));
  expect(res.status).toBe(200);
  const roles = res.body.data.map((m) => m.role).sort();
  expect(roles).toEqual(['admin', 'moderator', 'super_admin']);
  expect(res.body.data.some((m) => m.role === 'player')).toBe(false);
});

t('POST /admin/team/invite — crée le compte (sans mot de passe) + token Redis', async () => {
  const superAdmin = await H.createUser({ role: 'super_admin' });
  const res = await request(app)
    .post(`${API}/admin/team/invite`)
    .set(bearer(superAdmin))
    .send({ email: 'newadmin@creveton.cm', name: 'Nouvel Admin', role: 'admin' });
  expect(res.status).toBe(201);
  expect(res.body.invite_url).toContain('/accept-invite?token=');
  expect(res.body.user).toMatchObject({ email: 'newadmin@creveton.cm', role: 'admin' });

  // Compte créé sans mot de passe (inactif) ...
  const { rows } = await H.db.query('SELECT password_hash FROM users WHERE email = $1', ['newadmin@creveton.cm']);
  expect(rows[0].password_hash).toBeNull();
  // ... et token présent en Redis.
  const token = tokenFromUrl(res.body.invite_url);
  expect(await H.redis.get(`invite:${token}`)).toBeTruthy();
});

t('POST /admin/team/accept-invite — active le compte (mot de passe posé, token consommé)', async () => {
  const superAdmin = await H.createUser({ role: 'super_admin' });
  const inv = await request(app)
    .post(`${API}/admin/team/invite`)
    .set(bearer(superAdmin))
    .send({ email: 'pending@creveton.cm', name: 'En Attente', role: 'moderator' });
  const token = tokenFromUrl(inv.body.invite_url);

  const res = await request(app)
    .post(`${API}/admin/team/accept-invite`) // public : pas d'Authorization
    .send({ token, password: 'NewPass123' });
  expect(res.status).toBe(200);
  expect(res.body.message).toBeDefined();

  const { rows } = await H.db.query('SELECT password_hash FROM users WHERE email = $1', ['pending@creveton.cm']);
  expect(rows[0].password_hash).toBeTruthy();
  // Token consommé.
  expect(await H.redis.get(`invite:${token}`)).toBeNull();
});

t('POST /admin/team/accept-invite — token invalide/expiré → 410', async () => {
  const res = await request(app)
    .post(`${API}/admin/team/accept-invite`)
    .send({ token: '00000000-0000-0000-0000-000000000000', password: 'NewPass123' });
  expect(res.status).toBe(410);
  expect(res.body.error.code).toBe('INVITE_EXPIRED');
});

t('PATCH /admin/team/:id/role — modifie le rôle', async () => {
  const superAdmin = await H.createUser({ role: 'super_admin' });
  const member = await H.createUser({ role: 'moderator' });
  const res = await request(app)
    .patch(`${API}/admin/team/${member.id}/role`)
    .set(bearer(superAdmin))
    .send({ role: 'admin' });
  expect(res.status).toBe(200);
  expect(res.body.role).toBe('admin');
  const { rows } = await H.db.query('SELECT role FROM users WHERE id = $1', [member.id]);
  expect(rows[0].role).toBe('admin');
});

t('PATCH /admin/team/:id/role — impossible sur un super_admin → 403', async () => {
  const superAdmin = await H.createUser({ role: 'super_admin' });
  const otherSuper = await H.createUser({ role: 'super_admin' });
  const res = await request(app)
    .patch(`${API}/admin/team/${otherSuper.id}/role`)
    .set(bearer(superAdmin))
    .send({ role: 'admin' });
  expect(res.status).toBe(403);
});

t('PATCH /admin/team/:id/role — impossible sur soi-même → 403', async () => {
  const superAdmin = await H.createUser({ role: 'super_admin' });
  const res = await request(app)
    .patch(`${API}/admin/team/${superAdmin.id}/role`)
    .set(bearer(superAdmin))
    .send({ role: 'admin' });
  expect(res.status).toBe(403);
});

t('DELETE /admin/team/:id — désactive le membre (soft delete)', async () => {
  const superAdmin = await H.createUser({ role: 'super_admin' });
  const member = await H.createUser({ role: 'admin' });
  const res = await request(app).delete(`${API}/admin/team/${member.id}`).set(bearer(superAdmin));
  expect(res.status).toBe(204);
  const { rows } = await H.db.query('SELECT deleted_at FROM users WHERE id = $1', [member.id]);
  expect(rows[0].deleted_at).not.toBeNull();
});

t('RBAC — un admin (non super_admin) → 403 sur invite/role/delete', async () => {
  const admin = await H.createUser({ role: 'admin' });
  const member = await H.createUser({ role: 'moderator' });

  const inv = await request(app)
    .post(`${API}/admin/team/invite`)
    .set(bearer(admin))
    .send({ email: 'x@creveton.cm', name: 'X Y', role: 'moderator' });
  expect(inv.status).toBe(403);

  const role = await request(app)
    .patch(`${API}/admin/team/${member.id}/role`)
    .set(bearer(admin))
    .send({ role: 'admin' });
  expect(role.status).toBe(403);

  const del = await request(app).delete(`${API}/admin/team/${member.id}`).set(bearer(admin));
  expect(del.status).toBe(403);
});
