-- 007_transactions.sql
-- Creveton — CDC §4.3 « transactions »
-- Historique Mobile Money / wallet interne. Sert aussi de journal financier pour
-- la conformité (§3.6). Idempotence garantie par `reference` UNIQUE : un webhook
-- prestataire rejoué ne crée jamais de doublon (flag payant — cf. models/README).

CREATE TABLE IF NOT EXISTS transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  type          VARCHAR(20) NOT NULL
                  CHECK (type IN ('deposit', 'withdraw', 'payout', 'entry_fee', 'refund')),
  amount        DECIMAL(12, 2) NOT NULL,
  currency      VARCHAR(3)  NOT NULL DEFAULT 'XAF',

  -- NULL pour les mouvements purement internes au wallet.
  provider      VARCHAR(20) CHECK (provider IS NULL OR provider IN ('orange_money', 'mtn_momo', 'campay')),

  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'success', 'failed', 'reversed')),

  -- Idempotence : référence métier unique (clé fournie par le client / le prestataire).
  reference     VARCHAR(100) UNIQUE,
  external_id   VARCHAR(100),                                  -- identifiant côté prestataire (réf. Mobile Money)

  -- Rattachement optionnel (inscription tournoi, payout…).
  tournament_id UUID REFERENCES tournaments(id) ON DELETE SET NULL,

  metadata      JSONB       NOT NULL DEFAULT '{}'::jsonb,      -- payload prestataire, motif…

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Historique d'un utilisateur (fiche §3.2) et file financière (§3.5).
CREATE INDEX IF NOT EXISTS idx_transactions_user_created
  ON transactions (user_id, created_at DESC);
-- File d'attente / retries des transactions en attente (§3.5).
CREATE INDEX IF NOT EXISTS idx_transactions_status
  ON transactions (status, created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_provider
  ON transactions (provider);

-- updated_at tenu à jour automatiquement (suivi des transitions de statut).
DROP TRIGGER IF EXISTS set_transactions_updated_at ON transactions;
CREATE TRIGGER set_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
