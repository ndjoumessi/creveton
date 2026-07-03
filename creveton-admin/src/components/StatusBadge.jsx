import {
  pastels,
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

/** Badge de statut coloré (avec pastille). `kind` ∈ question|tournament|transaction|user. */
export default function StatusBadge({ status, kind = 'question' }) {
  const map = MAPS[kind] || {};
  const cfg = map[status] || { bg: pastels.neutral, fg: pastels.neutralFg, label: status };
  return (
    <span className="badge" style={{ background: cfg.bg, color: cfg.fg }}>
      <span className="badge-dot" style={{ background: cfg.fg }} />
      {cfg.label}
    </span>
  );
}
