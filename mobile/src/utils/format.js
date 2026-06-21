// Helpers de formatage (FCFA, dates, niveaux, etc.)

import { LEVELS, THEMES } from '../constants/config';

// Montants en FCFA — entiers, pas de sous-unité (API §1)
export function formatFcfa(amount) {
  const n = Number(amount) || 0;
  return `${n.toLocaleString('fr-FR')} FCFA`;
}

// Date ISO → relatif court (ex. « il y a 3 j »)
export function timeAgo(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (Number.isNaN(diff)) return '';
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `il y a ${d} j`;
  const mo = Math.floor(d / 30);
  return `il y a ${mo} mois`;
}

// Date ISO → format court FR (ex. 25 juin, 19:00)
export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Secondes → mm:ss
export function formatTimer(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function levelLabel(key) {
  return LEVELS.find((l) => l.key === key)?.label || key;
}

export function themeLabel(key) {
  return THEMES.find((t) => t.key === key)?.label || key;
}

export function themeEmoji(key) {
  return THEMES.find((t) => t.key === key)?.emoji || '❓';
}

// Paliers d'XP par niveau (1→5). Niveau N atteint dès total_xp >= XP_LEVELS[N-1].
export const XP_LEVELS = [0, 200, 500, 1200, 3000];
export const MAX_LEVEL = XP_LEVELS.length; // 5

// Seuil d'XP requis pour atteindre `level` (1..5).
export function xpForLevel(level) {
  const i = Math.max(1, Math.min(level, MAX_LEVEL)) - 1;
  return XP_LEVELS[i];
}

// Niveau effectif dérivé de l'XP — robuste si le backend renvoie un niveau
// périmé (ex. total_xp 920 mais level 2 encore stocké → vrai niveau 3).
export function levelForXp(totalXp) {
  const xp = Math.max(0, Number(totalXp) || 0);
  let lvl = 1;
  for (let i = 0; i < XP_LEVELS.length; i++) {
    if (xp >= XP_LEVELS[i]) lvl = i + 1;
  }
  return lvl;
}

// Progression dans le niveau courant. Tout est borné ≥ 0 (jamais d'XP négatif).
// Le niveau est recalculé depuis l'XP pour rester cohérent avec la courbe.
export function levelProgress(totalXp /* , level (ignoré : dérivé de l'XP) */) {
  const xp = Math.max(0, Number(totalXp) || 0);
  const level = levelForXp(xp);
  const isMax = level >= MAX_LEVEL;
  const currentLevelXP = XP_LEVELS[level - 1]; // XP au début du niveau courant
  const nextLevelXP = isMax ? XP_LEVELS[MAX_LEVEL - 1] : XP_LEVELS[level];
  const needed = Math.max(1, nextLevelXP - currentLevelXP); // XP entre les 2 paliers
  const progress = Math.max(0, xp - currentLevelXP); // XP acquise dans le niveau
  const remaining = isMax ? 0 : Math.max(0, nextLevelXP - xp);
  const pct = isMax ? 1 : Math.min(1, progress / needed);
  return { level, pct, current: progress, needed, remaining, isMax };
}
