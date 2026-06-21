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

// XP requis pour atteindre le niveau suivant (courbe simple, alignée affichage MVP)
export function xpForLevel(level) {
  return level * 5000;
}

export function levelProgress(totalXp, level) {
  const floor = xpForLevel(level - 1);
  const ceil = xpForLevel(level);
  const span = ceil - floor || 1;
  const pct = Math.min(1, Math.max(0, (totalXp - floor) / span));
  return { pct, current: totalXp - floor, needed: ceil - floor };
}
