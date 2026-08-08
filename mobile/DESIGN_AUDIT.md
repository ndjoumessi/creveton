# Audit UI/UX — application mobile Creveton

_Audit réalisé le 2026-08-08 sur `main`. Portée : `mobile/` uniquement (la console
admin a son propre système, cf. `DESIGN.md` à la racine)._

## Préalable — trois prémisses du brief à corriger

Avant l'audit lui-même, trois points du cahier des charges ne correspondent pas au dépôt.
Ils changent la nature du travail.

| Brief | Réalité mesurée |
|---|---|
| « React Native + TypeScript » | **JavaScript pur.** Aucun `.ts`/`.tsx` dans `src/`. Un `theme.ts` serait le seul fichier TS du projet. |
| « crée ou mets à jour un fichier de thème centralisé » | **Il existe déjà** : `src/constants/theme.js`, 14 groupes de tokens exportés (couleurs claires + sombres, dégradés par thème, fonts, tailles, spacing, radius, ombres, motion, zIndex). |
| « remplace par un set d'icônes cohérent (ex. lucide) » | **Lucide est déjà en place**, via un wrapper maison `components/Icon.js` qui normalise taille/couleur/épaisseur. |

Conséquence : il ne s'agit pas de **créer** un design system mais de corriger son **usage**.
La majorité des écarts relevés ci-dessous sont des endroits qui contournent des tokens
existants, pas des tokens manquants. C'est une bonne nouvelle — le travail est plus petit
et beaucoup moins risqué qu'une refonte.

---

## 1. Emojis employés comme icônes fonctionnelles

**21 fichiers** contiennent des emojis hors commentaire, **53 emojis distincts**. Tous ne
sont pas à remplacer : il faut séparer trois catégories.

### 1a. À remplacer par Lucide — emojis porteurs de sens dans un contrôle

| Emplacement | Emoji | Rôle | Icône Lucide suggérée |
|---|---|---|---|
| `QuizScreen.js:488` | `✕` | bouton quitter la partie | `X` |
| `QuizScreen.js:500`, `TournamentLiveScreen.js:186` | `⚡` | préfixe du score en cours | `Zap` |
| `GameStartScreen.js:287,352`, `RegisterScreen.js:328,357` | `✓` | coche de sélection | `Check` |
| `AnswerOption.js:77,83,119` | `✓` `✗` | bon/mauvais dans le quiz | `Check` / `X` |
| `SessionCard.js:137,138` | `✓` `⚡` | ratio de bonnes réponses, XP | `Check` / `Zap` |
| `StatsScreen.js:333`, `HomeScreen.js:378` | `🔥` | valeur de streak | `Flame` |
| `LevelBadge.js:16` | `★` | étoile de niveau | `Star` |
| `SessionsHistoryScreen.js:203` | `🔍` | état vide « aucun résultat » | `SearchX` |

Ces cas sont les plus coûteux visuellement : un emoji est **rendu par la police système**,
donc son poids, sa couleur et son alignement échappent aux tokens. `✓` et `✕` sont les plus
visibles — ils cohabitent avec de vraies icônes Lucide dans les mêmes écrans.

### 1b. À conserver — emojis décoratifs ou identitaires

- **Drapeaux pays** (`countries.js`, 35 occurrences) et langues (`ProfileScreen.js:65-66`).
  Aucun set d'icônes ne fait mieux ; les remplacer par des SVG alourdirait le bundle.
- **Emojis de thème** (`config.js:42-47` : 🎭 🗺️ 📜 🏭 ⚽ 🔬). Ils sont l'identité visuelle
  des catégories, repris dans les cartes, badges et historique. Les passer en Lucide
  effacerait la seule couleur non-marque de l'app.
- **Médailles** (`rank.js` 🥇🥈🥉, `Podium.js`) — convention universelle du podium.
- **Célébration** (`TournamentLiveScreen.js:291,319` 🏆🎉, `ResultsScreen.js` 🤝🏆💔).
  Registre émotionnel volontaire, cohérent avec la personnalité ludique.
