'use strict';

const H = require('./helpers/integration');
const request = require('supertest');
const app = require('../src/app');
const svc = require('../src/services/liveTournamentService');

/**
 * Tests d'intégration du moteur de tournoi temps réel (spec §13) — Postgres +
 * Redis réels. On exerce le service directement (la couche socket n'est qu'un
 * relais) : démarrage, scoring serveur-authoritative, anti-rejeu/anti-retard,
 * révélation, clôture (score + XP + game_sessions). Plus le garde-fou admin sur
 * l'endpoint POST /tournaments/:id/start.
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
     VALUES ($1,$2,$3,0,100,0,$4, now()) RETURNING *`,
    [over.name || 'Tournoi test', over.type || 'free', over.theme ?? 'geographie', over.status || 'open']
  );
  return rows[0];
}

async function addParticipant(tournamentId, userId) {
  await H.db.query(
    'INSERT INTO tournament_participants (tournament_id, user_id) VALUES ($1,$2)',
    [tournamentId, userId]
  );
}

const makeQuestions = (n) =>
  Promise.all(Array.from({ length: n }, () => H.createApprovedQuestion({ level: 'beginner', theme: 'geographie' })));

t('start tire les questions et passe le tournoi en running', async () => {
  const tour = await createTournament();
  await makeQuestions(5);

  const res = await svc.start(tour.id, { count: 3, timePerQSec: 10 });
  expect(res).toMatchObject({ total: 3, status: 'running' });

  const { rows } = await H.db.query('SELECT status FROM tournaments WHERE id = $1', [tour.id]);
  expect(rows[0].status).toBe('running');

  const user = await H.createUser({ role: 'player' });
  const state = await svc.currentState(tour.id, user.id);
  expect(state).toMatchObject({ status: 'running', index: -1, total: 3, question: null });
});

t('start refuse si la banque de questions est insuffisante', async () => {
  const tour = await createTournament();
  await makeQuestions(1);
  await expect(svc.start(tour.id, { count: 3, timePerQSec: 10 }))
    .rejects.toMatchObject({ code: 'NOT_ENOUGH_QUESTIONS', httpStatus: 422 });
});

t('réponse correcte → score (base + bonus vitesse), anti-rejeu, reveal', async () => {
  const tour = await createTournament();
  const [q] = await makeQuestions(1); // correct_index = 1
  const alice = await H.createUser({ role: 'player' });
  const bob = await H.createUser({ role: 'player' });
  await addParticipant(tour.id, alice.id);
  await addParticipant(tour.id, bob.id);

  await svc.start(tour.id, { count: 1, timePerQSec: 30 });
  const shown = await svc.showQuestion(tour.id, 0);
  expect(shown).toMatchObject({ index: 0, total: 1 });
  expect(shown.question.id).toBe(q.id);

  // Alice répond juste (mesure serveur < 5 s → bonus). Bob répond faux.
  await expect(svc.recordAnswer({ tournamentId: tour.id, userId: alice.id, index: 0, selectedIndex: 1 }))
    .resolves.toMatchObject({ accepted: true, index: 0 });
  await expect(svc.recordAnswer({ tournamentId: tour.id, userId: bob.id, index: 0, selectedIndex: 0 }))
    .resolves.toMatchObject({ accepted: true });

  // Double réponse refusée.
  await expect(svc.recordAnswer({ tournamentId: tour.id, userId: alice.id, index: 0, selectedIndex: 1 }))
    .rejects.toMatchObject({ code: 'ALREADY_ANSWERED' });

  // Non-inscrit = spectateur.
  const carol = await H.createUser({ role: 'player' });
  await expect(svc.recordAnswer({ tournamentId: tour.id, userId: carol.id, index: 0, selectedIndex: 1 }))
    .rejects.toMatchObject({ code: 'NOT_PARTICIPANT' });

  const reveal = await svc.revealQuestion(tour.id, 0);
  expect(reveal.correct_index).toBe(1);
  expect(reveal.leaderboard[0]).toMatchObject({ user_id: alice.id, score: 75, rank: 1 });
});

t('réponse hors timing (mauvais index) → ANSWER_TOO_LATE', async () => {
  const tour = await createTournament();
  await makeQuestions(2);
  const alice = await H.createUser({ role: 'player' });
  await addParticipant(tour.id, alice.id);
  await svc.start(tour.id, { count: 2, timePerQSec: 30 });
  await svc.showQuestion(tour.id, 0);
  await expect(svc.recordAnswer({ tournamentId: tour.id, userId: alice.id, index: 1, selectedIndex: 1 }))
    .rejects.toMatchObject({ code: 'ANSWER_TOO_LATE' });
});

t('finish persiste score + XP + game_sessions et clôture le tournoi', async () => {
  const tour = await createTournament();
  await makeQuestions(1);
  const alice = await H.createUser({ role: 'player', total_xp: 0, level: 1 });
  const bob = await H.createUser({ role: 'player', total_xp: 0, level: 1 });
  await addParticipant(tour.id, alice.id);
  await addParticipant(tour.id, bob.id);

  await svc.start(tour.id, { count: 1, timePerQSec: 30 });
  await svc.showQuestion(tour.id, 0);
  await svc.recordAnswer({ tournamentId: tour.id, userId: alice.id, index: 0, selectedIndex: 1 }); // juste → 75
  await svc.recordAnswer({ tournamentId: tour.id, userId: bob.id, index: 0, selectedIndex: 0 }); // faux → 0

  const summary = await svc.finish(tour.id);
  expect(summary.status).toBe('closed');

  const tourRow = await H.db.query('SELECT status FROM tournaments WHERE id = $1', [tour.id]);
  expect(tourRow.rows[0].status).toBe('closed');

  const parts = await H.db.query(
    'SELECT user_id, score FROM tournament_participants WHERE tournament_id = $1', [tour.id]
  );
  const byUser = Object.fromEntries(parts.rows.map((r) => [r.user_id, r.score]));
  expect(byUser[alice.id]).toBe(75);
  expect(byUser[bob.id]).toBe(0);

  const aliceXp = await H.db.query('SELECT total_xp FROM users WHERE id = $1', [alice.id]);
  expect(aliceXp.rows[0].total_xp).toBe(75);

  const sessions = await H.db.query(
    "SELECT count(*)::int AS n FROM game_sessions WHERE mode = 'tournament'"
  );
  expect(sessions.rows[0].n).toBe(2);

  // L'état Redis est purgé après clôture.
  expect(await svc.currentState(tour.id, alice.id)).toBeNull();
});

t('POST /tournaments/:id/start : 403 pour un joueur, 200 pour un admin', async () => {
  const tour = await createTournament();
  await makeQuestions(3);

  const player = await H.createUser({ role: 'player' });
  const forbidden = await request(app)
    .post(`/api/v1/tournaments/${tour.id}/start`)
    .set('Authorization', `Bearer ${H.tokenFor(player)}`)
    .send({ count: 3, time_per_q_s: 10 });
  expect(forbidden.status).toBe(403);

  const admin = await H.createUser({ role: 'admin' });
  const okRes = await request(app)
    .post(`/api/v1/tournaments/${tour.id}/start`)
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`)
    .send({ count: 3, time_per_q_s: 10 });
  expect(okRes.status).toBe(200);
  expect(okRes.body).toMatchObject({ total: 3, status: 'running' });
});
