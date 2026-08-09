'use strict';

/**
 * Étiquette lisible d'un appareil à partir de son `User-Agent`.
 *
 * Sert UNIQUEMENT l'écran « Sessions actives » : la liste affichait
 * « Session 5724ce03… », six lignes d'identifiants opaques sous un bouton
 * « Révoquer les autres ». Personne ne peut décider quoi révoquer à partir de
 * ça. L'allowlist Redis ne stockait rien d'autre que le sid (`refresh:<uid>:<sid>`
 * → `'1'`), donc le défaut n'était pas d'affichage mais de DONNÉE.
 *
 * Ce qu'on retient volontairement : navigateur + système, rien de plus.
 * L'adresse IP identifierait mieux, mais c'est une donnée personnelle
 * supplémentaire à conserver, et « Chrome sur macOS, ouverte le 3 août » suffit
 * à ce qu'un admin reconnaisse sa propre session. On n'ajoute pas une catégorie
 * de données pour un gain marginal.
 *
 * Analyse volontairement grossière : pas de dépendance, pas de base d'UA à
 * maintenir. Un UA inconnu retombe sur `null` et l'interface dit « Appareil
 * inconnu » — mieux qu'une étiquette inventée.
 */

// Ordre significatif : les UA se citent les uns les autres (Edge contient
// « Chrome », Chrome contient « Safari »). Le plus spécifique gagne.
const BROWSERS = [
  [/\bEdg(?:e|A|iOS)?\//i, 'Edge'],
  [/\bOPR\/|\bOpera\//i, 'Opera'],
  [/\bSamsungBrowser\//i, 'Samsung Internet'],
  [/\bFirefox\/|\bFxiOS\//i, 'Firefox'],
  [/\bChrome\/|\bCriOS\//i, 'Chrome'],
  [/\bSafari\//i, 'Safari'],
];

// « Android » avant « Linux » : un UA Android contient les deux.
const SYSTEMS = [
  [/\bAndroid\b/i, 'Android'],
  [/\biPhone\b|\biPad\b|\biPod\b/i, 'iOS'],
  [/\bMac OS X\b|\bMacintosh\b/i, 'macOS'],
  [/\bWindows\b/i, 'Windows'],
  [/\bCrOS\b/i, 'ChromeOS'],
  [/\bLinux\b/i, 'Linux'],
];

function match(table, ua) {
  for (const [re, label] of table) {
    if (re.test(ua)) return label;
  }
  return null;
}

/**
 * @param {string} [userAgent]
 * @returns {string|null} ex. « Chrome · macOS », « Safari », ou null si illisible.
 */
function deviceLabel(userAgent) {
  if (!userAgent || typeof userAgent !== 'string') return null;
  // Un UA anormalement long est soit forgé, soit inutile : on n'analyse pas.
  const ua = userAgent.slice(0, 400);
  const browser = match(BROWSERS, ua);
  const system = match(SYSTEMS, ua);
  if (browser && system) return `${browser} · ${system}`;
  return browser || system || null;
}

module.exports = { deviceLabel };
