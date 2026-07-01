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
      text          TEXT,          -- énoncé FR (langue principale)
      text_en       TEXT,          -- énoncé EN (optionnel, bilingue)
      options       TEXT,          -- JSON: [{ index, text, text_en }]
      theme         TEXT,
      level         TEXT,
      media_url     TEXT,
      correct_index INTEGER,       -- présent en mode normal, NULL sinon
      explanation   TEXT,           -- explication FR (révélée post-réponse)
      explanation_en TEXT,          -- explication EN (optionnelle, bilingue)
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
    'text_en TEXT',
    'explanation_en TEXT',
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
        `INSERT INTO questions (id, type, text, text_en, options, theme, level, media_url, correct_index, explanation, explanation_en, version, deleted, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
         ON CONFLICT(id) DO UPDATE SET
           type=excluded.type,
           text=excluded.text,
           text_en=excluded.text_en,
           options=excluded.options,
           theme=excluded.theme,
           level=excluded.level,
           media_url=excluded.media_url,
           correct_index=excluded.correct_index,
           explanation=excluded.explanation,
           explanation_en=excluded.explanation_en,
           version=excluded.version,
           deleted=0,
           updated_at=excluded.updated_at`,
        [
          q.id,
          q.type || 'mcq',
          // Le backend renvoie text (=FR rétro-compat), text_fr et text_en.
          q.text || q.text_fr || '',
          q.text_en || null,
          JSON.stringify(q.options || []),
          q.theme || null,
          q.level || null,
          q.media_url || null,
          Number.isInteger(q.correct_index) ? q.correct_index : null,
          q.explanation || null,
          q.explanation_en || null,
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

// Persiste la solution (correct_index + explications) d'une question déjà en
// cache — alimentée par le feedback /sessions/answer (mode normal, EN LIGNE).
// La vue joueur du serveur ne cache jamais ces champs (anti-triche) ; on les
// écrit donc au fil des réponses online pour rendre possible, lors des parties
// OFFLINE ultérieures sur ces mêmes questions, la révélation de la bonne réponse
// ET le calcul du score local. No-op si correct_index absent (rien à écrire).
export async function patchQuestionSolution(questionId, { correct_index, explanation, explanation_en } = {}) {
  if (!questionId || !Number.isInteger(correct_index)) return;
  const db = await getDb();
  await db.runAsync(
    `UPDATE questions
        SET correct_index = ?, explanation = ?, explanation_en = ?
      WHERE id = ?`,
    [correct_index, explanation ?? null, explanation_en ?? null, questionId]
  );
}

// Patch en lot des solutions (POST /questions/solutions) : alimente le cache
// offline en une transaction. Ignore silencieusement les entrées sans correct_index.
export async function batchPatchSolutions(solutions) {
  if (!solutions?.length) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const s of solutions) {
      if (!s?.id || !Number.isInteger(s.correct_index)) continue;
      await db.runAsync(
        `UPDATE questions SET correct_index = ?, explanation = ?, explanation_en = ?
         WHERE id = ?`,
        [s.correct_index, s.explanation ?? null, s.explanation_en ?? null, s.id]
      );
    }
  });
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

// IDs de toutes les questions actives en cache — pour la sync des solutions.
export async function getAllQuestionIds() {
  const db = await getDb();
  const rows = await db.getAllAsync('SELECT id FROM questions WHERE deleted = 0');
  return rows.map((r) => r.id);
}

export async function countQuestions() {
  const db = await getDb();
  const row = await db.getFirstAsync(
    'SELECT COUNT(*) AS n FROM questions WHERE deleted = 0'
  );
  return row?.n || 0;
}

// Nombre de questions actives en cache, regroupées par thème — alimente le badge
// « X questions offline » sur les cartes de thème de l'écran de lancement. Une seule
// requête ; renvoie une map { [theme]: count } (thèmes absents = 0 côté appelant).
export async function countQuestionsByTheme() {
  const db = await getDb();
  const rows = await db.getAllAsync(
    'SELECT theme, COUNT(*) AS n FROM questions WHERE deleted = 0 GROUP BY theme'
  );
  const map = {};
  for (const r of rows) map[r.theme] = r.n;
  return map;
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
    text_en: row.text_en || null,
    options,
    theme: row.theme,
    level: row.level,
    media_url: row.media_url,
    // Présents en mode normal (feedback immédiat), NULL/undefined sinon.
    correct_index: Number.isInteger(row.correct_index) ? row.correct_index : undefined,
    explanation: row.explanation || undefined,
    explanation_en: row.explanation_en || undefined,
    version: row.version,
  };
}

export default {
  initDatabase,
  upsertQuestions,
  softDeleteQuestions,
  patchQuestionSolution,
  batchPatchSolutions,
  getQuestions,
  getAllQuestionIds,
  countQuestions,
  countQuestionsByTheme,
  clearQuestions,
};
