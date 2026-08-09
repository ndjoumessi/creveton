/* Faits produit affichés sur les surfaces PUBLIQUES (Landing, Login).
 *
 * Source unique, volontairement. Ces chiffres vivaient en dur à quatre endroits
 * et se contredisaient à l'écran : le héro annonçait « 15 Thèmes » et « 180+
 * Questions », la section thèmes titrait « 4 thèmes, des centaines de questions »
 * puis listait 4 cartes dont les compteurs (18+15+16+12 = 61) ne tombaient sur
 * aucun des deux. Un visiteur qui additionne voit le mensonge.
 *
 * Il n'existe AUCUN endpoint public pour ces compteurs (`routes/index.js` :
 * tout est sous `authenticate`, y compris `/questions`). Les valeurs restent
 * donc saisies à la main — mais à un seul endroit, et arrondies vers le bas
 * (« 180+ ») pour rester vraies entre deux mises à jour.
 *
 * THEMES suit la taxonomie réelle de `constants/theme.js` (`themeBadgeColors`),
 * qui fait autorité côté console comme côté mobile. Aucun compteur PAR thème
 * n'est affiché : on ne peut pas les tenir à jour honnêtement d'ici.
 */

export const PRODUCT_FACTS = {
  questions: 180,
  themes: 6,
  levels: 3,
};

// Ordre d'affichage sur la Landing. `key` = clé de `themeBadgeColors` ET de
// `questions.themes.*` dans les catalogues i18n — le libellé est donc traduit,
// jamais écrit en dur (c'est la régression corrigée sur les badges de la console).
export const PUBLIC_THEMES = [
  { key: 'geographie', emoji: '🌍' },
  { key: 'culture', emoji: '📚' },
  { key: 'histoire', emoji: '🏛️' },
  { key: 'industrie', emoji: '🏭' },
  { key: 'sport', emoji: '⚽' },
  { key: 'science', emoji: '🔬' },
];
