'use strict';

const H = require('./helpers/integration');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const authService = require('../src/services/authService');

/**
 * Tests d'intégration « mot de passe oublié » (POST /auth/forgot-password puis
 * /auth/reset-password) contre Postgres + Redis réels.
 *
 * Le code n'est jamais renvoyé par l'API : les tests le lisent dans Redis, à la
 * clé `pwdreset:<user_id>` — c'est aussi la garantie qu'il n'a pas fuité dans
 * une réponse HTTP. En test, emailService est hermétique (aucun appel réseau).
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
const OLD_PASSWORD = 'AncienMotDePasse1';
const NEW_PASSWORD = 'NouveauMotDePasse1';

/**
 * Crée un joueur connectable : email + hash + TÉLÉPHONE VÉRIFIÉ.
 *
 * C'est `phone_verified` qui commande la récupération : le code part sur le
 * numéro (WhatsApp, repli SMS), pas sur l'adresse. `email_verified` est laissé à
 * vrai par habitude mais n'a plus d'effet ici — `emailVerification.test.js`
 * garde une assertion en sens inverse pour le prouver.
 */
async function createPlayer(over = {}) {
  const user = await H.createUser({ phone_verified: true, ...over });
  const hash = await bcrypt.hash(over.password || OLD_PASSWORD, 4);
  await H.db.query(
    'UPDATE users SET email = $1, password_hash = $2, email_verified = true WHERE id = $3',
    [over.email || EMAIL, hash, user.id]
  );
  const { rows } = await H.db.query('SELECT * FROM users WHERE id = $1', [user.id]);
  return rows[0];
}

/** Lit le code stocké en Redis pour ce compte (jamais exposé par l'API). */
async function storedCode(userId) {
  const data = await H.redis.hgetall(`pwdreset:${userId}`);
  return data && data.code ? data.code : null;
}

// ── Demande ────────────────────────────────────────────────────────────────

t('forgot-password renvoie 204 et stocke un code à 6 chiffres', async () => {
  const user = await createPlayer();

  const res = await request(app).post('/api/v1/auth/forgot-password').send({ email: EMAIL });
  expect(res.status).toBe(204);
  expect(res.body).toEqual({});

  const code = await storedCode(user.id);
  expect(code).toMatch(/^\d{6}$/);
});

t('forgot-password renvoie 204 pour un email INCONNU (anti-énumération)', async () => {
  const res = await request(app)
    .post('/api/v1/auth/forgot-password')
    .send({ email: 'personne@example.cm' });
  expect(res.status).toBe(204);
});

t("forgot-password n'envoie rien à un compte sans mot de passe (invité admin)", async () => {
  // Compte créé par invitation, jamais accepté : pas de password_hash.
  const user = await H.createUser();
  await H.db.query('UPDATE users SET email = $1 WHERE id = $2', ['invite@example.cm', user.id]);

  const res = await request(app)
    .post('/api/v1/auth/forgot-password')
    .send({ email: 'invite@example.cm' });

  // Réponse identique au cas nominal…
  expect(res.status).toBe(204);
  // …mais aucun code émis.
  expect(await storedCode(user.id)).toBeNull();
});

t('forgot-password est insensible à la casse de l\'email', async () => {
  const user = await createPlayer();
  await request(app)
    .post('/api/v1/auth/forgot-password')
    .send({ email: EMAIL.toUpperCase() })
    .expect(204);
  expect(await storedCode(user.id)).toMatch(/^\d{6}$/);
});

// ── Validation ─────────────────────────────────────────────────────────────

t('reset-password change le mot de passe et renvoie des tokens', async () => {
  const user = await createPlayer();
  await request(app).post('/api/v1/auth/forgot-password').send({ email: EMAIL }).expect(204);
  const code = await storedCode(user.id);

  const res = await request(app)
    .post('/api/v1/auth/reset-password')
    .send({ email: EMAIL, code, new_password: NEW_PASSWORD });

  expect(res.status).toBe(200);
  expect(res.body.access_token).toBeTruthy();
  expect(res.body.refresh_token).toBeTruthy();
  expect(res.body.user.id).toBe(user.id);

  // Le nouveau mot de passe fonctionne, l'ancien non.
  await request(app)
    .post('/api/v1/auth/login')
    .send({ email: EMAIL, password: NEW_PASSWORD })
    .expect(200);
  await request(app)
    .post('/api/v1/auth/login')
    .send({ email: EMAIL, password: OLD_PASSWORD })
    .expect(401);
});

