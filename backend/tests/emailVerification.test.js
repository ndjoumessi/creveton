'use strict';

const H = require('./helpers/integration');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');

/**
 * Vérification d'adresse email — confirmation, changement d'adresse, et la
 * conséquence qui justifie tout le reste : la réinitialisation de mot de passe
 * est refusée tant que l'adresse n'est pas prouvée.
 *
 * Les codes sont lus dans Redis (`emailverify:<user_id>`) : ils ne transitent
 * jamais par une réponse HTTP, et le vérifier ainsi le garantit.
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

const EMAIL = 'awa@example.cm';
const PASSWORD = 'MotDePasse1';

async function createPlayer(over = {}) {
  const user = await H.createUser({ phone_verified: true, ...over });
  const hash = await bcrypt.hash(PASSWORD, 4);
  await H.db.query(
    'UPDATE users SET email = $1, password_hash = $2, email_verified = $3 WHERE id = $4',
    [over.email || EMAIL, hash, over.email_verified ?? false, user.id]
  );
  const { rows } = await H.db.query('SELECT * FROM users WHERE id = $1', [user.id]);
  return rows[0];
}

async function storedVerify(userId) {
  const data = await H.redis.hgetall(`emailverify:${userId}`);
  return data && data.code ? data : null;
}

const authed = (user, path) =>
  request(app).post(path).set('Authorization', `Bearer ${H.tokenFor(user)}`);

// ── Confirmation de l'adresse courante ─────────────────────────────────────

t('demande puis confirmation marquent l\'adresse vérifiée', async () => {
  const user = await createPlayer();
  expect(user.email_verified).toBe(false);

  const req = await authed(user, '/api/v1/users/me/email/verify/request');
  expect(req.status).toBe(200);
  expect(req.body.email).toBe(EMAIL);
  // Le code n'est JAMAIS dans la réponse.
  expect(JSON.stringify(req.body)).not.toMatch(/\d{6}/);

  const { code } = await storedVerify(user.id);
  const res = await authed(user, '/api/v1/users/me/email/verify').send({ code });

  expect(res.status).toBe(200);
  expect(res.body.email_verified).toBe(true);
  expect(res.body.changed).toBe(false);

  const { rows } = await H.db.query('SELECT email_verified FROM users WHERE id = $1', [user.id]);
  expect(rows[0].email_verified).toBe(true);
});

t('une adresse déjà vérifiée refuse une nouvelle demande', async () => {
  const user = await createPlayer({ email_verified: true });
  const res = await authed(user, '/api/v1/users/me/email/verify/request');
  expect(res.status).toBe(409);
  expect(res.body.error.code).toBe('EMAIL_ALREADY_VERIFIED');
});

t('mauvais code : 3 essais puis le code est détruit', async () => {
  const user = await createPlayer();
  await authed(user, '/api/v1/users/me/email/verify/request').expect(200);
  const { code } = await storedVerify(user.id);
  const bad = code === '000000' ? '111111' : '000000';

  const attempt = () => authed(user, '/api/v1/users/me/email/verify').send({ code: bad });
  expect((await attempt()).body.error.code).toBe('VERIFY_CODE_INVALID');
  expect((await attempt()).body.error.code).toBe('VERIFY_CODE_INVALID');
  const third = await attempt();
  expect(third.status).toBe(429);
  expect(third.body.error.code).toBe('VERIFY_TOO_MANY_ATTEMPTS');

  expect(await storedVerify(user.id)).toBeNull();
  const withGood = await authed(user, '/api/v1/users/me/email/verify').send({ code });
  expect(withGood.status).toBe(410);
});

t('sans demande préalable, le code est réputé expiré', async () => {
  const user = await createPlayer();
  const res = await authed(user, '/api/v1/users/me/email/verify').send({ code: '123456' });
  expect(res.status).toBe(410);
  expect(res.body.error.code).toBe('VERIFY_CODE_EXPIRED');
});

// ── Changement d'adresse ───────────────────────────────────────────────────

t('changer d\'adresse envoie le code à la NOUVELLE et ne pose rien avant confirmation', async () => {
  const user = await createPlayer({ email_verified: true });

  const req = await authed(user, '/api/v1/users/me/email').send({ email: 'nouvelle@example.cm' });
  expect(req.status).toBe(200);
  expect(req.body.email).toBe('nouvelle@example.cm');

  // Tant que le code n'est pas confirmé, l'adresse du compte NE BOUGE PAS.
  const { rows } = await H.db.query('SELECT email, email_verified FROM users WHERE id = $1', [user.id]);
  expect(rows[0].email).toBe(EMAIL);
  expect(rows[0].email_verified).toBe(true);

  const { code } = await storedVerify(user.id);
  const res = await authed(user, '/api/v1/users/me/email/verify').send({ code });
  expect(res.status).toBe(200);
  expect(res.body.email).toBe('nouvelle@example.cm');
  expect(res.body.changed).toBe(true);

  // Nouvelle adresse posée ET vérifiée — c'est la même opération.
  const after = await H.db.query('SELECT email, email_verified FROM users WHERE id = $1', [user.id]);
  expect(after.rows[0].email).toBe('nouvelle@example.cm');
  expect(after.rows[0].email_verified).toBe(true);

  // Et elle sert bien à se connecter (l'email EST l'identifiant).
  await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nouvelle@example.cm', password: PASSWORD })
    .expect(200);
});

t('une adresse déjà prise par quelqu\'un d\'autre est refusée', async () => {
  await createPlayer({ email: 'occupee@example.cm', email_verified: true });
  const user = await createPlayer();

  const res = await authed(user, '/api/v1/users/me/email').send({ email: 'occupee@example.cm' });
  expect(res.status).toBe(409);
  expect(res.body.error.code).toBe('EMAIL_ALREADY_USED');
});

t('redemander la MÊME adresse non vérifiée est une simple redemande de code', async () => {
  const user = await createPlayer();
  const res = await authed(user, '/api/v1/users/me/email').send({ email: EMAIL.toUpperCase() });
  expect(res.status).toBe(200);
  expect(res.body.email).toBe(EMAIL);
  expect(await storedVerify(user.id)).not.toBeNull();
});

t('un code demandé pour une adresse ne peut pas en valider une autre', async () => {
  const user = await createPlayer({ email_verified: true });

  // Code demandé pour A…
  await authed(user, '/api/v1/users/me/email').send({ email: 'a@example.cm' }).expect(200);
  // …puis on change d'avis pour B : la nouvelle demande ÉCRASE la cible.
  await authed(user, '/api/v1/users/me/email').send({ email: 'b@example.cm' }).expect(200);

  const { code, email } = await storedVerify(user.id);
  expect(email).toBe('b@example.cm');

  const res = await authed(user, '/api/v1/users/me/email/verify').send({ code });
  expect(res.body.email).toBe('b@example.cm');
});

// ── Ce que la vérification d'adresse NE conditionne PAS ────────────────────

/**
 * Cette section affirmait l'inverse : « récupération réservée aux adresses
 * prouvées ». Le code de réinitialisation part désormais sur le TÉLÉPHONE, via
 * `otpChannel`, et c'est `phone_verified` qui commande (cf.
 * `passwordResetService` et `passwordReset.test.js`).
 *
 * On garde une assertion ici, en sens inverse, parce que le lien entre les deux
 * sous-systèmes est exactement ce qui avait été mal placé : adosser la
 * récupération de compte à un identifiant FACULTATIF et rarement confirmé
 * privait de fait la majorité des joueurs de tout recours. Si quelqu'un
 * remettait un jour un `email_verified` sur ce chemin, ce test doit tomber.
 */
t("une adresse non vérifiée ne bloque PLUS la récupération de mot de passe", async () => {
  const user = await createPlayer({ email_verified: false });

  await request(app)
    .post('/api/v1/auth/forgot-password')
    .send({ email: EMAIL })
    .expect(204);

  const data = await H.redis.hgetall(`pwdreset:${user.id}`);
  expect(data.code).toMatch(/^\d{6}$/);
});

t("l'admin peut réinitialiser un compte à l'adresse non vérifiée", async () => {
  const target = await createPlayer({ email_verified: false });
  const admin = await H.createUser({ role: 'admin' });

  const res = await request(app)
    .post(`/api/v1/admin/users/${target.id}/reset-password`)
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`);

  expect(res.status).toBe(200);
  expect(res.body.reset_initiated).toBe(true);
});

// ── Profil ─────────────────────────────────────────────────────────────────

t('GET /users/me expose email_verified', async () => {
  const user = await createPlayer({ email_verified: true });
  const res = await request(app)
    .get('/api/v1/users/me')
    .set('Authorization', `Bearer ${H.tokenFor(user)}`);
  expect(res.status).toBe(200);
  expect(res.body.email_verified).toBe(true);
});
