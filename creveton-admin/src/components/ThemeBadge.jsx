import { themeBadgeColors } from '../constants/theme';

/** Badge de thème — couleur distinctive par thème (culture, géo, histoire…). */
export default function ThemeBadge({ theme }) {
  const cfg = themeBadgeColors[theme] || { bg: '#f3f4f6', fg: '#6b7280', label: theme };
  return (
    <span className="badge" style={{ background: cfg.bg, color: cfg.fg }}>
      <span className="badge-dot" style={{ background: cfg.fg }} />
      {cfg.label}
    </span>
  );
}
