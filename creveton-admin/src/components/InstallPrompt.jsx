import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

const DISMISS_KEY = 'creveton_admin_pwa_dismissed';

/**
 * Bannière discrète « Installer l'application » : n'apparaît que lorsque le
 * navigateur émet `beforeinstallprompt` (PWA installable, non encore installée),
 * que l'app n'est pas déjà lancée en mode standalone, et que l'utilisateur ne
 * l'a pas masquée définitivement (localStorage).
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null);

  useEffect(() => {
    // Ne JAMAIS écouter si déjà masquée par l'utilisateur ou déjà installée
    // (lancée en standalone) — vérifié AVANT d'attacher l'écouteur.
    const dismissed = localStorage.getItem(DISMISS_KEY) === 'true';
    const installed = window.matchMedia('(display-mode: standalone)').matches;
    if (dismissed || installed) return undefined;

    const handler = (e) => {
      e.preventDefault();
      if (localStorage.getItem(DISMISS_KEY) === 'true') return;
      setDeferred(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    // Une fois installée, on retire la bannière.
    const onInstalled = () => setDeferred(null);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!deferred) return null;

  const install = async () => {
    deferred.prompt();
    try {
      const { outcome } = await deferred.userChoice;
      // Acceptée → on n'a plus jamais besoin de reproposer l'installation.
      if (outcome === 'accepted') localStorage.setItem(DISMISS_KEY, 'true');
    } finally {
      setDeferred(null);
    }
  };

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, 'true');
    setDeferred(null);
  };

  return (
    <div className="install-banner" role="region" aria-label="Installer l'application">
      <span className="install-banner__text">
        <Download size={16} aria-hidden="true" />
        Installer Creveton Admin comme application
      </span>
      <span className="install-banner__actions">
        <button type="button" className="install-banner__cta" onClick={install}>
          Installer
        </button>
        <button
          type="button"
          className="install-banner__close"
          onClick={dismiss}
          aria-label="Ne plus afficher"
          title="Ne plus afficher"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </span>
    </div>
  );
}
