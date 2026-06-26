import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import Sidebar from './Sidebar';
import Header from './Header';
import ErrorBoundary from '../ErrorBoundary';
import CommandPalette from '../CommandPalette';
import ScrollToTop from '../ScrollToTop';
import InstallPrompt from '../InstallPrompt';
import { useUiStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { setDateTimeZone } from '../../utils/format';

export default function Layout() {
  const { pathname } = useLocation();
  const maintenance = useUiStore((s) => s.maintenance);
  // Aligne l'affichage des dates sur le fuseau de l'admin connecté (users.timezone).
  const timezone = useAuthStore((s) => s.user?.timezone);
  useEffect(() => { setDateTimeZone(timezone || null); }, [timezone]);

  // Drawer mobile (< 768px) : état local + prop-drilling vers Header/Sidebar.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const closeMobileNav = () => setMobileNavOpen(false);
  const toggleMobileNav = () => setMobileNavOpen((v) => !v);
  // Se referme à chaque navigation (filet, en plus du onClick sur chaque lien).
  useEffect(() => { setMobileNavOpen(false); }, [pathname]);

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Aller au contenu principal</a>
      <Sidebar mobileNavOpen={mobileNavOpen} onCloseMobileNav={closeMobileNav} />
      <div
        className={`mobile-nav-overlay${mobileNavOpen ? ' is-open' : ''}`}
        onClick={closeMobileNav}
        aria-hidden="true"
      />
      <div className="app-main">
        {maintenance && (
          <div className="maintenance-banner" role="alert">
            <AlertTriangle size={16} />
            Mode maintenance activé — l’application mobile est temporairement indisponible pour les joueurs.
          </div>
        )}
        <Header mobileNavOpen={mobileNavOpen} onToggleMobileNav={toggleMobileNav} />
        <main className="app-content" id="main-content" tabIndex={-1}>
          {/* Boundary par page : une erreur de rendu n'affiche jamais un écran
              blanc, et la clé route réinitialise l'état à chaque navigation. */}
          <ErrorBoundary key={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      <CommandPalette />
      <ScrollToTop />
      <InstallPrompt />
    </div>
  );
}