- **🦐 (crevette)** dans `ErrorScreen`/`TournamentScreen:162` — clin d'œil au nom du produit.

### 1c. Zone grise — à trancher

`EmptyState` accepte **soit** une chaîne emoji **soit** un composant Lucide (`components/EmptyState.js:29-35`),
et les deux chemins coexistent aujourd'hui. C'est la source principale de l'incohérence :
7 appels, tous en emoji. Recommandation : ne garder que le chemin Lucide et retirer la
branche `typeof icon === 'string'`, ce qui rend l'incohérence **impossible** plutôt que
simplement déconseillée.

---

## 2. Rayons de bordure

Le token `radius` expose **7 valeurs** — le brief en demande 3 à 4.

```
pill 999 (41 usages) · lg 16 (33) · md 12 (22) · xl 20 (14)
xxl 24 (11) · sm 8 (6) · base 14 (3)
```

Deux problèmes distincts :

- **`base: 14` est mort-né** — 3 usages, coincé entre `md: 12` et `lg: 16`. Un écart de 2 px
  qu'aucun œil ne distingue. À supprimer.
- **`sm: 8` est quasi inutilisé** (6), et **`xxl: 24`** (11) ne se justifie que sur les grandes
  cartes d'authentification.

En plus des tokens, **13 `borderRadius` numériques en dur**, dont `18`, `13`, `55`, `3`, `2`, `1`.
Les valeurs 1/2/3 sont des barres de progression (légitimes, ce ne sont pas des conteneurs) ;
`13`, `18` et `55` sont de vraies dérives.

**Échelle proposée : 4 valeurs.**

| Token | Valeur | Usage |
|---|---|---|
| `sm` | 8 | badges, pastilles, petites pilules |
| `md` | 12 | champs, boutons, tuiles |
| `lg` | 16 | cartes |
| `pill` | 999 | CTA arrondis, onglets, avatars |

