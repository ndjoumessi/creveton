-- 006_challenges.sql
-- Creveton — CDC §4.3 « challenges »
-- Défi 1v1 entre deux joueurs (ou adversaire aléatoire). Les deux joueurs
-- répondent au même jeu de questions grâce à un `seed` partagé, ce qui garantit
-- l'équité sans rejouer le serveur (cf. src/models/README.md).

CREATE TABLE IF NOT EXISTS challenges (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opponent_id      UUID REFERENCES users(id) ON DELETE SET NULL,  -- NULL = matchmaking aléatoire en attente

  seed             VARCHAR(64),                                -- graine partagée → même set de questions
  stake            INTEGER        NOT NULL DEFAULT 0,          -- mise FCFA (>0 ⇒ flag payant, v2)

  -- Paramètres du défi (nécessaires pour rejouer le même set côté adversaire).
  theme            VARCHAR(20),
  level            VARCHAR(20),
  -- Set de questions FIGÉ : garantit un tirage identique aux deux joueurs même
  -- si le pool évolue entre la création et l'acceptation (spec §9 « set figé »).
  question_ids     UUID[] NOT NULL DEFAULT '{}',

  status           VARCHAR(20) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'accepted', 'active', 'completed',
                                       'declined', 'expired', 'cancelled')),

  score_challenger INTEGER,
  score_opponent   INTEGER,
  xp_challenger    INTEGER,                                    -- XP de session de chaque camp
  xp_opponent      INTEGER,                                    -- (sert au bonus +25% du gagnant)
  winner_id        UUID REFERENCES users(id) ON DELETE SET NULL,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  played_at        TIMESTAMPTZ                                 -- horodatage de fin de partie
);

-- Défis émis / reçus par un joueur (filtrés par statut côté app et console §3.4).
CREATE INDEX IF NOT EXISTS idx_challenges_challenger ON challenges (challenger_id, status);
CREATE INDEX IF NOT EXISTS idx_challenges_opponent   ON challenges (opponent_id, status);
