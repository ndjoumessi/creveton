// Validations client (miroir des règles API §4).

import {
  parsePhoneNumberFromString,
  AsYouType,
  getCountryCallingCode,
} from 'libphonenumber-js/min';

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

// ── Téléphone : international depuis 08-2026 ───────────────────────────────
// L'app n'acceptait que le +237, ce qui fermait l'inscription à la diaspora.
// Le backend valide la FORME E.164 ; ici on valide FINEMENT par pays (longueur
// du numéro national, préfixes réellement attribués) via libphonenumber-js —
// sans quoi `+237123` ou `+33000000000` passeraient.
// ⚠️ Ne concerne QUE le téléphone du compte. Le Mobile Money reste camerounais
// (backend : MOMO_PHONE_REGEX), il n'est pas saisi par ce chemin.
export const DEFAULT_COUNTRY = 'CM';

/** Indicatif d'appel d'un pays ISO ('CM' → '237'). '' si inconnu. */
export function callingCodeFor(country) {
  try {
    return getCountryCallingCode(country);
  } catch {
    return '';
  }
}

/**
 * Valide un numéro. Accepte soit un E.164 complet ('+33612345678'), soit un
 * numéro national accompagné de son pays ('612345678', 'FR').
 */
export function isValidPhone(input, country = DEFAULT_COUNTRY) {
  const parsed = parsePhoneNumberFromString(String(input || '').trim(), country);
  return Boolean(parsed && parsed.isValid());
}

/**
 * Normalise vers E.164 ('+237690000000'), '' si non parsable.
 * @param {string} input   national ('690000000') ou E.164 ('+237690000000')
 * @param {string} country pays ISO utilisé quand `input` n'a pas d'indicatif
 */
export function normalizePhone(input, country = DEFAULT_COUNTRY) {
  const parsed = parsePhoneNumberFromString(String(input || '').trim(), country);
  return parsed ? parsed.number : '';
}

/** Formatage lisible pour l'affichage ('+237 6 90 00 00 00'). */
export function formatPhone(input, country = DEFAULT_COUNTRY) {
  const parsed = parsePhoneNumberFromString(String(input || '').trim(), country);
  return parsed ? parsed.formatInternational() : String(input || '');
}

/** Formatage au fil de la frappe, dans les conventions du pays choisi. */
export function formatAsYouType(input, country = DEFAULT_COUNTRY) {
  return new AsYouType(country).input(String(input || ''));
}

// ── Mot de passe : ≥ 8 caractères, 1 chiffre, 1 majuscule ──────────────────
// `passwordIssues` renvoie les règles NON satisfaites, pour que l'UI désigne
// celle qui bloque au lieu de réciter les trois (le backend le fait déjà, via
// Joi : « … au moins une majuscule »).
export function passwordIssues(pwd) {
  const p = String(pwd || '');
  const issues = [];
  if (p.length < 8) issues.push('length');
  if (!/\d/.test(p)) issues.push('digit');
  if (!/[A-Z]/.test(p)) issues.push('upper');
  return issues;
}

export function isValidPassword(pwd) {
  return passwordIssues(pwd).length === 0;
}

export function isValidName(name) {
  const n = String(name || '').trim();
  return n.length >= 2 && n.length <= 100;
}

export function isValidAge(age) {
  if (age === '' || age === null || age === undefined) return true; // optionnel
  const n = Number(age);
  return Number.isInteger(n) && n >= 6 && n <= 99;
}

// Renvoie un objet { field: message } pour le formulaire d'inscription
export function validateRegister({ name, email, phone, password, age }) {
  const errors = {};
  if (!isValidName(name)) errors.name = 'Nom requis (2 à 100 caractères).';
  if (!isValidEmail(email)) errors.email = 'Adresse email invalide.';
  if (!isValidPhone(phone))
    errors.phone = 'Numéro invalide pour le pays sélectionné.';
  if (!isValidPassword(password))
    errors.password = '8 caractères min., 1 chiffre, 1 majuscule.';
  if (!isValidAge(age)) errors.age = 'Âge entre 6 et 99 ans.';
  return errors;
}
