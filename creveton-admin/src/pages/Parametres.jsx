import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
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
  { key: 'compte', labelKey: 'settings.sections.account', icon: User },
  { key: 'flags', labelKey: 'settings.sections.flags', icon: ToggleRight },
  { key: 'notifications', labelKey: 'settings.sections.notifications', icon: Bell },
  { key: 'systeme', labelKey: 'settings.sections.system', icon: Server },
  { key: 'apropos', labelKey: 'settings.sections.about', icon: Info },
];

/* Statut d'un check health (db/redis) → libellé + état booléen. */
function checkState(raw, t) {
  const ok = raw == null || raw === 'up' || raw === 'ok' || raw === 'operational';
  return { ok, label: ok ? t('dashboard.system.operational') : t('dashboard.system.down') };
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
  const { t } = useTranslation();
  return (
    <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div className="set-section-head">
        <h2>{t('settings.sections.account')}</h2>
        <p>{t('settings.desc.account')}</p>
      </div>

      <div className="set-identity">
        <Avatar name={user?.name} size="lg" />
        <div className="set-identity-meta">
          <span className="set-identity-name">{user?.name || '—'}</span>
          <span>
            <button className="btn btn-ghost" onClick={() => notify.info(t('settings.notify.avatarSoon'))}>
              <Camera size={15} /> {t('settings.account.avatar')}
            </button>
          </span>
        </div>
      </div>

      <div className="set-fields">
        <div className="set-field kv-field">
          <div className="k">{t('settings.account.displayName')}</div>
          <div className="v">{user?.name || '—'}</div>
        </div>
        <div className="set-field kv-field">
          <div className="k">{t('users.columns.role')}</div>
          <div className="v">{roleLabels[user?.role] || user?.role || '—'}</div>
        </div>
        <div className="set-field kv-field set-field-full">
          <div className="k">{t('login.email')}</div>
          <div className="v">{user?.email || '—'}</div>
        </div>
      </div>

      <div>
        <button className="btn btn-primary" onClick={onChangePassword}>
          <KeyRound size={16} /> {t('settings.security.changePassword')}
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
  const { t } = useTranslation();
  const maintenance = useUiStore((s) => s.maintenance);
  const setMaintenance = useUiStore((s) => s.setMaintenance);
  const [flags, setFlags] = useState({ push: true, registrations: true });

  const toggle = (key, msg) => (e) => {
    const on = e.target.checked;
    setFlags((f) => ({ ...f, [key]: on }));
    notify.success(`${msg} ${on ? t('settings.notify.on') : t('settings.notify.off')}`);
  };

  const toggleMaintenance = (e) => {
    const on = e.target.checked;
    setMaintenance(on);
    if (on) notify.info(t('settings.notify.maintenanceOn'));
    else notify.success(t('settings.notify.maintenanceOff'));
  };

  return (
    <div className="card card-pad">
      <div className="set-section-head" style={{ marginBottom: 6 }}>
        <h2>{t('settings.sections.flags')}</h2>
        <p>{t('settings.desc.flags')}</p>
      </div>

      <ToggleRow
        icon={Bell}
        title={t('settings.notify.pushTitle')}
        desc={t('settings.desc.push')}
        checked={flags.push}
        onChange={toggle('push', t('settings.notify.pushTitle'))}
      />
      <ToggleRow
        icon={DoorOpen}
        title={t('settings.flags.openRegistration')}
        desc={t('settings.flags.openRegistrationDesc')}
        checked={flags.registrations}
        onChange={toggle('registrations', t('settings.flags.openRegistration'))}
      />
      <ToggleRow
        icon={ShieldAlert}
        title={t('settings.flags.maintenance')}
        desc={t('settings.flags.maintenanceDesc')}
        checked={maintenance}
        onChange={toggleMaintenance}
      />
      <ToggleRow
        icon={Lock}
        title={t('settings.flags.paidTournaments')}
        desc={t('settings.desc.paidTournaments')}
        locked
        lockTag={t('settings.flags.requiresLicense')}
        lockHint={t('settings.misc.lockHint')}
        checked={false}
      />

      <div className="banner-locked card-pad" style={{ marginTop: 14, borderRadius: 12, fontSize: 13 }}>
        <Lock size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
        {t('settings.misc.paidBanner')}
      </div>
    </div>
  );
}

/* ── Section Notifications (persistance localStorage, pas d'API) ── */
function SectionNotifications() {
  const { t } = useTranslation();
  const [signup, setSignup] = useState(() => localStorage.getItem(NOTIF_SIGNUP_KEY) === 'true');
  const [crash, setCrash] = useState(() => localStorage.getItem(NOTIF_CRASH_KEY) === 'true');

  const toggleSignup = (e) => {
    const on = e.target.checked;
    setSignup(on);
    localStorage.setItem(NOTIF_SIGNUP_KEY, String(on));
    notify.success(`${t('settings.notify.signupAlerts')} ${on ? t('settings.notify.onF') : t('settings.notify.offF')}`);
  };

  const toggleCrash = (e) => {
    const on = e.target.checked;
    setCrash(on);
    localStorage.setItem(NOTIF_CRASH_KEY, String(on));
    notify.success(`${t('settings.notify.crashAlerts')} ${on ? t('settings.notify.onF') : t('settings.notify.offF')}`);
  };

  return (
    <div className="card card-pad">
      <div className="set-section-head" style={{ marginBottom: 6 }}>
        <h2>{t('settings.sections.notifications')}</h2>
        <p>{t('settings.desc.notifications')}</p>
      </div>

      <ToggleRow
        icon={Mail}
        title={t('settings.notify.signupTitle')}
        desc={t('settings.desc.signup')}
        checked={signup}
        onChange={toggleSignup}
      />
      <ToggleRow
        icon={ActivitySquare}
        title={t('settings.notifications.crashRate')}
        desc={t('settings.desc.crash')}
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
  const { t } = useTranslation();
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
        <h2>{t('settings.sections.system')}</h2>
        <p>{t('settings.desc.system')}</p>
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
            <SysCard icon={Database} name={t('dashboard.system.database')} state={checkState(checks.db, t)} />
            <SysCard icon={Zap} name={t('dashboard.system.redis')} state={checkState(checks.redis, t)} />
          </div>

          <div className="set-metric-grid">
            <SysMetric
              icon={Server}
              label={t('settings.system.apiResponse')}
              value={data?.latencyMs ?? '—'}
              unit="ms"
              hint={t('settings.system.apiResponseHint')}
            />
            <SysMetric
              icon={ActivitySquare}
              label={t('settings.system.uptime')}
              value={formatUptime(system.uptime_s)}
              hint={t('settings.system.uptimeHint')}
            />
            <SysMetric
              icon={Cpu}
              label={t('settings.system.nodeVersion')}
              value={system.node || '—'}
              hint={t('settings.system.nodeVersionHint')}
            />
            <SysMetric
              icon={Database}
              label={t('settings.system.pgVersion')}
              value={system.postgres || '—'}
              hint={t('settings.system.pgVersionHint')}
            />
          </div>
        </>
      )}
    </div>
  );
}

