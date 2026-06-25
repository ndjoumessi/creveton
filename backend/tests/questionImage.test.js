'use strict';

// Tests de l'image de question (admin) — upload/suppression Cloudinary.
// Cloudinary est entièrement mocké (aucun appel réseau) : `upload` (signé) renvoie
// secure_url + public_id ; `destroy` est neutralisé. Pattern identique à avatar.test.js.

jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload: jest.fn(),
      unsigned_upload: jest.fn(),
      destroy: jest.fn(),
    },
  },
}));

const cloudinary = require('cloudinary').v2;
const request = require('supertest');
const H = require('./helpers/integration');
const questionModel = require('../src/models/question.model');
const app = require('../src/app');

const CLOUD_URL =
  'https://res.cloudinary.com/creveton/image/upload/v1700000000/creveton/questions/question_x.jpg';
const CLOUD_PUBLIC_ID = 'creveton/questions/question_x_1700000000';
const P = '/api/v1/admin/questions';

let ready = false;
beforeAll(async () => {
  ready = await H.ensureReady();
});
afterAll(async () => {
  await H.teardown();
});
beforeEach(async () => {
  if (ready) await H.resetState();
  cloudinary.uploader.upload.mockReset();
  cloudinary.uploader.upload.mockResolvedValue({ secure_url: CLOUD_URL, public_id: CLOUD_PUBLIC_ID });
  cloudinary.uploader.destroy.mockReset();
  cloudinary.uploader.destroy.mockResolvedValue({ result: 'ok' });
});

const t = (name, fn) =>
  test(name, async () => {
    if (!ready) {
      console.warn(`[skip] ${name}`);
      return;
    }
    await fn();
  });

async function moderatorToken() {
  const mod = await H.createUser({ role: 'moderator' });
  return H.tokenFor(mod);
}

const attachImage = (token, id, buf = Buffer.from('fake-image-bytes'), opts = {}) =>
  request(app)
    .post(`${P}/${id}/image`)
    .set('Authorization', `Bearer ${token}`)
    .attach('image', buf, { filename: opts.filename || 'q.png', contentType: opts.contentType || 'image/png' });

// ── Upload valide → 200 + media_url + persistance (url + public_id) ───────────
t('POST /admin/questions/:id/image valide → 200 + media_url persisté', async () => {
  const token = await moderatorToken();
  const q = await H.createApprovedQuestion();

  const r = await attachImage(token, q.id);

  expect(r.status).toBe(200);
  expect(r.body.media_url).toMatch(/^https:\/\/res\.cloudinary\.com\//);
  expect(cloudinary.uploader.upload).toHaveBeenCalledTimes(1);

  const row = await questionModel.findByIdAny(q.id);
  expect(row.media_url).toBe(CLOUD_URL);
  expect(row.media_public_id).toBe(CLOUD_PUBLIC_ID);
});

// ── Vue joueur : media_url remonte dans la projection ────────────────────────
t('media_url remonte dans la vue joueur après upload', async () => {
  const token = await moderatorToken();
  const q = await H.createApprovedQuestion();
  await attachImage(token, q.id);

  const row = await questionModel.findByIdAny(q.id);
  const view = questionModel.toPlayerView(row);
  expect(view.media_url).toBe(CLOUD_URL);
  // Pas de public_id côté joueur (anti-fuite).
  expect(view.media_public_id).toBeUndefined();
});

// ── Type non autorisé (text/plain) → 400, pas d'appel Cloudinary ─────────────
t('POST image type non autorisé → 400', async () => {
  const token = await moderatorToken();
  const q = await H.createApprovedQuestion();

  const r = await request(app)
    .post(`${P}/${q.id}/image`)
    .set('Authorization', `Bearer ${token}`)
    .attach('image', Buffer.from('hello'), { filename: 'note.txt', contentType: 'text/plain' });

  expect(r.status).toBe(400);
  expect(r.body.error.code).toBe('VALIDATION_ERROR');
  expect(cloudinary.uploader.upload).not.toHaveBeenCalled();
});

// ── Fichier trop volumineux (> 2 Mo) → 400 (MulterError) ─────────────────────
t('POST image > 2 Mo → 400', async () => {
  const token = await moderatorToken();
  const q = await H.createApprovedQuestion();
  const big = Buffer.alloc(2 * 1024 * 1024 + 1, 1); // 2 Mo + 1 octet

  const r = await attachImage(token, q.id, big);

  expect(r.status).toBe(400);
  expect(r.body.error.code).toBe('VALIDATION_ERROR');
  expect(cloudinary.uploader.upload).not.toHaveBeenCalled();
});

// ── Remplacement : 2e upload supprime l'ancien public_id ─────────────────────
t('2e upload → destroy(ancien public_id)', async () => {
  const token = await moderatorToken();
  const q = await H.createApprovedQuestion();

  await attachImage(token, q.id);
  expect(cloudinary.uploader.destroy).not.toHaveBeenCalled();

  await attachImage(token, q.id);
  expect(cloudinary.uploader.destroy).toHaveBeenCalledTimes(1);
  expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(CLOUD_PUBLIC_ID);
});

// ── DELETE image → 204 + colonnes à NULL + destroy appelé ────────────────────
t('DELETE /admin/questions/:id/image → 204 + media nulle', async () => {
  const token = await moderatorToken();
  const q = await H.createApprovedQuestion();
  await attachImage(token, q.id);

  const r = await request(app).delete(`${P}/${q.id}/image`).set('Authorization', `Bearer ${token}`);

  expect(r.status).toBe(204);
  expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(CLOUD_PUBLIC_ID);
  const row = await questionModel.findByIdAny(q.id);
  expect(row.media_url).toBeNull();
  expect(row.media_public_id).toBeNull();
});

// ── DELETE sur question sans image → 204, destroy NON appelé ─────────────────
t('DELETE image sur question sans image → 204 (idempotent)', async () => {
  const token = await moderatorToken();
  const q = await H.createApprovedQuestion();

  const r = await request(app).delete(`${P}/${q.id}/image`).set('Authorization', `Bearer ${token}`);

  expect(r.status).toBe(204);
  expect(cloudinary.uploader.destroy).not.toHaveBeenCalled();
});
