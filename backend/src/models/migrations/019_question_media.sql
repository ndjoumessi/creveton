-- 019_question_media.sql — support image pour les questions (upload admin Cloudinary).
-- `media_url` existe déjà depuis 002_questions.sql (URL publique, vue joueur).
-- On ajoute `media_public_id` : le public_id Cloudinary, nécessaire pour supprimer
-- l'asset (destroy signé) et pour le « delete-before-replace » (public_id timestampé).
-- Idempotent (IF NOT EXISTS) — sûr à rejouer.
ALTER TABLE questions ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS media_public_id TEXT;
