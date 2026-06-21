# Product

## Register

product

## Users

La console d'administration **Creveton** sert les opérateurs internes de la plateforme
de quiz mobile (Cameroun, joueurs 12–30 ans) :

- **Aujourd'hui** : une petite équipe interne — fondateurs et modérateurs de contenu
  (1–5 personnes) — en usage quotidien intensif. Ils connaissent le produit ; ils
  veulent agir vite (modérer des questions, surveiller l'activité, gérer les joueurs).
- **Demain** : ouverture envisagée à des **partenaires / sponsors** sur des vues
  restreintes. L'architecture d'information et le système de rôles
  (`player · moderator · admin · super_admin`) doivent tenir cette montée en charge
  sans refonte.

Contexte d'usage : poste de travail (desktop), sessions de modération et de pilotage,
souvent en multitâche. La console consomme l'API backend REST + JWT (`../backend`).

## Product Purpose

Piloter la vie réelle de l'application mobile Creveton depuis une seule interface :
modération du contenu (questions), suivi des joueurs et de leur progression,
parties jouées, classements, tournois (MVP gratuit ; tournois payants désactivés),
et santé technique (API / DB / Redis / sync).

Le succès se mesure à la **rapidité de modération** (zéro question en attente),
à la **confiance dans les chiffres** (activité, classements, parties fiables et lisibles
en un coup d'œil) et à l'**absence d'erreurs irréversibles** (suspensions, suppressions
RGPD, changements de rôle toujours intentionnels).

## Brand Personality

**Chaleureux · camerounais · fiable.**

Identité vert foncé / or assumée, qui porte une fierté locale sans jamais sacrifier la
lisibilité d'un outil de travail. Le ton est posé et compétent — on est dans un cockpit,
pas dans un jeu — mais la couleur, les badges thématiques et les micro-détails rappellent
l'énergie ludique de l'app mobile qu'on administre. Personnalité avant l'esbroufe :
chaque ornement doit servir la lecture.

## Anti-references

- **Template admin générique gris** (AdminLTE, dashboards Bootstrap par défaut) : sans
  identité, tout se ressemble, rien ne hiérarchise.
- **Dashboard sur-gamifié** : confettis, jauges arc-en-ciel et badges partout qui noient
  la donnée. Le côté ludique reste un accent, pas la structure.
- **SaaS néon / crypto-casino** : dégradés violents, dark-mode tape-à-l'œil, densité
  illisible. Creveton est clair, calme, professionnel.
- **Mur de chiffres** : tables brutes sans hiérarchie, sans états vides, sans regroupement.

## Design Principles

1. **Fierté locale, lisibilité d'abord** — le vert/or et l'ancrage camerounais donnent
   l'identité ; ils ne passent jamais avant la clarté de lecture d'un outil de travail.
2. **Densité maîtrisée** — beaucoup d'information par écran, mais toujours scannable :
   hiérarchie typographique nette, regroupements, badges qui codent le sens.
3. **Garde-fous sur l'irréversible** — toute action destructrice ou sensible (suspendre,
   supprimer RGPD, changer un rôle, force sync) passe par une confirmation explicite.
4. **Prêt pour la montée en charge** — rôles et architecture d'information conçus pour
   accueillir partenaires/sponsors sur des vues restreintes sans refonte.
5. **États explicites** — chaque vue gère chargement (skeleton), vide (message utile) et
   erreur (message + reprise). Jamais d'écran blanc, jamais de zéro ambigu.

## Accessibility & Inclusion

Cible **WCAG 2.1 AA pragmatique** :

- Contraste AA sur texte et composants ; ne jamais coder une information **uniquement**
  par la couleur (les badges portent un libellé, pas qu'une teinte).
- Focus visible au clavier ; `Escape` ferme modales et drawers ; navigation clavier des
  actions principales.
- Interface en **français** (dates, libellés, états) — locale `fr` cohérente partout.
