import { format, parseISO } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import i18n from '../i18n';

/**
 * Étiquette de locale pour la langue ACTIVE de la console.
 *
 * Les trois formateurs ci-dessous codaient `'fr-FR'` en dur. La console bascule
 * pourtant FR/EN : en anglais, « 70 565 » s'affichait avec l'espace fine
 * française au lieu de « 70,565 », et « 36,7 % » avec une virgule décimale.
 * Le lecteur anglophone lit alors 36 virgule 7 comme trente-six mille sept.
 */
const isEn = () => (i18n.language || 'fr').startsWith('en');
const localeTag = () => (isEn() ? 'en-US' : 'fr-FR');

/**
 * Locale date-fns de la langue active.
 *
 * Exportée parce que certains écrans formatent des libellés d'axe directement
 * avec `format()` (agrégation par semaine / mois du graphe d'activité) : sans
 * elle, ils recodaient `{ locale: fr }` et rendaient « août 2026 » dans une
 * console anglaise.
 */
export const dateFnsLocale = () => (isEn() ? enUS : fr);

/** Montant FCFA (XAF) sans décimales : "4 280 000 FCFA" / "4,280,000 FCFA". */
export function fcfa(n) {
  if (n == null) return '—';
  return `${Math.round(n).toLocaleString(localeTag())} FCFA`;
}

/** Nombre groupé selon la langue active : 12 480 / 12,480. */
export function num(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString(localeTag());
}

/** Pourcentage : 0.367 → "36,7 %" / "36.7 %". */
export function pct(ratio, digits = 1) {
  if (ratio == null) return '—';
  const value = new Intl.NumberFormat(localeTag(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(ratio * 100);
  return `${value} %`;
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

/**
 * Date courte dans la langue active : « 21 juin 2026 » / « 21 Jun 2026 ».
 * Respecte le fuseau de l'admin s'il est défini.
 *
 * S'appelait `dateFr` et figeait `{ locale: fr }`. La console bascule pourtant
 * FR/EN : en anglais, toutes les dates de toutes les pages rendaient des mois
 * français. Le nom disait la langue ; il dit désormais la FORME — c'est ce qui
 * empêche de re-figer une locale dedans.
 */
export function dateShort(iso, pattern = 'dd MMM yyyy') {
  if (!iso) return '—';
  try {
    let d = typeof iso === 'string' ? parseISO(iso) : iso;
    if (activeTimeZone) d = toZoned(d, activeTimeZone);
    return format(d, pattern, { locale: dateFnsLocale() });
  } catch {
    return '—';
  }
}

/**
 * Date + heure. Le GABARIT lui-même change de langue : « 21 juin 2026 à 14h05 »
 * contre « 21 Jun 2026 at 14:05 ». Traduire les mois sans traduire le « à » ni
 * le séparateur horaire n'aurait fait qu'une phrase à moitié française.
 */
export const dateTimeShort = (iso) =>
  dateShort(iso, isEn() ? "dd MMM yyyy 'at' HH:mm" : "dd MMM yyyy 'à' HH'h'mm");

/** Heure seule, même raison : « 14h05 » / « 14:05 ». */
export const timeShort = (iso) => dateShort(iso, isEn() ? 'HH:mm' : "HH'h'mm");

/**
 * Date longue LOCALISÉE selon la langue active ('fr'|'en') :
 * « 21 juin 2026 » / « June 21, 2026 ». Respecte le fuseau admin s'il est défini.
 */
export function dateLocale(iso, lang = 'fr') {
  if (!iso) return '—';
  try {
    const d = typeof iso === 'string' ? parseISO(iso) : iso;
    return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'fr-FR', {
      dateStyle: 'long',
      ...(activeTimeZone ? { timeZone: activeTimeZone } : {}),
    }).format(d);
  } catch {
    return '—';
  }
}

/**
 * Décompte avant le début d'un tournoi → données pures (label/couleur côté page) :
 *   { past } | { dayDiff, time, tone } où tone = red (aujourd'hui) · gold (≤ 7 j) · green (+).
 * Date.now()/new Date() ici (util, hors rendu React) — autorisé.
 */
export function tournamentStart(iso) {
  if (!iso) return null;
  const start = (typeof iso === 'string' ? parseISO(iso) : iso).getTime();
  if (Number.isNaN(start)) return null;
  if (start - Date.now() <= 0) return { past: true };
  const dayMs = 86400000;
  const a = new Date(start); a.setHours(0, 0, 0, 0);
  const b = new Date(); b.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((a.getTime() - b.getTime()) / dayMs);
  let tone = 'green';
  if (dayDiff === 0) tone = 'red';
  else if (dayDiff <= 7) tone = 'gold';
  return { past: false, dayDiff, time: timeShort(iso), tone };
}

/** Date courante ramenée au fuseau de l'admin (champs locaux = heure murale du fuseau). */
function zonedNow() {
  const now = new Date();
  return activeTimeZone ? toZoned(now, activeTimeZone) : now;
}

/** Clé calendaire 'yyyy-MM-dd' d'un instant, dans le fuseau de l'admin. null si vide. */
export function dayKey(iso) {
  // Clé calendaire : gabarit NUMÉRIQUE, donc volontairement insensible à la
  // langue — c'est un identifiant d'agrégation, pas un libellé.
  return iso ? dateShort(iso, 'yyyy-MM-dd') : null;
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
    out.push({ key: format(d, 'yyyy-MM-dd'), label: format(d, 'd MMMM', { locale: dateFnsLocale() }) });
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
