// Couleurs des signaux de performance, partagées entre écrans.
// Médailles : or (1) · argent (2) · bronze (3) ; au-delà, repli neutre.
// Taux de réussite : feu tricolore commun (cf. successRateColor).
// Helpers purs : les couleurs thème-aware sont passées en paramètre (`colors`),
// jamais importées statiquement — comme les autres utils (`format.js`).

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

// Argent / bronze : teintes fixes hors rampe thème (pas de token dédié).
export const SILVER = '#C0C0C0';
export const BRONZE = '#CD7F32';

// Emoji médaille pour le top 3, sinon null. Les appelants gèrent le repli
// (`medalEmoji(r) || '#' + r` pour un numéro, `|| '🥉'` pour un podium borné).
export function medalEmoji(rank) {
  return MEDALS[rank] || null;
}

// Couleur du rang : or (1) · argent (2) · bronze (3), sinon texte neutre.
export function medalColor(rank, colors) {
  if (rank === 1) return colors.gold500;
  if (rank === 2) return SILVER;
  if (rank === 3) return BRONZE;
  return colors.textDark;
}

// Couleur du taux de réussite — feu tricolore : ≥70 vert · 40–69 ambre · <40 rouge.
//
// Le Profil et les Stats appliquaient DEUX règles différentes au MÊME chiffre :
// le Profil passait au rouge sous 50 % et au vert au-dessus de 70 %, les Stats
// basculaient à 40 % et 70 %. Un taux de 44 % s'affichait donc en rouge sur le
// Profil (« ça va mal ») et en ambre sur les Stats (« milieu de tableau »), à
// deux écrans d'écart. Les bornes divergeaient aussi : `> 70` d'un côté, `>= 70`
// de l'autre — exactement 70 % ne verdissait que sur un des deux.
//
// Règle retenue : celle des Stats, la plus complète (trois bandes, et un rouge
// réservé aux taux réellement bas). `green500` tombe à ~2:1 sur la carte sombre
// → `green300` en thème sombre. La couleur est toujours doublée du pourcentage
// lui-même, jamais porteuse seule de l'information.
export function successRateColor(pct, colors, isDark = false) {
  if (pct === null || pct === undefined) return colors.textDark;
  if (pct >= 70) return isDark ? colors.green300 : colors.green500;
  if (pct >= 40) return colors.gold500;
  return colors.red400;
}
