'use strict';

/**
 * Exécuteur de migrations SQL — Creveton.
 *
 * Applique dans l'ordre lexicographique tous les fichiers `migrations/*.sql`
 * non encore appliqués, en s'appuyant sur une table de suivi `schema_migrations`.
 *
 * Garanties :
 *   - chaque migration est exécutée AU PLUS UNE FOIS (suivi par nom de fichier) ;
 *   - chaque migration tourne dans SA PROPRE transaction → en cas d'échec, le
 *     fichier fautif est annulé entièrement (pas d'état partiel) ;
 *   - l'ordre est déterministe (préfixes numériques 001…007).
 *
 * Usage :
 *   npm run migrate            # applique les migrations en attente
 *   node src/models/migrate.js # idem
 */

const fs = require('fs');
const path = require('path');
const db = require('../config/database');
const logger = require('../config/logger');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/** Crée la table de suivi si elle n'existe pas encore. */
async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

/** Liste les fichiers .sql triés (ordre lexicographique = ordre d'application). */
function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Dossier de migrations introuvable : ${MIGRATIONS_DIR}`);
  }
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/** Renvoie l'ensemble des migrations déjà appliquées. */
async function getApplied(client) {
  const { rows } = await client.query('SELECT filename FROM schema_migrations');
  return new Set(rows.map((r) => r.filename));
}

async function migrate() {
  const client = await db.getClient();
  let applied = 0;
  try {
    await ensureMigrationsTable(client);
    const alreadyApplied = await getApplied(client);
    const files = listMigrationFiles();

    const pending = files.filter((f) => !alreadyApplied.has(f));
    if (pending.length === 0) {
      logger.info('Migrations : aucune en attente — base à jour', { total: files.length });
      return;
    }

    logger.info('Migrations en attente', { count: pending.length, files: pending });

    for (const file of pending) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      const start = Date.now();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied += 1;
        logger.info(`✓ Migration appliquée : ${file}`, { duration_ms: Date.now() - start });
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error(`✗ Échec de la migration : ${file} (annulée)`, { error: err.message });
        throw err; // on arrête tout : on n'applique pas les migrations suivantes
      }
    }

    logger.info('Migrations terminées', { applied });
  } finally {
    client.release();
  }
}

// Exécution directe en CLI : applique puis ferme le pool et fixe le code de sortie.
if (require.main === module) {
  migrate()
    .then(() => db.close())
    .then(() => process.exit(0))
    .catch(async (err) => {
      logger.error('Migration interrompue', { error: err.message });
      try {
        await db.close();
      } catch (_) {
        /* ignore */
      }
      process.exit(1);
    });
}

module.exports = { migrate };
