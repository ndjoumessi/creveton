import {
  questionStatusColors,
  tournamentStatusColors,
  transactionStatusColors,
  userStatusColors,
} from '../constants/theme';

const MAPS = {
  question: questionStatusColors,
  tournament: tournamentStatusColors,
  transaction: transactionStatusColors,
  user: userStatusColors,
};

/** Badge coloré selon le statut. `kind` ∈ question|tournament|transaction|user. */
export default function StatusBadge({ status, kind = 'question' }) {
  const map = MAPS[kind] || {};
  const cfg = map[status] || { bg: '#eceff1', fg: '#546e7a', label: status };
  return (
    <span className="badge" style={{ background: cfg.bg, color: cfg.fg }}>
      {cfg.label}
    </span>
  );
}
