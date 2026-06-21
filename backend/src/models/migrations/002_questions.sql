-- 002_questions.sql
-- Creveton — CDC §4.2 « Table questions »
-- Banque de questions partagée. Source de vérité unique : aucune question en dur
-- dans le code de l'app (CDC §4.2, point non négociable n°3).
--
-- Points non négociables (CDC §4.2) appliqués ici :
--   1. updated_at INDEXÉ — clé du delta sync (GET /questions/delta?since=…).
--      Sans cet index, chaque requête de sync fait un full scan.
--   2. Soft delete obligatoire (deleted_at) — JAMAIS de DELETE réel : l'app doit
--      pouvoir savoir qu'une question doit être retirée du cache local.
--   3. version — incrémenté à chaque modification (résolution de conflits).

CREATE TABLE IF NOT EXISTS questions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  text_fr       TEXT        NOT NULL,                          -- énoncé FR (langue principale)
  text_en       TEXT,                                          -- énoncé EN (optionnel, v2)

  type          VARCHAR(20) NOT NULL DEFAULT 'mcq'
                  CHECK (type IN ('mcq', 'true_false', 'open', 'order')),

  -- Liste des propositions : [{ "text": "...", "is_correct": true|false }] (≈4 options).
  options       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  -- Index de la bonne réponse (0–3) — redondant avec options.is_correct pour un
  -- accès direct côté moteur de quiz.
  correct_index SMALLINT    CHECK (correct_index IS NULL OR correct_index BETWEEN 0 AND 3),

  theme         VARCHAR(20) NOT NULL
                  CHECK (theme IN ('culture', 'geographie', 'histoire', 'industrie', 'sport', 'science')),
  -- CDC : « level / difficulty ». On conserve le nom `level` (aligné sur l'app).
  level         VARCHAR(20) NOT NULL DEFAULT 'beginner'
                  CHECK (level IN ('beginner', 'intermediate', 'expert')),

  explanation   TEXT,                                          -- affichée après réponse
  media_url     TEXT,                                          -- image / audio (optionnel, v2)

  source        VARCHAR(50) NOT NULL DEFAULT 'manual'
                  CHECK (source IN ('manual', 'import', 'ai_generated')),

  -- Workflow de modération (CDC §3.3). 'review' = pending_review.
  status        VARCHAR(20) NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'review', 'approved', 'rejected', 'archived')),

  version       INTEGER     NOT NULL DEFAULT 1,                -- résolution de conflits delta sync
  success_rate  REAL,                                          -- % de réussite (recalculé la nuit)
  created_by    UUID        REFERENCES users(id) ON DELETE SET NULL,  -- admin créateur

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),            -- INDEXÉ ci-dessous (delta sync)
  deleted_at    TIMESTAMPTZ                                    -- soft delete (jamais de DELETE réel)
);

-- (1) CRITIQUE : index sur updated_at — colonne pivot du delta sync.
CREATE INDEX IF NOT EXISTS idx_questions_updated_at ON questions (updated_at);

-- Service des sets de questions à l'app : GET /questions?theme=&level=&count=
-- Index partiel : on ne sert que les questions publiées et non supprimées.
CREATE INDEX IF NOT EXISTS idx_questions_theme_level
  ON questions (theme, level)
  WHERE deleted_at IS NULL AND status = 'approved';

-- Pilotage du contenu dans la console (file de modération par statut).
CREATE INDEX IF NOT EXISTS idx_questions_status ON questions (status);

-- (2) updated_at est tenu à jour automatiquement à chaque UPDATE.
-- NB : `version` reste à la charge de l'application (sémantique de résolution de
-- conflits) ; ainsi les recalculs batch de success_rate peuvent décider ou non
-- de l'incrémenter sans logique cachée dans la base.
DROP TRIGGER IF EXISTS set_questions_updated_at ON questions;
CREATE TRIGGER set_questions_updated_at
  BEFORE UPDATE ON questions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
