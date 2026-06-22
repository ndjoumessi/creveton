// Système de design Creveton (charte CDC §9) — source de vérité côté JS.

export const colors = {
  green900: '#0b2e1a',
  green700: '#1a5230',
  green500: '#2a8a4f',
  green300: '#5eca84',
  gold: '#d4a017',
  gold500: '#d4a017',
  gold400: '#e8b830',
  goldLight: '#e8b830',
  cream: '#fdf6e9',
  bg: '#f8f9fa',
  contentBg: '#f0f4f0',
  surface: '#ffffff',
  border: '#e5e7eb',
  text: '#374151',
  ink: '#0b2e1a',
  muted: '#6b7280',
  red: '#e74c3c',
  red400: '#e74c3c',
  white: '#ffffff',
};

export const fonts = {
  heading: "'Outfit', system-ui, sans-serif",
  body: "'Space Grotesk', system-ui, sans-serif",
};

// Palette graphiques (recharts).
export const chartColors = ['#2a8a4f', '#d4a017', '#5eca84', '#3b82f6', '#8b5cf6'];

// Badges de THÈME — couleur distinctive + emoji par thème (spec redesign senior).
export const themeBadgeColors = {
  culture: { bg: '#f3edff', fg: '#8b5cf6', label: 'Culture', icon: '📚' }, // violet
  geographie: { bg: '#e6f0ff', fg: '#3b82f6', label: 'Géographie', icon: '🌍' }, // bleu
  histoire: { bg: '#fff4e0', fg: '#f59e0b', label: 'Histoire', icon: '🏛️' }, // orange
  industrie: { bg: '#e3fbef', fg: '#10b981', label: 'Industrie', icon: '🏭' }, // vert
  sport: { bg: '#fdeceb', fg: '#e74c3c', label: 'Sport', icon: '⚽' }, // rouge
  science: { bg: '#e6fafc', fg: '#0891b2', label: 'Science', icon: '🔬' }, // cyan
};

// Badges de STATUT — questions (workflow CDC §3.3).
export const questionStatusColors = {
  draft: { bg: '#f3f4f6', fg: '#6b7280', label: 'Brouillon' },
  pending_review: { bg: '#fef3c7', fg: '#a16207', label: 'En révision' },
  approved: { bg: '#dcfce7', fg: '#15803d', label: 'Approuvée' },
  rejected: { bg: '#fee2e2', fg: '#dc2626', label: 'Rejetée' },
  archived: { bg: '#e5e7eb', fg: '#4b5563', label: 'Archivée' },
};

// Couleurs sémantiques de statut tournoi (CDC §2.4) : scheduled gris · open bleu ·
// running vert (pulse via .is-live) · closed amber · paid or · cancelled rouge.
export const tournamentStatusColors = {
  scheduled: { bg: '#f3f4f6', fg: '#6b7280', label: 'Programmé' },
  open: { bg: '#dbeafe', fg: '#2563eb', label: 'Inscriptions' },
  running: { bg: '#dcfce7', fg: '#15803d', label: 'En cours' },
  closed: { bg: '#fef3c7', fg: '#b45309', label: 'Clôturé' },
  paid: { bg: '#fdf6e3', fg: '#b8860b', label: 'Payé' },
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
