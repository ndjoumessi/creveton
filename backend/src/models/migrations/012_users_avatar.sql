-- 012 — Avatar utilisateur : URL relative vers le fichier servi sous /uploads/avatars.
-- Le client envoie une image déjà recadrée/redimensionnée (≤256px, WebP/JPEG/PNG) ;
-- le serveur valide (mime, taille) puis écrit le fichier. Pas de transformation côté serveur.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
