'use strict';

/**
 * Seed e2e — manche de tournoi live.
 *
 * Crée (ou réutilise) un tournoi GRATUIT en statut 'open' avec Nelson inscrit,
 * pour tester le flow temps réel sans passer par l'écran de liste.
 *
 *   node scripts/seed_live_test.js
 *
 * NB schéma : la table `tournaments` n'a PAS de colonnes `currency` ni `format`
 * (cf. migration 004). La devise est XAF par convention applicative ; le format
 * de la manche (nombre de questions / temps par question) se passe au démarrage
 * via POST /tournaments/:id/start { count, time_per_q_s }, il n'est pas stocké.
 */

const db = require('../src/config/database');

const API = process.env.API_PREFIX || '/api/v1';
const BASE = `http://localhost:${process.env.PORT || 4000}${API}`;
const SEED_NAME = 'Test Live E2E';
const SEED_EMAIL = 'nelson@creveton.cm';

async function main() {
  // 1. Récupérer l'id de Nelson.
  const {
    rows: [user],
  } = await db.query('SELECT id FROM users WHERE email = $1', [SEED_EMAIL]);
  if (!user) throw new Error(`Utilisateur ${SEED_EMAIL} introuvable`);

  // 2. Créer le tournoi (réutilise un 'open' homonyme déjà seedé → rejouable).
  const { rows: existing } = await db.query(
    "SELECT id, name FROM tournaments WHERE name = $1 AND status = 'open' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1",
    [SEED_NAME]
  );
  let tournament = existing[0];
  if (tournament) {
    console.log('ℹ️  Tournoi open homonyme réutilisé.');
  } else {
    const {
      rows: [created],
    } = await db.query(
      `INSERT INTO tournaments
         (name, type, entry_fee, max_players, prize_pool, theme, status, starts_at, ends_at)
       VALUES
         ($1, 'free', 0, 10, 0, 'culture', 'open',
          NOW() + interval '1 minute', NOW() + interval '30 minutes')
       RETURNING id, name`,
      [SEED_NAME]
    );
    tournament = created;
  }

  // 3. Inscrire Nelson (idempotent).
  await db.query(
    `INSERT INTO tournament_participants (tournament_id, user_id)
     VALUES ($1, $2) ON CONFLICT (tournament_id, user_id) DO NOTHING`,
    [tournament.id, user.id]
  );

  console.log('✅ Tournoi prêt :', tournament.id, '—', tournament.name);
  console.log('   Démarrer la manche (admin) :');
  console.log(`   POST ${BASE}/tournaments/${tournament.id}/start`);
  console.log('        body { "count": 5, "time_per_q_s": 15 }');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
