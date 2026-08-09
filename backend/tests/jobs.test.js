'use strict';

const H = require('./helpers/integration');
const request = require('supertest');
const app = require('../src/app');
const { isDue, describe: describeSchedule } = require('../src/jobs/schedule');
const lock = require('../src/jobs/lock');
const runner = require('../src/jobs/runner');
const expireChallenges = require('../src/jobs/tasks/expireChallenges');
const tournamentLifecycle = require('../src/jobs/tasks/tournamentLifecycle');
const emailVerifyNudge = require('../src/jobs/tasks/emailVerifyNudge');

/**
 * Ordonnanceur : cadences, verrou, tâches, observation.
 *
 * Les cadences se testent SANS horloge simulée — `isDue` prend `now` en
 * paramètre, précisément pour ça. Les tâches, elles, tournent contre Postgres +
 * Redis réels comme le reste de la suite.
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

// Instants exprimés en UTC ; les cadences sont en heure du Cameroun (UTC+1),
// donc 02:00 UTC = 03:00 local.
const at = (iso) => new Date(iso);

// ── Cadences (pur, sans infra) ─────────────────────────────────────────────

test('everyMinutes : dû seulement après l’intervalle', () => {
  const s = { everyMinutes: 60 };
  const now = at('2026-08-09T12:00:00Z');
  expect(isDue(s, now, null)).toBe(true); // jamais exécutée
  expect(isDue(s, now, now.getTime() - 59 * 60_000)).toBe(false);
  expect(isDue(s, now, now.getTime() - 61 * 60_000)).toBe(true);
});

test('dailyAt : fenêtre de 5 min à l’heure LOCALE (UTC+1)', () => {
  const s = { dailyAt: 3 }; // 3 h Cameroun = 2 h UTC
  expect(isDue(s, at('2026-08-09T02:00:00Z'), null)).toBe(true);
  expect(isDue(s, at('2026-08-09T02:04:00Z'), null)).toBe(true);
  // Hors fenêtre : 5 min après l'heure pile.
  expect(isDue(s, at('2026-08-09T02:06:00Z'), null)).toBe(false);
  // Bonne minute mais mauvaise heure — le piège si on oubliait le décalage.
  expect(isDue(s, at('2026-08-09T03:00:00Z'), null)).toBe(false);
});

test('dailyAt : pas deux fois dans la même fenêtre', () => {
  const s = { dailyAt: 3 };
  const now = at('2026-08-09T02:03:00Z');
  // Exécutée il y a 3 min → la fenêtre dure 5 min, il ne faut pas rejouer.
  expect(isDue(s, now, now.getTime() - 3 * 60_000)).toBe(false);
  // Exécutée hier → dû.
  expect(isDue(s, now, now.getTime() - 24 * 3600_000)).toBe(true);
});

test('weeklyAt : jour ET heure locale', () => {
  const s = { weeklyAt: { weekday: 1, hour: 4 } }; // lundi 4 h local = 3 h UTC
  expect(isDue(s, at('2026-08-10T03:00:00Z'), null)).toBe(true); // lundi
  expect(isDue(s, at('2026-08-11T03:00:00Z'), null)).toBe(false); // mardi
});

test('describe rend un libellé lisible', () => {
  expect(describeSchedule({ everyMinutes: 15 })).toMatch(/15 min/);
  expect(describeSchedule({ dailyAt: 3 })).toMatch(/3h/);
});

// ── Verrou ─────────────────────────────────────────────────────────────────

t('le verrou est exclusif, et se libère', async () => {
  const first = await lock.acquire('test-job', 5000);
  expect(first).toBeTruthy();

  const second = await lock.acquire('test-job', 5000);
  expect(second).toBeNull(); // déjà pris

  await lock.release('test-job', first);
  const third = await lock.acquire('test-job', 5000);
  expect(third).toBeTruthy();
  await lock.release('test-job', third);
});

t('libérer avec un identifiant étranger ne casse pas le verrou du voisin', async () => {
  // Scénario du DEL aveugle : A dépasse son TTL, B reprend le verrou, A revient
  // et tente de libérer. Sans comparaison, A libérerait le verrou de B.
  const mine = await lock.acquire('test-job', 5000);
  expect(mine).toBeTruthy();

  await lock.release('test-job', 'un-autre-run-id');

  // Toujours tenu : la libération étrangère n'a rien fait.
  expect(await lock.acquire('test-job', 5000)).toBeNull();
  await lock.release('test-job', mine);
});

// ── expire-challenges ──────────────────────────────────────────────────────

t('expire-challenges ferme les défis dépassés et épargne les autres', async () => {
  const a = await H.createUser();
  const b = await H.createUser();

  const mk = async (status, ageHours) => {
    const { rows } = await H.db.query(
      `INSERT INTO challenges (challenger_id, opponent_id, theme, level, status, created_at)
       VALUES ($1,$2,'culture','beginner',$3, now() - ($4 || ' hours')::interval)
       RETURNING id`,
      [a.id, b.id, status, ageHours]
    );
    return rows[0].id;
  };

  const vieuxPending = await mk('pending', 30);
  const recentPending = await mk('pending', 2);
  const vieuxTermine = await mk('completed', 30);
  const vieuxRefuse = await mk('declined', 30);

  const res = await expireChallenges.run();
  expect(res.expired).toBe(1);

  const statusOf = async (id) =>
    (await H.db.query('SELECT status FROM challenges WHERE id = $1', [id])).rows[0].status;

  expect(await statusOf(vieuxPending)).toBe('expired');
  expect(await statusOf(recentPending)).toBe('pending');
  // Les défis déjà clos ne sont jamais repris.
  expect(await statusOf(vieuxTermine)).toBe('completed');
  expect(await statusOf(vieuxRefuse)).toBe('declined');

  // Idempotent : deuxième passage, plus rien à faire.
  expect((await expireChallenges.run()).expired).toBe(0);
});

// ── tournament-lifecycle ───────────────────────────────────────────────────

t('tournament-lifecycle ouvre les inscriptions et signale les retards', async () => {
  const mk = async (status, startsInHours) => {
    const { rows } = await H.db.query(
      `INSERT INTO tournaments (name, theme, max_players, entry_fee, prize_pool, status, starts_at)
       VALUES ($1,'culture',8,0,0,$2, now() + ($3 || ' hours')::interval)
       RETURNING id`,
      [`T-${Math.random().toString(36).slice(2, 7)}`, status, startsInHours]
    );
    return rows[0].id;
  };

  const imminent = await mk('scheduled', 6); // dans 6 h → à ouvrir
  const lointain = await mk('scheduled', 72); // dans 3 j → trop tôt
  const enRetard = await mk('open', -5); // parti il y a 5 h, jamais lancé

  const res = await tournamentLifecycle.run();
  expect(res.opened).toBe(1);
  // Seul `enRetard` est en retard : `imminent`, qui vient de passer en `open`,
  // démarre dans le futur.
  expect(res.overdue).toBe(1);

  const statusOf = async (id) =>
    (await H.db.query('SELECT status FROM tournaments WHERE id = $1', [id])).rows[0].status;

  expect(await statusOf(imminent)).toBe('open');
  expect(await statusOf(lointain)).toBe('scheduled');
  // La tâche ne DÉMARRE jamais un tournoi — décision produit, laissée à un
  // humain. Et à 5 h de retard elle ne l'expire pas non plus : l'expiration
  // n'intervient qu'au-delà de 24 h (cf. test suivant).
  expect(await statusOf(enRetard)).toBe('open');
  expect(res.expired).toBe(0);
});

t('tournament-lifecycle expire les tournois morts, et EUX SEULS', async () => {
  const mk = async ({ hours, fee = 0, players = 0 }) => {
    const { rows } = await H.db.query(
      `INSERT INTO tournaments (name, theme, max_players, entry_fee, prize_pool, status, starts_at)
       VALUES ($1,'culture',8,$2,0,'open', now() - ($3 || ' hours')::interval)
       RETURNING id`,
      [`T-${Math.random().toString(36).slice(2, 7)}`, fee, hours]
    );
    const id = rows[0].id;
    for (let i = 0; i < players; i += 1) {
      const u = await H.createUser();
      await H.db.query('INSERT INTO tournament_participants (tournament_id, user_id) VALUES ($1,$2)', [id, u.id]);
    }
    return id;
  };

  // Mort : cinq semaines de retard, gratuit, personne inscrit. Le cas constaté
  // sur staging, qui gonflait le KPI « Tournois ouverts ».
  const mort = await mk({ hours: 24 * 35 });
  // Vivant : assez de joueurs pour démarrer — l'annuler détruirait de vraies
  // inscriptions pour corriger un oubli humain.
  const jouable = await mk({ hours: 24 * 35, players: 2 });
  // Payant : tant que le remboursement n'est pas implémenté, une tâche
  // automatique n'annule pas ce à quoi de l'argent est attaché.
  const payant = await mk({ hours: 24 * 35, fee: 500 });
  // Dans la fenêtre de grâce : en retard, mais pas encore mort.
  const recent = await mk({ hours: 5 });

  const res = await tournamentLifecycle.run();
  expect(res.expired).toBe(1);

  const statusOf = async (id) =>
    (await H.db.query('SELECT status FROM tournaments WHERE id = $1', [id])).rows[0].status;

  expect(await statusOf(mort)).toBe('cancelled');
  expect(await statusOf(jouable)).toBe('open');
  expect(await statusOf(payant)).toBe('open');
  expect(await statusOf(recent)).toBe('open');

  // Ce qui survit reste SIGNALÉ : trois tournois toujours en retard.
  expect(res.overdue).toBe(3);

  // Idempotent : un second passage ne retrouve rien à expirer.
  const again = await tournamentLifecycle.run();
  expect(again.expired).toBe(0);
});

// ── email-verify-nudge ─────────────────────────────────────────────────────

/** Compte non vérifié, avec jeton push, créé il y a `ageDays`. */
async function nudgeable(over = {}) {
  const u = await H.createUser();
  await H.db.query(
    `UPDATE users
        SET email = $2, email_verified = false, push_token = $3,
            created_at = now() - ($4 || ' days')::interval,
            email_nudge_count = $5, email_nudged_at = $6
      WHERE id = $1`,
    [
      u.id,
      over.email || `u${Math.random().toString(36).slice(2, 8)}@example.cm`,
      // `??` retomberait sur la valeur par défaut pour `push_token: null` —
      // or c'est justement le cas qu'on veut tester (compte sans jeton push).
      'push_token' in over ? over.push_token : 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
      over.ageDays ?? 10,
      over.count ?? 0,
      over.nudgedAt ?? null,
    ]
  );
  return u;
}

