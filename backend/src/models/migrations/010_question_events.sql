-- 010_question_events.sql
-- Creveton — journal d'audit des questions (console §12, onglet Historique).
-- Trace les évènements de cycle de vie d'une question (création, édition,
-- transitions de modération avec motif/acteur, retraits force-sync) afin
-- d'alimenter l'historique et le diff de versions côté admin.

CREATE TABLE IF NOT EXISTS question_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id  UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,

  event        VARCHAR(20) NOT NULL
                 CHECK (event IN ('created', 'updated', 'submitted', 'approved',
                                  'rejected', 'resubmitted', 'archived', 'force_sync')),

  actor_id     UUID REFERENCES users(id) ON DELETE SET NULL,   -- admin/modérateur auteur
  reason       TEXT,                                           -- motif (rejet) ou note
  -- Métadonnées libres : { version, from, to, changed: ["theme","level",…],
  -- before: {...}, after: {...} } — sert le diff visuel entre versions.
  meta         JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Historique d'une question, du plus récent au plus ancien.
CREATE INDEX IF NOT EXISTS idx_question_events_question
  ON question_events (question_id, created_at DESC);
