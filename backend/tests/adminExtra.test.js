'use strict';

const H = require('./helpers/integration');
const request = require('supertest');
const app = require('../src/app');

/**
 * Tests d'intégration des nouveaux endpoints admin :
 * sessions, sessions/:id, users/:id/role, users/invite, leaderboard.
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

const P = '/api/v1/admin';

t('GET /admin/sessions → 200, parties + infos joueur (admin)', async () => {
  const admin = await H.createUser({ role: 'admin', phone: '+237690000020' });
  const player = await H.createUser({ role: 'player', phone: '+237690000021', ville: 'Douala' });
  const q = await H.createApprovedQuestion();
  await H.db.query(
    `INSERT INTO game_sessions (user_id, theme, level, score, correct_count, question_count, xp_earned, answers)
     VALUES ($1,'sport','beginner',150,3,5,300,$2::jsonb)`,
    [player.id, JSON.stringify([{ question_id: q.id, selected_index: 1, is_correct: true, elapsed_ms: 2200 }])]
  );

  const r = await request(app).get(`${P}/sessions`).set('Authorization', `Bearer ${H.tokenFor(admin)}`);
  expect(r.status).toBe(200);
  expect(r.body.data).toHaveLength(1);
  expect(r.body.data[0]).toMatchObject({ score: 150, theme: 'sport', user: { name: player.name, ville: 'Douala' } });
  expect(r.body.page).toHaveProperty('has_more');
});

t('GET /admin/sessions : moderator → 403 (admin minimum)', async () => {
  const mod = await H.createUser({ role: 'moderator', phone: '+237690000022' });
  const r = await request(app).get(`${P}/sessions`).set('Authorization', `Bearer ${H.tokenFor(mod)}`);
  expect(r.status).toBe(403);
});

t('GET /admin/sessions/:id → détail + récap question par question', async () => {
  const admin = await H.createUser({ role: 'admin', phone: '+237690000023' });
  const player = await H.createUser({ role: 'player', phone: '+237690000024' });
  const q = await H.createApprovedQuestion({ text_fr: 'Capitale du Cameroun ?', correct_index: 1 });
  const ins = await H.db.query(
    `INSERT INTO game_sessions (user_id, theme, level, score, correct_count, question_count, xp_earned, answers)
     VALUES ($1,'geographie','beginner',75,1,1,150,$2::jsonb) RETURNING id`,
    [player.id, JSON.stringify([{ question_id: q.id, selected_index: 1, is_correct: true, elapsed_ms: 1800 }])]
  );
  const id = ins.rows[0].id;

  const r = await request(app).get(`${P}/sessions/${id}`).set('Authorization', `Bearer ${H.tokenFor(admin)}`);
  expect(r.status).toBe(200);
  expect(r.body.user.name).toBe(player.name);
  expect(r.body.answers).toHaveLength(1);
  expect(r.body.answers[0]).toMatchObject({
    question_text: 'Capitale du Cameroun ?',
    correct_index: 1,
    your_index: 1,
    is_correct: true,
    elapsed_ms: 1800,
  });
});

t('PATCH /admin/users/:id/role : super_admin change le rôle ; admin → 403', async () => {
  const superAdmin = await H.createUser({ role: 'super_admin', phone: '+237690000025' });
  const admin = await H.createUser({ role: 'admin', phone: '+237690000026' });
  const target = await H.createUser({ role: 'player', phone: '+237690000027' });

  // admin n'a pas le droit (super_admin requis)
  const forbidden = await request(app).patch(`${P}/users/${target.id}/role`).set('Authorization', `Bearer ${H.tokenFor(admin)}`).send({ role: 'moderator' });
  expect(forbidden.status).toBe(403);

  // super_admin OK
  const okRes = await request(app).patch(`${P}/users/${target.id}/role`).set('Authorization', `Bearer ${H.tokenFor(superAdmin)}`).send({ role: 'moderator' });
  expect(okRes.status).toBe(200);
  expect(okRes.body.role).toBe('moderator');
  const { rows } = await H.db.query('SELECT role FROM users WHERE id = $1', [target.id]);
  expect(rows[0].role).toBe('moderator');
});

t('PATCH /admin/users/:id/role : super_admin interdit dans le body', async () => {
  const superAdmin = await H.createUser({ role: 'super_admin', phone: '+237690000028' });
  const target = await H.createUser({ role: 'player', phone: '+237690000029' });
  const r = await request(app).patch(`${P}/users/${target.id}/role`).set('Authorization', `Bearer ${H.tokenFor(superAdmin)}`).send({ role: 'super_admin' });
  expect(r.status).toBe(400);
  expect(r.body.error.code).toBe('VALIDATION_ERROR');
});

t('POST /admin/users/invite : crée un admin avec mot de passe temporaire', async () => {
  const admin = await H.createUser({ role: 'admin', phone: '+237690000030' });
  const r = await request(app)
    .post(`${P}/users/invite`)
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`)
    .send({ email: 'newmod@creveton.cm', name: 'Nouveau Mod', role: 'moderator' });

  expect(r.status).toBe(201);
  expect(r.body).toMatchObject({ email: 'newmod@creveton.cm', role: 'moderator' });
  expect(typeof r.body.temporary_password).toBe('string');
  expect(r.body.temporary_password.length).toBeGreaterThanOrEqual(8);

  // Compte créé, phone_verified=true, actif
  const { rows } = await H.db.query('SELECT role, phone_verified, status FROM users WHERE email = $1', ['newmod@creveton.cm']);
  expect(rows[0]).toMatchObject({ role: 'moderator', phone_verified: true, status: 'active' });

  // doublon email → 409
  const dup = await request(app).post(`${P}/users/invite`).set('Authorization', `Bearer ${H.tokenFor(admin)}`).send({ email: 'newmod@creveton.cm', name: 'Doublon', role: 'admin' });
  expect(dup.status).toBe(409);
  expect(dup.body.error.code).toBe('EMAIL_ALREADY_USED');
});

t('GET /admin/leaderboard → 200, classement (me/data/page)', async () => {
  const admin = await H.createUser({ role: 'moderator', phone: '+237690000031' });
  // une partie pour alimenter le classement (rebuild depuis game_sessions)
  const player = await H.createUser({ role: 'player', phone: '+237690000032' });
  await H.db.query(`INSERT INTO game_sessions (user_id, score) VALUES ($1, 500)`, [player.id]);

  const r = await request(app).get(`${P}/leaderboard`).set('Authorization', `Bearer ${H.tokenFor(admin)}`);
  expect(r.status).toBe(200);
  expect(Array.isArray(r.body.data)).toBe(true);
  expect(r.body.data[0]).toMatchObject({ user_id: player.id, score: 500, rank: 1 });
  expect(r.body.page.limit).toBe(100);
});
