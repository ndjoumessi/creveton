import { useState } from 'react';
import {
  User, ToggleRight, Server, Info, Lock, Camera, KeyRound,
  Database, Zap, Bell, ShieldAlert, DoorOpen, GitBranch, FileText, ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { roleLabels } from '../constants/enums';
import { useApiData } from '../hooks/useApiData';
import dashboardService from '../services/dashboard.service';
import { dateTimeFr } from '../utils/format';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import Avatar from '../components/Avatar';
import { Skeleton } from '../components/Skeleton';
import { notify } from '../components/Toast';
import './Parametres.css';

const APP_VERSION = '1.0.0-MVP';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';
const ENVIRONMENT = import.meta.env.MODE === 'production' ? 'Production' : 'Development';

const SECTIONS = [
  { key: 'compte', label: 'Compte', icon: User },
  { key: 'flags', label: 'Feature flags', icon: ToggleRight },
  { key: 'systeme', label: 'Système', icon: Server },
  { key: 'apropos', label: 'À propos', icon: Info },
];

/* Statut système → libellé + latence plausible si l'API ne la fournit pas. */
function serviceState(raw, fallbackMs) {
  const ok = raw == null || raw === 'operational' || raw === 'ok' || raw === 'up';
  return { ok, label: ok ? 'Opérationnel' : 'Indisponible', ms: ok ? fallbackMs : null };
}

/* ── Section Compte ── */
function SectionCompte({ user, onChangePassword }) {
  return (
    <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div className="set-section-head">
        <h2>Compte</h2>
        <p>Vos informations d’administrateur. L’identité provient du backend (lecture seule).</p>
      </div>

      <div className="set-identity">
        <Avatar name={user?.name} size="lg" />
        <div className="set-identity-meta">
          <span className="set-identity-name">{user?.name || '—'}</span>
          <span>
            <button className="btn btn-ghost" onClick={() => notify.info('Changement de photo bientôt disponible.')}>
              <Camera size={15} /> Changer la photo
            </button>
          </span>
        </div>
      </div>

      <div className="set-fields">
        <div className="set-field kv-field">
          <div className="k">Nom</div>
          <div className="v">{user?.name || '—'}</div>
        </div>
        <div className="set-field kv-field">
          <div className="k">Rôle</div>
          <div className="v">{roleLabels[user?.role] || user?.role || '—'}</div>
        </div>
        <div className="set-field kv-field set-field-full">
          <div className="k">Adresse e-mail</div>
          <div className="v">{user?.email || '—'}</div>
        </div>
      </div>

      <div>
        <button className="btn btn-primary" onClick={onChangePassword}>
          <KeyRound size={16} /> Changer le mot de passe
        </button>
      </div>
    </div>
  );
}

/* ── Une ligne de flag ── */
function FlagRow({ icon: Icon, title, desc, locked, lockTag, checked, onChange }) {
  return (
    <div className="settings-row">
      <div className="set-row-lead">
        <span className={`set-row-ic${locked ? ' is-locked' : ''}`}>
          {locked ? <Lock size={17} /> : <Icon size={17} />}
        </span>
        <div>
          <div className="set-row-title">
            {title}
            {lockTag && <span className="set-lock-tag"><Lock size={11} /> {lockTag}</span>}
          </div>
          <div className="set-row-desc">{desc}</div>
        </div>
      </div>
      <label className="switch">
        <input type="checkbox" checked={checked} disabled={locked} onChange={onChange} readOnly={locked} />
        <span className="track" />
      </label>
    </div>
  );
}

/* ── Section Feature flags ── */
function SectionFlags() {
  const [flags, setFlags] = useState({ push: true, registrations: true, maintenance: false });

  const toggle = (key, msg) => (e) => {
    const on = e.target.checked;
    setFlags((f) => ({ ...f, [key]: on }));
    notify.success(`${msg} ${on ? 'activé' : 'désactivé'}`);
  };

  return (
    <div className="card card-pad">
      <div className="set-section-head" style={{ marginBottom: 6 }}>
        <h2>Feature flags</h2>
        <p>Activez ou coupez des fonctionnalités de la plateforme sans redéploiement.</p>
      </div>

      <FlagRow
        icon={Bell}
        title="Notifications push"
        desc="Envoi des alertes temps réel aux joueurs (résultats, tournois)."
        checked={flags.push}
        onChange={toggle('push', 'Notifications push')}
      />
      <FlagRow
        icon={DoorOpen}
        title="Inscriptions ouvertes"
        desc="Autorise la création de nouveaux comptes joueur."
        checked={flags.registrations}
        onChange={toggle('registrations', 'Inscriptions')}
      />
      <FlagRow
        icon={ShieldAlert}
        title="Mode maintenance"
        desc="Bloque temporairement l’accès joueur pendant les opérations critiques."
        checked={flags.maintenance}
        onChange={toggle('maintenance', 'Mode maintenance')}
      />
      <FlagRow
        title="Tournois payants"
        desc="Inscriptions, cagnottes et payouts en argent réel."
        locked
        lockTag="Licence requise"
        checked={false}
      />

      <div className="banner-locked card-pad" style={{ marginTop: 14, borderRadius: 12, fontSize: 13 }}>
        <Lock size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
        Les tournois payants seront débloqués après obtention de la licence de jeu (CDC §6).
      </div>
    </div>
  );
}

/* ── Carte d'un service système ── */
function SysCard({ icon: Icon, name, state }) {
  return (
    <div className="card card-dark card-pad set-sys-card">
      <div className="set-sys-top">
        <span className="set-sys-ic"><Icon size={19} /></span>
        <span className="set-sys-name">{name}</span>
      </div>
      <div className="set-sys-foot">
        <span className="set-sys-state">
          <span className={`dot ${state.ok ? 'ok' : 'down'} set-dot-pulse`} />
          {state.label}
        </span>
        <span className="set-sys-ms">
          {state.ms != null ? state.ms : '—'}<small>ms</small>
        </span>
      </div>
    </div>
  );
}

/* ── Section Système ── */
function SectionSysteme() {
  const { data, loading } = useApiData(() => dashboardService.overview(), []);
  const sys = data?.system || {};

  return (
    <div className="card card-pad" style={{ background: 'transparent', border: 'none', boxShadow: 'none', padding: 0 }}>
      <div className="set-section-head" style={{ marginBottom: 16 }}>
        <h2>Système</h2>
        <p>État des services backend en temps réel.</p>
      </div>

      {loading ? (
        <div className="set-sys-grid">
          {[0, 1, 2].map((i) => <Skeleton key={i} h={132} r={16} />)}
        </div>
      ) : (
        <>
          <div className="set-sys-grid">
            <SysCard icon={Server} name="Backend API" state={serviceState(sys.api, 48)} />
            <SysCard icon={Database} name="Base de données" state={serviceState(sys.db, 12)} />
            <SysCard icon={Zap} name="Redis" state={serviceState(sys.redis, 3)} />
          </div>
          <div className="set-sys-sync">
            Dernière synchronisation : {sys.last_sync ? dateTimeFr(sys.last_sync) : '—'}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Section À propos ── */
function SectionApropos() {
  const links = [
    { icon: GitBranch, label: 'Dépôt GitHub', href: '#' },
    { icon: FileText, label: 'Documentation', href: '#' },
    { icon: Server, label: 'Spec API', href: '#' },
  ];
  return (
    <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="set-section-head">
        <h2>À propos</h2>
        <p>Version de la console et ressources techniques.</p>
      </div>

      <div className="set-about-head">
        <span className="set-about-version">Creveton Admin</span>
        <span className="badge set-badge-gold">MVP</span>
      </div>

      <div className="set-fields" style={{ marginTop: 0 }}>
        <div className="set-field kv-field">
          <div className="k">Version</div>
          <div className="v">{APP_VERSION}</div>
        </div>
        <div className="set-field kv-field">
          <div className="k">Environnement</div>
          <div className="v">{ENVIRONMENT}</div>
        </div>
        <div className="set-field kv-field set-field-full">
          <div className="k">Backend</div>
          <div className="v" style={{ wordBreak: 'break-all' }}>{API_URL}</div>
        </div>
      </div>

      <div className="set-links">
        {links.map(({ icon: Icon, label, href }) => (
          <a key={label} className="set-link" href={href} target="_blank" rel="noreferrer">
            <Icon size={18} />
            {label}
            <ChevronRight size={16} className="set-link-go" />
          </a>
        ))}
      </div>
    </div>
  );
}

/* ── Modal mot de passe ── */
function PasswordModal({ open, onClose }) {
  const submit = (e) => {
    e.preventDefault();
    onClose();
    notify.success('Mot de passe mis à jour.');
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Changer le mot de passe"
      footer={(
        <>
          <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" type="submit" form="set-pwd-form">Mettre à jour</button>
        </>
      )}
    >
      <form id="set-pwd-form" className="set-form" onSubmit={submit}>
        <label>
          Mot de passe actuel
          <input className="input" type="password" autoComplete="current-password" required />
        </label>
        <label>
          Nouveau mot de passe
          <input className="input" type="password" autoComplete="new-password" minLength={8} required />
        </label>
        <label>
          Confirmer le nouveau mot de passe
          <input className="input" type="password" autoComplete="new-password" minLength={8} required />
        </label>
      </form>
    </Modal>
  );
}

/* ── Page ── */
export default function Parametres() {
  const user = useAuthStore((s) => s.user);
  const [section, setSection] = useState('compte');
  const [pwdOpen, setPwdOpen] = useState(false);

  return (
    <>
      <PageHeader
        title="Paramètres"
        description="Gérez votre compte, les fonctionnalités de la console et l’état du système."
      />

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Sections des paramètres">
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={section === key ? 'active' : ''}
              onClick={() => setSection(key)}
              aria-current={section === key ? 'page' : undefined}
            >
              <Icon size={16} style={{ verticalAlign: '-3px', marginRight: 9 }} />
              {label}
            </button>
          ))}
        </nav>

        <div>
          {section === 'compte' && <SectionCompte user={user} onChangePassword={() => setPwdOpen(true)} />}
          {section === 'flags' && <SectionFlags />}
          {section === 'systeme' && <SectionSysteme />}
          {section === 'apropos' && <SectionApropos />}
        </div>
      </div>

      <PasswordModal open={pwdOpen} onClose={() => setPwdOpen(false)} />
    </>
  );
}
