-- 022_ticket_messages.sql — fil de messages d'un ticket de support (021_*).
-- `ticket_id` CASCADE (les messages disparaissent avec le ticket) ; `sender_id`
-- SET NULL (on conserve le message si l'auteur part) ; `sender_role` distingue
-- joueur / admin / système (messages automatiques d'assignation, etc.).
-- Idempotent (IF NOT EXISTS) — sûr à rejouer.

CREATE TABLE IF NOT EXISTS ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
  sender_role VARCHAR(10) NOT NULL DEFAULT 'player'
    CHECK (sender_role IN ('player','admin','system')),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id);
