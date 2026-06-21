import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import {
  User, ToggleRight, Server, Info, Lock, Camera, KeyRound,
  Database, Zap, Bell, ShieldAlert, DoorOpen, GitBranch, FileText, ChevronRight,
  Mail, ActivitySquare, Cpu,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { roleLabels } from '../constants/enums';
import { useApiData } from '../hooks/useApiData';
import healthService from '../services/health.service';
import authService from '../services/auth.service';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import Avatar from '../components/Avatar';
import PasswordInput from '../components/PasswordInput';
import { Skeleton } from '../components/Skeleton';
import { notify } from '../components/Toast';
import './Parametres.css';

const APP_VERSION = '1.0.0-MVP';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';
const ENVIRONMENT = import.meta.env.MODE === 'production' ? 'Production' : 'Development';

const NOTIF_SIGNUP_KEY = 'creveton_admin_notif_signup';
const NOTIF_CRASH_KEY = 'creveton_admin_notif_crash';

const SECTIONS = [
  { key: 'compte', label: 'Compte', icon: User },
  { key: 'flags', label: 'Feature flags', icon: ToggleRight },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'systeme', label: 'Système', icon: Server },
  { key: 'apropos', label: 'À propos', icon: Info },
];

/* Statut d'un check health (db/redis) → libellé + état booléen. */
function checkState(raw) {
  const ok = raw == null || raw === 'up' || raw === 'ok' || raw === 'operational';
  return { ok, label: ok ? 'Opérationnel' : 'Indisponible' };
}

