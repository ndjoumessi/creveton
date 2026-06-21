import { useLocation, useNavigate } from 'react-router-dom';
import { Menu, RefreshCw, LogOut } from 'lucide-react';
import { useUiStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { triggerRefresh } from '../../hooks/useApiData';
import { notify } from '../Toast';

const TITLES = {
  '/': 'Dashboard',
  '/analytics': 'Analytique',
  '/alerts': 'Alertes',
  '/support': 'Support',
  '/users': 'Utilisateurs',
  '/kyc': 'Vérification KYC',
  '/transactions': 'Transactions',
  '/finances': 'Finances & Revenus',
  '/wallet-ops': 'Recharges & Retraits',
  '/compliance': 'Conformité ANIF',
  '/audit': 'Journal Audit',
  '/team': 'Équipe Admin',
  '/questions': 'Questions',
  '/tournaments': 'Tournois',
  '/challenges': 'Challenges',
  '/settings': 'Paramètres',
};

export default function Header() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const lang = useUiStore((s) => s.lang);
  const setLang = useUiStore((s) => s.setLang);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const title = TITLES[pathname] || 'Creveton Admin';
  const initials = (user?.name || 'AD').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  const onRefresh = () => {
    triggerRefresh();
    notify.success('Données actualisées');
  };

  const onLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="header">
      <button className="icon-btn" onClick={toggleSidebar} aria-label="Menu"><Menu size={18} /></button>
      <div className="breadcrumb">
        <span className="crumb-muted">Console</span>
        <span>/</span>
        <span>{title}</span>
      </div>

      <div className="header-spacer" />

      <span className="live-badge"><span className="live-dot" /> Live</span>

      <div className="lang-toggle">
        <button className={lang === 'fr' ? 'active' : ''} onClick={() => setLang('fr')}>FR</button>
        <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>EN</button>
      </div>

      <button className="btn btn-sm" onClick={onRefresh}><RefreshCw size={15} /> Actualiser</button>

      <div className="profile">
        <div className="avatar">{initials}</div>
        <div className="stack" style={{ gap: 0 }}>
          <strong style={{ fontSize: 13 }}>{user?.name || 'Admin'}</strong>
          <span className="muted" style={{ fontSize: 11.5 }}>{user?.role || 'admin'}</span>
        </div>
      </div>

      <button className="icon-btn" onClick={onLogout} title="Déconnexion" aria-label="Déconnexion">
        <LogOut size={17} />
      </button>
    </header>
  );
}
