-- 025_game_sessions_played_at_idx.sql
-- Rapports admin agrégés (GET /admin/analytics/reports/sessions) : GROUP BY
-- theme|level|mode sur une plage de dates. Les index existants couvrent déjà le
-- regroupement par thème (idx_game_sessions_theme_played) et l'historique joueur
-- (idx_game_sessions_user_played), mais un GROUP BY level|mode borné par played_at
-- ne disposait d'aucun index pour le filtre de plage → scan complet.
-- On pose un btree sur played_at seul pour supporter le WHERE played_at >= from
-- AND played_at < to des nouveaux rapports (idempotent).
CREATE INDEX IF NOT EXISTS idx_game_sessions_played_at
  ON game_sessions (played_at);
