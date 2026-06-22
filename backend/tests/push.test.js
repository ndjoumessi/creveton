'use strict';

/**
 * Tests des notifications push. Le SDK Expo est MOCKÉ (aucun appel réseau réel).
 *  - sendPush : ignore les tokens invalides, loggue les erreurs de reçu.
 *  - PATCH /users/me : persiste un push_token valide, ignore un format invalide.
 */

// L'API push d'Expo est appelée via fetch → on mocke `global.fetch` (aucun réseau).
const logger = require('../src/config/logger');
const pushService = require('../src/services/pushService');
const H = require('./helpers/integration');
const request = require('supertest');
const app = require('../src/app');

const VALID_TOKEN = 'ExponentPushToken[abcDEF1234567890ghiJKL]';
const okResponse = (data) => ({ ok: true, json: async () => ({ data }) });

afterEach(() => { jest.restoreAllMocks(); });

describe('pushService.sendPush (fetch mocké)', () => {
  test('ignore les tokens invalides (aucun appel réseau)', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(okResponse([]));
    await pushService.sendPush(['not-a-token', null, ''], { title: 'X', body: 'Y' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('envoie aux tokens valides et loggue les reçus en erreur', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValue(okResponse([{ status: 'error', message: 'DeviceNotRegistered' }]));
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});

    await pushService.sendPush(VALID_TOKEN, {
      title: '⚔️ Défi',
      body: 'Test',
      data: { type: 'challenge_received' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Le corps POSTé porte le token + titre + priorité.
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent[0]).toMatchObject({ to: VALID_TOKEN, title: '⚔️ Défi', priority: 'high' });
    // L'erreur de reçu est journalisée (sans planter).
    expect(warn).toHaveBeenCalledWith('Push échoué', expect.objectContaining({ token: VALID_TOKEN }));
  });

  test('ne lève jamais même si fetch plante', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    await expect(pushService.sendPush(VALID_TOKEN, { title: 'X', body: 'Y' })).resolves.toBeUndefined();
  });
});

describe('PATCH /users/me — push_token', () => {
  let ready = false;
  beforeAll(async () => { ready = await H.ensureReady(); });
  afterAll(async () => { await H.teardown(); });
  beforeEach(async () => { if (ready) await H.resetState(); });

  const t = (name, fn) =>
    test(name, async () => {
      if (!ready) { console.warn(`[skip] ${name}`); return; }
      await fn();
    });

  t('push_token valide → persisté en base', async () => {
    const user = await H.createUser({ role: 'player' });
    const res = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${H.tokenFor(user)}`)
      .send({ push_token: VALID_TOKEN });
    expect(res.status).toBe(200);

    const { rows } = await H.db.query('SELECT push_token FROM users WHERE id = $1', [user.id]);
    expect(rows[0].push_token).toBe(VALID_TOKEN);
  });

  t('push_token au format invalide → ignoré (non persisté), maj OK', async () => {
    const user = await H.createUser({ role: 'player' });
    const res = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${H.tokenFor(user)}`)
      .send({ push_token: 'pas-un-token', ville: 'Yaoundé' });
    // La requête réussit (le champ invalide est ignoré, pas un 400 global).
    expect(res.status).toBe(200);
    expect(res.body.ville).toBe('Yaoundé');

    const { rows } = await H.db.query('SELECT push_token FROM users WHERE id = $1', [user.id]);
    expect(rows[0].push_token).toBeNull();
  });
});
