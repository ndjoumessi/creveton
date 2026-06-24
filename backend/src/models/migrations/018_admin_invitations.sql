-- 018_admin_invitations.sql
-- Journal d'audit des invitations équipe (console §Équipe). Complète — sans le
-- remplacer — le flux existant (token UUID en Redis, TTL 72h). Une ligne est
-- écrite à chaque invitation et passée à `accepted` lors de l'acceptation, ce qui
-- permet de LISTER les invitations en attente (impossible depuis Redis seul) et
-- de tracer le statut d'envoi de l'email (Resend).

CREATE TABLE IF NOT EXISTS admin_invitations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        VARCHAR(255) NOT NULL,
  name         VARCHAR(255),
  role         VARCHAR(50)  NOT NULL CHECK (role IN ('moderator', 'admin', 'super_admin')),
  invited_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  invite_token VARCHAR(255) NOT NULL,
  status       VARCHAR(50)  DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  email_sent   BOOLEAN      DEFAULT false,
  email_error  TEXT,
  expires_at   TIMESTAMPTZ  NOT NULL DEFAULT now() + interval '72 hours',
  accepted_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_invitations_token  ON admin_invitations (invite_token);
CREATE INDEX IF NOT EXISTS idx_admin_invitations_email  ON admin_invitations (email);
CREATE INDEX IF NOT EXISTS idx_admin_invitations_status ON admin_invitations (status);
