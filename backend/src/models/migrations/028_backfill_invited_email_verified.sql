-- Rattrapage : membres d'équipe activés APRÈS la migration 026 (028).
--
-- La 026 avait raison sur le fond — un compte activé par lien d'invitation a
-- prouvé le contrôle de sa boîte, puisqu'il a fallu ouvrir cet email pour
-- choisir son mot de passe — mais elle n'a rattrapé que l'existant. Le chemin
-- COURANT (`teamService.acceptInvite`) continuait d'appeler `setPassword`, qui
-- ne touche pas au drapeau.
--
-- Conséquence observée en staging : un modérateur invité et actif restait
-- `email_verified = false` à vie, et le bouton « Réinitialiser le mot de passe »
-- de la console lui répondait « L'adresse de ce compte n'est pas vérifiée » —
-- un refus correct dans son principe, appliqué à quelqu'un qui avait justement
-- fait la preuve demandée.
--
-- Le code est corrigé (`userModel.activateFromInvite` pose mot de passe ET
-- drapeau dans la même requête) ; cette migration répare les comptes passés
-- entre les deux. Elle est idempotente et volontairement identique à celle de
-- la 026 : mêmes conditions, même prudence.
--
-- On ne touche QUE les invitations réellement acceptées. Une invitation encore
-- « pending » n'a rien prouvé du tout.
UPDATE users u
   SET email_verified = true
  FROM admin_invitations i
 WHERE lower(i.email) = lower(u.email)
   AND i.status = 'accepted'
   AND u.email IS NOT NULL
   AND u.email_verified = false
   AND u.deleted_at IS NULL;
