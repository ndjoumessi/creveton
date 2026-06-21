import { useState } from 'react';
import { KeyRound, ShieldAlert, Info } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { roleLabels } from '../constants/enums';
import PageHeader from '../components/PageHeader';
import { notify } from '../components/Toast';

const APP_VERSION = '1.0.0-MVP';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';
const ENVIRONMENT = import.meta.env.MODE === 'production' ? 'Production' : 'Development';

/* ---------- Ligne de réglage avec interrupteur ---------- */
function SettingsRow({ icon, label, description, children }) {
  return (
    <div className="settings-row">
      <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
        {icon}
        <div>
          <div style={{ fontWeight: 500, color: 'var(--ink)' }}>{label}</div>
          {description && <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{description}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

/* ---------- Page ---------- */
export default function Parametres() {
  const user = useAuthStore((s) => s.user);
  const [maint, setMaint] = useState(false);

  const toggleMaint = (e) => {
    const on = e.target.checked;
    setMaint(on);
    notify.success(`Mode maintenance ${on ? 'activé' : 'désactivé'}`);
  };

  return (
    <>
      <PageHeader
        title="Paramètres"
        description="Gérez votre compte, les fonctionnalités de la console et consultez les informations système."
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Section 1 — Compte admin */}
        <div className="card card-pad">
          <h3 className="card-title">Compte admin</h3>
          <dl className="kv" style={{ marginTop: 16 }}>
            <dt>Nom</dt><dd>{user?.name || '—'}</dd>
            <dt>Email</dt><dd>{user?.email || '—'} <span className="muted">(lecture seule)</span></dd>
            <dt>Rôle</dt><dd>{roleLabels[user?.role] || user?.role || '—'}</dd>
          </dl>
          <button
            className="btn"
            style={{ marginTop: 16 }}
            onClick={() => notify.info('Fonctionnalité bientôt disponible.')}
          >
            <KeyRound size={16} /> Changer le mot de passe
          </button>
        </div>

        {/* Section 2 — Feature flags */}
        <div className="card card-pad">
          <h3 className="card-title">Feature flags</h3>
          <SettingsRow
            label="Tournois payants"
            description="Activation prévue après obtention de la licence (CDC §6)."
          >
            <label className="switch">
              <input type="checkbox" checked={false} disabled readOnly />
              <span className="track" />
            </label>
          </SettingsRow>
          <SettingsRow
            icon={<ShieldAlert size={18} style={{ color: 'var(--muted)', marginTop: 1 }} />}
            label="Mode maintenance"
            description="Bloque temporairement l’accès joueur pendant les opérations critiques."
          >
            <label className="switch">
              <input type="checkbox" checked={maint} onChange={toggleMaint} />
              <span className="track" />
            </label>
          </SettingsRow>
        </div>

        {/* Section 3 — À propos */}
        <div className="card card-pad">
          <h3 className="card-title"><Info size={16} style={{ verticalAlign: '-2px', marginRight: 6 }} />À propos</h3>
          <dl className="kv" style={{ marginTop: 16 }}>
            <dt>Version app</dt><dd>{APP_VERSION}</dd>
            <dt>Backend</dt><dd>{API_URL}</dd>
            <dt>Environnement</dt><dd>{ENVIRONMENT}</dd>
          </dl>
        </div>
      </div>
    </>
  );
}
