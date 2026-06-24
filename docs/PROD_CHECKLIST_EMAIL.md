# Checklist mise en production — Intégration email Resend

_Dernière mise à jour : 25 juin 2026_

## Contexte

L'intégration Resend est live sur staging (creveton-staging.up.railway.app).
Avant de passer en production, deux actions sont requises.

## 1. Vérifier le domaine creveton.cm sur Resend

### Pourquoi

Actuellement EMAIL_FROM=Creveton <onboarding@resend.dev> (domaine de test Resend).
En production, les emails doivent partir de noreply@creveton.cm.

### Étapes

1. Aller sur https://resend.com/domains
2. Cliquer "Add Domain" → entrer creveton.cm
3. Ajouter les enregistrements DNS fournis par Resend (SPF, DKIM, DMARC) chez ton registrar
4. Cliquer "Verify" dans Resend — attendre propagation DNS (5 min à 48h)
5. Une fois vérifié, mettre à jour la variable Railway :
   railway variables set EMAIL_FROM="Creveton <noreply@creveton.cm>" --service creveton --environment production
6. Redéployer le service backend sur production

### Vérification

Envoyer une invitation test depuis l'admin console de production et vérifier :
- L'email arrive dans la boîte
- L'expéditeur affiche "Creveton <noreply@creveton.cm>"
- Pas de marquage spam

---

## 2. Migration admin_invitations sur la base de production

### Pourquoi

La table admin_invitations (migration 018) existe sur staging mais pas encore sur la DB de production.
Sans elle, POST /admin/team/invite retourne une erreur 500.

### Étapes

1. Activer le proxy TCP sur la DB Postgres de production (Railway dashboard → production → Postgres → Networking → TCP Proxy)
2. Récupérer le mot de passe :
   railway variables --service Postgres --environment production --json | python3 -c "import sys,json;v=json.load(sys.stdin);print(v.get('PGPASSWORD',v.get('POSTGRES_PASSWORD','')))"
3. Lancer la migration :
   DATABASE_URL="postgresql://postgres:<PASSWORD>@<HOST>:<PORT>/railway" npm run migrate
4. Vérifier :
   DATABASE_URL="postgresql://postgres:<PASSWORD>@<HOST>:<PORT>/railway" psql -c "\d admin_invitations"
5. Désactiver immédiatement le proxy TCP

### Vérification

   DATABASE_URL="..." psql -c "SELECT COUNT(*) FROM admin_invitations;"
Doit retourner 0 (table vide, prête).

---

## 3. Variables d'environnement Railway — production

| Variable | Valeur |
|---|---|
| RESEND_API_KEY | Clé Resend (depuis resend.com/api-keys) |
| EMAIL_FROM | Creveton <noreply@creveton.cm> (après vérification domaine) |
| APP_DEEP_LINK_URL | https://creveton.cm |
| ADMIN_URL | https://creveton-admin.up.railway.app (ou domaine custom) |

---

## 4. Smoke test post-déploiement

1. Se connecter sur l'admin console de production (nelson@creveton.cm)
2. Aller dans Équipe → Inviter un membre
3. Envoyer une invitation à une adresse réelle
4. Vérifier : email reçu, lien d'acceptation fonctionnel, row dans admin_invitations
5. Tester le referral : POST /api/v1/users/me/referral/invite depuis l'app mobile

---

## 5. Rotation du secret Cloudinary en production

### Contexte

Le secret Cloudinary a été rotaté sur staging (25 juin 2026).
La production doit recevoir le même nouveau secret.

### Étapes

1. Récupérer le nouveau CLOUDINARY_API_SECRET depuis backend/.env local (déjà rotaté)
2. Mettre à jour Railway production :
   railway link --project creveton-staging --environment production --service creveton
   railway variable set "CLOUDINARY_API_SECRET=<nouveau_secret>"
   railway redeploy --service creveton --environment production
   railway unlink
3. Vérifier la rotation (test signé — le DELETE seul ne suffit pas) :
   # Ping Admin API Cloudinary directement
   curl -s "https://api.cloudinary.com/v1_1/<cloud_name>/resources/image?max_results=1" \
     -u "<api_key>:<nouveau_secret>" | python3 -c "import sys,json;d=json.load(sys.stdin);print('OK' if 'resources' in d else 'FAIL: '+str(d))"
   # → doit afficher OK

### Variables concernées

| Variable | Action |
|---|---|
| CLOUDINARY_API_SECRET | Mettre à jour avec la nouvelle valeur (même que staging) |
| CLOUDINARY_API_KEY | Inchangé |
| CLOUDINARY_CLOUD_NAME | Inchangé (dbxby82nw) |
| CLOUDINARY_UPLOAD_PRESET | Inchangé (creveton_avatar) |

---

## Statut

| Étape | Staging | Production |
|---|---|---|
| Resend installé + emailService | ✅ | ✅ (déployé) |
| Migration 018_admin_invitations | ✅ | ⬜ À faire |
| EMAIL_FROM domaine vérifié | ⬜ onboarding@resend.dev | ⬜ À faire |
| Variables Railway configurées | ✅ | ⬜ À faire |
| Smoke test | ✅ | ⬜ À faire |
| Cloudinary secret rotaté | ✅ (staging, 25 juin 2026) | ⬜ À faire |
