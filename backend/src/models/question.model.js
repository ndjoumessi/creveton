'use strict';

const db = require('../config/database');

/**
 * Couche d'accès aux données « questions » (réf. spec §5/§15, migration 002).
 *
 * RÈGLE ANTI-TRICHE : la projection joueur (`toPlayerView`) ne renvoie JAMAIS
 * `correct_index`, `explanation`, ni `options[].is_correct`. La bonne réponse
 * n'est révélée que par /sessions/submit (scoreService).
 *
 * Toutes les lectures excluent les soft-deletes (`deleted_at IS NULL`) et ne
 * servent que le contenu publié (`status = 'approved'`).
 */

// Colonnes nécessaires à la vue joueur (sans solution).
const PLAYER_COLUMNS = 'id, type, text_fr, text_en, options, theme, level, media_url, version';

/**
 * Projette une ligne SQL en Question « vue joueur » (§15) — sans solution.
 * @param {object} row
 * @param {'fr'|'en'} [lang='fr']
 */
function toPlayerView(row, lang = 'fr') {
  if (!row) return null;
  const text = lang === 'en' && row.text_en ? row.text_en : row.text_fr;
  const rawOptions = Array.isArray(row.options) ? row.options : [];
  return {
    id: row.id,
    type: row.type,
    text,
    // On ré-indexe et on retire is_correct (jamais exposé).
    options: rawOptions.map((opt, index) => ({ index, text: opt.text })),
    theme: row.theme,
    level: row.level,
    media_url: row.media_url ?? null,
    version: row.version,
  };
}

/**
 * Tirage de questions publiées, filtré et déterministe par `seed`.
 *
 * Déterminisme : `ORDER BY md5(id::text || seed)` produit le MÊME ordre pour un
 * seed donné, indépendamment du plan d'exécution → garantit un tirage identique
 * pour les deux joueurs d'un challenge (même seed + même pool candidat).
 *
 * @param {object} opts
 * @param {string|null} [opts.theme]
 * @param {string|null} [opts.level]
 * @param {number} [opts.count=10]
 * @param {string[]} [opts.excludeIds=[]]  IDs à exclure (anti-répétition solo).
 * @param {string} opts.seed               graine du tirage.
 * @returns {Promise<object[]>} lignes brutes (à projeter via toPlayerView).
 */
async function pickRandom({ theme = null, level = null, count = 10, excludeIds = [], seed }) {
  const exclude = excludeIds && excludeIds.length ? excludeIds : null;
  const { rows } = await db.query(
    `SELECT ${PLAYER_COLUMNS}
       FROM questions
      WHERE deleted_at IS NULL
        AND status = 'approved'
        AND ($1::text IS NULL OR theme = $1)
        AND ($2::text IS NULL OR level = $2)
        AND ($3::uuid[] IS NULL OR id <> ALL($3))
      ORDER BY md5(id::text || $4)
      LIMIT $5`,
    [theme, level, exclude, String(seed), count]
  );
  return rows;
}

/**
 * IDs des questions vues lors des `sessions` dernières parties d'un joueur.
 * Source : game_sessions.answers (JSONB) — utilisé pour l'anti-répétition.
 */
async function recentQuestionIds(userId, sessions = 3) {
  const { rows } = await db.query(
    `SELECT answers
       FROM game_sessions
      WHERE user_id = $1
      ORDER BY played_at DESC
      LIMIT $2`,
    [userId, sessions]
  );
  const ids = new Set();
  for (const row of rows) {
    const answers = Array.isArray(row.answers) ? row.answers : [];
    for (const answer of answers) {
      if (answer && answer.question_id) ids.add(answer.question_id);
    }
  }
  return [...ids];
}

/** Horodatage serveur (borne haute cohérente pour le delta sync). */
async function serverNow() {
  const { rows } = await db.query('SELECT now() AS now');
  return rows[0].now;
}

/**
 * Questions VISIBLES (publiées, non supprimées) modifiées dans (since, syncedAt].
 * Retourne les lignes brutes + created_at/updated_at pour le classement new/updated.
 */
async function changedSince(since, syncedAt) {
  const { rows } = await db.query(
    `SELECT ${PLAYER_COLUMNS}, created_at, updated_at
       FROM questions
      WHERE updated_at > $1 AND updated_at <= $2
        AND deleted_at IS NULL
        AND status = 'approved'
      ORDER BY updated_at ASC`,
    [since, syncedAt]
  );
  return rows;
}

