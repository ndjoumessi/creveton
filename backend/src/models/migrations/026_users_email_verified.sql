-- Vérification de l'adresse email (026).
--
-- L'email était requis et unique à l'inscription, mais jamais VÉRIFIÉ : une
-- adresse mal saisie créait un compte dont la récupération de mot de passe
-- partait chez un inconnu. Cette colonne permet de réserver la récupération par
-- email aux adresses dont on a prouvé le contrôle.
--
-- DEFAULT false, y compris pour les comptes EXISTANTS : les marquer vrais
-- perpétuerait exactement le trou qu'on ferme. Ils gardent tous leurs accès
-- (rien ne bloque la connexion) — seule la récupération par email leur demande
-- de vérifier d'abord, ce qui se fait en deux gestes depuis le profil.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;

-- Les comptes d'équipe créés par invitation posent leur mot de passe via un lien
-- reçu SUR cette adresse : le contrôle de la boîte est donc déjà prouvé au
-- moment où le compte devient utilisable. Les marquer vérifiés évite de leur
-- redemander ce qu'ils viennent de faire.
UPDATE users u
   SET email_verified = true
  FROM admin_invitations i
 WHERE lower(i.email) = lower(u.email)
   AND i.status = 'accepted'
   AND u.email IS NOT NULL;
