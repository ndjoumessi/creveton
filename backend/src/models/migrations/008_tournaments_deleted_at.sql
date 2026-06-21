-- 008_tournaments_deleted_at.sql
-- Ajoute le soft delete aux tournois (cohérent avec users/questions, CDC §3.3) :
-- requis par tournament.model.findAll() et le décompte des tournois actifs.
-- Additif et idempotent → s'applique aux bases existantes ET aux bases fraîches.

ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Liste admin/joueur des tournois vivants, triés par date de création.
CREATE INDEX IF NOT EXISTS idx_tournaments_active
  ON tournaments (created_at DESC)
  WHERE deleted_at IS NULL;
