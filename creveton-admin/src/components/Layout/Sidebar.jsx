import { NavLink } from 'react-router-dom';
import { LayoutDashboard, BarChart3, FileQuestion, Trophy, Users, ArrowLeftRight, Settings } from 'lucide-react';

const NAV = [
  {
    title: 'Vue générale',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/analytics', label: 'Analytique', icon: BarChart3 },
    ],
  },
  {
    title: 'Contenu',
    items: [
      { to: '/questions', label: 'Questions', icon: FileQuestion },
      { to: '/tournaments', label: 'Tournois', icon: Trophy },
    ],
  },
  {
    title: 'Utilisateurs',
    items: [{ to: '/users', label: 'Utilisateurs', icon: Users }],
  },
  {
    title: 'Finances',
    items: [{ to: '/transactions', label: 'Transactions', icon: ArrowLeftRight }],
  },
  {
    title: 'Paramètres',
    items: [{ to: '/settings', label: 'Paramètres', icon: Settings }],
  },
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo">C</div>
        <span className="sidebar-brand-name">Creveton</span>
      </div>
      <nav className="sidebar-nav">
        {NAV.map((section) => (
          <div className="nav-section" key={section.title}>
            <div className="nav-section-title">{section.title}</div>
            {section.items.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Icon className="nav-icon" size={18} />
                <span className="nav-label">{label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
