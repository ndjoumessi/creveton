-- 020_explanation_en.sql
-- Explication EN (bilingue) — colonne optionnelle, jamais NOT NULL (text_fr/
-- explanation FR restent la source). Remplie par l'auto-traduction IA et le
-- script de batch (translate-explanations-en.js).
--
-- ANTI-TRICHE : tout comme `explanation`, `explanation_en` n'est JAMAIS exposée
-- dans la vue joueur (toPlayerView) — elle ne transite que par /sessions/answer
-- et /sessions/submit (révélation post-réponse).

ALTER TABLE questions ADD COLUMN IF NOT EXISTS explanation_en TEXT;
