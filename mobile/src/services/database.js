// Cache local des questions (SQLite) — alimenté par le delta sync (CDC §2.8).
// Règle d'or : l'app ne stocke jamais de questions en dur ; tout passe par
// le cache local, lui-même rempli par GET /questions/delta et /questions/all.

import * as SQLite from 'expo-sqlite';

let dbPromise = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('creveton.db');
  }
  return dbPromise;
}

// Schéma : vue joueur + (mode normal uniquement) correct_index/explanation
// pour le feedback immédiat. En tournoi/challenge ces champs restent absents
// (anti-triche serveur). Soft-delete via la colonne deleted (1).
export async function initDatabase() {
  const db = await getDb();
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS questions (
      id            TEXT PRIMARY KEY NOT NULL,
      type          TEXT,
      text          TEXT,
      options       TEXT,          -- JSON: [{ index, text }]
      theme         TEXT,
      level         TEXT,
      media_url     TEXT,
      correct_index INTEGER,       -- présent en mode normal, NULL sinon
      explanation   TEXT,
      version       INTEGER DEFAULT 1,
      deleted       INTEGER DEFAULT 0,
      updated_at    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_questions_theme_level
      ON questions (theme, level, deleted);
  `);
  // Migration douce : ajoute les colonnes si une ancienne base existe déjà.
  for (const col of [
    'correct_index INTEGER',
    'explanation TEXT',
  ]) {
    try {
      await db.execAsync(`ALTER TABLE questions ADD COLUMN ${col};`);
    } catch {
      /* colonne déjà présente */
    }
  }
  return db;
}

// UPSERT d'un lot de questions (new[] + updated[] du delta).
export async function upsertQuestions(questions = []) {
  if (!questions.length) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const q of questions) {
      await db.runAsync(
        `INSERT INTO questions (id, type, text, options, theme, level, media_url, correct_index, explanation, version, deleted, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
         ON CONFLICT(id) DO UPDATE SET
           type=excluded.type,
           text=excluded.text,
           options=excluded.options,
           theme=excluded.theme,
           level=excluded.level,
           media_url=excluded.media_url,
           correct_index=excluded.correct_index,
           explanation=excluded.explanation,
           version=excluded.version,
           deleted=0,
           updated_at=excluded.updated_at`,
        [
          q.id,
          q.type || 'mcq',
          q.text || '',
          JSON.stringify(q.options || []),
          q.theme || null,
          q.level || null,
          q.media_url || null,
          Number.isInteger(q.correct_index) ? q.correct_index : null,
          q.explanation || null,
          q.version || 1,
          q.updated_at || q.synced_at || null,
        ]
      );
    }
  });
}

// Soft-delete des ids retirés (deleted_ids[] du delta ou push force_sync).
export async function softDeleteQuestions(ids = []) {
  if (!ids.length) return;
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE questions SET deleted = 1 WHERE id IN (${placeholders})`,
    ids
  );
}

// Tirage local pour démarrer une partie en mode hybride.
export async function getQuestions({ theme, level, count = 10 }) {
  const db = await getDb();
  const where = ['deleted = 0'];
  const params = [];
  if (theme) {
    where.push('theme = ?');
    params.push(theme);
  }
  if (level) {
    where.push('level = ?');
    params.push(level);
  }
  // ORDER BY RANDOM() : suffisant pour le cache local côté client.
  const rows = await db.getAllAsync(
    `SELECT * FROM questions WHERE ${where.join(' AND ')} ORDER BY RANDOM() LIMIT ?`,
    [...params, count]
  );
  return rows.map(rowToQuestion);
}

export async function countQuestions() {
  const db = await getDb();
  const row = await db.getFirstAsync(
    'SELECT COUNT(*) AS n FROM questions WHERE deleted = 0'
  );
  return row?.n || 0;
}

export async function clearQuestions() {
  const db = await getDb();
  await db.runAsync('DELETE FROM questions');
}

function rowToQuestion(row) {
  let options = [];
  try {
    options = JSON.parse(row.options || '[]');
  } catch {
    options = [];
  }
  return {
    id: row.id,
    type: row.type,
    text: row.text,
    options,
    theme: row.theme,
    level: row.level,
    media_url: row.media_url,
    // Présents en mode normal (feedback immédiat), NULL/undefined sinon.
    correct_index: Number.isInteger(row.correct_index) ? row.correct_index : undefined,
    explanation: row.explanation || undefined,
    version: row.version,
  };
}

export default {
  initDatabase,
  upsertQuestions,
  softDeleteQuestions,
  getQuestions,
  countQuestions,
  clearQuestions,
};
