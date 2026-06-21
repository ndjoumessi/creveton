-- 005_tournament_participants.sql
-- Creveton — CDC §4.3 « tournament_participants »
-- Table de jonction users ↔ tournaments (N:M) : inscription d'un joueur, son
-- score, son rang et son éventuel payout (déclenché à la validation des résultats).

CREATE TABLE IF NOT EXISTS tournament_participants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id)       ON DELETE CASCADE,

  score         INTEGER NOT NULL DEFAULT 0,
  rank          INTEGER,                                       -- classement final (NULL avant clôture)
  payout        INTEGER        NOT NULL DEFAULT 0,             -- gain FCFA versé au joueur

  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Un joueur ne s'inscrit qu'une fois par tournoi.
  UNIQUE (tournament_id, user_id)
);

-- Classement d'un tournoi (tri par score décroissant).
CREATE INDEX IF NOT EXISTS idx_tournament_participants_ranking
  ON tournament_participants (tournament_id, score DESC);

-- Tournois auxquels un joueur a participé (fiche utilisateur).
CREATE INDEX IF NOT EXISTS idx_tournament_participants_user
  ON tournament_participants (user_id);