t('la relance ne cible que les comptes éligibles, et marque le compteur', async () => {
  const cible = await nudgeable();
  const tropRecent = await nudgeable({ ageDays: 1 }); // dans les 3 j de grâce
  const sansPush = await nudgeable({ push_token: null });
  const plafonne = await nudgeable({ count: 3 }); // plafond atteint

  const verifie = await nudgeable();
  await H.db.query('UPDATE users SET email_verified = true WHERE id = $1', [verifie.id]);

  const countOf = async (id) =>
    (await H.db.query('SELECT email_nudge_count FROM users WHERE id = $1', [id])).rows[0]
      .email_nudge_count;

  // Hors fenêtre : le garde-fou horaire prime, rien n'est envoyé NI marqué.
  // 06:00 UTC = 07:00 au Cameroun.
  const horsFenetre = await emailVerifyNudge.run({ now: new Date('2026-08-09T06:00:00Z') });
  expect(horsFenetre.skipped).toBe('hors fenêtre');
  expect(await countOf(cible.id)).toBe(0);

  // Dans la fenêtre : 17:00 UTC = 18:00 au Cameroun.
  const res = await emailVerifyNudge.run({ now: new Date('2026-08-09T17:00:00Z') });
  expect(res.nudged).toBe(1);
  expect(await countOf(cible.id)).toBe(1);
  expect(await countOf(tropRecent.id)).toBe(0);
  expect(await countOf(sansPush.id)).toBe(0);
  expect(await countOf(plafonne.id)).toBe(3);
  expect(await countOf(verifie.id)).toBe(0);
});

