'use strict';

const H = require('./helpers/integration');
const request = require('supertest');
const app = require('../src/app');

/**
 * Tests d'intégration — POST/DELETE /admin/tournaments/:id/participants.
 * Inscription/retrait manuel de joueurs par un admin.
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

async function createTournament(over = {}) {
  const { rows } = await H.db.query(
    `INSERT INTO tournaments (name, type, theme, entry_fee, max_players, prize_pool, status, starts_at)
     VALUES ($1,$2,$3,$4,$5,0,$6, now()) RETURNING *`,
    [
      over.name || 'Tournoi admin test',
      over.type || 'free',
      over.theme ?? 'geographie',
      over.entry_fee ?? 0,
      over.max_players ?? 100,
      over.status || 'open',
    ]
  );
  return rows[0];
}

const participantCount = async (tournamentId) => {
  const { rows } = await H.db.query(
    'SELECT count(*)::int AS n FROM tournament_participants WHERE tournament_id = $1',
    [tournamentId]
  );
  return rows[0].n;
};

const addParticipant = (tournamentId, admin, body) =>
  request(app)
    .post(`/api/v1/admin/tournaments/${tournamentId}/participants`)
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`)
    .send(body);

const removeParticipant = (tournamentId, userId, admin) =>
  request(app)
    .delete(`/api/v1/admin/tournaments/${tournamentId}/participants/${userId}`)
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`);

// ── POST /:id/participants ────────────────────────────────────────────────────

t('admin inscrit un joueur → 201 avec infos joueur', async () => {
  const admin = await H.createUser({ role: 'admin' });
  const player = await H.createUser({ role: 'player' });
  const tour = await createTournament();

  const res = await addParticipant(tour.id, admin, { user_id: player.id });

  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({
    tournament_id: tour.id,
    user_id: player.id,
    score: 0,
    payout: 0,
  });
  expect(res.body.name).toBeDefined();
  expect(await participantCount(tour.id)).toBe(1);
});

t('joueur déjà inscrit → 409 ALREADY_REGISTERED', async () => {
  const admin = await H.createUser({ role: 'admin' });
  const player = await H.createUser({ role: 'player' });
  const tour = await createTournament();

  await H.db.query(
    'INSERT INTO tournament_participants (tournament_id, user_id) VALUES ($1, $2)',
    [tour.id, player.id]
  );

  const res = await addParticipant(tour.id, admin, { user_id: player.id });

  expect(res.status).toBe(409);
  expect(res.body.error.code).toBe('ALREADY_REGISTERED');
  expect(await participantCount(tour.id)).toBe(1);
});

t('capacité atteinte → 409 TOURNAMENT_FULL', async () => {
  const admin = await H.createUser({ role: 'admin' });
  const alice = await H.createUser({ role: 'player' });
  const bob = await H.createUser({ role: 'player' });
  const tour = await createTournament({ max_players: 1 });

  await H.db.query(
    'INSERT INTO tournament_participants (tournament_id, user_id) VALUES ($1, $2)',
    [tour.id, alice.id]
  );

  const res = await addParticipant(tour.id, admin, { user_id: bob.id });

  expect(res.status).toBe(409);
  expect(res.body.error.code).toBe('TOURNAMENT_FULL');
  expect(await participantCount(tour.id)).toBe(1);
});

t('tournoi annulé → 400 VALIDATION_ERROR', async () => {
  const admin = await H.createUser({ role: 'admin' });
  const player = await H.createUser({ role: 'player' });
  const tour = await createTournament({ status: 'cancelled' });

  const res = await addParticipant(tour.id, admin, { user_id: player.id });

  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe('VALIDATION_ERROR');
});

// ── DELETE /:id/participants/:user_id ─────────────────────────────────────────

t('admin retire un participant → 200', async () => {
  const admin = await H.createUser({ role: 'admin' });
  const player = await H.createUser({ role: 'player' });
  const tour = await createTournament();

  await H.db.query(
    'INSERT INTO tournament_participants (tournament_id, user_id) VALUES ($1, $2)',
    [tour.id, player.id]
  );
  expect(await participantCount(tour.id)).toBe(1);

  const res = await removeParticipant(tour.id, player.id, admin);

  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ tournament_id: tour.id, user_id: player.id });
  expect(await participantCount(tour.id)).toBe(0);
});

t('retrait sur tournoi en cours → 403 FORBIDDEN', async () => {
  const admin = await H.createUser({ role: 'admin' });
  const player = await H.createUser({ role: 'player' });
  const tour = await createTournament({ status: 'running' });

  await H.db.query(
    'INSERT INTO tournament_participants (tournament_id, user_id) VALUES ($1, $2)',
    [tour.id, player.id]
  );

  const res = await removeParticipant(tour.id, player.id, admin);

  expect(res.status).toBe(403);
  expect(res.body.error.code).toBe('FORBIDDEN');
  expect(await participantCount(tour.id)).toBe(1);
});
