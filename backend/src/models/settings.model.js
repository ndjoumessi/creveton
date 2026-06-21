'use strict';

const db = require('../config/database');

/** Accès aux paramètres applicatifs (migration 011). Stockage clé → valeur JSONB. */

async function getAll() {
  const { rows } = await db.query('SELECT key, value, updated_at FROM app_settings');
  return rows;
}

async function get(key) {
  const { rows } = await db.query('SELECT value FROM app_settings WHERE key = $1', [key]);
  return rows[0] ? rows[0].value : undefined;
}

/** Upsert d'un paramètre (valeur JSON quelconque) + traçabilité de l'auteur. */
async function set(key, value, updatedBy = null) {
  const { rows } = await db.query(
    `INSERT INTO app_settings (key, value, updated_by, updated_at)
     VALUES ($1, $2::jsonb, $3, now())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
     RETURNING key, value, updated_at`,
    [key, JSON.stringify(value), updatedBy]
  );
  return rows[0];
}

module.exports = { getAll, get, set };
