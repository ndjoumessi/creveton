'use strict';

const H = require('./helpers/integration');
const request = require('supertest');
const app = require('../src/app');

/**
 * Tests d'intégration Admin (spec §12) — CRUD questions, workflow de statuts,
 * import CSV, soft delete, RBAC — Postgres + Redis réels.
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

const P = '/api/v1/admin';
const QUESTION = {
  text_fr: 'Quel fleuve traverse Yaoundé ?',
  type: 'mcq',
  options: [
    { text: 'Le Wouri', is_correct: false },
    { text: 'La Sanaga', is_correct: false },
    { text: 'Le Mfoundi', is_correct: true },
    { text: 'Le Nyong', is_correct: false },
  ],
  theme: 'geographie',
  level: 'intermediate',
  explanation: 'Le Mfoundi traverse Yaoundé.',
  source: 'manual',
};

async function actors() {
  const moderator = await H.createUser({ role: 'moderator', phone: '+237690000010' });
  const admin = await H.createUser({ role: 'admin', phone: '+237690000011' });
  return {
    modAuth: `Bearer ${H.tokenFor(moderator)}`,
    adminAuth: `Bearer ${H.tokenFor(admin)}`,
  };
}

t('POST /admin/questions : crée en draft, correct_index calculé, version 1', async () => {
  const { modAuth } = await actors();
  const r = await request(app).post(`${P}/questions`).set('Authorization', modAuth).send(QUESTION);
  expect(r.status).toBe(201);
  expect(r.body.status).toBe('draft'); // jamais approved directement
  expect(r.body.correct_index).toBe(2);
  expect(r.body.version).toBe(1);
});

t('POST /admin/questions : doublon → 409, ≠1 bonne réponse → 422', async () => {
  const { modAuth } = await actors();
  await request(app).post(`${P}/questions`).set('Authorization', modAuth).send(QUESTION);

  const dup = await request(app).post(`${P}/questions`).set('Authorization', modAuth).send(QUESTION);
  expect(dup.status).toBe(409);
  expect(dup.body.error.code).toBe('DUPLICATE_QUESTION');

  const bad = await request(app)
    .post(`${P}/questions`)
    .set('Authorization', modAuth)
    .send({
      ...QUESTION,
      text_fr: 'Autre question ?',
      options: [
        { text: 'a', is_correct: true },
        { text: 'b', is_correct: true },
      ],
    });
  expect(bad.status).toBe(422);
  expect(bad.body.error.code).toBe('INVALID_CORRECT_OPTION_COUNT');
});

t('workflow statuts : draft → review → approved ; saut interdit → 400', async () => {
  const { modAuth } = await actors();
  const c = await request(app).post(`${P}/questions`).set('Authorization', modAuth).send(QUESTION);
  const id = c.body.id;

  const r1 = await request(app).post(`${P}/questions/${id}/transition`).set('Authorization', modAuth).send({ to: 'review' });
  expect(r1.body.status).toBe('review');

  // saut review → archived interdit
  const bad = await request(app).post(`${P}/questions/${id}/transition`).set('Authorization', modAuth).send({ to: 'archived' });
  expect(bad.status).toBe(400);
  expect(bad.body.error.code).toBe('VALIDATION_ERROR');

  const r2 = await request(app).post(`${P}/questions/${id}/transition`).set('Authorization', modAuth).send({ to: 'approved' });
  expect(r2.body.status).toBe('approved');
});

t('DELETE /admin/questions/:id : soft delete (admin), jamais de DELETE réel', async () => {
  const { modAuth, adminAuth } = await actors();
  const c = await request(app).post(`${P}/questions`).set('Authorization', modAuth).send(QUESTION);
  const id = c.body.id;

  // moderator ne peut pas supprimer (RBAC §12)
  const forbidden = await request(app).delete(`${P}/questions/${id}`).set('Authorization', modAuth);
  expect(forbidden.status).toBe(403);
  expect(forbidden.body.error.code).toBe('FORBIDDEN');

  // admin : soft delete → archived + deleted_at
  const del = await request(app).delete(`${P}/questions/${id}`).set('Authorization', adminAuth);
  expect(del.status).toBe(200);
  expect(del.body.status).toBe('archived');
  expect(del.body.deleted_at).toBeTruthy();

  // la ligne existe toujours en base (pas de DELETE réel)
  const { rows } = await H.db.query('SELECT deleted_at FROM questions WHERE id = $1', [id]);
  expect(rows).toHaveLength(1);
  expect(rows[0].deleted_at).not.toBeNull();
});

t('POST /admin/questions/import : rapport { total_rows, accepted, rejected, errors[] }', async () => {
  const { modAuth } = await actors();
  const csv = Buffer.from(
    [
      'question,option_a,option_b,option_c,option_d,correct,difficulty,category,explanation,language',
      'Capitale du Cameroun ?,Douala,Yaoundé,Bafoussam,Garoua,B,beginner,geographie,exp,fr',
      'Ligne cassée,opt,,,,Z,beginner,sport,exp,fr', // correct hors A-D → rejet (ligne 3)
    ].join('\n')
  );
  const r = await request(app)
    .post(`${P}/questions/import`)
    .set('Authorization', modAuth)
    .attach('file', csv, 'questions.csv');

  expect(r.status).toBe(200);
  expect(r.body.total_rows).toBe(2);
  expect(r.body.accepted).toBe(1);
  expect(r.body.rejected).toBe(1);
  expect(Array.isArray(r.body.errors)).toBe(true);
  expect(r.body.errors[0]).toMatchObject({ row: 3 });
  expect(typeof r.body.errors[0].issue).toBe('string');
});

t('RBAC : sans token → 401 ; player → 403', async () => {
  const noToken = await request(app).get(`${P}/questions`);
  expect(noToken.status).toBe(401);

  const player = await H.createUser({ role: 'player', phone: '+237690000099' });
  const r = await request(app).get(`${P}/questions`).set('Authorization', `Bearer ${H.tokenFor(player)}`);
  expect(r.status).toBe(403);
  expect(r.body.error.code).toBe('FORBIDDEN');
});
