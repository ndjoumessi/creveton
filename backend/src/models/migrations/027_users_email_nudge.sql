-- Suivi des relances « confirme ton email » (027).
--
-- En base et non en Redis : le compteur doit survivre à un FLUSHDB, et il doit
-- être interrogeable (savoir combien de comptes ont épuisé leurs relances est
-- une question qu'on se posera). Deux colonnes plutôt qu'un timestamp seul :
-- l'espacement (7 jours) et le PLAFOND (3 relances à vie) sont deux règles
-- distinctes, et le plafond est ce qui sépare un rappel d'un harcèlement.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_nudged_at  TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_nudge_count SMALLINT NOT NULL DEFAULT 0;

-- Index partiel : la tâche ne cherche QUE des comptes non vérifiés, une fraction
-- de la table. Un index complet coûterait de l'écriture à chaque mise à jour de
-- profil pour un gain nul sur les 99 % de comptes vérifiés.
CREATE INDEX IF NOT EXISTS idx_users_email_nudge
  ON users (email_nudged_at)
  WHERE email_verified = false AND deleted_at IS NULL;
