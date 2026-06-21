-- 003_game_sessions.sql
-- Creveton — CDC §4.3 « game_sessions »
-- Une ligne = une partie complète. Le score est (re)calculé côté serveur lors
-- du POST /sessions/submit ; les réponses détaillées sont conservées en JSONB.

CREATE TABLE IF NOT EXISTS game_sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  mode           VARCHAR(20) NOT NULL DEFAULT 'normal'
                   CHECK (mode IN ('normal', 'tournament', 'challenge')),
  theme          VARCHAR(20),                                  -- NULL = thèmes mixtes
  level          VARCHAR(20),

  score          INTEGER  NOT NULL DEFAULT 0,                  -- recalculé serveur (anti-triche)
  correct_count  SMALLINT NOT NULL DEFAULT 0,
  question_count SMALLINT NOT NULL DEFAULT 0,
  xp_earned      INTEGER  NOT NULL DEFAULT 0,

  -- Détail des réponses : [{ "question_id", "selected_index", "is_correct", "time_ms" }]
  answers        JSONB    NOT NULL DEFAULT '[]'::jsonb,

  played_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Historique des parties d'un joueur (fiche utilisateur §3.2, 50 dernières parties).
CREATE INDEX IF NOT EXISTS idx_game_sessions_user_played
  ON game_sessions (user_id, played_at DESC);

-- Classements par thème / période (GET /leaderboard).
CREATE INDEX IF NOT EXISTS idx_game_sessions_theme_played
  ON game_sessions (theme, played_at DESC);
