-- 017 — public_id Cloudinary de l'avatar. Permet le « delete-before-replace » :
-- avant chaque nouvel upload, on supprime l'ancien asset Cloudinary (un seul
-- avatar par user, pas d'orphelins) et la suppression d'avatar cible le vrai
-- asset (les public_id sont timestampés : user_<id>_<ts>).
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_public_id TEXT;
