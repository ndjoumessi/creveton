-- 024_question_solutions_sync.sql
-- Endpoint POST /questions/solutions — synchronisation des solutions vers le cache
-- offline mobile (révélation de la bonne réponse + score local en mode normal HORS
-- LIGNE, cf. gameStore.computeLocalResult / QuizScreen reveal).
--
-- Aucune structure à créer : questions.correct_index existe depuis 002_questions.sql,
-- et explanation / explanation_en depuis 020_explanation_en.sql. Ce fichier documente
-- l'ajout de l'endpoint et pose un commentaire de colonne idempotent pour tracer le
-- nouvel usage « sync offline » de correct_index (qui reste absent de la vue joueur).
COMMENT ON COLUMN questions.correct_index IS 'Index 0-based de la bonne option. Jamais exposé au tirage/sync joueur (anti-triche) ; servi a la demande via POST /questions/solutions (cache offline mobile) et via /sessions/answer + /sessions/submit (scoring serveur).';
