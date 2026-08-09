# Déploiement — Staging

État réel des **deux** pipelines de déploiement staging (backend et admin). Ils
sont **indépendants** : deux services Railway distincts, deux mécanismes de
déclenchement différents. Lire ceci avant de toucher à `deploy-staging.yml` ou
aux réglages Railway.

Projet Railway : `fad03484-e491-4b46-8ae1-477b8e96d672`.

| Surface | Service Railway | URL staging | Qui déploie |
|---|---|---|---|
| **Backend** (API) | `creveton` | https://creveton-staging.up.railway.app | **GitHub Actions** (`deploy-staging.yml`) |
| **Admin** (console React) | `creveton-admin-staging` | https://creveton-admin-staging.up.railway.app | **Auto-deploy natif Railway** |

## Backend — via GitHub Actions (gate CI)

Fichier : **`.github/workflows/deploy-staging.yml`**.

```
push main → CI (ci.yml) → si CI verte → workflow_run → deploy-staging.yml
          → railway up --service creveton --ci → service `creveton`
```

- Déclencheur : `workflow_run` sur le workflow **CI**, branche `main`, `types: [completed]`,
  gardé par `if: github.event.workflow_run.conclusion == 'success'`. **On ne déploie
  donc jamais un backend dont la CI a échoué.**
- Déclenchement **manuel** possible : `workflow_dispatch` (onglet Actions → « Deploy
  Staging » → Run workflow, ou `gh workflow run deploy-staging.yml`). La garde `if`
  laisse passer `workflow_dispatch` (pas de `workflow_run` associé).
- Déploiement : **CLI Railway officiel épinglé** `@railway/cli@5.23.3`, commande
  `railway up --service "$RAILWAY_SERVICE" --ci`. Le `--ci` streame les logs de build
  puis sort en **échec si le build casse** (pas de faux positif silencieux).
- Auth : secret repo **`RAILWAY_TOKEN`** (token de projet, scope l'environnement).
  Service configurable via la variable repo `RAILWAY_SERVICE` (défaut `creveton`).
- **Auto-deploy natif Railway sur `creveton` : DÉSACTIVÉ** (Railway → service `creveton`
  → Settings → Source → « Auto deploy is disabled »). C'est ce workflow, et lui seul,
  qui déploie le backend. Cette désactivation est **volontaire** : sans elle, le backend
  se déploierait deux fois par push (natif + workflow).

### Migrations — appliquées au démarrage du conteneur

Le `Dockerfile` lance `node src/models/migrate.js && node src/server.js`.

Ce n'était **pas** le cas avant le 09-08-2026 : l'image démarrait le serveur seul, et
aucune migration n'était jamais appliquée au déploiement. Un fichier SQL poussé dans le
dépôt n'avait donc aucun effet sur staging tant que quelqu'un ne lançait pas `npm run
migrate` à la main — ce que rien ne rappelait. Symptôme observé : la migration `028`
déployée, puis la console continuant pendant plusieurs minutes de refuser une
réinitialisation de mot de passe pour un motif que cette migration corrigeait justement.

Deux propriétés à connaître :

- **`&&` et non `;`** — si une migration échoue, le conteneur ne démarre pas. Un serveur
  qui tourne sur un schéma qu'il ne comprend pas est pire qu'un déploiement rouge : le
  rouge se voit, la corruption silencieuse non. Railway conservera l'ancien déploiement.
- **Verrou consultatif Postgres** (`pg_advisory_lock`, `migrate.js`) — deux instances qui
  démarrent ensemble ne rejouent pas les mêmes fichiers. `numReplicas: 1` aujourd'hui,
  mais la garantie ne doit pas dépendre d'un réglage de tableau de bord.

`migrate()` reste idempotent (suivi par nom de fichier dans `schema_migrations`, une
transaction par migration) : redémarrer un conteneur ne rejoue rien.

### Historique / pourquoi cette config

Le workflow utilisait l'action tierce `bervProject/railway-deploy@main` (non épinglée),
cassée par une release amont : `railway: not found`, `railway_token` rejeté. Résultat :
**échec silencieux depuis le 23 juin**, puis workflow désactivé manuellement. Réparé au
commit **`226b54b`** (CLI officiel épinglé + `--ci` + `workflow_dispatch` + réactivation),
vérifié en live (« Deploy complete »).

## Admin — via auto-deploy natif Railway

- `push main` → Railway (intégration GitHub native du service `creveton-admin-staging`)
  build `creveton-admin/` et déploie. **Aucun** workflow GitHub Actions custom pour l'admin.
- **`Wait for CI` natif Railway est ACTIF** sur ce service : Railway attend que les checks
  CI GitHub passent avant de déployer. C'est un réglage **côté Railway**, distinct de la
  garde `if:` du workflow backend.

## ⚠️ Point de vigilance — le toggle natif « Wait for CI »

Le service backend `creveton` avait déjà, **avant** toute intervention, le toggle natif
Railway **« Wait for CI » activé**. C'est ce qui masquait la panne : même avec le workflow
`deploy-staging.yml` en échec, Railway déployait quand même le backend (après CI verte),
donc rien ne semblait cassé côté utilisateur.

**Conséquence à retenir :** si quelqu'un **réactive un jour l'auto-deploy natif du backend
`creveton`**, il faut **aussi** vérifier l'état de « Wait for CI » sur ce service —
sinon on retombe dans un **double déploiement** (natif Railway **+** workflow GitHub
Actions), potentiellement silencieux. La règle : **un seul mécanisme actif par service.**

- Backend `creveton` : auto-deploy natif **OFF** → seul le workflow déploie.
- Admin `creveton-admin-staging` : auto-deploy natif **ON** (Wait for CI) → pas de workflow.

## Vérifier qu'un seul déploiement backend se déclenche

Sur un push `main` qui touche le backend (ou n'importe quel push, le workflow se déclenche
quand même) :

1. **GitHub Actions** : un run `CI`, puis **exactement un** run `Deploy Staging`
   (`gh run list --workflow deploy-staging.yml --limit 3`). Le run `Deploy Staging`
   imprime une **URL de build Railway unique** dans son log (`railway up` → « Build Logs: … »).
2. **Railway** : l'historique de déploiement du service `creveton` doit montrer **un seul**
   déploiement, tracé « via CLI » (le `railway up` du workflow), **aucun** déploiement
   « via GitHub » (puisque l'auto-deploy natif est OFF). Vérif rapide en local :
   `railway deployments --service creveton` (nécessite `railway login`).

Si l'historique Railway montre **deux** déploiements pour un même commit (un « via GitHub »
+ un « via CLI »), c'est que l'auto-deploy natif du backend a été réactivé → voir le point
de vigilance ci-dessus.

## Backlog / known issues (pré-release)

Points fonctionnels à traiter **avant release publique**, non liés au déploiement lui-même
mais suivis ici faute de doc release dédiée :

- **[#2](https://github.com/ndjoumessi/creveton/issues/2)** — garde `MIN_PLAYERS_TO_START`
  manquante dans `liveTournamentService.start()` (`POST /tournaments/:id/start`). Le chemin
  admin (`POST /admin/tournaments/:id/start`) applique bien le minimum (≥ 2 joueurs), mais le
  chemin temps réel peut démarrer une manche avec 0/1 inscrit. La constante elle-même est
  déjà correcte (`= 2`) ; seul le garde sur ce chemin manque.
