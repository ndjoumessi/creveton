---
name: Creveton Admin
description: Console d'administration du quiz mobile Creveton — cockpit émeraude, or rare, dense et lisible.
colors:
  green900: "#0b2e1a"
  green700: "#1a5230"
  green500: "#2a8a4f"
  green300: "#5eca84"
  gold: "#d4a017"
  gold-light: "#e8b830"
  bg: "#f0f4f0"
  surface: "#ffffff"
  border: "#e5e7eb"
  border-green: "#d6e6db"
  text: "#374151"
  ink: "#0b2e1a"
  muted: "#6b7280"
  red: "#e74c3c"
typography:
  display:
    fontFamily: "Outfit, system-ui, sans-serif"
    fontSize: "36px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.5px"
  headline:
    fontFamily: "Outfit, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.3px"
  title:
    fontFamily: "Outfit, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.5px"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  pill: "999px"
spacing:
  xs: "7px"
  sm: "12px"
  md: "20px"
  lg: "32px"
components:
  button-primary:
    backgroundColor: "{colors.green900}"
    textColor: "{colors.gold}"
    rounded: "{rounded.sm}"
    padding: "9px 15px"
  button-primary-hover:
    backgroundColor: "#143d23"
    textColor: "{colors.gold}"
  button-success:
    backgroundColor: "{colors.green500}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "9px 15px"
  button-danger:
    backgroundColor: "{colors.red}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "9px 15px"
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.green900}"
    rounded: "{rounded.sm}"
    padding: "9px 15px"
  button-gold:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.green900}"
    rounded: "{rounded.sm}"
    padding: "9px 15px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "20px 22px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
  badge:
    rounded: "7px"
    padding: "3px 10px"
  install-banner:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "8px 8px 8px 18px"
---

# Design System: Creveton Admin

## 1. Overview

**Creative North Star: "Le Cockpit Émeraude"**

Creveton Admin est une salle de contrôle. Les murs sont en vert nuit (`#0b2e1a`), la
donnée est nette et posée sous les yeux de l'opérateur, et l'or (`#d4a017`) n'apparaît
que là où ça compte vraiment : un CTA principal, un podium, une médaille, l'item de
navigation actif. C'est un outil de travail pour modérer du contenu et piloter une app
de quiz — calme, dense, sous contrôle — pas un tableau de bord ludique. La fierté
camerounaise vit dans le couple vert/or ; elle ne passe jamais avant la lisibilité.

Le système est **dense mais scannable**. Beaucoup d'information par écran (KPI, tables,
listes, drawers), mais une hiérarchie typographique franche — Outfit pour tout ce qui
structure (titres, chiffres, libellés de table), Space Grotesk pour le corps — tient le
regard. Les surfaces sont plates au repos, posées sur un fond gris très clair légèrement
teinté vert (`#f0f4f0`), délimitées par une bordure d'1px (`#e5e7eb`) et une ombre quasi invisible.
La profondeur est réservée à ce qui flotte vraiment : modales et drawers.

