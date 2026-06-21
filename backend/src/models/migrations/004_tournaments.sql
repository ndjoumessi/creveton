-- 004_tournaments.sql
-- Creveton — CDC §4.3 « tournaments »
-- Définition d'un tournoi. Les inscriptions/résultats vivent dans
-- tournament_participants (005). Mise payante derrière un feature flag (CDC §3.5,
-- mode gratuit forcé tant que la licence n'est pas obtenue — §3.6).

CREATE TABLE IF NOT EXISTS tournaments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(150) NOT NULL,

  type         VARCHAR(20) NOT NULL DEFAULT 'free'
                 CHECK (type IN ('free', 'flash', 'mini', 'grand', 'premium')),
  theme        VARCHAR(20),                                    -- NULL = thèmes mixtes

  entry_fee    DECIMAL(10, 2) NOT NULL DEFAULT 0,              -- mise FCFA (0 = gratuit)
  max_players  INTEGER     CHECK (max_players IS NULL OR max_players > 0),
  prize_pool   DECIMAL(12, 2) NOT NULL DEFAULT 0,              -- cagnotte FCFA

  status       VARCHAR(20) NOT NULL DEFAULT 'scheduled'
                 CHECK (status IN ('scheduled', 'open', 'running', 'closed', 'paid', 'cancelled')),

  starts_at    TIMESTAMPTZ,
  ends_at      TIMESTAMPTZ,

  created_by   UUID        REFERENCES users(id) ON DELETE SET NULL,  -- admin organisateur
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Suivi console : tournois programmés / en cours, tri par date (§3.4).
CREATE INDEX IF NOT EXISTS idx_tournaments_status_starts
  ON tournaments (status, starts_at);