/* uptime en secondes → « Xj Yh Zm » ou « Xh Ym ». */
function formatUptime(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return '—';
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}j ${h}h ${m}m`;
  return `${h}h ${m}m`;
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

/* ── Une ligne de réglage (flag ou notification) ── */
function ToggleRow({ icon: Icon, title, desc, locked, lockTag, lockHint, checked, onChange }) {
  return (
    <div className="settings-row">
      <div className="set-row-lead">
        <span className={`set-row-ic${locked ? ' is-locked' : ''}`}>
          {locked ? <Lock size={17} /> : <Icon size={17} />}
        </span>
        <div>
          <div className="set-row-title">
            {title}
            {lockTag && (
              <span className="set-lock-tag" title={lockHint}>
                <Lock size={11} /> {lockTag}
              </span>
            )}
          </div>
          <div className="set-row-desc">{desc}</div>
        </div>
      </div>
      <label className="switch" title={locked ? lockHint : undefined}>
        <input
          type="checkbox"
          checked={checked}
          disabled={locked}
          onChange={onChange}
          readOnly={locked}
        />
        <span className="track" />
      </label>
    </div>
  );
}

/* ── Section Feature flags ── */
function SectionFlags() {
  const maintenance = useUiStore((s) => s.maintenance);
  const setMaintenance = useUiStore((s) => s.setMaintenance);
  const [flags, setFlags] = useState({ push: true, registrations: true });

  const toggle = (key, msg) => (e) => {
    const on = e.target.checked;
    setFlags((f) => ({ ...f, [key]: on }));
    notify.success(`${msg} ${on ? 'activé' : 'désactivé'}`);
  };

  const toggleMaintenance = (e) => {
    const on = e.target.checked;
    setMaintenance(on);
    if (on) notify.info('Mode maintenance activé — l’accès joueur est bloqué.');
    else notify.success('Mode maintenance désactivé.');
  };

  return (
    <div className="card card-pad">
      <div className="set-section-head" style={{ marginBottom: 6 }}>
        <h2>Feature flags</h2>
        <p>Activez ou coupez des fonctionnalités de la plateforme sans redéploiement.</p>
      </div>

      <ToggleRow
        icon={Bell}
        title="Notifications push"
        desc="Envoi des alertes temps réel aux joueurs (résultats, tournois)."
        checked={flags.push}
        onChange={toggle('push', 'Notifications push')}
      />
      <ToggleRow
        icon={DoorOpen}
        title="Inscriptions ouvertes"
        desc="Autorise la création de nouveaux comptes joueur."
        checked={flags.registrations}
        onChange={toggle('registrations', 'Inscriptions')}
      />
      <ToggleRow
        icon={ShieldAlert}
        title="Mode maintenance"
        desc="Bloque temporairement l’accès joueur et affiche la bannière globale."
        checked={maintenance}
        onChange={toggleMaintenance}
      />
      <ToggleRow
        icon={Lock}
        title="Tournois payants"
        desc="Inscriptions, cagnottes et payouts en argent réel."
        locked
        lockTag="Licence requise"
        lockHint="Activation après licence (CDC §6)"
        checked={false}
      />

      <div className="banner-locked card-pad" style={{ marginTop: 14, borderRadius: 12, fontSize: 13 }}>
        <Lock size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
        Les tournois payants seront débloqués après obtention de la licence de jeu (CDC §6).
      </div>
    </div>
  );
}

/* ── Section Notifications (persistance localStorage, pas d'API) ── */
function SectionNotifications() {
  const [signup, setSignup] = useState(() => localStorage.getItem(NOTIF_SIGNUP_KEY) === 'true');
  const [crash, setCrash] = useState(() => localStorage.getItem(NOTIF_CRASH_KEY) === 'true');

  const toggleSignup = (e) => {
    const on = e.target.checked;
    setSignup(on);
    localStorage.setItem(NOTIF_SIGNUP_KEY, String(on));
    notify.success(`Alertes inscription ${on ? 'activées' : 'désactivées'}`);
  };

  const toggleCrash = (e) => {
    const on = e.target.checked;
    setCrash(on);
    localStorage.setItem(NOTIF_CRASH_KEY, String(on));
    notify.success(`Alertes crash ${on ? 'activées' : 'désactivées'}`);
  };

  return (
    <div className="card card-pad">
      <div className="set-section-head" style={{ marginBottom: 6 }}>
        <h2>Notifications</h2>
        <p>Préférences d’alertes par e-mail pour votre compte d’administrateur.</p>
      </div>

      <ToggleRow
        icon={Mail}
        title="E-mail à chaque nouvelle inscription"
        desc="Recevez un message dès qu’un joueur crée un compte."
        checked={signup}
        onChange={toggleSignup}
      />
      <ToggleRow
        icon={ActivitySquare}
        title="Alerte si taux de crash > 1 %"
        desc="Notification immédiate en cas de dégradation de la stabilité applicative."
        checked={crash}
        onChange={toggleCrash}
      />
    </div>
  );
}

/* ── Carte d'un service système (DB / Redis) ── */
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
      </div>
    </div>
  );
}

/* ── Une métrique chiffrée (temps de réponse, uptime, versions) ── */
function SysMetric({ icon: Icon, label, value, unit, hint }) {
  return (
    <div className="set-metric" title={hint}>
      <span className="set-metric-ic"><Icon size={16} /></span>
      <div className="set-metric-body">
        <div className="set-metric-label">{label}</div>
        <div className="set-metric-value">
          {value}{unit && <small>{unit}</small>}
        </div>
      </div>
    </div>
  );
}

/* ── Section Système (healthService + mesure latence client) ── */
function SectionSysteme() {
  const { data, loading } = useApiData(async () => {
    const t0 = performance.now();
    const res = await healthService.get();
    const latencyMs = Math.round(performance.now() - t0);
    return { ...res, latencyMs };
  }, []);

  const checks = data?.checks || {};
  const system = data?.system || {};

  return (
    <div className="card card-pad" style={{ background: 'transparent', border: 'none', boxShadow: 'none', padding: 0 }}>
      <div className="set-section-head" style={{ marginBottom: 16 }}>
        <h2>Système</h2>
        <p>État des services backend et métriques d’exécution en temps réel.</p>
      </div>

      {loading ? (
        <>
          <div className="set-sys-grid">
            {[0, 1].map((i) => <Skeleton key={i} h={108} r={16} />)}
          </div>
          <div className="set-metric-grid" style={{ marginTop: 16 }}>
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} h={64} r={14} />)}
          </div>
        </>
      ) : (
        <>
          <div className="set-sys-grid">
            <SysCard icon={Database} name="Base de données" state={checkState(checks.db)} />
            <SysCard icon={Zap} name="Redis" state={checkState(checks.redis)} />
          </div>

          <div className="set-metric-grid">
            <SysMetric
              icon={Server}
              label="Temps de réponse API"
              value={data?.latencyMs ?? '—'}
              unit="ms"
              hint="Durée de l’appel /health mesurée côté client."
            />
            <SysMetric
              icon={ActivitySquare}
              label="Uptime depuis démarrage"
              value={formatUptime(system.uptime_s)}
              hint="Temps écoulé depuis le dernier redémarrage du backend."
            />
            <SysMetric
              icon={Cpu}
              label="Version Node.js"
              value={system.node || '—'}
              hint="Runtime du serveur backend."
            />
            <SysMetric
              icon={Database}
              label="Version PostgreSQL"
              value={system.postgres || '—'}
              hint="Moteur de base de données."
            />
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

/* ── Modal mot de passe (react-hook-form + authService) ── */
function PasswordModal({ open, onClose }) {
  const {
    register, handleSubmit, reset, watch, formState: { errors, isSubmitting },
  } = useForm({ mode: 'onTouched' });

  const newPassword = watch('newPassword');

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const onSubmit = async (values) => {
    try {
      await authService.changePassword(values.currentPassword, values.newPassword);
      notify.success('Mot de passe mis à jour.');
      reset();
      onClose();
    } catch (err) {
      const status = err?.response?.status;
      const apiMsg = err?.response?.data?.message;
      let message = 'Échec de la mise à jour du mot de passe.';
      if (status === 400 || status === 401 || status === 403) {
        message = apiMsg || 'Mot de passe actuel incorrect.';
      } else if (apiMsg) {
        message = apiMsg;
      }
      notify.error(message);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Changer le mot de passe"
      footer={(
        <>
          <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" type="submit" form="set-pwd-form" disabled={isSubmitting}>
            {isSubmitting ? 'Mise à jour…' : 'Mettre à jour'}
          </button>
        </>
      )}
    >
      <form id="set-pwd-form" className="set-form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <label>
          Mot de passe actuel
          <PasswordInput
            autoComplete="current-password"
            aria-invalid={errors.currentPassword ? 'true' : 'false'}
            {...register('currentPassword', { required: 'Le mot de passe actuel est requis.' })}
          />
          {errors.currentPassword && <span className="set-form-err">{errors.currentPassword.message}</span>}
        </label>

        <label>
          Nouveau mot de passe
          <PasswordInput
            autoComplete="new-password"
            aria-invalid={errors.newPassword ? 'true' : 'false'}
            {...register('newPassword', {
              required: 'Le nouveau mot de passe est requis.',
              minLength: { value: 8, message: 'Minimum 8 caractères.' },
              validate: (v, all) =>
                v !== all.currentPassword || 'Le nouveau mot de passe doit différer de l’actuel.',
            })}
          />
          {errors.newPassword && <span className="set-form-err">{errors.newPassword.message}</span>}
        </label>

        <label>
          Confirmer le nouveau mot de passe
          <PasswordInput
            autoComplete="new-password"
            aria-invalid={errors.confirmPassword ? 'true' : 'false'}
            {...register('confirmPassword', {
              required: 'Veuillez confirmer le nouveau mot de passe.',
              validate: (v) => v === newPassword || 'Les mots de passe ne correspondent pas.',
            })}
          />
          {errors.confirmPassword && <span className="set-form-err">{errors.confirmPassword.message}</span>}
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
          {section === 'notifications' && <SectionNotifications />}
          {section === 'systeme' && <SectionSysteme />}
          {section === 'apropos' && <SectionApropos />}
        </div>
      </div>

      <PasswordModal open={pwdOpen} onClose={() => setPwdOpen(false)} />
    </>
  );
}
