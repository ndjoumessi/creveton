-- 001_users.sql
-- Creveton — CDC §4.1 « Table users »
-- Comptes joueurs, modérateurs et administrateurs (app mobile + console admin).

-- gen_random_uuid() est natif depuis PostgreSQL 13 ; pgcrypto garantit la
-- disponibilité sur les versions antérieures et les fournisseurs managés.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Fonction de trigger partagée : met à jour updated_at à chaque modification.
-- Réutilisée par les tables soumises au delta sync / à l'historique (questions,
-- transactions). Définie ici car 001 est la première migration appliquée.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(100) NOT NULL,                       -- nom complet
  email           VARCHAR(255) UNIQUE,                         -- sert à la connexion (optionnel)
  phone           VARCHAR(20)  UNIQUE NOT NULL,                -- +237… — chiffré au repos (AES-256) côté app
  phone_verified  BOOLEAN      NOT NULL DEFAULT false,         -- OTP SMS validé
  password_hash   TEXT,                                        -- bcrypt (nullable : auth principale par OTP)

  ville           VARCHAR(100),
  age             SMALLINT     CHECK (age IS NULL OR age BETWEEN 1 AND 120),
  sexe            VARCHAR(1)   CHECK (sexe IS NULL OR sexe IN ('H', 'F', 'N')),
  lang            VARCHAR(2)   NOT NULL DEFAULT 'fr' CHECK (lang IN ('fr', 'en')),

  total_xp        INTEGER      NOT NULL DEFAULT 0,
  level           SMALLINT     NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 5),  -- calculé dynamiquement (1–5)
  role            VARCHAR(20)  NOT NULL DEFAULT 'player'
                    CHECK (role IN ('player', 'moderator', 'admin', 'super_admin')),

  wallet_balance  DECIMAL(10, 2) NOT NULL DEFAULT 0,           -- solde FCFA (XAF)

  referral_code   VARCHAR(20)  UNIQUE,                         -- code de parrainage unique
  referred_by     UUID         REFERENCES users(id) ON DELETE SET NULL,  -- §3.2 parrainage

  -- Modération de compte (§3.2 suspension / bannissement).
  status          VARCHAR(20)  NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'suspended', 'banned')),

  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),         -- inscription
  last_active_at  TIMESTAMPTZ,                                 -- dernière activité (churn)
  deleted_at      TIMESTAMPTZ                                  -- soft delete RGPD (§3.2 — purge planifiée)
);

-- Recherche / filtres console admin (§3.2) et requêtes de parrainage.
CREATE INDEX IF NOT EXISTS idx_users_role          ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_referred_by   ON users (referred_by);
CREATE INDEX IF NOT EXISTS idx_users_last_active_at ON users (last_active_at);
-- N'indexer que les comptes vivants (la majorité des requêtes excluent les supprimés).
CREATE INDEX IF NOT EXISTS idx_users_active        ON users (created_at) WHERE deleted_at IS NULL;
