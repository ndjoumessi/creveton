'use strict';

// Resend mocké : aucun appel réseau réel. Les deux fonctions renvoient un succès
// par défaut ; les tests d'échec surchargent ponctuellement le mock.
jest.mock('../src/services/emailService', () => ({
  sendTeamInvitation: jest.fn(async () => ({ sent: true, id: 'email_mock' })),
  sendPlayerReferral: jest.fn(async () => ({ sent: true, id: 'email_mock' })),
}));

const H = require('./helpers/integration');
const request = require('supertest');
const app = require('../src/app');
const emailService = require('../src/services/emailService');

/**
 * Intégration email/invitations (Resend mocké, Postgres + Redis réels) :
 *   - POST /admin/team/invite : ligne admin_invitations + email envoyé ;
 *   - GET /admin/team/invitations : liste paginée ;
 *   - POST /admin/team/invitations/:id/resend : renvoi, introuvable, déjà acceptée ;
 *   - POST /users/me/referral/invite : succès, limite quotidienne, échec email.
 */

let ready = false;
beforeAll(async () => { ready = await H.ensureReady(); });
afterAll(async () => { await H.teardown(); });
beforeEach(async () => {
  if (ready) {
    await H.resetState();
    jest.clearAllMocks();
    emailService.sendTeamInvitation.mockResolvedValue({ sent: true, id: 'email_mock' });
    emailService.sendPlayerReferral.mockResolvedValue({ sent: true, id: 'email_mock' });
  }
});

const t = (name, fn) =>
  test(name, async () => {
    if (!ready) { console.warn(`[skip] ${name}`); return; }
    await fn();
  });

const API = '/api/v1';
const bearer = (user) => ({ Authorization: `Bearer ${H.tokenFor(user)}` });
const tokenFromUrl = (url) => new URL(url).searchParams.get('token');

// ── Invitations équipe ─────────────────────────────────────────────────────

t('POST /admin/team/invite — écrit admin_invitations + envoie l’email', async () => {
  const superAdmin = await H.createUser({ role: 'super_admin' });
  const res = await request(app)
    .post(`${API}/admin/team/invite`)
    .set(bearer(superAdmin))
    .send({ email: 'mod1@creveton.cm', name: 'Mod Un', role: 'moderator', lang: 'fr' });

  expect(res.status).toBe(201);
  expect(res.body.email_sent).toBe(true);
  expect(res.body.invitation_id).toBeTruthy();
  expect(emailService.sendTeamInvitation).toHaveBeenCalledTimes(1);
  expect(emailService.sendTeamInvitation.mock.calls[0][0]).toMatchObject({
    to: 'mod1@creveton.cm', role: 'moderator', lang: 'fr',
  });

  const { rows } = await H.db.query('SELECT * FROM admin_invitations WHERE email = $1', ['mod1@creveton.cm']);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ role: 'moderator', status: 'pending', email_sent: true });
  expect(rows[0].invited_by).toBe(superAdmin.id);
});

t('POST /admin/team/invite — email_sent=false si Resend échoue (invitation conservée)', async () => {
  const superAdmin = await H.createUser({ role: 'super_admin' });
  emailService.sendTeamInvitation.mockResolvedValueOnce({ sent: false, error: 'smtp down' });

  const res = await request(app)
    .post(`${API}/admin/team/invite`)
    .set(bearer(superAdmin))
    .send({ email: 'mod2@creveton.cm', name: 'Mod Deux', role: 'admin' });

  expect(res.status).toBe(201);
  expect(res.body.email_sent).toBe(false);
  const { rows } = await H.db.query('SELECT email_sent, email_error FROM admin_invitations WHERE email = $1', ['mod2@creveton.cm']);
  expect(rows[0].email_sent).toBe(false);
  expect(rows[0].email_error).toBe('smtp down');
});

t('POST /admin/team/invite — email déjà invité/utilisé → 409', async () => {
  const superAdmin = await H.createUser({ role: 'super_admin' });
  const payload = { email: 'dup@creveton.cm', name: 'Dup User', role: 'admin' };
  expect((await request(app).post(`${API}/admin/team/invite`).set(bearer(superAdmin)).send(payload)).status).toBe(201);
  const second = await request(app).post(`${API}/admin/team/invite`).set(bearer(superAdmin)).send(payload);
  expect(second.status).toBe(409);
  expect(second.body.error.code).toBe('EMAIL_ALREADY_USED');
});

t('POST /admin/team/invite — rôle invalide → 400', async () => {
  const superAdmin = await H.createUser({ role: 'super_admin' });
  const res = await request(app)
    .post(`${API}/admin/team/invite`)
    .set(bearer(superAdmin))
    .send({ email: 'x@creveton.cm', name: 'X Y', role: 'super_admin' });
  expect(res.status).toBe(400);
  expect(emailService.sendTeamInvitation).not.toHaveBeenCalled();
});

