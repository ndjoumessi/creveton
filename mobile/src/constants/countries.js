// Liste de pays proposée au sélecteur d'indicatif (inscription).
//
// Volontairement CURÉE, pas exhaustive : le Cameroun d'abord (marché principal),
// puis l'Afrique centrale et de l'Ouest, puis les destinations de diaspora. Une
// liste des ~250 pays du monde noierait les 5 choix réellement utilisés.
// `PHONE_COUNTRY_FALLBACK` reste disponible pour saisir un indicatif absent
// d'ici : l'utilisateur tape son numéro au format international complet.
//
// Les INDICATIFS ne sont pas écrits ici — ils sont dérivés de libphonenumber-js
// (`callingCodeFor`, utils/validation.js) pour éviter toute divergence avec la
// table qui sert ensuite à valider.

import { searchNormalize } from '../utils/format';

export const COUNTRIES = [
  { iso: 'CM', flag: '🇨🇲', fr: 'Cameroun', en: 'Cameroon' },

  // Afrique centrale
  { iso: 'TD', flag: '🇹🇩', fr: 'Tchad', en: 'Chad' },
  { iso: 'CF', flag: '🇨🇫', fr: 'Centrafrique', en: 'Central African Rep.' },
  { iso: 'GA', flag: '🇬🇦', fr: 'Gabon', en: 'Gabon' },
  { iso: 'GQ', flag: '🇬🇶', fr: 'Guinée équatoriale', en: 'Equatorial Guinea' },
  { iso: 'CG', flag: '🇨🇬', fr: 'Congo', en: 'Congo' },
  { iso: 'CD', flag: '🇨🇩', fr: 'RD Congo', en: 'DR Congo' },

  // Afrique de l'Ouest
  { iso: 'NG', flag: '🇳🇬', fr: 'Nigeria', en: 'Nigeria' },
  { iso: 'CI', flag: '🇨🇮', fr: "Côte d'Ivoire", en: 'Ivory Coast' },
  { iso: 'SN', flag: '🇸🇳', fr: 'Sénégal', en: 'Senegal' },
  { iso: 'GH', flag: '🇬🇭', fr: 'Ghana', en: 'Ghana' },
  { iso: 'ML', flag: '🇲🇱', fr: 'Mali', en: 'Mali' },
  { iso: 'BF', flag: '🇧🇫', fr: 'Burkina Faso', en: 'Burkina Faso' },
  { iso: 'BJ', flag: '🇧🇯', fr: 'Bénin', en: 'Benin' },
  { iso: 'TG', flag: '🇹🇬', fr: 'Togo', en: 'Togo' },
  { iso: 'NE', flag: '🇳🇪', fr: 'Niger', en: 'Niger' },
  { iso: 'GN', flag: '🇬🇳', fr: 'Guinée', en: 'Guinea' },

  // Maghreb & Afrique australe / de l'Est
  { iso: 'MA', flag: '🇲🇦', fr: 'Maroc', en: 'Morocco' },
  { iso: 'DZ', flag: '🇩🇿', fr: 'Algérie', en: 'Algeria' },
  { iso: 'TN', flag: '🇹🇳', fr: 'Tunisie', en: 'Tunisia' },
  { iso: 'ZA', flag: '🇿🇦', fr: 'Afrique du Sud', en: 'South Africa' },
  { iso: 'KE', flag: '🇰🇪', fr: 'Kenya', en: 'Kenya' },

  // Diaspora
  { iso: 'FR', flag: '🇫🇷', fr: 'France', en: 'France' },
  { iso: 'BE', flag: '🇧🇪', fr: 'Belgique', en: 'Belgium' },
  { iso: 'DE', flag: '🇩🇪', fr: 'Allemagne', en: 'Germany' },
  { iso: 'GB', flag: '🇬🇧', fr: 'Royaume-Uni', en: 'United Kingdom' },
  { iso: 'US', flag: '🇺🇸', fr: 'États-Unis', en: 'United States' },
  { iso: 'CA', flag: '🇨🇦', fr: 'Canada', en: 'Canada' },
  { iso: 'IT', flag: '🇮🇹', fr: 'Italie', en: 'Italy' },
  { iso: 'ES', flag: '🇪🇸', fr: 'Espagne', en: 'Spain' },
  { iso: 'CH', flag: '🇨🇭', fr: 'Suisse', en: 'Switzerland' },
  { iso: 'NL', flag: '🇳🇱', fr: 'Pays-Bas', en: 'Netherlands' },
  { iso: 'TR', flag: '🇹🇷', fr: 'Turquie', en: 'Türkiye' },
  { iso: 'AE', flag: '🇦🇪', fr: 'Émirats arabes unis', en: 'United Arab Emirates' },
  { iso: 'CN', flag: '🇨🇳', fr: 'Chine', en: 'China' },
];

/** Nom localisé d'un pays selon la langue active ('fr' | 'en'). */
export function countryName(country, lang) {
  return lang === 'en' ? country.en : country.fr;
}

/**
 * Recherche dans le sélecteur : normalise accents et casse, et interroge les
 * DEUX langues plus l'indicatif.
 *
 * Les deux langues volontairement : un utilisateur francophone sur une interface
 * anglaise tapera « Tchad » devant une liste qui affiche « Chad », et
 * réciproquement. Refuser sa saisie parce qu'elle est dans l'autre langue serait
 * absurde — il cherche un pays, pas une traduction.
 *
 * L'indicatif aussi : « 237 » ou « +237 » trouve le Cameroun. C'est souvent ce
 * qu'on connaît par cœur quand le nom du pays est ambigu (Congo / RD Congo).
 *
 * @param {object} country
 * @param {string} query
 * @param {string} callingCode indicatif déjà résolu (évite de réimporter
 *   libphonenumber ici — cf. l'en-tête sur la non-duplication des indicatifs).
 */
export function matchesQuery(country, query, callingCode) {
  const q = searchNormalize(query);
  if (!q) return true;
  return (
    searchNormalize(country.fr).includes(q) ||
    searchNormalize(country.en).includes(q) ||
    country.iso.toLowerCase().includes(q) ||
    String(callingCode || '').includes(q.replace(/^\+/, ''))
  );
}

/** Retrouve une entrée par code ISO. */
export function countryByIso(iso) {
  return COUNTRIES.find((c) => c.iso === iso) || COUNTRIES[0];
}
