import { NavLink, Link } from 'react-router-dom';
import { LayoutDashboard, Trophy, FileQuestion, Gamepad2, Swords, Users, Settings } from 'lucide-react';
import dashboardService from '../../services/dashboard.service';
import { useApiData } from '../../hooks/useApiData';
import Logo from '../Logo';

const NAV = [
  {
    title: 'Vue générale',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/classement', label: 'Classement', icon: Trophy },
    ],
  },
  {
    title: 'Contenu',
    items: [
      { to: '/questions', label: 'Questions', icon: FileQuestion, badgeKey: 'pending' },
      { to: '/sessions', label: 'Parties', icon: Gamepad2 },
      { to: '/tournaments', label: 'Tournois', icon: Swords },
    ],
  },
  {
    title: 'Utilisateurs',
    items: [{ to: '/users', label: 'Utilisateurs', icon: Users }],
  },
  {
    title: 'Paramètres',
    items: [{ to: '/settings', label: 'Paramètres', icon: Settings }],
  },
];

export default function Sidebar() {
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
          <div className="nav-section" key={section.title}>
            <div className="nav-section-title">{section.title}</div>
            {section.items.map(({ to, label, icon: Icon, end, badgeKey }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={label}>
                <Icon className="nav-icon" size={18} />
                <span className="nav-label">{label}</span>
                {badgeKey === 'pending' && pending > 0 && <span className="nav-badge">{pending}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