t('le code est à USAGE UNIQUE', async () => {
  const user = await createPlayer();
  await request(app).post('/api/v1/auth/forgot-password').send({ email: EMAIL }).expect(204);
  const code = await storedCode(user.id);

  await request(app)
    .post('/api/v1/auth/reset-password')
    .send({ email: EMAIL, code, new_password: NEW_PASSWORD })
    .expect(200);

  const again = await request(app)
    .post('/api/v1/auth/reset-password')
    .send({ email: EMAIL, code, new_password: 'EncoreUnAutre1' });
  expect(again.status).toBe(410);
  expect(again.body.error.code).toBe('RESET_CODE_EXPIRED');
});

t('un mauvais code renvoie RESET_CODE_INVALID sans toucher au mot de passe', async () => {
  const user = await createPlayer();
  await request(app).post('/api/v1/auth/forgot-password').send({ email: EMAIL }).expect(204);
  const good = await storedCode(user.id);
  const bad = good === '000000' ? '111111' : '000000';

  const res = await request(app)
    .post('/api/v1/auth/reset-password')
    .send({ email: EMAIL, code: bad, new_password: NEW_PASSWORD });
  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe('RESET_CODE_INVALID');

  await request(app)
    .post('/api/v1/auth/login')
    .send({ email: EMAIL, password: OLD_PASSWORD })
    .expect(200);
});

t('au 3e échec le code est DÉTRUIT (429 puis plus rien à tenter)', async () => {
  const user = await createPlayer();
  await request(app).post('/api/v1/auth/forgot-password').send({ email: EMAIL }).expect(204);
  const good = await storedCode(user.id);
  const bad = good === '000000' ? '111111' : '000000';

  const attempt = () =>
    request(app)
      .post('/api/v1/auth/reset-password')
      .send({ email: EMAIL, code: bad, new_password: NEW_PASSWORD });

  expect((await attempt()).body.error.code).toBe('RESET_CODE_INVALID');
  expect((await attempt()).body.error.code).toBe('RESET_CODE_INVALID');
  const third = await attempt();
  expect(third.status).toBe(429);
  expect(third.body.error.code).toBe('RESET_TOO_MANY_ATTEMPTS');

  // Le bon code ne vaut plus rien : il faut en redemander un.
  expect(await storedCode(user.id)).toBeNull();
  const withGood = await request(app)
    .post('/api/v1/auth/reset-password')
    .send({ email: EMAIL, code: good, new_password: NEW_PASSWORD });
  expect(withGood.status).toBe(410);
});

t('un email inconnu à la validation renvoie RESET_CODE_INVALID (pas USER_NOT_FOUND)', async () => {
  const res = await request(app)
    .post('/api/v1/auth/reset-password')
    .send({ email: 'personne@example.cm', code: '123456', new_password: NEW_PASSWORD });
  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe('RESET_CODE_INVALID');
});

t('sans demande préalable, le code est réputé expiré', async () => {
  await createPlayer();
  const res = await request(app)
    .post('/api/v1/auth/reset-password')
    .send({ email: EMAIL, code: '123456', new_password: NEW_PASSWORD });
  expect(res.status).toBe(410);
  expect(res.body.error.code).toBe('RESET_CODE_EXPIRED');
});

t('le nouveau mot de passe doit différer de l\'ancien', async () => {
  const user = await createPlayer();
  await request(app).post('/api/v1/auth/forgot-password').send({ email: EMAIL }).expect(204);
  const code = await storedCode(user.id);

  const res = await request(app)
    .post('/api/v1/auth/reset-password')
    .send({ email: EMAIL, code, new_password: OLD_PASSWORD });
  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe('VALIDATION_ERROR');
});

t('un mot de passe faible est refusé (même règle qu\'à l\'inscription)', async () => {
  const user = await createPlayer();
  await request(app).post('/api/v1/auth/forgot-password').send({ email: EMAIL }).expect(204);
  const code = await storedCode(user.id);

  const res = await request(app)
    .post('/api/v1/auth/reset-password')
    .send({ email: EMAIL, code, new_password: 'motdepasse' }); // ni majuscule ni chiffre
  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe('VALIDATION_ERROR');
});

// ── Sessions ───────────────────────────────────────────────────────────────

