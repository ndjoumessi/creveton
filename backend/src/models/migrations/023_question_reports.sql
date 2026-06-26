-- 023_question_reports.sql — signalements de questions par les joueurs.
-- `question_id` / `reported_by` CASCADE. UNIQUE(question_id, reported_by) : un
-- joueur ne signale une question qu'une seule fois (l'agrégat « count » se calcule
-- par COUNT côté requête admin). `status` = traitement modération du signalement.
-- Idempotent (IF NOT EXISTS) — sûr à rejouer.

CREATE TABLE IF NOT EXISTS question_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  reported_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason VARCHAR(50) NOT NULL DEFAULT 'other'
    CHECK (reason IN ('wrong_answer','typo','offensive','duplicate','other')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','ignored','resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(question_id, reported_by)
);

CREATE INDEX IF NOT EXISTS idx_question_reports_question ON question_reports(question_id);
CREATE INDEX IF NOT EXISTS idx_question_reports_status ON question_reports(status);
