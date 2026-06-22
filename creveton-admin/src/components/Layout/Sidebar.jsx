import { NavLink, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, Trophy, FileQuestion, Gamepad2, Swords, Users, Settings, UsersRound, ShieldCheck, Headphones } from 'lucide-react';
import dashboardService from '../../services/dashboard.service';
import { useApiData } from '../../hooks/useApiData';
import Logo from '../Logo';

const NAV = [
  {
    titleKey: 'nav.general',
    items: [
      { to: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard, end: true },
      { to: '/classement', labelKey: 'nav.leaderboard', icon: Trophy },
    ],
  },
  {
    titleKey: 'nav.content',
    items: [
      { to: '/questions', labelKey: 'nav.questions', icon: FileQuestion, badgeKey: 'pending' },
      { to: '/sessions', labelKey: 'nav.sessions', icon: Gamepad2 },
      { to: '/tournaments', labelKey: 'nav.tournaments', icon: Swords },
    ],
  },
  {
    titleKey: 'nav.userSection',
    items: [{ to: '/users', labelKey: 'nav.users', icon: Users }],
  },
  {
    titleKey: 'nav.teamSection',
    items: [
      { to: '/team', labelKey: 'nav.team', icon: UsersRound, end: true },
      { to: '/team/roles', labelKey: 'nav.roles', icon: ShieldCheck },
      { to: '/support', labelKey: 'nav.support', icon: Headphones },
    ],
  },
  {
    titleKey: 'nav.params',
    items: [{ to: '/settings', labelKey: 'nav.settings', icon: Settings }],
  },
];

export default function Sidebar() {
  const { t } = useTranslation();
  // Compteur de questions en attente pour le badge de notification.
  const { data } = useApiData(() => dashboardService.overview().catch(() => null), [], { pollMs: 60000 });
  const pending = data?.pending_questions?.length || 0;

  return (
    <aside className="sidebar">
      <Link to="/dashboard" className="sidebar-brand" aria-label="Tableau de bord Creveton">
        <Logo size={40} className="sidebar-logo-svg" />
        <span className="sidebar-brand-name">Creveton</span>
      </Link>
      <nav className="sidebar-nav">
        {NAV.map((section) => (
          <div className="nav-section" key={section.titleKey}>
            <div className="nav-section-title">{t(section.titleKey)}</div>
            {section.items.map(({ to, labelKey, icon: Icon, end, badgeKey }) => {
              const label = t(labelKey);
              return (
                <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={label}>
                  <Icon className="nav-icon" size={18} />
                  <span className="nav-label">{label}</span>
                  {badgeKey === 'pending' && pending > 0 && <span className="nav-badge">{pending}</span>}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