// ── Observation ────────────────────────────────────────────────────────────

t('runJob écrit une trace lisible, succès comme échec', async () => {
  const okJob = {
    name: 'test-ok',
    schedule: { everyMinutes: 1 },
    timeoutMs: 5000,
    run: async () => ({ done: 42 }),
  };
  const koJob = {
    name: 'test-ko',
    schedule: { everyMinutes: 1 },
    timeoutMs: 5000,
    run: async () => {
      throw new Error('boum');
    },
  };

  const a = await runner.runJob(okJob, { force: true });
  expect(a).toMatchObject({ ran: true, ok: true, summary: { done: 42 } });

  // Une tâche qui échoue ne propage pas : elle est tracée, pas relancée.
  const b = await runner.runJob(koJob, { force: true });
  expect(b).toMatchObject({ ran: true, ok: false, error: 'boum' });

  const traceOk = JSON.parse(await H.redis.get('jobs:last:test-ok'));
  expect(traceOk.ok).toBe(true);
  expect(traceOk.summary).toEqual({ done: 42 });

  const traceKo = JSON.parse(await H.redis.get('jobs:last:test-ko'));
  expect(traceKo.ok).toBe(false);
  expect(traceKo.error).toBe('boum');
});

t('GET /admin/jobs liste les tâches et leur dernière exécution', async () => {
  const admin = await H.createUser({ role: 'admin' });
  await runner.runJob(require('../src/jobs/tasks/expireChallenges'), { force: true });

  const res = await request(app)
    .get('/api/v1/admin/jobs')
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`);

  expect(res.status).toBe(200);
  const names = res.body.data.map((j) => j.name);
  expect(names).toEqual(
    expect.arrayContaining(['success-rate', 'expire-challenges', 'tournament-lifecycle', 'email-verify-nudge'])
  );

  const ec = res.body.data.find((j) => j.name === 'expire-challenges');
  expect(ec.schedule).toMatch(/60 min/);
  expect(ec.last.ok).toBe(true);
  // Une tâche jamais lancée est explicitement `null`, pas absente : « jamais
  // exécutée » doit se lire sur le tableau de bord.
  expect(res.body.data.find((j) => j.name === 'success-rate').last).toBeNull();
});

t('un modérateur ne voit pas les tâches ; seul super_admin peut les relancer', async () => {
  const moderator = await H.createUser({ role: 'moderator' });
  const admin = await H.createUser({ role: 'admin' });

  await request(app)
    .get('/api/v1/admin/jobs')
    .set('Authorization', `Bearer ${H.tokenFor(moderator)}`)
    .expect(403);

  // admin lit…
  await request(app)
    .get('/api/v1/admin/jobs')
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`)
    .expect(200);

  // …mais ne relance pas.
  await request(app)
    .post('/api/v1/admin/jobs/expire-challenges/run')
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`)
    .expect(403);
});

t('relancer une tâche inconnue renvoie 404', async () => {
  const su = await H.createUser({ role: 'super_admin' });
  const res = await request(app)
    .post('/api/v1/admin/jobs/nawak/run')
    .set('Authorization', `Bearer ${H.tokenFor(su)}`);
  expect(res.status).toBe(404);
  expect(res.body.error.code).toBe('JOB_NOT_FOUND');
});

t('relance manuelle : exécute et renvoie le résumé', async () => {
  const su = await H.createUser({ role: 'super_admin' });
  const res = await request(app)
    .post('/api/v1/admin/jobs/expire-challenges/run')
    .set('Authorization', `Bearer ${H.tokenFor(su)}`);
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
  expect(res.body.summary).toHaveProperty('expired');
});

t('une tâche déjà verrouillée refuse la relance manuelle (409)', async () => {
  const su = await H.createUser({ role: 'super_admin' });
  const held = await lock.acquire('expire-challenges', 10_000);
  expect(held).toBeTruthy();

  const res = await request(app)
    .post('/api/v1/admin/jobs/expire-challenges/run')
    .set('Authorization', `Bearer ${H.tokenFor(su)}`);
  expect(res.status).toBe(409);
  expect(res.body.error.code).toBe('JOB_ALREADY_RUNNING');

  await lock.release('expire-challenges', held);
});