Ce système rejette explicitement le **template admin gris générique** (rien ne
hiérarchise), le **dashboard sur-gamifié** (confettis et jauges arc-en-ciel qui noient
la donnée), le **SaaS néon / crypto-casino** (dégradés violents, dark-mode tape-à-l'œil)
et le **mur de chiffres** (tables brutes sans états vides ni regroupement).

**Key Characteristics:**
- Vert profond comme structure, or comme signal rare de valeur et d'action.
- Surfaces plates et bordées ; profondeur réservée aux couches flottantes.
- Outfit structure, Space Grotesk lit ; couleur fonctionnelle, jamais décorative.
- Chaque badge porte un libellé, pas qu'une teinte. La couleur ne code jamais seule.
- Tout état est explicite : skeleton au chargement, message à vide, message à l'erreur.

## 2. Colors

Une charte à deux voix — un vert profond qui porte la structure, un or rare qui signale
la valeur — posée sur des neutres modernes : ardoise froide pour le texte, légèrement
teintés vert pour les fonds.

### Primary
- **Vert Nuit** (`#0b2e1a`, `green900` / `ink`) : la couleur d'autorité. Fond de la
  sidebar, fond des CTA primaires, couleur de tous les titres. C'est le « mur » du cockpit.
- **Vert Forêt** (`#1a5230`, `green700`) : état actif de la navigation, liens de carte,
  scores mis en avant. Le vert qui « parle » dans le contenu.
- **Vert Émeraude** (`#2a8a4f`, `green500`) : la couleur d'action positive — boutons de
  succès (Approuver, Démarrer), focus des champs, points d'état « opérationnel »,
  remplissage des barres de progression.
- **Vert Tendre** (`#5eca84`, `green300`) : accents clairs — titres de section dans la
  sidebar, illustrations d'état vide, fin des dégradés de progression.

### Secondary
- **Or Creveton** (`#d4a017`, `gold`) : le signal rare. Logo, texte des CTA primaires,
  médaille et bordure du podium d'or, item de navigation actif. Sa rareté fait sa valeur.
- **Or Clair** (`#e8b830`, `gold-light`) : uniquement comme fin de dégradé sur le logo et
  les CTA dorés. Jamais seul.

### Neutral
- **Texte** (`#374151`, `text`) : corps de texte, valeurs de table.
- **Encre** (`#0b2e1a`, `ink`) : titres (identique au Vert Nuit — l'encre EST le vert).
- **Sourdine** (`#6b7280`, `muted`) : labels secondaires, sous-titres, méta, placeholders.
- **Fond** (`#f0f4f0`, `bg`) : fond applicatif sous toutes les surfaces — gris très clair
  légèrement teinté vert (la « voix » du cockpit jusque dans le neutre).
- **Bordure verte** (`#d6e6db`, `border-green`) : variante teintée vert de la bordure,
  pour les séparations qui veulent rester dans la charte (cartes douces, bandeau d'install).
- **Surface** (`#ffffff`, `surface`) : cartes, tables, modales, champs.
- **Bordure** (`#e5e7eb`, `border`) : toutes les séparations — 1px, jamais plus.

### Tertiary (badges fonctionnels)
Les badges de thème et de statut portent leur propre couple bg/fg pastel (violet Culture,
bleu Géographie, orange Histoire, etc.) défini dans `theme.js`. Ce sont des **codes**, pas
des décorations : chaque badge associe toujours teinte **et** libellé.

### Named Rules
**La Règle de l'Or Rare.** L'or ne couvre jamais plus de ~10 % d'un écran. Réservé au
CTA primaire, à la navigation active, au logo et aux récompenses (podium, médailles). Le
diluer, c'est tuer le signal. Sa rareté est le sujet.

**La Règle du Sens Doublé.** Une information n'est jamais codée par la seule couleur. Un
statut, un thème, une réussite portent toujours un libellé ou une icône en plus de la
teinte (contrainte WCAG AA, daltonisme).

## 3. Typography

**Display Font:** Outfit (avec `system-ui, sans-serif`)
**Body Font:** Space Grotesk (avec `system-ui, sans-serif`)

**Character:** Outfit est géométrique, confiant, légèrement condensé aux gros poids — il
porte les chiffres et les titres avec autorité. Space Grotesk apporte une lisibilité un
peu technique au corps, cohérente avec un outil de pilotage. Le contraste structure/corps
est net : si c'est un nombre, un titre ou un en-tête, c'est de l'Outfit.

### Hierarchy
- **Display** (Outfit 700, 36px, line-height 1, -0.5px) : grandes valeurs KPI. La donnée
  qu'on lit de loin.
- **Headline** (Outfit 700, 24px, -0.3px) : titres de page (`.page-title`).
- **Title** (Outfit 600, 15px) : titres de carte (`.card-title`), noms (joueurs, tournois).
- **Body** (Space Grotesk 400, 14px, line-height 1.5) : corps, cellules de table, valeurs.
- **Label** (Space Grotesk 600, 11px, +0.5px, MAJUSCULES) : en-têtes de colonnes de table,
  titres de section de sidebar (10px, +1.4px). Le petit texte qui catégorise.

### Named Rules
**La Règle Outfit-pour-les-Chiffres.** Tout nombre qui compte (KPI, score, compteur,
rang) est en Outfit, poids ≥ 700. Les chiffres sont les héros d'un cockpit ; ils ne
s'affichent jamais dans la fonte de corps.

## 4. Elevation

Système **plat par défaut, tonal d'abord**. La profondeur n'est pas un décor : elle ne
sert qu'à distinguer ce qui flotte réellement de ce qui est posé. Les cartes, KPI et
tables vivent à plat sur le fond gris, séparés par une bordure d'1px et une ombre si
discrète qu'on la perçoit à peine. Seules les couches véritablement superposées —
modales, drawers — reçoivent une vraie ombre portée.

### Shadow Vocabulary
- **Repos** (`box-shadow: 0 1px 3px rgba(0,0,0,0.08)`) : cartes, KPI, podium, bandeaux de
  stats. Quasi imperceptible — suggère la surface, pas l'élévation.
- **Flottant** (`box-shadow: 0 10px 30px rgba(16,24,40,0.12)`) : modales et drawers
  uniquement. La seule vraie ombre du système.
- **Lueur d'accent** (`box-shadow: 0 2px 8px rgba(212,160,23,0.35)`) : exclusivement sous
  le logo doré. La seule ombre colorée autorisée.

### Named Rules
**La Règle du Plat-par-Défaut.** Une surface de contenu est plate, bordée d'1px. Si tu
ajoutes une ombre marquée à une carte ou une table, tu as tort : l'ombre lourde est
réservée à ce qui se superpose réellement (overlay), jamais à ce qui est dans le flux.

## 5. Components

### Buttons
- **Shape:** coins doucement arrondis (8px ; `.btn-sm` garde 8px). Hauteur compacte
  (padding `9px 15px`), Outfit 600 à 13.5px.
- **Primary** (`.btn-primary`) : fond Vert Nuit (`#0b2e1a`), texte Or. Le CTA qui engage.
- **Hover / Focus:** primary fonce vers `#143d23` ; transition `all 0.15s`. Les champs
  reçoivent un halo `0 0 0 3px rgba(42,138,79,0.12)` + bordure émeraude au focus.
- **Success** (`.btn-success`) : émeraude plein, texte blanc — Approuver, Démarrer.
- **Danger** (`.btn-danger`) : rouge plein (`#e74c3c`), texte blanc — actions destructrices.
- **Ghost** (`.btn-ghost`) : transparent, contour Vert Nuit — action secondaire.
- **Gold** (`.btn-gold`) : dégradé or, texte Vert Nuit — réservé login / premium.
- **Icon buttons** (`.icon-btn` 36px, `.icon-action` 32px) : carrés arrondis pour les
  actions de ligne ; `.icon-action.danger` vire au rouge au survol seulement.

### Chips & Badges
- **Badge** (`.badge`) : pilule douce (7px), 12px gras, toujours teinte pastel **+
  libellé**. Statuts (question/tournoi/transaction/user) et thèmes ont chacun leur couple
  bg/fg dans `theme.js`.
- **Chip** (`.chip`) : fond vert très clair (`#ecfdf3`), texte Vert Forêt — tags et
  filtres actifs, avec croix de retrait.

### Cards / Containers
- **Corner Style:** 12px (`--radius`) ; modales 16px, podium 14px.
- **Background:** Surface blanche sur fond `#f0f4f0`.
- **Shadow Strategy:** ombre Repos uniquement (cf. Elevation). Plat par défaut.
- **Border:** 1px `#e5e7eb`, systématique.
- **Internal Padding:** `20px 22px` (`.card-pad`).

### Inputs / Fields
- **Style:** trait 1px `#e5e7eb`, fond blanc, rayon 8px, padding `10px 12px`.
- **Focus:** bordure émeraude (`#2a8a4f`) + halo `0 0 0 3px rgba(42,138,79,0.12)`. Jamais
  de `outline` par défaut supprimé sans ce remplacement visible.
- **Error:** message `.field-error` rouge 12px sous le champ.
- **Search:** champ avec icône en absolu à gauche (padding-left 38px).

### Navigation
- **Style:** sidebar fixe 240px, fond Vert Nuit. Sections coiffées d'un label Vert Tendre
  10px en MAJUSCULES espacées (`VUE GÉNÉRALE`, `CONTENU`, `UTILISATEURS`, `PARAMÈTRES`).
- **Item:** 70 % blanc au repos ; survol éclaircit le fond. **Actif:** fond Vert Forêt,
  texte + icône **Or**, liseré gauche or de 3px. C'est le seul or « permanent » de l'écran.
- **Responsive:** sous 1280px la sidebar se réduit à 72px (icônes seules) ; sous 1100px
  les grilles passent en colonne unique.

### Podium (composant signature)
Classement à trois marches alignées en bas (`align-items: end`), la 1ʳᵉ légèrement plus
large. Médailles circulaires en dégradé — or (`#d4a017→#e8b830`), argent
(`#9aa3ad→#c4ccd4`), bronze (`#b27a44→#d09a63`) — et la carte d'or prend un fond crème
(`#fffbe9→#fff`) et une bordure dorée. C'est l'endroit où l'app de quiz « respire » dans
l'admin.

### Install Banner (PWA)
Bandeau d'installation discret (`.install-banner`, composant `InstallPrompt`) : l'admin
est une **PWA installable**, et ce bandeau n'apparaît que lorsque le navigateur émet
`beforeinstallprompt` — jamais si l'utilisateur l'a déjà masqué ou si l'app tourne déjà en
standalone (installée).
- **Forme:** pilule flottante (`--radius-pill`), Surface blanche, bordure verte douce 1px
  (`--border-green`), ombre `--shadow-md`. C'est une couche qui **flotte** : l'ombre y est
  donc justifiée (cf. Elevation, profondeur réservée à ce qui flotte).
- **Position:** `fixed`, ancrée en **bas-centre** de l'écran (`bottom: 20px`), au-dessus du
  contenu — présence offerte, jamais imposée ; n'interrompt aucune tâche.
- **Contenu:** icône `download` + libellé « Installer Creveton Admin comme application »,
  CTA Or « Installer » (`.install-banner__cta` — action primaire, l'or rare est ici à sa
  place), puis croix « Ne plus afficher » (`.install-banner__close`, ghost discret).
- **Sens doublé:** l'action porte icône **et** libellé explicite ; le CTA Or reste minuscule
  (une seule pilule), conforme à La Règle de l'Or Rare.
- **Persistance:** « Installer » accepté ou croix → masqué **définitivement**
  (`localStorage`), y compris après rafraîchissement et sur chaque nouvel événement.

## 6. Do's and Don'ts

### Do:
- **Do** réserver l'or au CTA primaire, à la nav active, au logo et aux récompenses —
  ≤ 10 % de l'écran (La Règle de l'Or Rare).
- **Do** mettre tout chiffre important en Outfit ≥ 700 (KPI, score, rang, compteur).
- **Do** garder les cartes et tables plates : bordure 1px + ombre Repos, rien de plus.
- **Do** doubler toute couleur signifiante d'un libellé ou d'une icône (statut, thème) —
  contraste AA, daltonisme.
- **Do** fournir les trois états sur chaque vue : skeleton (`.skeleton`/`.skel-row`) au
  chargement, `.empty` à vide, message + reprise à l'erreur.
- **Do** confirmer explicitement toute action destructrice (suspendre, supprimer RGPD,
  changer un rôle, force sync) — bouton `.btn-danger` + modale de confirmation.
- **Do** laisser `Escape` fermer modales et drawers, et garder un focus visible au clavier.

### Don't:
- **Don't** noyer l'écran sous l'or ou les dégradés : pas de **dashboard sur-gamifié**
  (confettis, jauges arc-en-ciel) ni de **SaaS néon / crypto-casino** (dark-mode tape-à-l'œil).
- **Don't** retomber dans le **template admin gris générique** où rien ne hiérarchise —
  la hiérarchie typographique Outfit/Space Grotesk est obligatoire.
- **Don't** poser une ombre lourde sur une carte ou une table ; l'ombre `0 10px 30px` est
  réservée aux overlays (modale, drawer).
- **Don't** coder une information par la seule couleur (badge sans libellé interdit).
- **Don't** afficher un **mur de chiffres** : table brute sans regroupement ni état vide.
- **Don't** dépasser 1px sur une bordure, ni utiliser un liseré coloré épais comme
  décor — le seul liseré coloré autorisé est l'or 3px de la nav active.
- **Don't** supprimer l'`outline` de focus sans le remplacer par le halo émeraude.
