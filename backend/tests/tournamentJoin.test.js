'use strict';

const H = require('./helpers/integration');
const request = require('supertest');
const app = require('../src/app');

/**
 * Tests d'intégration de POST /tournaments/:id/join (spec §8) — Postgres réel.
 * Inscription aux tournois GRATUITS (entry_fee = 0 → 201 « confirmed », idempotent)
 * et garde-fous : tournoi introuvable, fermé, complet, et tournoi PAYANT bloqué par
 * le flag `tournaments.paid.enabled` (403 FEATURE_DISABLED tant qu'il est false).
 */

let ready = false;
beforeAll(async () => { ready = await H.ensureReady(); });
afterAll(async () => { await H.teardown(); });
beforeEach(async () => { if (ready) await H.resetState(); });

const t = (name, fn) =>
  test(name, async () => {
    if (!ready) { console.warn(`[skip] ${name}`); return; }
    await fn();
  });

/** Crée un tournoi (gratuit/ouvert par défaut ; paramètres surchargeables). */
async function createTournament(over = {}) {
  const { rows } = await H.db.query(
    `INSERT INTO tournaments (name, type, theme, entry_fee, max_players, prize_pool, status, starts_at)
     VALUES ($1,$2,$3,$4,$5,0,$6, now()) RETURNING *`,
    [
      over.name || 'Tournoi gratuit',
      over.type || 'free',
      over.theme ?? 'geographie',
      over.entry_fee ?? 0,
      over.max_players ?? 100,
      over.status || 'open',
    ]
  );
  return rows[0];
}

const join = (tournamentId, user, body = {}) =>
  request(app)
    .post(`/api/v1/tournaments/${tournamentId}/join`)
    .set('Authorization', `Bearer ${H.tokenFor(user)}`)
    .send(body);

const participantCount = async (tournamentId) => {
  const { rows } = await H.db.query(
    'SELECT count(*)::int AS n FROM tournament_participants WHERE tournament_id = $1',
    [tournamentId]
  );
  return rows[0].n;
};

t('tournoi gratuit ouvert → 201 confirmed + participant persisté', async () => {
  const tour = await createTournament();
  const player = await H.createUser({ role: 'player' });

  const res = await join(tour.id, player);
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({
    tournament_id: tour.id,
    user_id: player.id,
    status: 'confirmed',
    entry_fee: 0,
  });
  expect(await participantCount(tour.id)).toBe(1);
});

t('join deux fois (même joueur) → toujours 201, un seul enregistrement (idempotent)', async () => {
  const tour = await createTournament();
  const player = await H.createUser({ role: 'player' });

  const first = await join(tour.id, player);
  const second = await join(tour.id, player);
  expect(first.status).toBe(201);
  expect(second.status).toBe(201);
  expect(second.body).toMatchObject({ status: 'confirmed' });
  expect(await participantCount(tour.id)).toBe(1);
});

t('tournoi inexistant → 404 TOURNAMENT_NOT_FOUND', async () => {
  const player = await H.createUser({ role: 'player' });
  const res = await join('00000000-0000-0000-0000-000000000000', player);
  expect(res.status).toBe(404);
  expect(res.body.error.code).toBe('TOURNAMENT_NOT_FOUND');
});

t("tournoi non ouvert (status != 'open') → 422 TOURNAMENT_NOT_OPEN", async () => {
  const tour = await createTournament({ status: 'running' });
  const player = await H.createUser({ role: 'player' });
  const res = await join(tour.id, player);
  expect(res.status).toBe(422);
  expect(res.body.error.code).toBe('TOURNAMENT_NOT_OPEN');
  expect(await participantCount(tour.id)).toBe(0);
});

t('tournoi complet (max_players atteint) → 409 TOURNAMENT_FULL', async () => {
  const tour = await createTournament({ max_players: 1 });
  const alice = await H.createUser({ role: 'player' });
  const bob = await H.createUser({ role: 'player' });

  const ok = await join(tour.id, alice);
  expect(ok.status).toBe(201);

  const full = await join(tour.id, bob);
  expect(full.status).toBe(409);
  expect(full.body.error.code).toBe('TOURNAMENT_FULL');
  expect(await participantCount(tour.id)).toBe(1);
});

t('tournoi payant (entry_fee > 0, flag off) → 403 FEATURE_DISABLED', async () => {
  const tour = await createTournament({ type: 'premium', entry_fee: 500 });
  const player = await H.createUser({ role: 'player' });
  const res = await join(tour.id, player);
  expect(res.status).toBe(403);
  expect(res.body.error.code).toBe('FEATURE_DISABLED');
  expect(await participantCount(tour.id)).toBe(0);
});
