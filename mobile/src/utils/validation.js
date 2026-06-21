// Validations client (miroir des règles API §4).

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

// +237 + 9 chiffres (API §4 register)
export function isValidPhone(phone) {
  return /^\+237\d{9}$/.test(String(phone || '').trim());
}

// Normalise une saisie locale vers le format +237XXXXXXXXX
export function normalizePhone(input) {
  let digits = String(input || '').replace(/\D/g, '');
  if (digits.startsWith('237')) digits = digits.slice(3);
  return digits ? `+237${digits.slice(0, 9)}` : '';
}

// ≥ 8 caractères, 1 chiffre, 1 majuscule
export function isValidPassword(pwd) {
  const p = String(pwd || '');
  return p.length >= 8 && /\d/.test(p) && /[A-Z]/.test(p);
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
    errors.phone = 'Numéro invalide (format +237XXXXXXXXX).';
  if (!isValidPassword(password))
    errors.password = '8 caractères min., 1 chiffre, 1 majuscule.';
  if (!isValidAge(age)) errors.age = 'Âge entre 6 et 99 ans.';
  return errors;
}
