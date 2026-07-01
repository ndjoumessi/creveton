// Médailles & couleurs de rang partagées (podium / classement).
// Or (1) · argent (2) · bronze (3) ; au-delà, repli neutre.
// Helper pur : les couleurs thème-aware sont passées en paramètre (`colors`),
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
