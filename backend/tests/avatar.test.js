'use strict';

// Mock complet de Cloudinary : aucun appel réseau réel. `upload` renvoie une
// secure_url ; `config`/`destroy` sont neutralisés.
jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload: jest.fn(),
      destroy: jest.fn().mockResolvedValue({ result: 'ok' }),
    },
  },
}));

const cloudinary = require('cloudinary').v2;
const H = require('./helpers/integration');
const request = require('supertest');
const app = require('../src/app');

const CLOUD_URL =
  'https://res.cloudinary.com/creveton/image/upload/v1700000000/creveton/avatars/user_x.jpg';

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
  cloudinary.uploader.upload.mockResolvedValue({ secure_url: CLOUD_URL });
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

// ── Image valide → 200 + avatar_url Cloudinary (persisté) ────────────────────
t('POST /users/me/avatar avec image valide → 200 + avatar_url Cloudinary', async () => {
  const user = await H.createUser({ role: 'player' });
  const token = H.tokenFor(user);

  const r = await post(token).attach('avatar', Buffer.from('fake-image-bytes'), {
    filename: 'a.png',
    contentType: 'image/png',
  });

  expect(r.status).toBe(200);
  expect(r.body.avatar_url).toMatch(/^https:\/\/res\.cloudinary\.com\//);
  expect(cloudinary.uploader.upload).toHaveBeenCalledTimes(1);
  // Transformation 200×200 demandée à Cloudinary.
  const opts = cloudinary.uploader.upload.mock.calls[0][1];
  expect(opts.transformation[0]).toMatchObject({ width: 200, height: 200, crop: 'fill' });

  // L'URL est bien persistée en base (visible via GET /users/me).
  const me = await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${token}`);
  expect(me.body.avatar_url).toMatch(/^https:\/\/res\.cloudinary\.com\//);
});

// ── Sans fichier → 400 VALIDATION_ERROR ──────────────────────────────────────
t('POST /users/me/avatar sans fichier → 400', async () => {
  const user = await H.createUser({ role: 'player' });
  const token = H.tokenFor(user);

  const r = await post(token);

  expect(r.status).toBe(400);
  expect(r.body.error.code).toBe('VALIDATION_ERROR');
  expect(cloudinary.uploader.upload).not.toHaveBeenCalled();
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
  expect(cloudinary.uploader.upload).not.toHaveBeenCalled();
});
