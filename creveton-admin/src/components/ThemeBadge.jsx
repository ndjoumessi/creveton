import { themeBadgeColors } from '../constants/theme';

/** Badge de thème — emoji + couleur distinctive par thème (culture, géo, histoire…). */
export default function ThemeBadge({ theme }) {
  const cfg = themeBadgeColors[theme] || { bg: '#f3f4f6', fg: '#6b7280', label: theme, icon: '' };
  return (
    <span className="badge badge-theme" style={{ background: cfg.bg, color: cfg.fg }}>
      {cfg.icon && <span className="badge-emoji" aria-hidden="true">{cfg.icon}</span>}
      {cfg.label}
    </span>
  );
}
