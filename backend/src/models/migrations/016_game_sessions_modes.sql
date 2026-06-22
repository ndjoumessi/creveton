-- 016_game_sessions_modes.sql
-- Ajoute les modes de jeu « blitz » (timer global 60 s) et « marathon »
-- (180 s, 20 questions mix + bonus thème) à la contrainte CHECK du mode.
-- Idempotent : on retombe la contrainte si elle existe puis on la recrée.

ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_mode_check;
ALTER TABLE game_sessions
  ADD CONSTRAINT game_sessions_mode_check
  CHECK (mode IN ('normal', 'tournament', 'challenge', 'blitz', 'marathon'));
