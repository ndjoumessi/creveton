// Système de design Creveton (charte CDC §9) — source de vérité côté JS.

export const colors = {
  green900: '#0b2e1a',
  green700: '#1a5230',
  green500: '#2a8a4f',
  green300: '#5eca84',
  gold: '#d4a017',
  goldLight: '#e8b830',
  bg: '#f8f9fa',
  surface: '#ffffff',
  border: '#e5e7eb',
  text: '#374151',
  ink: '#0b2e1a',
  muted: '#6b7280',
  red: '#dc2626',
  // alias rétro-compat
  gold500: '#d4a017',
  red400: '#dc2626',
  white: '#ffffff',
};

export const fonts = {
  heading: "'Outfit', system-ui, sans-serif",
  body: "'Space Grotesk', system-ui, sans-serif",
};

// Palette graphiques (recharts).
export const chartColors = ['#2a8a4f', '#d4a017', '#5eca84', '#2563eb', '#7c3aed'];

// Badges de THÈME — une couleur distinctive par thème (spec redesign).
export const themeBadgeColors = {
  culture: { bg: '#ede9fe', fg: '#7c3aed', label: 'Culture' }, // violet
  geographie: { bg: '#dbeafe', fg: '#2563eb', label: 'Géographie' }, // bleu
  histoire: { bg: '#ffedd5', fg: '#ea580c', label: 'Histoire' }, // orange
  industrie: { bg: '#dcfce7', fg: '#16a34a', label: 'Industrie' }, // vert
  sport: { bg: '#fee2e2', fg: '#dc2626', label: 'Sport' }, // rouge
  science: { bg: '#cffafe', fg: '#0891b2', label: 'Science' }, // cyan
};

// Badges de STATUT — questions (workflow CDC §3.3).
export const questionStatusColors = {
  draft: { bg: '#f3f4f6', fg: '#6b7280', label: 'Brouillon' },
  pending_review: { bg: '#fef3c7', fg: '#a16207', label: 'En révision' },
  approved: { bg: '#dcfce7', fg: '#15803d', label: 'Approuvée' },
  rejected: { bg: '#fee2e2', fg: '#dc2626', label: 'Rejetée' },
  archived: { bg: '#e5e7eb', fg: '#4b5563', label: 'Archivée' },
};

export const tournamentStatusColors = {
  scheduled: { bg: '#f3f4f6', fg: '#6b7280', label: 'Programmé' },
  open: { bg: '#dcfce7', fg: '#15803d', label: 'Inscriptions' },
  running: { bg: '#fef3c7', fg: '#a16207', label: 'En cours' },
  closed: { bg: '#e5e7eb', fg: '#4b5563', label: 'Clôturé' },
  paid: { bg: '#dcfce7', fg: '#15803d', label: 'Payé' },
  cancelled: { bg: '#fee2e2', fg: '#dc2626', label: 'Annulé' },
};

export const transactionStatusColors = {
  pending: { bg: '#fef3c7', fg: '#a16207', label: 'En attente' },
  success: { bg: '#dcfce7', fg: '#15803d', label: 'Réussie' },
  failed: { bg: '#fee2e2', fg: '#dc2626', label: 'Échouée' },
  reversed: { bg: '#e5e7eb', fg: '#4b5563', label: 'Annulée' },
};

export const userStatusColors = {
  active: { bg: '#dcfce7', fg: '#15803d', label: 'Actif' },
  suspended: { bg: '#fef3c7', fg: '#a16207', label: 'Suspendu' },
  banned: { bg: '#fee2e2', fg: '#dc2626', label: 'Banni' },
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
