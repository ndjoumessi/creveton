# CLAUDE.md

Guidance pour les agents travaillant sur Creveton — app de quiz mobile compétitive
(Cameroun, joueurs 12–30 ans). Monorepo : `backend/` (Node·Express·PostgreSQL·Redis),
`creveton-admin/` (React 19·Vite·JS/JSX), `mobile/` (React Native·Expo).

## Design Context

Le contexte de design produit/visuel vit à la racine et **fait autorité** pour toute
tâche d'interface (console admin) :

- **[`PRODUCT.md`](PRODUCT.md)** — register (`product`), utilisateurs, raison d'être,
  personnalité de marque (*chaleureux · camerounais · fiable*), anti-références, et les
  5 principes de design stratégiques.
- **[`DESIGN.md`](DESIGN.md)** — système visuel au format Stitch : North Star
  **« Le Cockpit Émeraude »**, charte vert profond / or rare, typo Outfit + Space Grotesk,
  élévation plate-par-défaut, composants. Tokens normatifs en frontmatter.
- **`.impeccable/design.json`** — sidecar (rampes tonales, ombres, motion, snippets de
  composants) consommé par `/impeccable live`.

**Avant toute modification d'UI dans `creveton-admin/`**, lire `DESIGN.md`. Règles clés :
l'or ≤ 10 % de l'écran (CTA primaire, nav active, récompenses) ; tout chiffre important en
Outfit ≥ 700 ; surfaces plates (bordure 1px, ombre légère), profondeur réservée aux
overlays ; toute couleur signifiante doublée d'un libellé ; états skeleton/vide/erreur
obligatoires ; confirmation explicite sur toute action destructrice ; `Escape` ferme
modales et drawers.

Les tokens sources côté code : `creveton-admin/src/constants/theme.js` (JS) et
`creveton-admin/src/index.css` (CSS). DESIGN.md les reflète ; en cas de dérive, le
régénérer avec `/impeccable document`.
