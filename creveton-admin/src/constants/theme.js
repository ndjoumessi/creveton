// Charte graphique Creveton (CDC §9). Source de vérité côté JS (charts, badges).

export const colors = {
  green900: '#0b2e1a',
  green700: '#1a5230',
  green500: '#2a8a4f',
  green300: '#5eca84',
  gold500: '#d4a017',
  gold400: '#e8b830',
  cream: '#fdf6e9',
  red400: '#e74c3c',
  white: '#ffffff',
  // Neutres utilitaires dérivés
  ink: '#0b2e1a',
  muted: '#6b7a72',
  border: '#e6e1d4',
  bg: '#f7f3ea',
};

export const fonts = {
  heading: "'Outfit', system-ui, sans-serif",
  body: "'Space Grotesk', system-ui, sans-serif",
};

// Palette pour les graphiques (recharts).
export const chartColors = [colors.green500, colors.gold500, colors.green300, colors.red400, colors.green700];

// Couleurs de statut des questions (workflow CDC §3.3).
export const questionStatusColors = {
  draft: { bg: '#eceff1', fg: '#546e7a', label: 'Brouillon' },
  pending_review: { bg: '#fff4d6', fg: '#a9791a', label: 'En révision' },
  approved: { bg: '#dcf3e4', fg: '#1a7a3f', label: 'Approuvée' },
  rejected: { bg: '#fbe0dd', fg: '#c0392b', label: 'Rejetée' },
  archived: { bg: '#e8e3d6', fg: '#7a6f57', label: 'Archivée' },
};

// Couleurs de statut des tournois.
export const tournamentStatusColors = {
  scheduled: { bg: '#eceff1', fg: '#546e7a', label: 'Programmé' },
  open: { bg: '#dcf3e4', fg: '#1a7a3f', label: 'Inscriptions' },
  running: { bg: '#fff4d6', fg: '#a9791a', label: 'En cours' },
  closed: { bg: '#e8e3d6', fg: '#7a6f57', label: 'Clôturé' },
  paid: { bg: '#dcf3e4', fg: '#1a7a3f', label: 'Payé' },
  cancelled: { bg: '#fbe0dd', fg: '#c0392b', label: 'Annulé' },
};

// Couleurs de statut des transactions / comptes.
export const transactionStatusColors = {
  pending: { bg: '#fff4d6', fg: '#a9791a', label: 'En attente' },
  success: { bg: '#dcf3e4', fg: '#1a7a3f', label: 'Réussie' },
  failed: { bg: '#fbe0dd', fg: '#c0392b', label: 'Échouée' },
  reversed: { bg: '#e8e3d6', fg: '#7a6f57', label: 'Annulée' },
};

export const userStatusColors = {
  active: { bg: '#dcf3e4', fg: '#1a7a3f', label: 'Actif' },
  suspended: { bg: '#fff4d6', fg: '#a9791a', label: 'Suspendu' },
  banned: { bg: '#fbe0dd', fg: '#c0392b', label: 'Banni' },
};

export const providerLabels = {
  orange_money: 'Orange Money',
  mtn_momo: 'MTN MoMo',
  campay: 'Campay',
};

export const themeLabels = {
  culture: 'Culture',
  geographie: 'Géographie',
  histoire: 'Histoire',
  industrie: 'Industrie',
  sport: 'Sport',
  science: 'Science',
};

export const levelLabels = {
  beginner: 'Débutant',
  intermediate: 'Intermédiaire',
  expert: 'Expert',
};