/* ── Section À propos ── */
function SectionApropos() {
  const { t } = useTranslation();
  const links = [
    { icon: GitBranch, label: t('settings.about.github'), href: '#' },
    { icon: FileText, label: t('settings.about.documentation'), href: '#' },
    { icon: Server, label: t('settings.about.apiSpec'), href: '#' },
  ];
  return (
    <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="set-section-head">
        <h2>{t('settings.sections.about')}</h2>
        <p>{t('settings.desc.about')}</p>
      </div>

      <div className="set-about-head">
        <span className="set-about-version">{t('settings.about.brand')}</span>
        <span className="badge set-badge-gold">MVP</span>
      </div>

      <div className="set-fields" style={{ marginTop: 0 }}>
        <div className="set-field kv-field">
          <div className="k">{t('settings.about.version')}</div>
          <div className="v">{APP_VERSION}</div>
        </div>
        <div className="set-field kv-field">
          <div className="k">{t('settings.about.environment')}</div>
          <div className="v">{ENVIRONMENT}</div>
        </div>
        <div className="set-field kv-field set-field-full">
          <div className="k">{t('settings.about.backend')}</div>
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
  const { t } = useTranslation();
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
      notify.success(t('settings.notify.passwordUpdated'));
      reset();
      onClose();
    } catch (err) {
      const status = err?.response?.status;
      const apiMsg = err?.response?.data?.message;
      let message = t('settings.notify.passwordUpdateFailed');
      if (status === 400 || status === 401 || status === 403) {
        message = apiMsg || t('settings.notify.currentPasswordWrong');
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
      title={t('settings.security.changePassword')}
      footer={(
        <>
          <button className="btn btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn btn-primary" type="submit" form="set-pwd-form" disabled={isSubmitting}>
            {isSubmitting ? t('settings.misc.updating') : t('settings.misc.update')}
          </button>
        </>
      )}
    >
      <form id="set-pwd-form" className="set-form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <label>
          {t('settings.security.current')}
          <PasswordInput
            autoComplete="current-password"
            aria-invalid={errors.currentPassword ? 'true' : 'false'}
            {...register('currentPassword', { required: t('settings.validation.currentRequired') })}
          />
          {errors.currentPassword && <span className="set-form-err">{errors.currentPassword.message}</span>}
        </label>

        <label>
          {t('settings.security.new')}
          <PasswordInput
            autoComplete="new-password"
            aria-invalid={errors.newPassword ? 'true' : 'false'}
            {...register('newPassword', {
              required: t('settings.validation.newRequired'),
              minLength: { value: 8, message: t('settings.validation.minLength') },
              validate: (v, all) =>
                v !== all.currentPassword || t('settings.validation.mustDiffer'),
            })}
          />
          {errors.newPassword && <span className="set-form-err">{errors.newPassword.message}</span>}
        </label>

        <label>
          {t('settings.security.confirm')}
          <PasswordInput
            autoComplete="new-password"
            aria-invalid={errors.confirmPassword ? 'true' : 'false'}
            {...register('confirmPassword', {
              required: t('settings.validation.confirmRequired'),
              validate: (v) => v === newPassword || t('settings.validation.noMatch'),
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
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [section, setSection] = useState('compte');
  const [pwdOpen, setPwdOpen] = useState(false);

  return (
    <>
      <PageHeader
        title={t('settings.title')}
        description={t('settings.subtitle')}
      />

      <div className="settings-layout">
        <nav className="settings-nav" aria-label={t('settings.title')}>
          {SECTIONS.map(({ key, labelKey, icon: Icon }) => (
            <button
              key={key}
              className={section === key ? 'active' : ''}
              onClick={() => setSection(key)}
              aria-current={section === key ? 'page' : undefined}
            >
              <Icon size={16} style={{ verticalAlign: '-3px', marginRight: 9 }} />
              {t(labelKey)}
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
