-- 014_users_push_token.sql
-- Creveton — jeton de notification push par appareil.
-- Expo Push Token (format « ExponentPushToken[...] »), mis à jour à chaque
-- enregistrement de l'app (PATCH /users/me). Sert aux notifications ciblées
-- (défi reçu, tournoi qui démarre, level up, résultat de défi — spec §14).

ALTER TABLE users ADD COLUMN IF NOT EXISTS push_token TEXT;

COMMENT ON COLUMN users.push_token IS
  'Expo Push Token (format ExponentPushToken[...]) — mis à jour à chaque enregistrement app';
