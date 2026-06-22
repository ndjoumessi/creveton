-- 013_users_timezone.sql
-- Creveton — fuseau horaire de préférence de l'utilisateur (console Paramètres §Compte).
-- Utilisé pour l'affichage des dates/heures côté admin ; défaut = Cameroun (UTC+1).

ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) NOT NULL DEFAULT 'Africa/Douala';
