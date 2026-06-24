'use strict';

/**
 * Seed one-off — importe + approuve les questions de creveton_questions_demo.csv
 * directement dans la base (creveton_dev), sans passer par la modération.
 *
 *   node backend/scripts/seed-questions-extended.js
 *
 * Idempotent : relançable sans créer de doublons (dédup sur text_fr).
 *
 * NB schéma (migration 002_questions.sql) — réalités à connaître :
 *   - Il N'Y A PAS de table `answers`. Les propositions sont stockées dans la
 *     colonne JSONB `options` de `questions` : [{ "text": "...", "is_correct": bool }],
 *     avec `correct_index` (0–3) redondant pour l'accès direct.
 *   - `source` est contraint à ('manual','import','ai_generated') → 'seed' est
 *     INTERDIT par le CHECK. On utilise 'import' (valeur des 60 lignes déjà en base).
 *   - Pas d'index UNIQUE sur text_fr → on ne peut pas faire ON CONFLICT sur le texte ;
 *     on utilise l'équivalent idempotent INSERT ... WHERE NOT EXISTS.
 *
 * Connexion DB : pool partagé src/config/database.js (lit DATABASE_URL / env.db,
 * soit postgresql://creveton:creveton@localhost:5432/creveton_dev en dev).
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const db = require('../src/config/database');

// CSV à la racine du monorepo (../../ depuis backend/scripts/).
const CSV_PATH = path.resolve(__dirname, '..', '..', 'creveton_questions_demo.csv');

const LETTER_TO_INDEX = { A: 0, B: 1, C: 2, D: 3 };
const VALID_THEMES = ['culture', 'geographie', 'histoire', 'industrie', 'sport', 'science'];
const VALID_LEVELS = ['beginner', 'intermediate', 'expert'];

// Lit et parse le CSV → tableau de lignes (objets clés = en-têtes du fichier).
function readCsv(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

// Valide une ligne CSV et construit le payload d'insertion, ou renvoie { error }.
function toQuestion(row) {
  const text = (row.question || '').trim();
  const letter = (row.correct || '').trim().toUpperCase();
  const theme = (row.category || '').trim();
  const level = (row.difficulty || '').trim();
  const opts = [row.option_a, row.option_b, row.option_c, row.option_d].map((o) => (o || '').trim());
  const explanation = (row.explanation || '').trim() || null;

  if (!text) return { error: 'texte vide' };
  if (!(letter in LETTER_TO_INDEX)) return { error: `lettre correcte invalide (${row.correct})` };
  if (opts.some((o) => !o)) return { error: 'option manquante' };
  if (!VALID_THEMES.includes(theme)) return { error: `thème invalide (${theme})` };
  if (!VALID_LEVELS.includes(level)) return { error: `niveau invalide (${level})` };

  const correctIndex = LETTER_TO_INDEX[letter];
  const options = opts.map((t, i) => ({ text: t, is_correct: i === correctIndex }));

  return { text, options, correctIndex, theme, level, explanation };
}

// INSERT idempotent : n'insère que si aucune question (non supprimée) n'a déjà ce texte.
// rowCount === 1 → insérée ; 0 → déjà présente (ignorée).
async function insertIfAbsent(q) {
  const res = await db.query(
    `INSERT INTO questions
       (text_fr, type, options, correct_index, theme, level, explanation, source, status)
     SELECT $1, 'mcq', $2::jsonb, $3, $4, $5, $6, 'import', 'approved'
     WHERE NOT EXISTS (
       SELECT 1 FROM questions WHERE text_fr = $1 AND deleted_at IS NULL
     )
     RETURNING id`,
    [q.text, JSON.stringify(q.options), q.correctIndex, q.theme, q.level, q.explanation]
  );
  return res.rowCount === 1;
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV introuvable : ${CSV_PATH}`);
  }
  console.log(`📄 Lecture de ${CSV_PATH}`);
  const rows = await readCsv(CSV_PATH);
  console.log(`   ${rows.length} lignes lues.\n`);

  let inserted = 0;
  let skippedExisting = 0;
  let skippedInvalid = 0;

  for (const row of rows) {
    const q = toQuestion(row);
    if (q.error) {
      skippedInvalid += 1;
      console.warn(`⚠️  Ignorée (${q.error}) : "${(row.question || '').slice(0, 60)}"`);
      continue;
    }
    const didInsert = await insertIfAbsent(q);
    if (didInsert) inserted += 1;
    else skippedExisting += 1;
  }

  console.log('\n──────────── Résumé ────────────');
  console.log(`✅ ${inserted} question(s) insérée(s) (status=approved, source=import)`);
  console.log(`↪️  ${skippedExisting} ignorée(s) (texte déjà présent)`);
  if (skippedInvalid) console.log(`⚠️  ${skippedInvalid} ignorée(s) (ligne invalide)`);
  console.log('────────────────────────────────');
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ Échec du seed :', e.message);
  process.exit(1);
});
