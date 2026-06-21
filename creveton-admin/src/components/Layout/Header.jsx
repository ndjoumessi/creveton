import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { RefreshCw, LogOut, Command } from 'lucide-react';
import { useUiStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { triggerRefresh } from '../../hooks/useApiData';
import { notify } from '../Toast';
import Modal from '../Modal';

const TITLES = {
  '/dashboard': 'Dashboard',
  '/classement': 'Classement',
  '/questions': 'Questions',
  '/sessions': 'Parties',
  '/tournaments': 'Tournois',
  '/users': 'Utilisateurs',
  '/settings': 'Paramètres',
};

export default function Header() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const lang = useUiStore((s) => s.lang);
  const setLang = useUiStore((s) => s.setLang);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const title = TITLES[pathname] || 'Console';
  const initials = (user?.name || 'AD').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  const onRefresh = () => {
    triggerRefresh();
    notify.success('Données actualisées');
  };
  const doLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };
  // Ouvre la palette de commandes (Cmd+K) via un faux événement clavier.
  const openPalette = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));

  return (
    <header className="header">
      <div className="breadcrumb">
        <Link to="/dashboard" className="crumb-muted" title="Console d’administration">Console</Link>
        <span className="crumb-sep">/</span>
        <span className="crumb-current">{title}</span>
      </div>

      <div className="header-spacer" />

      <button className="cmdk-trigger" onClick={openPalette} title="Palette de commandes (⌘K)">
        <Command size={14} /> <span>Rechercher</span> <kbd>⌘K</kbd>
      </button>

      <div className="header-sep" />

      <span className="live-badge"><span className="live-dot" /> Live</span>

      <div className="header-sep" />

      <div className="lang-toggle">
        <button className={lang === 'fr' ? 'active' : ''} onClick={() => setLang('fr')}>FR</button>
        <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>EN</button>
      </div>

      <button className="header-btn" onClick={onRefresh} title="Actualiser les données"><RefreshCw size={15} /> Actualiser</button>

      <div className="header-sep" />

      <div className="profile-avatar" title={user?.name || 'Admin'}>{initials}</div>

      <button className="header-btn" onClick={() => setConfirmLogout(true)} title="Déconnexion" aria-label="Déconnexion">
        <LogOut size={17} />
      </button>

      <Modal
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        title="Déconnexion"
        footer={(
          <>
            <button className="btn" onClick={() => setConfirmLogout(false)}>Annuler</button>
            <button className="btn btn-danger" onClick={doLogout}><LogOut size={15} /> Se déconnecter</button>
          </>
        )}
      >
        <p style={{ margin: 0 }}>Voulez-vous vraiment vous déconnecter de la console ?</p>
      </Modal>
    </header>
  );
}