/**
 * IDs des questions qui ont QUITTÉ l'ensemble visible dans (since, syncedAt] :
 * soft-deletées (deleted_at) OU dé-publiées (status ≠ approved). Le client doit
 * les retirer de son cache. Le trigger met à jour updated_at lors d'un soft
 * delete, donc `updated_at > since` capte aussi les suppressions.
 */
async function deletedSince(since, syncedAt) {
  const { rows } = await db.query(
    `SELECT id
       FROM questions
      WHERE updated_at > $1 AND updated_at <= $2
        AND (deleted_at IS NOT NULL OR status <> 'approved')`,
    [since, syncedAt]
  );
  return rows.map((r) => r.id);
}

/**
 * Snapshot paginé (keyset par id) des questions publiées — premier lancement.
 * @returns {Promise<{ rows: object[], hasMore: boolean, nextCursor: string|null }>}
 */
async function listAllApproved({ limit = 200, cursor = null }) {
  const params = [];
  let where = `WHERE deleted_at IS NULL AND status = 'approved'`;
  if (cursor) {
    params.push(cursor);
    where += ` AND id > $${params.length}`;
  }
  params.push(limit + 1); // +1 pour détecter has_more
  const { rows } = await db.query(
    `SELECT ${PLAYER_COLUMNS}
       FROM questions
       ${where}
      ORDER BY id ASC
      LIMIT $${params.length}`,
    params
  );
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    rows: page,
    hasMore,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

/**
 * Existence d'une question par texte normalisé (détection de doublons).
 * La normalisation (minuscules, espaces compactés) est appliquée des deux côtés
 * pour comparer indépendamment de la casse et des espaces.
 */
async function existsByNormalizedText(normalizedText) {
  const { rows } = await db.query(
    `SELECT 1
       FROM questions
      WHERE deleted_at IS NULL
        AND lower(btrim(regexp_replace(text_fr, '\\s+', ' ', 'g'))) = $1
      LIMIT 1`,
    [normalizedText]
  );
  return rows.length > 0;
}

/**
 * Insère une question. `options` est sérialisé en JSONB.
 * @param {object} data
 * @param {object} [executor=db]  pool ou client (pour transactions/batch).
 */
async function create(data, executor = db) {
  const { rows } = await executor.query(
    `INSERT INTO questions
       (text_fr, text_en, type, options, correct_index, theme, level,
        explanation, media_url, source, status, created_by)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      data.text_fr,
      data.text_en ?? null,
      data.type || 'mcq',
      JSON.stringify(data.options || []),
      data.correct_index ?? null,
      data.theme,
      data.level,
      data.explanation ?? null,
      data.media_url ?? null,
      data.source || 'manual',
      data.status || 'pending_review',
      data.created_by ?? null,
    ]
  );
  return rows[0];
}

/**
 * Charge les solutions (correct_index, explanation) d'un lot de questions.
 * RÉSERVÉ au serveur (scoring /sessions/submit) — jamais exposé via la vue
 * joueur. On ne filtre ni le statut ni deleted_at : on doit pouvoir noter une
 * partie même si la question a été archivée/supprimée depuis le tirage.
 * @param {string[]} ids
 * @returns {Promise<Map<string,{correct_index:number|null, explanation:string|null}>>}
 */
/**
 * Récupère un lot de questions en version « brève » (texte + options + bonne
 * réponse) pour le récapitulatif d'une partie côté admin.
 * @returns {Promise<Map<string,{text_fr, options, correct_index}>>}
 */
async function findManyBrief(ids) {
  if (!ids || ids.length === 0) return new Map();
  const { rows } = await db.query(
    `SELECT id, text_fr, options, correct_index FROM questions WHERE id = ANY($1::uuid[])`,
    [ids]
  );
  return new Map(rows.map((r) => [r.id, { text_fr: r.text_fr, options: r.options, correct_index: r.correct_index }]));
}

async function findSolutions(ids) {
  if (!ids || ids.length === 0) return new Map();
  const { rows } = await db.query(
    `SELECT id, correct_index, explanation
       FROM questions
      WHERE id = ANY($1::uuid[])`,
    [ids]
  );
  return new Map(rows.map((r) => [r.id, { correct_index: r.correct_index, explanation: r.explanation }]));
}

/**
 * Vue admin COMPLÈTE d'une question (§15 vue admin) — inclut la solution.
 * Réservée aux endpoints /admin/* (rôle modérateur+).
 */
function toAdminView(row) {
  if (!row) return null;
  return {
    id: row.id,
    text_fr: row.text_fr,
    text_en: row.text_en ?? null,
    type: row.type,
    options: Array.isArray(row.options) ? row.options : [],
    correct_index: row.correct_index ?? null,
    theme: row.theme,
    level: row.level,
    explanation: row.explanation ?? null,
    media_url: row.media_url ?? null,
    source: row.source,
    status: row.status,
    version: row.version,
    success_rate: row.success_rate ?? null,
    created_by: row.created_by ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at ?? null,
  };
}

/** Récupère une question par id, quel que soit son statut (vue admin). */
async function findByIdAny(id) {
  const { rows } = await db.query('SELECT * FROM questions WHERE id = $1', [id]);
  return rows[0] || null;
}

/**
 * Liste admin paginée (keyset par created_at,id desc) avec filtres.
 * Inclut tous les statuts ; exclut les soft-deletes sauf si demandé.
 */
async function listAdmin({ status = null, theme = null, level = null, q = null, limit = 20, offset = 0 }) {
  const params = [];
  const clauses = ['deleted_at IS NULL'];
  if (status) {
    params.push(status);
    clauses.push(`status = $${params.length}`);
  }
  if (theme) {
    params.push(theme);
    clauses.push(`theme = $${params.length}`);
  }
  if (level) {
    params.push(level);
    clauses.push(`level = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    clauses.push(`text_fr ILIKE $${params.length}`);
  }
  params.push(limit + 1);
  const limitIdx = params.length;
  params.push(offset);
  const { rows } = await db.query(
    `SELECT * FROM questions
      WHERE ${clauses.join(' AND ')}
      ORDER BY created_at DESC, id DESC
      LIMIT $${limitIdx} OFFSET $${params.length}`,
    params
  );
  const hasMore = rows.length > limit;
  return { rows: hasMore ? rows.slice(0, limit) : rows, hasMore };
}

/**
 * Met à jour les champs autorisés d'une question. Incrémente `version` ;
 * réinitialise success_rate si la solution (options/correct_index) change.
 * Le trigger met à jour updated_at (delta sync).
 * @returns {Promise<object|null>} ligne mise à jour.
 */
async function update(id, fields) {
  const ALLOWED = ['text_fr', 'text_en', 'type', 'theme', 'level', 'explanation', 'media_url'];
  const sets = [];
  const params = [id];
  for (const key of ALLOWED) {
    if (fields[key] !== undefined) {
      params.push(fields[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }
  const answerChanged = fields.options !== undefined || fields.correct_index !== undefined;
  if (fields.options !== undefined) {
    params.push(JSON.stringify(fields.options));
    sets.push(`options = $${params.length}::jsonb`);
  }
  if (fields.correct_index !== undefined) {
    params.push(fields.correct_index);
    sets.push(`correct_index = $${params.length}`);
  }
  sets.push('version = version + 1');
  if (answerChanged) sets.push('success_rate = NULL'); // recalcul nocturne

  const { rows } = await db.query(
    `UPDATE questions SET ${sets.join(', ')}
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *`,
    params
  );
  return rows[0] || null;
}

/** Change le statut (workflow). @returns ligne mise à jour ou null. */
async function setStatus(id, status) {
  const { rows } = await db.query(
    `UPDATE questions SET status = $2
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *`,
    [id, status]
  );
  return rows[0] || null;
}

/**
 * Soft delete (jamais de DELETE réel — spec §12) : pose deleted_at + status
 * archived. Idempotent : ne ré-archive pas une question déjà supprimée.
 */
async function softDelete(id) {
  const { rows } = await db.query(
    `UPDATE questions
        SET deleted_at = now(), status = 'archived'
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Récupère des questions APPROUVÉES par ids, en vue joueur (sans solution),
 * dans l'ordre fourni. Utilisé pour rejouer un set figé (challenge §9).
 */
async function findPlayerByIds(ids, lang = 'fr') {
  if (!ids || ids.length === 0) return [];
  const { rows } = await db.query(
    `SELECT ${PLAYER_COLUMNS} FROM questions
      WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
    [ids]
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter(Boolean).map((r) => toPlayerView(r, lang));
}

module.exports = {
  PLAYER_COLUMNS,
  toPlayerView,
  toAdminView,
  findPlayerByIds,
  pickRandom,
  recentQuestionIds,
  serverNow,
  changedSince,
  deletedSince,
  listAllApproved,
  existsByNormalizedText,
  create,
  findManyBrief,
  findSolutions,
  findByIdAny,
  listAdmin,
  update,
  setStatus,
  softDelete,
};
