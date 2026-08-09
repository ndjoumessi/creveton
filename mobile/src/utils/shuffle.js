// Mélange de l'ordre d'affichage des options d'une question.
//
// ─ Le problème ─
// `correct_index` est figé en base. Une question rejouée présente donc toujours
// sa bonne réponse à la même place, et un joueur qui la revoit mémorise « c'est
// B » sans relire l'énoncé. La banque compte 180 questions pour des parties de
// 10 : les répétitions sont la règle, pas l'exception.
//
// ─ Pourquoi c'est peu invasif ─
// La lettre affichée (A/B/C/D) vient de la POSITION de rendu (`LETTERS[i]`),
// tandis que la sélection, la correction et l'envoi au serveur s'appuient sur
// `opt.index`, l'IDENTITÉ de l'option. Réordonner le tableau change donc ce que
// le joueur voit sans toucher à ce qui est transmis : `selected_index` reste
// canonique, et ni le scoreService, ni le cache SQLite, ni le rejeu hors ligne
// ne bougent.
//
// ─ Pourquoi DÉTERMINISTE et pas `Math.random()` ─
// L'ordre est recalculé à chaque rendu (mémo sur la question ET sur la langue,
// pour suivre une bascule FR↔EN en cours de partie). Un tirage aléatoire
// remélangerait donc les options sous les yeux du joueur — au changement de
// langue, et surtout après sa réponse, au moment précis où l'écran révèle la
// bonne. Une permutation dérivée de (graine, id de question) est stable tant
// que la partie dure, et rejouable.
//
// ─ Portée ─
// En mode `normal`, le cache local contient `correct_index` (feedback immédiat
// hors ligne) : ce mélange ne protège PAS d'une inspection de la base du
// téléphone. Il traite la mémorisation passive d'une lettre, rien d'autre.
// Contre l'inspection, la parade existe déjà ailleurs — tournois et défis ne
// reçoivent jamais la solution.

/** Hachage 32 bits (FNV-1a) — suffisant pour amorcer un tirage d'affichage. */
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** PRNG déterministe 32 bits (mulberry32). */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Réordonne les options pour l'AFFICHAGE. Les éléments sont renvoyés tels
 * quels — `index` (et donc l'identité) voyage avec eux.
 *
 * @param {Array}  options    options de la question (chacune porte son `index`)
 * @param {string} seed       graine de la partie (partagée en duel)
 * @param {string} questionId pour que deux questions d'une même partie ne
 *                            partagent pas la même permutation
 * @returns {Array} nouveau tableau, ordre mélangé ; l'entrée n'est pas mutée
 */
export function shuffleOptions(options, seed, questionId) {
  const list = Array.isArray(options) ? [...options] : [];
  // Sans graine, on ne mélange pas : mieux vaut l'ordre d'origine qu'un ordre
  // instable d'un rendu à l'autre.
  if (!seed || list.length < 2) return list;

  const rand = mulberry32(hash32(`${seed}:${questionId ?? ''}`));
  // Fisher-Yates.
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/**
 * Graine de partie, quand le serveur n'en fournit pas (solo).
 *
 * `Date.now()` + aléa : deux parties lancées sur la même question ne doivent
 * pas retomber sur le même ordre, sinon le mélange ne servirait qu'une fois.
 */
export function newGameSeed() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export default { shuffleOptions, newGameSeed };
