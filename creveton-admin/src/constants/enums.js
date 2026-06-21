// Énumérations métier (miroir de backend/src/utils/constants.js).

export const THEME_KEYS = ['culture', 'geographie', 'histoire', 'industrie', 'sport', 'science'];
export const LEVEL_KEYS = ['beginner', 'intermediate', 'expert'];
export const QUESTION_STATUS_KEYS = ['draft', 'pending_review', 'approved', 'rejected', 'archived'];
export const TOURNAMENT_TYPE_KEYS = ['free', 'flash', 'mini', 'grand', 'premium'];
export const TOURNAMENT_STATUS_KEYS = ['scheduled', 'open', 'running', 'closed', 'paid', 'cancelled'];
export const PROVIDER_KEYS = ['orange_money', 'mtn_momo', 'campay'];
export const TRANSACTION_TYPE_KEYS = ['deposit', 'withdraw', 'payout', 'entry_fee', 'refund'];
export const TRANSACTION_STATUS_KEYS = ['pending', 'success', 'failed', 'reversed'];
export const USER_STATUS_KEYS = ['active', 'suspended', 'banned'];
export const ROLE_KEYS = ['player', 'moderator', 'admin', 'super_admin'];

export const transactionTypeLabels = {
  deposit: 'Dépôt',
  withdraw: 'Retrait',
  payout: 'Payout',
  entry_fee: 'Inscription',
  refund: 'Remboursement',
};

export const tournamentTypeLabels = {
  free: 'Gratuit',
  flash: 'Flash',
  mini: 'Mini',
  grand: 'Grand',
  premium: 'Premium',
};

export const roleLabels = {
  player: 'Joueur',
  moderator: 'Modérateur',
  admin: 'Admin',
  super_admin: 'Super Admin',
};