t('TOUTES les sessions tombent, y compris celle de l\'appareil courant', async () => {
  const user = await createPlayer();

  // Deux sessions ouvertes avant la réinitialisation.
  const s1 = await authService.issueTokens(user);
  const s2 = await authService.issueTokens(user);
  await request(app)
    .post('/api/v1/auth/refresh')
    .send({ refresh_token: s1.refresh_token })
    .expect(200);

  await request(app).post('/api/v1/auth/forgot-password').send({ email: EMAIL }).expect(204);
  const code = await storedCode(user.id);
  const res = await request(app)
    .post('/api/v1/auth/reset-password')
    .send({ email: EMAIL, code, new_password: NEW_PASSWORD })
    .expect(200);

  for (const old of [s1, s2]) {
    const r = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: old.refresh_token });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('REFRESH_TOKEN_INVALID');
  }

  // La session fraîchement émise, elle, fonctionne.
  await request(app)
    .post('/api/v1/auth/refresh')
    .send({ refresh_token: res.body.refresh_token })
    .expect(200);
});

// ── Rate limit ─────────────────────────────────────────────────────────────

t('les demandes répétées sont plafonnées, sans révéler quoi que ce soit', async () => {
  await createPlayer();
  // Limite par email : 5/h. La 6e est refusée par le middleware (429), mais le
  // corps ne dit rien du compte — c'est un refus de débit, pas une réponse métier.
  for (let i = 0; i < 5; i += 1) {
    await request(app).post('/api/v1/auth/forgot-password').send({ email: EMAIL }).expect(204);
  }
  const res = await request(app).post('/api/v1/auth/forgot-password').send({ email: EMAIL });
  expect(res.status).toBe(429);
});

// ── Déclenchement admin ────────────────────────────────────────────────────

t('admin reset-password émet un vrai code pour l\'utilisateur', async () => {
  const target = await createPlayer();
  const admin = await H.createUser({ role: 'admin' });

  const res = await request(app)
    .post(`/api/v1/admin/users/${target.id}/reset-password`)
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`);

  expect(res.status).toBe(200);
  expect(res.body.reset_initiated).toBe(true);
  // `simulated` et non un vrai canal : ni WhatsApp ni Twilio ne sont configurés
  // en test, et `otpChannel` journalise alors le code au lieu de l'envoyer.
  // L'assertion vaut pour le CHAÎNAGE (le service passe bien par otpChannel et
  // rapporte ce qu'il en revient), pas pour la délivrance.
  expect(res.body.channel).toBe('simulated');

  // Le code émis est utilisable par l'utilisateur — c'est tout l'objet du
  // correctif : la route envoyait auparavant un OTP que rien ne consommait.
  const code = await storedCode(target.id);
  expect(code).toMatch(/^\d{6}$/);
  await request(app)
    .post('/api/v1/auth/reset-password')
    .send({ email: EMAIL, code, new_password: NEW_PASSWORD })
    .expect(200);
});

t('admin reset-password refuse un numéro non vérifié, avec un motif clair', async () => {
  const target = await createPlayer({ phone_verified: false });
  const admin = await H.createUser({ role: 'admin' });

  const res = await request(app)
    .post(`/api/v1/admin/users/${target.id}/reset-password`)
    // En-tête EXPLICITE : le message existe en deux langues depuis l'i18n des
    // erreurs serveur. Sans lui, l'assertion tiendrait par le seul hasard du
    // défaut français.
    .set('Accept-Language', 'fr')
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`);

  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe('VALIDATION_ERROR');
  // L'opérateur doit comprendre POURQUOI, pas croire à une panne.
  expect(res.body.error.message).toMatch(/vérifié/i);
});

// ── Le verrou : c'est le TÉLÉPHONE qui commande ────────────────────────────

t("forgot-password n'émet AUCUN code si le numéro n'est pas vérifié", async () => {
  const user = await createPlayer({ phone_verified: false });

  // Réponse identique au cas nominal (anti-énumération)…
  await request(app)
    .post('/api/v1/auth/forgot-password')
    .send({ email: EMAIL })
    .expect(204);

  // …mais rien n'a été émis.
  const data = await H.redis.hgetall(`pwdreset:${user.id}`);
  expect(data.code).toBeUndefined();
});

t("reset-password refuse un code si le numéro a cessé d'être vérifié", async () => {
  // Cas tordu mais réel : code émis sur un numéro prouvé, puis vérification
  // retirée (changement de numéro) avant la validation.
  const user = await createPlayer();
  await request(app).post('/api/v1/auth/forgot-password').send({ email: EMAIL }).expect(204);
  const { rows } = await H.db.query(
    'UPDATE users SET phone_verified = false WHERE id = $1 RETURNING id',
    [user.id]
  );
  expect(rows).toHaveLength(1);

  const code = await storedCode(user.id);
  const res = await request(app)
    .post('/api/v1/auth/reset-password')
    .send({ email: EMAIL, code, new_password: 'ToutAutreChose1' });
  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe('RESET_CODE_INVALID');
});
