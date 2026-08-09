/**
 * Drapeau d'un numéro au format international (E.164).
 *
 * Le drapeau 🇨🇲 était écrit EN DUR à trois endroits de la console (liste
 * Utilisateurs, tiroir Utilisateurs, tiroir Équipe). Il datait d'une époque où
 * le compte était forcément camerounais — mais `PHONE_REGEX` côté backend est
 * international depuis, et l'inscription mobile propose un sélecteur de pays.
 * Un joueur inscrit avec un `+33` s'affichait donc sous drapeau camerounais.
 *
 * ── Pourquoi une table ici plutôt qu'une bibliothèque ──
 * `mobile/` dérive ses indicatifs de `libphonenumber-js`, justement pour ne pas
 * les écrire à la main. Cette bibliothèque n'est pas dans les dépendances de la
 * console, et l'ajouter pèserait ~145 Ko de bundle pour afficher un emoji : le
 * rapport est mauvais. On duplique donc la liste — en la gardant alignée sur
 * `mobile/src/constants/countries.js`, mêmes 35 pays curés (Cameroun d'abord,
 * Afrique centrale et de l'Ouest, puis diaspora).
 *
 * ── Le repli est neutre, pas camerounais ──
 * Un indicatif absent de la table rend 🌐 et non 🇨🇲. Afficher un drapeau faux
 * est pire que n'en afficher aucun : c'est ce défaut-là qu'on corrige.
 */

// Indicatif → drapeau. L'ordre n'importe pas : la résolution prend le préfixe
// le PLUS LONG (sans quoi « +1242 » Bahamas tomberait sur « +1 » États-Unis).
const FLAG_BY_CALLING_CODE = {
  237: '🇨🇲', // Cameroun — marché principal
  // Afrique centrale
  235: '🇹🇩', 236: '🇨🇫', 241: '🇬🇦', 240: '🇬🇶', 242: '🇨🇬', 243: '🇨🇩',
  // Afrique de l'Ouest
  234: '🇳🇬', 225: '🇨🇮', 221: '🇸🇳', 233: '🇬🇭', 223: '🇲🇱', 226: '🇧🇫',
  229: '🇧🇯', 228: '🇹🇬', 227: '🇳🇪', 224: '🇬🇳',
  // Maghreb & Afrique australe/orientale
  212: '🇲🇦', 213: '🇩🇿', 216: '🇹🇳', 27: '🇿🇦', 254: '🇰🇪',
  // Diaspora
  33: '🇫🇷', 32: '🇧🇪', 49: '🇩🇪', 44: '🇬🇧', 1: '🇺🇸', 39: '🇮🇹',
  34: '🇪🇸', 41: '🇨🇭', 31: '🇳🇱', 90: '🇹🇷', 971: '🇦🇪', 86: '🇨🇳',
};

// Le Canada partage « +1 » avec les États-Unis ; on ne peut pas les distinguer
// sans la table des indicatifs régionaux. On assume 🇺🇸 pour « +1 » — c'est
// documenté ici pour que personne ne le prenne pour un oubli.

const MAX_CODE_LENGTH = 3;
export const UNKNOWN_FLAG = '🌐';

/**
 * @param {string} phone numéro au format international (« +237690000000 »)
 * @returns {string} emoji drapeau, ou 🌐 si l'indicatif est inconnu ou le
 *   numéro absent / mal formé.
 */
export function phoneFlag(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return UNKNOWN_FLAG;
  // Préfixe le plus long d'abord : « 237 » avant « 23 » avant « 2 ».
  for (let len = MAX_CODE_LENGTH; len >= 1; len -= 1) {
    const flag = FLAG_BY_CALLING_CODE[Number(digits.slice(0, len))];
    if (flag) return flag;
  }
  return UNKNOWN_FLAG;
}

export default phoneFlag;
