-- 009_questions_similarity.sql
-- Creveton — détection de doublons multi-niveaux à l'import (CDC §3.3).
--
-- Objectif : passer d'une détection « texte exact » à une détection robuste :
--   Niveau 1 — hash exact (text_hash) : rejet immédiat des doublons stricts.
--   Niveau 2 — similarité trigramme (pg_trgm) : repérer les quasi-doublons
--              (« Quelle est la capitale du Cameroun ? » vs « capitale du Cameroun »).
--   Niveau 3 — même texte, options différentes : signalement (handled applicatif).
--
-- Idempotent : toutes les créations sont IF NOT EXISTS ; rejouable sans risque.

-- pgcrypto : digest()/encode() pour calculer le hash SHA-256 en base (backfill +
-- insertion). pg_trgm : similarity()/opérateur % pour le niveau 2.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Niveau 1 — colonne de hash du texte normalisé (lower + espaces compactés + trim).
-- Le hash est calculé côté base (digest) ET côté Node (questionService.hashText)
-- avec la MÊME normalisation, de sorte qu'une sonde JS retombe sur la même valeur.
ALTER TABLE questions ADD COLUMN IF NOT EXISTS text_hash VARCHAR(64);

-- Index du hash : lookup O(1) du doublon exact à l'insertion/import.
CREATE INDEX IF NOT EXISTS idx_questions_text_hash ON questions (text_hash);

-- Niveau 2 — index GIN trigramme sur text_fr : accélère l'opérateur de similarité
-- (text_fr % $1) et la fonction similarity() utilisés par la recherche de quasi-doublons.
CREATE INDEX IF NOT EXISTS idx_questions_text_trgm
  ON questions USING gin (text_fr gin_trgm_ops);

-- Backfill du hash pour l'existant. Normalisation IDENTIQUE à questionService :
--   lower(trim(collapse_spaces(text_fr))). On ne touche pas updated_at (donc pas
--   de DDL trigger ici) : ALTER ... ADD COLUMN + UPDATE en migration ne déclenche
--   pas le delta sync joueur car text_hash n'est pas dans la vue joueur.
UPDATE questions
   SET text_hash = encode(
         digest(lower(btrim(regexp_replace(text_fr, '\s+', ' ', 'g'))), 'sha256'),
         'hex')
 WHERE text_hash IS NULL;
