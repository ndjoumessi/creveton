'use strict';

// One-shot translation of approved French quiz questions to English.
//
// Loads every approved question still missing text_en, sends them ALL in a
// single Claude API call (REST, same fetch pattern as aiCorrectorService —
// the @anthropic-ai/sdk is not a backend dependency), then writes the result
// back per question:
//   - questions.text_en        ← translated statement
//   - questions.options JSONB   ← each option gains a `text_en` field
//
// Idempotent: only rows with text_en IS NULL/'' are picked up, so re-running
// after a partial/failed run resumes the remaining questions. Read-only on
// schema; no routes/models touched. Run: node scripts/translate-questions-en.js

require('../src/config/env'); // loads dotenv (DB + ANTHROPIC_API_KEY)
const db = require('../src/config/database');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 8000; // ample for a chunk of ~30 questions + options
const TIMEOUT_MS = 120_000; // per-chunk timeout
const CHUNK_SIZE = 30; // questions per Claude call (small responses = reliable, fast)

function buildPrompt(questions) {
  const payload = questions.map((q) => ({
    id: q.id,
    text_fr: q.text_fr,
    options_fr: (q.options || []).map((o) => o.text),
  }));

  return (
    'You are translating Cameroonian quiz questions from French to English.\n\n'
    + 'Translate ALL questions accurately. Keep the same meaning, difficulty level, and cultural context.\n\n'
    + 'For proper nouns (Cameroon cities, people, institutions), keep them as-is.\n'
    + 'Return ONLY a valid JSON array, no explanation, no markdown:\n\n'
    + '[\n'
    + '  {\n'
    + '    "id": "uuid",\n'
    + '    "text_en": "translated question text",\n'
    + '    "options_en": ["option A translated", "option B translated", "option C translated", "option D translated"]\n'
    + '  },\n'
    + '  ...\n'
    + ']\n\n'
    + 'Questions to translate:\n'
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
  // Strip markdown fences if the model wrapped the array despite instructions.
  let clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  // Fallback: slice to the outermost array if there's stray prose around it.
  if (!clean.startsWith('[')) {
    const start = clean.indexOf('[');
    const end = clean.lastIndexOf(']');
    if (start !== -1 && end !== -1 && end > start) {
      clean = clean.slice(start, end + 1);
    }
  }
  const parsed = JSON.parse(clean);
  if (!Array.isArray(parsed)) {
    throw new Error('La réponse n\'est pas un tableau JSON.');
  }
  return parsed;
}

// Translate one chunk and persist its results immediately. Returns counters.
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
    const textEn = (t.text_en || '').trim();
    const optionsEn = Array.isArray(t.options_en) ? t.options_en : [];
    if (!textEn) {
      failures.push({ id: q.id, reason: 'text_en vide' });
      continue;
    }
    if (optionsEn.length !== (q.options || []).length) {
      failures.push({
        id: q.id,
        reason: `nombre d'options ${optionsEn.length} ≠ ${(q.options || []).length}`,
      });
      continue;
    }

    const updatedOptions = (q.options || []).map((opt, i) => ({
      ...opt,
      text_en: (optionsEn[i] || '').trim(),
    }));

    try {
      await db.query(
        `UPDATE questions SET text_en = $1, options = $2 WHERE id = $3`,
        [textEn, JSON.stringify(updatedOptions), q.id],
      );
      translated += 1;
      console.log(`      ✓ ${q.id}  ${textEn.slice(0, 50)}`);
    } catch (err) {
      failures.push({ id: q.id, reason: err.message });
    }
  }

  return { translated, failures };
}

async function main() {
  const { rows: questions } = await db.query(
    `SELECT id, text_fr, options
       FROM questions
      WHERE status = 'approved'
        AND (text_en IS NULL OR text_en = '')
        AND deleted_at IS NULL
      ORDER BY created_at`,
  );

  console.log(`[1/3] ${questions.length} question(s) à traduire (status=approved, text_en vide).`);
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
      // A whole chunk failed (network / unparseable JSON). Record its questions
      // as failed and continue — the next run will retry them (idempotent).
      console.error(`   ${label} ❌ ${err.message}`);
      for (const q of chunks[i]) {
        failures.push({ id: q.id, reason: `lot échoué : ${err.message}` });
      }
    }
  }

  console.log('[3/3] Terminé.');
  console.log(`      Traduites : ${translated}`);
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
