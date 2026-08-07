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
  body: "'Inter', system-ui, sans-serif",
};

// Palette PASTEL — source de vérité unique JS (miroir des tokens CSS --pastel-* de
// index.css). Utilisée par les maps de statut/thème ci-dessous et les usages inline
// JSX. Ne PAS fusionner de teintes proches ; les valeurs bespoke non dupliquées
// (ex. `#dbeafe`, `#e5e7eb`, `#fdf6e3`) restent des littéraux, hors palette.
export const pastels = {
  violet: '#f3edff', violetFg: '#8b5cf6', // culture
  blue: '#e6f0ff', blueFg: '#3b82f6', blueFgStrong: '#2563eb', // géo / info / mod
  orange: '#fff4e0', orangeFg: '#f59e0b', // histoire
  mint: '#e3fbef', mintFg: '#10b981', // industrie
  roseFg: '#e74c3c', // sport — couleur saturée d'identité (fond rose replié dans red)
  cyan: '#e6fafc', cyanFg: '#0891b2', // science
  green: '#dcfce7', greenFg: '#15803d', // approuvé / actif / succès
  red: '#fee2e2', redFg: '#dc2626', // rejeté / erreur
  amber: '#fef3c7', amberFg: '#a16207', // en attente
  neutral: '#f3f4f6', neutralFg: '#6b7280', // brouillon / niveau 1
  amberFgDeep: '#b45309', redFgDeep: '#b91c1c', redFgDark: '#fca5a5', // textes foncés récurrents
};

// Palette graphiques (recharts).
export const chartColors = ['#2a8a4f', '#d4a017', '#5eca84', '#3b82f6', '#8b5cf6'];

// Badges de THÈME — couleur distinctive + emoji par thème (spec redesign senior).
export const themeBadgeColors = {
  culture: { bg: pastels.violet, fg: pastels.violetFg, label: 'Culture', icon: '📚' },
  geographie: { bg: pastels.blue, fg: pastels.blueFg, label: 'Géographie', icon: '🌍' },
  histoire: { bg: pastels.orange, fg: pastels.orangeFg, label: 'Histoire', icon: '🏛️' },
  industrie: { bg: pastels.mint, fg: pastels.mintFg, label: 'Industrie', icon: '🏭' },
  sport: { bg: pastels.red, fg: pastels.roseFg, label: 'Sport', icon: '⚽' },
  science: { bg: pastels.cyan, fg: pastels.cyanFg, label: 'Science', icon: '🔬' },
};

// Badges de STATUT — questions (workflow CDC §3.3). `archived` = gris bespoke (hors palette).
export const questionStatusColors = {
  draft: { bg: pastels.neutral, fg: pastels.neutralFg, label: 'Brouillon' },
  pending_review: { bg: pastels.amber, fg: pastels.amberFg, label: 'En révision' },
  approved: { bg: pastels.green, fg: pastels.greenFg, label: 'Approuvée' },
  rejected: { bg: pastels.red, fg: pastels.redFg, label: 'Rejetée' },
  archived: { bg: '#e5e7eb', fg: '#4b5563', label: 'Archivée' },
};

// Couleurs sémantiques de statut tournoi (CDC §2.4) : scheduled gris · open bleu ·
// running vert (pulse via .is-live) · closed amber · paid or · cancelled rouge.
// `open` (#dbeafe) et `paid` (#fdf6e3/#b8860b) = valeurs bespoke non dupliquées, hors palette.
export const tournamentStatusColors = {
  scheduled: { bg: pastels.neutral, fg: pastels.neutralFg, label: 'Programmé' },
  open: { bg: '#dbeafe', fg: pastels.blueFgStrong, label: 'Inscriptions' },
  running: { bg: pastels.green, fg: pastels.greenFg, label: 'En cours' },
  closed: { bg: pastels.amber, fg: pastels.amberFgDeep, label: 'Clôturé' },
  paid: { bg: '#fdf6e3', fg: '#b8860b', label: 'Payé' },
  cancelled: { bg: pastels.red, fg: pastels.redFg, label: 'Annulé' },
};

export const transactionStatusColors = {
  pending: { bg: pastels.amber, fg: pastels.amberFg, label: 'En attente' },
  success: { bg: pastels.green, fg: pastels.greenFg, label: 'Réussie' },
  failed: { bg: pastels.red, fg: pastels.redFg, label: 'Échouée' },
  reversed: { bg: '#e5e7eb', fg: '#4b5563', label: 'Annulée' },
};

export const userStatusColors = {
  active: { bg: pastels.green, fg: pastels.greenFg, label: 'Actif' },
  suspended: { bg: pastels.amber, fg: pastels.amberFg, label: 'Suspendu' },
  banned: { bg: pastels.red, fg: pastels.redFg, label: 'Banni' },
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
