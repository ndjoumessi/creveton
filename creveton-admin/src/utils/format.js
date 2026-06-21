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

/** Date courte FR : "21 juin 2026". */
export function dateFr(iso, pattern = 'dd MMM yyyy') {
  if (!iso) return '—';
  try {
    return format(typeof iso === 'string' ? parseISO(iso) : iso, pattern, { locale: fr });
  } catch {
    return '—';
  }
}

export const dateTimeFr = (iso) => dateFr(iso, "dd MMM yyyy 'à' HH:mm");
