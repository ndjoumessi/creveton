import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

/** Montant FCFA (XAF) sans décimales : "4 280 000 FCFA". */
export function fcfa(n) {
  if (n == null) return '—';
  return `${Math.round(n).toLocaleString('fr-FR')} FCFA`;
}

/** Nombre formaté FR : 12 480. */
export function num(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fr-FR');
}

/** Pourcentage : 0.367 → "36,7 %". */
export function pct(ratio, digits = 1) {
  if (ratio == null) return '—';
  return `${(ratio * 100).toFixed(digits).replace('.', ',')} %`;
}

// Fuseau horaire actif (préférence de l'admin connecté, users.timezone). Quand
// défini, les dates sont affichées dans CE fuseau plutôt que celui du navigateur.
// Synchronisé depuis authStore via setDateTimeZone() (cf. Layout).
let activeTimeZone = null;

/** Définit le fuseau d'affichage (IANA, ex. 'Africa/Douala'). null = navigateur. */
export function setDateTimeZone(tz) {
  activeTimeZone = tz || null;
}

/**
 * Renvoie une Date dont les champs LOCAUX (lus par date-fns) valent l'heure
 * « murale » du fuseau cible — sans dépendance externe (Intl natif). On reformate
 * l'instant dans le fuseau cible puis on le ré-interprète en heure locale.
 */
function toZoned(date, tz) {
  try {
    return new Date(date.toLocaleString('en-US', { timeZone: tz }));
  } catch {
    return date;
  }
}

/** Date courte FR : "21 juin 2026" — dans le fuseau de l'admin si défini. */
export function dateFr(iso, pattern = 'dd MMM yyyy') {
  if (!iso) return '—';
  try {
    let d = typeof iso === 'string' ? parseISO(iso) : iso;
    if (activeTimeZone) d = toZoned(d, activeTimeZone);
    return format(d, pattern, { locale: fr });
  } catch {
    return '—';
  }
}

export const dateTimeFr = (iso) => dateFr(iso, "dd MMM yyyy 'à' HH'h'mm");

/** Date courante ramenée au fuseau de l'admin (champs locaux = heure murale du fuseau). */
function zonedNow() {
  const now = new Date();
  return activeTimeZone ? toZoned(now, activeTimeZone) : now;
}

/** Clé calendaire 'yyyy-MM-dd' d'un instant, dans le fuseau de l'admin. null si vide. */
export function dayKey(iso) {
  return iso ? dateFr(iso, 'yyyy-MM-dd') : null;
}

/**
 * Les N derniers jours (du plus ancien au plus récent), jusqu'à aujourd'hui dans
 * le fuseau de l'admin : `[{ key: 'yyyy-MM-dd', label: '21 juin' }, …]`. Les clés
 * sont alignées sur `dayKey()` pour permettre l'agrégation par jour calendaire.
 */
export function lastDays(n) {
  const t = zonedNow();
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() - i);
    out.push({ key: format(d, 'yyyy-MM-dd'), label: format(d, 'd MMMM', { locale: fr }) });
  }
  return out;
}

/** Initiales (2 max) d'un nom. */
export function initials(name) {
  return (name || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

// Palette d'avatars (couleur déterministe dérivée du nom).
const AVATAR_COLORS = ['#2a8a4f', '#d4a017', '#2563eb', '#7c3aed', '#dc2626', '#0891b2', '#ea580c', '#16a34a'];

/** Couleur d'avatar stable pour un nom donné. */
export function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** Vrai si une date ISO tombe aujourd'hui — dans le fuseau de l'admin si défini. */
export function isToday(iso) {
  if (!iso) return false;
  let d = new Date(iso);
  let now = new Date();
  if (Number.isNaN(d.getTime())) return false;
  if (activeTimeZone) {
    d = toZoned(d, activeTimeZone);
    now = toZoned(now, activeTimeZone);
  }
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}
