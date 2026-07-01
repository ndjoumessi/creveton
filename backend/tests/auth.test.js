'use strict';

const H = require('./helpers/integration');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');

/**
 * Tests d'intégration Auth (spec §4) — register, verify-otp, login, refresh,
 * logout — contre Postgres + Redis réels.
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

// Wrapper : ignore le test si l'infra n'est pas disponible (dev local).
const t = (name, fn) =>
  test(name, async () => {
    if (!ready) {
      console.warn(`[skip] ${name}`);
      return;
    }
    await fn();
  });

const REG = {
  name: 'Awa Mballa',
  email: 'awa@example.cm',
  phone: '+237690000000',
  password: 'MotDePasse1',
  ville: 'Yaoundé',
};
const base = '/api/v1/auth';

t('register → 201 + OTP envoyé', async () => {
  const r = await request(app).post(`${base}/register`).send(REG);
  expect(r.status).toBe(201);
  expect(r.body.otp_sent).toBe(true);
  expect(r.body.user_id).toBeDefined();
  expect(r.body.phone).toBe(REG.phone);
});

t('register : téléphone déjà utilisé → 409 PHONE_ALREADY_USED', async () => {
  await request(app).post(`${base}/register`).send(REG);
  const r = await request(app)
    .post(`${base}/register`)
    .send({ ...REG, email: 'autre@example.cm' });
  expect(r.status).toBe(409);
  expect(r.body.error.code).toBe('PHONE_ALREADY_USED');
});

t('verify-otp mauvais code → 400 OTP_INVALID', async () => {
  await request(app).post(`${base}/register`).send(REG);
  const r = await request(app).post(`${base}/verify-otp`).send({ phone: REG.phone, code: '000000' });
  expect(r.status).toBe(400);
  expect(r.body.error.code).toBe('OTP_INVALID');
});

t('flux complet : register → verify-otp → login → refresh → logout', async () => {
  await request(app).post(`${base}/register`).send(REG);

  // L'OTP est en Redis (SMS simulé en test).
  const code = await H.redis.hget(`otp:${REG.phone}`, 'code');
  expect(code).toMatch(/^\d{6}$/);

  const v = await request(app).post(`${base}/verify-otp`).send({ phone: REG.phone, code });
  expect(v.status).toBe(200);
  expect(v.body.access_token).toBeDefined();
  expect(v.body.refresh_token).toBeDefined();
  expect(v.body.token_type).toBe('Bearer');
  expect(v.body.expires_in).toBe(3600);
  expect(v.body.user.phone_verified).toBe(true);

  // login
  const lg = await request(app).post(`${base}/login`).send({ email: REG.email, password: REG.password });
  expect(lg.status).toBe(200);
  expect(lg.body.access_token).toBeDefined();

  // refresh → nouvel access token
  const rf = await request(app).post(`${base}/refresh`).send({ refresh_token: v.body.refresh_token });
  expect(rf.status).toBe(200);
  expect(rf.body.access_token).toBeDefined();
  expect(rf.body.expires_in).toBe(3600);

  // logout (révoque la session de l'access token)
  const lo = await request(app).post(`${base}/logout`).set('Authorization', `Bearer ${v.body.access_token}`);
  expect(lo.status).toBe(204);

  // refresh après logout → révoqué
  const rf2 = await request(app).post(`${base}/refresh`).send({ refresh_token: v.body.refresh_token });
  expect(rf2.status).toBe(401);
  expect(rf2.body.error.code).toBe('REFRESH_TOKEN_INVALID');
});

t('login mauvais mot de passe → 401 AUTH_INVALID_CREDENTIALS', async () => {
  await request(app).post(`${base}/register`).send(REG);
  const code = await H.redis.hget(`otp:${REG.phone}`, 'code');
  await request(app).post(`${base}/verify-otp`).send({ phone: REG.phone, code });
  const r = await request(app).post(`${base}/login`).send({ email: REG.email, password: 'Mauvais1' });
  expect(r.status).toBe(401);
  expect(r.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
});

t('login avant vérification OTP → 403 PHONE_NOT_VERIFIED', async () => {
  await request(app).post(`${base}/register`).send(REG);
  const r = await request(app).post(`${base}/login`).send({ email: REG.email, password: REG.password });
  expect(r.status).toBe(403);
  expect(r.body.error.code).toBe('PHONE_NOT_VERIFIED');
});

/**
 * POST /auth/change-password — l'utilisateur est authentifié (Bearer). `createUser`
 * ne pose pas de password_hash, on en injecte un connu directement en base.
 */
async function userWithPassword(password = 'KnownPass1') {
  const user = await H.createUser();
  await H.db.query('UPDATE users SET password_hash=$1 WHERE id=$2', [
    await bcrypt.hash(password, 12),
    user.id,
  ]);
  return user;
}

t('change-password valide → 200 { changed: true }', async () => {
  const user = await userWithPassword();
  const r = await request(app)
    .post(`${base}/change-password`)
    .set('Authorization', `Bearer ${H.tokenFor(user)}`)
    .send({ current_password: 'KnownPass1', new_password: 'NewPass2' });
  expect(r.status).toBe(200);
  expect(r.body.changed).toBe(true);
  // Le nouveau hash est bien persisté en base.
  const { rows } = await H.db.query('SELECT password_hash FROM users WHERE id = $1', [user.id]);
  expect(await bcrypt.compare('NewPass2', rows[0].password_hash)).toBe(true);
});

t('change-password mauvais actuel → 400 INVALID_CURRENT_PASSWORD', async () => {
  const user = await userWithPassword();
  const r = await request(app)
    .post(`${base}/change-password`)
    .set('Authorization', `Bearer ${H.tokenFor(user)}`)
    .send({ current_password: 'WrongPass1', new_password: 'NewPass2' });
  expect(r.status).toBe(400);
  expect(r.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
});

t('change-password nouveau trop faible → 400 VALIDATION_ERROR', async () => {
  const user = await userWithPassword();
  const r = await request(app)
    .post(`${base}/change-password`)
    .set('Authorization', `Bearer ${H.tokenFor(user)}`)
    .send({ current_password: 'KnownPass1', new_password: 'short' });
  expect(r.status).toBe(400);
  expect(r.body.error.code).toBe('VALIDATION_ERROR');
});

t('change-password nouveau = ancien → 400 VALIDATION_ERROR', async () => {
  const user = await userWithPassword();
  const r = await request(app)
    .post(`${base}/change-password`)
    .set('Authorization', `Bearer ${H.tokenFor(user)}`)
    .send({ current_password: 'KnownPass1', new_password: 'KnownPass1' });
  expect(r.status).toBe(400);
  expect(r.body.error.code).toBe('VALIDATION_ERROR');
});

t('change-password sans authentification → 401', async () => {
  const r = await request(app)
    .post(`${base}/change-password`)
    .send({ current_password: 'KnownPass1', new_password: 'NewPass2' });
  expect(r.status).toBe(401);
});