t('GET /admin/team/invitations — liste les invitations en attente', async () => {
  const superAdmin = await H.createUser({ role: 'super_admin' });
  await request(app).post(`${API}/admin/team/invite`).set(bearer(superAdmin))
    .send({ email: 'a@creveton.cm', name: 'A B', role: 'moderator' });

  const res = await request(app).get(`${API}/admin/team/invitations?status=pending`).set(bearer(superAdmin));
  expect(res.status).toBe(200);
  expect(res.body.data).toHaveLength(1);
  expect(res.body.data[0]).toMatchObject({ email: 'a@creveton.cm', role: 'moderator', status: 'pending' });
  expect(res.body.page).toMatchObject({ page: 1, total: 1 });
});

t('POST /admin/team/invitations/:id/resend — renvoie l’email (pending)', async () => {
  const superAdmin = await H.createUser({ role: 'super_admin' });
  const inv = await request(app).post(`${API}/admin/team/invite`).set(bearer(superAdmin))
    .send({ email: 'r@creveton.cm', name: 'R S', role: 'admin' });
  emailService.sendTeamInvitation.mockClear();

  const res = await request(app)
    .post(`${API}/admin/team/invitations/${inv.body.invitation_id}/resend`)
    .set(bearer(superAdmin))
    .send({ lang: 'en' });

  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ resent: true, email_sent: true });
  expect(emailService.sendTeamInvitation).toHaveBeenCalledTimes(1);
  expect(emailService.sendTeamInvitation.mock.calls[0][0]).toMatchObject({ to: 'r@creveton.cm', lang: 'en' });
});

t('POST /admin/team/invitations/:id/resend — introuvable → 404', async () => {
  const superAdmin = await H.createUser({ role: 'super_admin' });
  const res = await request(app)
    .post(`${API}/admin/team/invitations/00000000-0000-0000-0000-000000000000/resend`)
    .set(bearer(superAdmin))
    .send({});
  expect(res.status).toBe(404);
  expect(res.body.error.code).toBe('INVITATION_NOT_FOUND');
});

t('POST /admin/team/invitations/:id/resend — déjà acceptée → 409', async () => {
  const superAdmin = await H.createUser({ role: 'super_admin' });
  const inv = await request(app).post(`${API}/admin/team/invite`).set(bearer(superAdmin))
    .send({ email: 'acc@creveton.cm', name: 'Acc Ept', role: 'moderator' });
  const token = tokenFromUrl(inv.body.invite_url);
  await request(app).post(`${API}/admin/team/accept-invite`).send({ token, password: 'NewPass123' });

  const res = await request(app)
    .post(`${API}/admin/team/invitations/${inv.body.invitation_id}/resend`)
    .set(bearer(superAdmin))
    .send({});
  expect(res.status).toBe(409);
  expect(res.body.error.code).toBe('INVITATION_NOT_PENDING');
});

t('POST /admin/team/accept-invite — marque l’invitation acceptée (audit)', async () => {
  const superAdmin = await H.createUser({ role: 'super_admin' });
  const inv = await request(app).post(`${API}/admin/team/invite`).set(bearer(superAdmin))
    .send({ email: 'mark@creveton.cm', name: 'Mark Ed', role: 'moderator' });
  const token = tokenFromUrl(inv.body.invite_url);
  await request(app).post(`${API}/admin/team/accept-invite`).send({ token, password: 'NewPass123' });

  const { rows } = await H.db.query('SELECT status, accepted_at FROM admin_invitations WHERE email = $1', ['mark@creveton.cm']);
  expect(rows[0].status).toBe('accepted');
  expect(rows[0].accepted_at).not.toBeNull();
});

// ── Parrainage joueur ──────────────────────────────────────────────────────

t('POST /users/me/referral/invite — envoie un email de parrainage', async () => {
  const player = await H.createUser({ role: 'player' });
  const res = await request(app)
    .post(`${API}/users/me/referral/invite`)
    .set(bearer(player))
    .send({ email: 'friend@example.com', lang: 'fr' });

  expect(res.status).toBe(200);
  expect(res.body).toEqual({ sent: true });
  expect(emailService.sendPlayerReferral).toHaveBeenCalledTimes(1);
  expect(emailService.sendPlayerReferral.mock.calls[0][0]).toMatchObject({
    to: 'friend@example.com', referralCode: player.referral_code,
  });
});

t('POST /users/me/referral/invite — limite quotidienne (10) → 429', async () => {
  const player = await H.createUser({ role: 'player' });
  for (let i = 0; i < 10; i += 1) {
    const okRes = await request(app).post(`${API}/users/me/referral/invite`).set(bearer(player)).send({ email: `f${i}@example.com` });
    expect(okRes.status).toBe(200);
  }
  const res = await request(app).post(`${API}/users/me/referral/invite`).set(bearer(player)).send({ email: 'f10@example.com' });
  expect(res.status).toBe(429);
  expect(res.body.error.code).toBe('RATE_LIMITED');
});

t('POST /users/me/referral/invite — échec email → 503', async () => {
  const player = await H.createUser({ role: 'player' });
  emailService.sendPlayerReferral.mockResolvedValueOnce({ sent: false, error: 'boom' });
  const res = await request(app).post(`${API}/users/me/referral/invite`).set(bearer(player)).send({ email: 'fail@example.com' });
  expect(res.status).toBe(503);
  expect(res.body.error.code).toBe('EMAIL_SEND_FAILED');
});
