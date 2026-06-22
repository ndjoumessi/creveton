-- 015_game_sessions_streak.sql
-- Persiste la meilleure série (streak) d'une partie, déjà calculée côté serveur
-- (scoreService.computeSession → streak_max) mais jamais stockée jusqu'ici.
-- Permet d'afficher le « streak max » sur l'accueil mobile (dérivé de l'historique).

ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS streak_max INTEGER NOT NULL DEFAULT 0;
