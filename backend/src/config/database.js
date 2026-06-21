'use strict';

const { Pool } = require('pg');
const env = require('./env');
const logger = require('./logger');

/**
 * Pool de connexions PostgreSQL partagé.
 * Utiliser query() pour les requêtes simples, getClient() pour les transactions.
 */

const poolConfig = env.db.url
  ? { connectionString: env.db.url, max: env.db.poolMax }
  : {
      host: env.db.host,
      port: env.db.port,
      user: env.db.user,
      password: env.db.password,
      database: env.db.database,
      max: env.db.poolMax,
    };

if (env.db.ssl) {
  // Vérification du certificat activée. Pour un fournisseur managé avec CA
  // dédiée, renseigner PGSSLROOTCERT (lu nativement par node-postgres) plutôt
  // que de désactiver la vérification.
  poolConfig.ssl = { rejectUnauthorized: true };
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  logger.error('Erreur inattendue sur un client PostgreSQL inactif', { error: err.message });
});

/**
 * Exécute une requête paramétrée via le pool.
 * @param {string} text  Requête SQL avec placeholders $1, $2…
 * @param {Array}  params Paramètres
 */
async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  if (!env.isProd) {
    logger.debug('SQL', { text: text.replace(/\s+/g, ' ').trim(), duration_ms: Date.now() - start, rows: res.rowCount });
  }
  return res;
}

/** Récupère un client dédié (à libérer avec client.release()) pour les transactions. */
function getClient() {
  return pool.connect();
}

/** Vérifie la connectivité (health check). */
async function ping() {
  await pool.query('SELECT 1');
  return true;
}

async function close() {
  await pool.end();
}

module.exports = { pool, query, getClient, ping, close };
