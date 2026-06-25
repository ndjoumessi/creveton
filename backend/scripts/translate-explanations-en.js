'use strict';

// Batch translation of approved questions' EXPLANATIONS (FR → EN).
//
// Same pattern/structure as translate-questions-en.js: loads every approved
// question that HAS a French explanation but no explanation_en yet, translates
// in chunks of 30 via a single Claude call per chunk (REST fetch — no SDK), and
// writes explanation_en back per row.
//
// Idempotent: only rows with explanation present AND explanation_en NULL/'' are
// picked up, so re-running resumes the remainder. Run:
//   node scripts/translate-explanations-en.js

require('../src/config/env'); // loads dotenv (DB + ANTHROPIC_API_KEY)
const db = require('../src/config/database');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 8000; // ample for a chunk of ~30 explanations
const TIMEOUT_MS = 120_000; // per-chunk timeout
const CHUNK_SIZE = 30;

function buildPrompt(questions) {
  const payload = questions.map((q) => ({ id: q.id, explanation: q.explanation }));
  return (
    'Translate these Cameroonian quiz explanations from French to English.\n\n'
    + 'Keep proper nouns as-is. Return ONLY valid JSON array:\n'
    + '[{ "id": "uuid", "explanation_en": "translated explanation" }]\n\n'
    + 'Explanations:\n'
    + JSON.stringify(payload)
  );
}

async function callClaude(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY manquante dans l\'environnement.');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic HTTP ${res.status}: ${body.slice(0, 500)}`);
  }
  return res.json();
}

function parseTranslations(rawText) {
  const text = (rawText || '').trim();
  let clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!clean.startsWith('[')) {
    const start = clean.indexOf('[');
    const end = clean.lastIndexOf(']');
    if (start !== -1 && end !== -1 && end > start) clean = clean.slice(start, end + 1);
  }
  const parsed = JSON.parse(clean);
  if (!Array.isArray(parsed)) throw new Error('La réponse n\'est pas un tableau JSON.');
  return parsed;
}

// Translate one chunk and persist immediately. Returns counters.
async function processChunk(chunk, label) {
  const response = await callClaude(buildPrompt(chunk));
  const usage = response.usage || {};
  console.log(
    `   ${label} réponse reçue — tokens in: ${usage.input_tokens ?? '?'}, `
    + `out: ${usage.output_tokens ?? '?'}, stop: ${response.stop_reason ?? '?'}`,
  );
  if (response.stop_reason === 'max_tokens') {
    console.warn(`   ${label} ⚠️  stop_reason=max_tokens : réponse possiblement tronquée.`);
  }

  const rawText = response.content && response.content[0] && response.content[0].text;
  const translations = parseTranslations(rawText); // throws → caught by caller
  const byTranslation = new Map(translations.map((t) => [t.id, t]));

  let translated = 0;
  const failures = [];

  for (const q of chunk) {
    const t = byTranslation.get(q.id);
    if (!t) {
      failures.push({ id: q.id, reason: 'absente de la réponse Claude' });
      continue;
    }
    const explEn = (t.explanation_en || '').trim();
    if (!explEn) {
      failures.push({ id: q.id, reason: 'explanation_en vide' });
      continue;
    }
    try {
      await db.query('UPDATE questions SET explanation_en = $1 WHERE id = $2', [explEn, q.id]);
      translated += 1;
      console.log(`      ✓ ${q.id}  ${explEn.slice(0, 50)}`);
    } catch (err) {
      failures.push({ id: q.id, reason: err.message });
    }
  }

  return { translated, failures };
}

async function main() {
  const { rows: questions } = await db.query(
    `SELECT id, explanation
       FROM questions
      WHERE status = 'approved'
        AND explanation IS NOT NULL AND explanation <> ''
        AND (explanation_en IS NULL OR explanation_en = '')
        AND deleted_at IS NULL
      ORDER BY created_at`,
  );

  console.log(`[1/3] ${questions.length} explication(s) à traduire (approved, explanation_en vide).`);
  if (questions.length === 0) {
    console.log('Rien à faire. ✅');
    return;
  }

  const chunks = [];
  for (let i = 0; i < questions.length; i += CHUNK_SIZE) {
    chunks.push(questions.slice(i, i + CHUNK_SIZE));
  }
  console.log(`[2/3] Traduction en ${chunks.length} lot(s) de ≤${CHUNK_SIZE} (écriture immédiate par lot)…`);

  let translated = 0;
  const failures = [];

  for (let i = 0; i < chunks.length; i += 1) {
    const label = `[lot ${i + 1}/${chunks.length}]`;
    try {
      const r = await processChunk(chunks[i], label);
      translated += r.translated;
      failures.push(...r.failures);
    } catch (err) {
      console.error(`   ${label} ❌ ${err.message}`);
      for (const q of chunks[i]) {
        failures.push({ id: q.id, reason: `lot échoué : ${err.message}` });
      }
    }
  }

  console.log('[3/3] Terminé.');
  console.log(`      Traduites : ${translated}`);
  console.log(`      Ignorées (déjà traduites) : 0`);
  console.log(`      Échecs : ${failures.length}`);
  if (failures.length) {
    for (const f of failures) {
      console.log(`        - ${f.id} : ${f.reason}`);
    }
  }
}

main()
  .catch((err) => {
    console.error('[FATAL]', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.close().catch(() => {});
  });