`base`/`xl`/`xxl` sont retirés — `xxl` (cartes d'auth) migre vers `lg`, ce qui rapproche les
cartes d'inscription du reste de l'app.

---

## 3. Couleurs de catégories

Elles vivent dans `themeGradients` et `themeAccent` (`theme.js:173-191`) :

| Thème | Accent | Logique |
|---|---|---|
| Géographie | `#2d5a8e` bleu | mer / carte — lisible |
| Culture | `#5b2d8e` violet | arbitraire |
| Histoire | `#8b4513` brun | parchemin — lisible |
| Industrie | `#1a5230` vert | **= `green700` de la marque** |
| Sport | `#8e2d2d` rouge | terrain / effort |
| Science | `#0f7b75` sarcelle | arbitraire |

**Le vrai défaut n'est pas l'arbitraire, c'est la collision.** « Industrie » utilise
exactement le vert de marque `green700`. Le vert signifie partout ailleurs dans l'app
*succès / marque / actif* ; ici il signifie *une catégorie parmi six*. Sur la carte
Industrie de l'écran Jouer, la catégorie devient indistinguable d'un état sélectionné.

Même remarque, plus faible, pour Sport (`#8e2d2d`) qui approche le rouge d'erreur `red600`
(`#e74c3c`) — la teinte est plus sourde, la confusion est moindre.

**Recommandation :** garder six teintes distinctes (elles fonctionnent comme repère mémoriel),
mais **sortir Industrie et Sport de la plage vert-de-marque / rouge-d'erreur**. Le drapeau
camerounais reste porté par le châssis (fond vert profond, or des CTA), pas par les
catégories — vouloir dériver les six catégories du drapeau donnerait six variations de
vert/rouge/jaune indiscernables, l'inverse du but recherché.

---

## 4. État désactivé trop proche de l'état actif

Un seul mécanisme dans toute l'app : `opacity: 0.45`, sur `AppButton.js:111` et `FAB.js:56`.

Le cas le plus visible est la carte de tournoi (`TournamentScreen.js:205-220`) : un tournoi
plein, à venir ou payant passe en `variant='ghost'` + `disabled`. Or `ghost` est déjà un
bouton discret **à l'état normal** — l'opacité 0.45 appliquée à un bouton déjà pâle sur un
fond sombre produit un contrôle qui ressemble à un bouton actif discret. Le libellé
« Indisponible » porte alors **seule** l'information.

C'est un manquement direct à la règle de charte « toute couleur signifiante doublée d'un
libellé » — appliquée ici à l'envers : le libellé n'est pas doublé d'un signal visuel.

**Recommandation :** un état désactivé explicite plutôt qu'une opacité — fond neutre,
bordure en pointillés ou absente, curseur d'indisponibilité, et le libellé conservé.
L'opacité seule ne survit pas au thème sombre, où tout est déjà peu contrasté.

---

## 5. Hiérarchie des chiffres-clés

Les grands nombres sont rendus par `Title` avec `weight="extrabold"` ou `"black"`, mais la
**taille est décidée écran par écran**, parfois en pixels bruts :

| Emplacement | Traitement |
|---|---|
| `StatsScreen.js:358` | `size={32}` — nombre brut, hors échelle |
| `StatsScreen.js:572` | `size="display"` (48) |
| `StatsScreen.js:580` | `size="xl"` (22) |
| `HomeScreen.js:98` | taille par défaut |

`fontSizes` propose 10 valeurs nommées **par la taille** (`xs` → `hero`), jamais **par le
rôle**. Rien n'indique au développeur quelle taille correspond à « chiffre-clé de carte KPI ».
D'où le `size={32}` : il manquait un cran entre `xxl` (28) et `xxxl` (36), donc quelqu'un
l'a inventé sur place.

Sur la **sémantique couleur**, en revanche, l'app est déjà correcte : le taux de réussite
passe en rouge à 43 % (`HomeScreen.js:98` via `valueColor`), le rang en or. C'est cohérent
et à conserver — le manque est sur la taille, pas sur la couleur.

---

## 6. États vides

7 appels à `EmptyState`. **3 n'offrent aucune action** :

| Écran | Icône | CTA |
|---|---|---|
| Challenges | ⚔️ | ✅ « Lancer un défi » |
| Historique — aucun résultat | 🔍 | ❌ |
| Historique — aucune partie | 🎮 | ✅ |
| Stats | 🎮 | ✅ |
| Stats — classement | 🏆 | ✅ |
| **Tournois — actifs** | 🏆 | ❌ |
| **Tournois — terminés** | 🏆 | ❌ |

Les deux états vides de Tournois occupent un écran entier pour dire « Aucun tournoi
ouvert · Reviens bientôt ». C'est une impasse : l'utilisateur qui arrive là n'a aucune sortie
autre que la barre d'onglets. Le cas est fréquent — les captures montrent les trois onglets
Tournois vides simultanément.

L'état vide « aucun résultat » de l'historique est différent : après un filtrage, l'action
attendue est **réinitialiser les filtres**, pas jouer.

---

## Synthèse — par rapport travail / gain

| # | Sujet | Effort | Gain | Risque |
|---|---|---|---|---|
| 4 | État désactivé | faible | **fort** | faible |
| 6 | États vides Tournois | faible | **fort** | nul |
| 2 | Échelle de radius | moyen | moyen | faible |
| 5 | Rôles typographiques des chiffres | moyen | moyen | faible |
| 1a | Emojis fonctionnels → Lucide | moyen | moyen | faible |
| 3 | Collision Industrie / vert de marque | faible | moyen | **moyen** (identité) |

Les points 4 et 6 sont les meilleurs candidats à traiter en premier : peu de code, effet
immédiatement visible, aucun risque de régression visuelle ailleurs.
