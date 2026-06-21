-- 011_app_settings.sql
-- Creveton — paramètres applicatifs persistés (console §Paramètres / CDC §3.5).
-- Feature flags éditables depuis l'admin (maintenance, inscriptions, delta sync,
-- mode démo). Le flag « tournois payants » reste géré par variable d'environnement
-- (verrouillé tant que la licence Ministère des Finances n'est pas obtenue — §3.6).

CREATE TABLE IF NOT EXISTS app_settings (
  key         VARCHAR(60) PRIMARY KEY,
  value       JSONB       NOT NULL,
  updated_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
