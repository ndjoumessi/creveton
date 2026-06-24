'use strict';

// Mock complet de Cloudinary : aucun appel réseau réel. `unsigned_upload`
// renvoie une secure_url + public_id ; `destroy` est neutralisé (résolu).
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
const H = require('./helpers/integration');
const userModel = require('../src/models/user.model');
const request = require('supertest');
const app = require('../src/app');

const CLOUD_URL =
  'https://res.cloudinary.com/creveton/image/upload/v1700000000/creveton/avatars/user_x.jpg';
const CLOUD_PUBLIC_ID = 'creveton/avatars/user_x_1700000000';

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
  cloudinary.uploader.unsigned_upload.mockReset();
  cloudinary.uploader.unsigned_upload.mockResolvedValue({
    secure_url: CLOUD_URL,
    public_id: CLOUD_PUBLIC_ID,
  });
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

const post = (token) =>
  request(app).post('/api/v1/users/me/avatar').set('Authorization', `Bearer ${token}`);

const attach = (token) =>
  post(token).attach('avatar', Buffer.from('fake-image-bytes'), {
    filename: 'a.png',
    contentType: 'image/png',
  });

// ── Image valide → 200 + avatar_url Cloudinary (persisté) ────────────────────
t('POST /users/me/avatar avec image valide → 200 + avatar_url Cloudinary', async () => {
  const user = await H.createUser({ role: 'player' });
  const token = H.tokenFor(user);

  const r = await attach(token);

  expect(r.status).toBe(200);
  expect(r.body.avatar_url).toMatch(/^https:\/\/res\.cloudinary\.com\//);
  expect(cloudinary.uploader.unsigned_upload).toHaveBeenCalledTimes(1);

  // L'URL est bien persistée en base (visible via GET /users/me).
  const me = await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${token}`);
  expect(me.body.avatar_url).toMatch(/^https:\/\/res\.cloudinary\.com\//);
});

// ── avatar_public_id persisté en base après upload ───────────────────────────
t('POST /users/me/avatar persiste avatar_public_id en base', async () => {
  const user = await H.createUser({ role: 'player' });
  const token = H.tokenFor(user);

  await attach(token);

  const row = await userModel.findById(user.id);
  expect(row.avatar_public_id).toBe(CLOUD_PUBLIC_ID);
});

// ── Pas d'ancien avatar → destroy NON appelé ─────────────────────────────────
t('POST /users/me/avatar sans ancien avatar → destroy non appelé', async () => {
  const user = await H.createUser({ role: 'player' });
  const token = H.tokenFor(user);

  await attach(token);

  expect(cloudinary.uploader.destroy).not.toHaveBeenCalled();
});

// ── Ancien avatar présent → destroy appelé avec l'ancien public_id ───────────
t('POST /users/me/avatar avec ancien avatar → destroy(ancien public_id)', async () => {
  const user = await H.createUser({ role: 'player' });
  const token = H.tokenFor(user);

  // 1er upload : crée l'avatar (aucun ancien à supprimer).
  await attach(token);
  expect(cloudinary.uploader.destroy).not.toHaveBeenCalled();

  // 2e upload : l'ancien public_id (persisté) doit être supprimé, une seule fois.
  await attach(token);
  expect(cloudinary.uploader.destroy).toHaveBeenCalledTimes(1);
  expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(CLOUD_PUBLIC_ID);
});

// ── Sans fichier → 400 VALIDATION_ERROR ──────────────────────────────────────
t('POST /users/me/avatar sans fichier → 400', async () => {
  const user = await H.createUser({ role: 'player' });
  const token = H.tokenFor(user);

  const r = await post(token);

  expect(r.status).toBe(400);
  expect(r.body.error.code).toBe('VALIDATION_ERROR');
  expect(cloudinary.uploader.unsigned_upload).not.toHaveBeenCalled();
});

// ── Fichier non-image → 400 (rejet multer fileFilter) ────────────────────────
t('POST /users/me/avatar avec fichier non-image → 400', async () => {
  const user = await H.createUser({ role: 'player' });
  const token = H.tokenFor(user);

  const r = await post(token).attach('avatar', Buffer.from('hello world'), {
    filename: 'note.txt',
    contentType: 'text/plain',
  });

  expect(r.status).toBe(400);
  expect(r.body.error.code).toBe('VALIDATION_ERROR');
  expect(cloudinary.uploader.unsigned_upload).not.toHaveBeenCalled();
});
