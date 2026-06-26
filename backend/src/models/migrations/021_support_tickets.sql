-- 021_support_tickets.sql — tickets de support joueur (console admin /support).
-- Remplace les mocks front (support.service.js) par une vraie persistance.
-- `player_id` = joueur à l'origine du ticket (CASCADE) ; `assigned_to` = membre
-- de l'équipe en charge (SET NULL si le compte admin part).
-- Idempotent (IF NOT EXISTS) — sûr à rejouer.

CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','resolved','closed')),
  priority VARCHAR(10) NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('urgent','normal','low')),
  type VARCHAR(20) NOT NULL DEFAULT 'other'
    CHECK (type IN ('account','question','bug','other')),
  subject VARCHAR(255) NOT NULL,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_player ON tickets(player_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON tickets(assigned_to);
