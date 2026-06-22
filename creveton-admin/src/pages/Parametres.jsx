import './Parametres.css';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  User, Shield, ToggleLeft, Bell, Settings as Cog, Plug, Info,
  Save, Check, Monitor, Database, Zap, Server, Download,
  RefreshCw, LogOut, KeyRound, AlertTriangle, Globe,
} from 'lucide-react';
import settingsService from '../services/settings.service';
import healthService from '../services/health.service';
import authService from '../services/auth.service';
import { useApiData } from '../hooks/useApiData';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { num, dateFr, dateTimeFr } from '../utils/format';
import PageHeader from '../components/PageHeader';
import AvatarUpload from '../components/AvatarUpload';
import PasswordInput from '../components/PasswordInput';
import { Skeleton } from '../components/Skeleton';
import { notify } from '../components/Toast';

const SECTIONS = [
  { key: 'account', icon: User },
  { key: 'security', icon: Shield },
  { key: 'flags', icon: ToggleLeft },
  { key: 'notifications', icon: Bell },
  { key: 'system', icon: Cog },
  { key: 'integrations', icon: Plug },
  { key: 'about', icon: Info },
];

const ROLE_KEYS = { player: 'player', moderator: 'moderator', admin: 'admin', super_admin: 'super_admin' };
const APP_VERSION = '1.0.0-MVP';

// Préférences locales (sans colonne backend dédiée) : fuseau & thème d'interface.
const TZ_KEY = 'creveton_admin_tz';
const TIMEZONES = ['Africa/Douala', 'Africa/Lagos', 'Europe/Paris', 'America/New_York'];
const TZ_LABELS = {
  'Africa/Douala': 'Africa/Douala (UTC+1)',
  'Africa/Lagos': 'Africa/Lagos (UTC+1)',
  'Europe/Paris': 'Europe/Paris (UTC+1)',
  'America/New_York': 'America/New_York (UTC-5)',
};

// Préférences de notification (sans backend dédié → persistées localement).
const NOTIF_DEFAULTS = {
  signup: true, perfect: true, reported: false, crash: true, mod_24h: true,
  latency: true, redis: true, disk: false, daily: false,
};
const NOTIF_KEY = 'creveton_admin_notifs';
function loadNotifs() {
  try { return { ...NOTIF_DEFAULTS, ...JSON.parse(localStorage.getItem(NOTIF_KEY) || '{}') }; }
  catch { return { ...NOTIF_DEFAULTS }; }
}

function bytesMb(n) { return n != null ? `${Math.round(n / 1e6)} Mo` : '—'; }

const STRENGTH_KEYS = ['veryWeak', 'weak', 'medium', 'strong', 'veryStrong'];

/** Force d'un mot de passe → score 0–4. */
function passwordStrengthScore(pwd) {
  if (!pwd) return 0;
  let s = 0;
  if (pwd.length >= 8) s += 1;
  if (/[A-Z]/.test(pwd)) s += 1;
  if (/\d/.test(pwd)) s += 1;
  if (/[^A-Za-z0-9]/.test(pwd)) s += 1;
  return s;
}

/** Toggle custom réutilisable. */
function Toggle({ checked, onChange, disabled }) {
  return (
    <label className={`switch ${disabled ? 'is-disabled' : ''}`}>
      <input type="checkbox" checked={checked} onChange={(e) => !disabled && onChange(e.target.checked)} disabled={disabled} />
      <span className="track" />
    </label>
  );
}

export default function Parametres() {
  const { t } = useTranslation();
  const [section, setSection] = useState('account');
  const user = useAuthStore((s) => s.user) || {};
  const lang = useUiStore((s) => s.lang);
  const setLang = useUiStore((s) => s.setLang);
  const setMaintenance = useUiStore((s) => s.setMaintenance);

  return (
    <>
      <PageHeader title={t('settings.title')} description={t('settings.pageDescription')} />
      <div className="settings-layout">
        <nav className="settings-nav">
          {SECTIONS.map((sct) => {
            const Icon = sct.icon;
            return (
              <button key={sct.key} className={section === sct.key ? 'active' : ''} onClick={() => setSection(sct.key)}>
                <Icon size={16} /> {t(`settings.sections.${sct.key}`)}
              </button>
            );
          })}
        </nav>

        <div className="settings-content">
          {section === 'account' && <AccountSection user={user} lang={lang} setLang={setLang} />}
          {section === 'security' && <SecuritySection />}
          {section === 'flags' && <FlagsSection setMaintenance={setMaintenance} />}
          {section === 'notifications' && <NotificationsSection />}
          {section === 'system' && <SystemSection />}
          {section === 'integrations' && <IntegrationsSection />}
          {section === 'about' && <AboutSection user={user} />}
        </div>
      </div>
    </>
  );
}

/* ───────────────────────── Compte ───────────────────────── */
function AccountSection({ user, lang, setLang }) {
  const { t } = useTranslation();
  const updateUser = useAuthStore((s) => s.updateUser);
  // Profil frais (avatar_url, dates) — repli sur le profil du store.
  const { data: me } = useApiData(() => settingsService.getMe().catch(() => null), []);

  const [name, setName] = useState(user.name || '');
  const [tz, setTz] = useState(() => localStorage.getItem(TZ_KEY) || 'Africa/Douala');
  const [savedTz, setSavedTz] = useState(tz);
  const [formLang, setFormLang] = useState(lang);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);

  const avatarUrl = user.avatar_url ?? me?.avatar_url ?? null;
  const createdAt = user.created_at ?? me?.created_at ?? null;
  const lastActive = user.last_active_at ?? me?.last_active_at ?? null;
  const roleLabel = ROLE_KEYS[user.role] ? t(`settings.account.roles.${ROLE_KEYS[user.role]}`) : (user.role || '—');

  const dirty = name.trim() !== (user.name || '') || tz !== savedTz || formLang !== lang;

  const save = async () => {
    if (!name.trim()) { notify.error(t('settings.account.nameRequired')); return; }
    setBusy(true);
    try {
      const updated = await settingsService.updateMe({ name: name.trim(), lang: formLang });
      localStorage.setItem(TZ_KEY, tz); setSavedTz(tz);
      if (formLang !== lang) setLang(formLang);
      updateUser({ ...updated });
      notify.success(t('settings.account.saved'));
      setOk(true); setTimeout(() => setOk(false), 2000);
    } catch { notify.error(t('settings.account.updateFailed')); } finally { setBusy(false); }
  };

  return (
    <div className="card card-pad">
      <h3 className="card-title">{t('settings.sections.account')}</h3>
      <p className="card-sub" style={{ marginBottom: 18 }}>{t('settings.account.cardSub')}</p>

      {/* Ligne 1 — avatar (upload) + infos en lecture seule */}
      <div className="set-acc-top">
        <div className="set-acc-avatar">
          <AvatarUpload
            name={user.name}
            avatarUrl={avatarUrl}
            onUploaded={(url) => updateUser({ avatar_url: url })}
            onRemoved={() => updateUser({ avatar_url: null })}
          />
          <div className="set-acc-name">{user.name || '—'}</div>
          <span className="badge badge-gold-soft">{roleLabel}</span>
          <div className="set-acc-formats">{t('settings.account.acceptedFormats')}</div>
        </div>

        <dl className="set-acc-info">
          <div className="set-kv">
            <dt>{t('settings.account.emailAddress')}</dt>
            <dd>{user.email || '—'} <span className="set-verified">{t('settings.account.verified')}</span></dd>
          </div>
          <div className="set-kv">
            <dt>{t('settings.account.role')}</dt>
            <dd><span className="badge badge-gold-soft">{roleLabel}</span> <span className="set-muted-note">{t('settings.account.notEditable')}</span></dd>
          </div>
          <div className="set-kv">
            <dt>{t('settings.account.memberSince')}</dt>
            <dd>{createdAt ? dateFr(createdAt) : '—'}</dd>
          </div>
          <div className="set-kv">
            <dt>{t('settings.account.lastLogin')}</dt>
            <dd>{lastActive ? dateTimeFr(lastActive) : '—'}</dd>
          </div>
        </dl>
      </div>

      <div className="set-divider" />

      {/* Ligne 2 — formulaire éditable */}
      <h4 className="set-acc-edit-title">{t('settings.account.editableInfo')}</h4>
      <div className="set-form">
        <div className="field">
          <label>{t('settings.account.displayName')}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder={t('settings.account.namePlaceholder')} />
        </div>
        <div className="field">
          <label>{t('settings.account.timezone')}</label>
          <select className="select" value={tz} onChange={(e) => setTz(e.target.value)}>
            {TIMEZONES.map((z) => <option key={z} value={z}>{TZ_LABELS[z]}</option>)}
          </select>
        </div>
        <div className="field">
          <label>{t('settings.account.interfaceLang')}</label>
          <div className="set-pill-row">
            <button type="button" className={`set-choice ${formLang === 'fr' ? 'is-active' : ''}`} onClick={() => setFormLang('fr')}>🇫🇷 Français</button>
            <button type="button" className={`set-choice ${formLang === 'en' ? 'is-active' : ''}`} onClick={() => setFormLang('en')}>🇬🇧 English</button>
          </div>
        </div>
        <div className="field">
          <label>{t('settings.account.theme')}</label>
          <div className="set-pill-row">
            <button type="button" className="set-choice is-active">☀️ {t('settings.account.themeLight')}</button>
            <button type="button" className="set-choice" disabled title={t('settings.account.themeDarkSoon')}>🌙 {t('settings.account.themeDark')}</button>
          </div>
        </div>
      </div>

      <button className={`btn btn-gold ${ok ? 'is-ok' : ''}`} disabled={(!dirty && !ok) || busy} onClick={save}>
        {busy ? <RefreshCw size={15} className="spin" /> : <Save size={15} />}
        {ok ? t('settings.account.saved') : t('settings.account.saveChanges')}
      </button>
    </div>
  );
}

/* ───────────────────────── Sécurité ───────────────────────── */
function SecuritySection() {
  const { t } = useTranslation();
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [cf, setCf] = useState('');
  const [busy, setBusy] = useState(false);
  const strengthScore = passwordStrengthScore(nw);
  const strengthLabel = nw ? t(`settings.security.strengthScale.${STRENGTH_KEYS[strengthScore]}`) : '—';
  const rules = {
    len: nw.length >= 8, maj: /[A-Z]/.test(nw), num: /\d/.test(nw), spec: /[^A-Za-z0-9]/.test(nw),
  };
  const allRules = rules.len && rules.maj && rules.num && rules.spec;
  const canSubmit = cur && allRules && nw === cf;

  const { data: sessions, loading: loadingSessions, refetch } = useApiData(() => settingsService.getSessions(), []);

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await authService.changePassword(cur, nw);
      notify.success(t('settings.notify.passwordUpdated'));
      setCur(''); setNw(''); setCf('');
    } catch (e) { notify.error(e?.response?.data?.error?.message || t('settings.security.changeFailed')); }
    finally { setBusy(false); }
  };

  const revokeOthers = async () => {
    try {
      const r = await settingsService.revokeOtherSessions();
      notify.success(t('settings.security.revoked', { count: r.revoked }));
      refetch();
    } catch { notify.error(t('settings.security.revokeFailed')); }
  };

  return (
    <>
      <div className="card card-pad">
        <h3 className="card-title">{t('settings.security.changePassword')}</h3>
        <p className="card-sub" style={{ marginBottom: 16 }}>{t('settings.security.requirements')}</p>
        <div className="set-form">
          <div className="field"><label>{t('settings.security.current')}</label><PasswordInput value={cur} onChange={(e) => setCur(e.target.value)} /></div>
          <div className="field"><label>{t('settings.security.new')}</label><PasswordInput value={nw} onChange={(e) => setNw(e.target.value)} /></div>
          <div className="field"><label>{t('settings.security.confirmShort')}</label><PasswordInput value={cf} onChange={(e) => setCf(e.target.value)} /></div>
        </div>
        {nw && (
          <div className="set-strength">
            <div className="set-strength-bar">
              {[0, 1, 2, 3].map((i) => <span key={i} className={`set-strength-seg ${i < strengthScore ? `s${strengthScore}` : ''}`} />)}
            </div>
            <span className="set-strength-label">{strengthLabel}</span>
          </div>
        )}
        <ul className="set-rules">
          <li className={rules.len ? 'ok' : ''}><Check size={13} /> {t('settings.security.ruleLength')}</li>
          <li className={rules.maj ? 'ok' : ''}><Check size={13} /> {t('settings.security.ruleUppercase')}</li>
          <li className={rules.num ? 'ok' : ''}><Check size={13} /> {t('settings.security.ruleDigit')}</li>
          <li className={rules.spec ? 'ok' : ''}><Check size={13} /> {t('settings.security.ruleSpecial')}</li>
        </ul>
        {cf && nw !== cf && <div className="field-error">{t('settings.validation.noMatch')}</div>}
        <button className="btn btn-gold" disabled={!canSubmit || busy} onClick={submit}><KeyRound size={15} /> {t('settings.security.changePassword')}</button>
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div className="between">
          <div>
            <h3 className="card-title">{t('settings.security.activeSessions')}</h3>
            <p className="card-sub">{t('settings.security.sessionsSub')}</p>
          </div>
          <button className="btn btn-danger-ghost btn-sm" onClick={revokeOthers}><LogOut size={14} /> {t('settings.security.revokeOthersShort')}</button>
        </div>
        {loadingSessions ? (
          <Skeleton w="100%" h={48} r={10} style={{ marginTop: 10 }} />
        ) : (sessions || []).length === 0 ? (
          <p className="muted" style={{ marginTop: 10 }}>{t('settings.security.noSessions')}</p>
        ) : (
          <div className="set-sessions">
            {sessions.map((s) => (
              <div className="set-session" key={s.sid}>
                <span className="set-session-ic"><Monitor size={16} /></span>
                <div className="set-session-main">
                  <span className="set-session-id">{t('settings.security.sessionLabel', { masked: s.masked })}{s.current && <span className="set-session-cur">{t('settings.security.sessionCurrent')}</span>}</span>
                  <span className="set-session-exp">{s.expires_in_s != null ? t('settings.security.expiresIn', { days: Math.round(s.expires_in_s / 86400) }) : t('settings.security.expiryUnknown')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="set-note"><AlertTriangle size={14} /> {t('settings.security.historyNote')}</div>
      </div>
    </>
  );
}

/* ───────────────────────── Feature flags ───────────────────────── */
function FlagsSection({ setMaintenance }) {
  const { t } = useTranslation();
  const { data: flags, loading, setData } = useApiData(() => settingsService.getFlags(), []);

  const toggle = async (flag, enabled) => {
    // Optimiste.
    setData((prev) => (prev || []).map((f) => (f.key === flag.key ? { ...f, enabled } : f)));
    try {
      const updated = await settingsService.setFlag(flag.key, enabled);
      setData(updated);
      if (flag.key === 'maintenance_mode') setMaintenance(enabled);
      notify.success(t('settings.flags.toggled', { label: flag.label, state: enabled ? t('settings.notify.on') : t('settings.notify.off') }));
    } catch {
      setData((prev) => (prev || []).map((f) => (f.key === flag.key ? { ...f, enabled: !enabled } : f)));
      notify.error(t('settings.flags.toggleFailed'));
    }
  };

  if (loading && !flags) return <Skeleton w="100%" h={300} r={14} />;

  return (
    <div className="set-flags">
      {(flags || []).map((flag) => (
        <div className={`card card-pad set-flag ${flag.key === 'demo_mode' && flag.enabled ? 'set-flag-demo' : ''} ${flag.locked ? 'set-flag-locked' : ''}`} key={flag.key}>
          <div className="set-flag-main">
            <div className="set-flag-title">
              {flag.label}
              {flag.locked && <span className="set-flag-badge" title={t('settings.flags.cdcTitle')}>🔒 CDC §6</span>}
            </div>
            <p className="set-flag-desc">{flag.description}</p>
            {flag.locked && <p className="set-flag-status">{t('settings.flags.lockedStatus')}</p>}
          </div>
          <Toggle checked={flag.enabled} onChange={(v) => toggle(flag, v)} disabled={!flag.editable} />
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── Notifications ───────────────────────── */
function NotificationsSection() {
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState(loadNotifs);
  const set = (key, val) => {
    const next = { ...prefs, [key]: val };
    setPrefs(next);
    localStorage.setItem(NOTIF_KEY, JSON.stringify(next));
  };
  const renderRow = (k, label) => (
    <div className="settings-row" key={k}>
      <span>{label}</span>
      <Toggle checked={prefs[k]} onChange={(v) => set(k, v)} />
    </div>
  );
  return (
    <>
      <div className="card card-pad">
        <h3 className="card-title">{t('settings.notifications.email')}</h3>
        {renderRow('signup', t('settings.notifications.newSignup'))}
        {renderRow('perfect', t('settings.notifications.perfectScore'))}
        {renderRow('reported', t('settings.notifications.reportedQuestion'))}
        {renderRow('crash', t('settings.notifications.crashRateLong'))}
        {renderRow('mod_24h', t('settings.notifications.pendingModerationLong'))}
      </div>
      <div className="card card-pad" style={{ marginTop: 16 }}>
        <h3 className="card-title">{t('settings.notifications.system')}</h3>
        {renderRow('latency', t('settings.notifications.highLatencyLong'))}
        {renderRow('redis', t('settings.notifications.redisDown'))}
        {renderRow('disk', t('settings.notifications.diskSpaceLong'))}
      </div>
      <div className="card card-pad" style={{ marginTop: 16 }}>
        <h3 className="card-title">{t('settings.notifications.dailySummary')}</h3>
        {renderRow('daily', t('settings.notifications.dailySummaryRow'))}
      </div>
      <div className="set-note"><AlertTriangle size={14} /> {t('settings.notifications.localNote')}</div>
    </>
  );
}

/* ───────────────────────── Système ───────────────────────── */
function ServiceCard({ icon, label, ok, latency, extra }) {
  const { t } = useTranslation();
  return (
    <div className="set-sys-card">
      <span className="set-sys-ic">{icon}</span>
      <div className="set-sys-body">
        <div className="set-sys-name">{label}</div>
        <div className={`set-sys-state ${ok ? 'ok' : 'down'}`}>
          <span className="dot" /> {ok ? t('settings.system.operational') : t('settings.system.down')}{latency != null ? ` · ${latency} ms` : ''}
        </div>
        {extra && <div className="set-sys-extra">{extra}</div>}
      </div>
    </div>
  );
}

function SystemSection() {
  const { t } = useTranslation();
  const { data: sys, loading } = useApiData(() => settingsService.getSystem(), [], { pollMs: 15000 });
  const [running, setRunning] = useState(null);

  const action = async (key, fn, label) => {
    setRunning(key);
    try {
      const r = await fn();
      notify.success(`${label} — ${r.updated != null ? t('settings.system.rowsCount', { count: num(r.updated) }) : t('settings.system.done')}.`);
    } catch { notify.error(t('settings.system.actionFailed', { label })); } finally { setRunning(null); }
  };

  if (loading && !sys) return <Skeleton w="100%" h={320} r={14} />;
  const memPct = sys?.memory?.heap_total ? Math.round((sys.memory.heap_used / sys.memory.heap_total) * 100) : 0;
  const poolPct = sys?.db?.max ? Math.round((sys.db.pool_total / sys.db.max) * 100) : 0;

  return (
    <>
      <div className="card card-pad">
        <h3 className="card-title">{t('settings.system.services')}</h3>
        <div className="set-sys-grid">
          <ServiceCard icon={<Server size={18} />} label={t('settings.system.backendApi')} ok latency={null} extra={t('settings.system.nodeUptimeExtra', { version: sys?.node?.version, hours: Math.floor((sys?.node?.uptime_s || 0) / 3600) })} />
          <ServiceCard icon={<Database size={18} />} label="PostgreSQL" ok={!sys?.pg?.error} latency={sys?.pg?.latency_ms} extra={t('settings.system.pgExtra', { version: sys?.pg?.version || '', connections: sys?.pg?.connections ?? '—' })} />
          <ServiceCard icon={<Zap size={18} />} label="Redis" ok={sys?.redis?.status === 'ready'} latency={sys?.redis?.latency_ms} extra={t('settings.system.redisExtra', { keys: sys?.redis?.keys ?? '—' })} />
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <h3 className="card-title">{t('settings.system.resources')}</h3>
        <div className="set-res">
          <div className="set-res-row">
            <span className="set-res-label">{t('settings.system.memoryHeap')}</span>
            <span className="progress"><span style={{ width: `${memPct}%` }} /></span>
            <span className="set-res-val">{bytesMb(sys?.memory?.heap_used)} / {bytesMb(sys?.memory?.heap_total)}</span>
          </div>
          <div className="set-res-row">
            <span className="set-res-label">{t('settings.system.dbConnections')}</span>
            <span className="progress"><span style={{ width: `${poolPct}%` }} /></span>
            <span className="set-res-val">{sys?.db?.pool_total ?? 0} / {sys?.db?.max ?? 10}</span>
          </div>
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <h3 className="card-title">{t('settings.system.maintenance')}</h3>
        <div className="set-maint">
          <button className="btn" disabled={running === 'sr'} onClick={() => action('sr', settingsService.recomputeSuccessRates, t('settings.system.ratesRecomputed'))}>
            {running === 'sr' ? <RefreshCw size={15} className="spin" /> : <RefreshCw size={15} />} {t('settings.system.recalcRates')}
          </button>
          <button className="btn" disabled={running === 'xp'} onClick={() => action('xp', settingsService.recomputeXp, t('settings.system.levelsRecomputed'))}>
            {running === 'xp' ? <RefreshCw size={15} className="spin" /> : <RefreshCw size={15} />} {t('settings.system.recalcLevels')}
          </button>
          <button className="btn" onClick={() => settingsService.exportQuestions().then(() => notify.success(t('settings.system.exportQuestionsDone'))).catch(() => notify.error(t('settings.system.exportFailed')))}>
            <Download size={15} /> {t('settings.system.exportQuestionsBtn')}
          </button>
          <button className="btn" onClick={() => settingsService.exportUsers().then(() => notify.success(t('settings.system.exportUsersDone'))).catch(() => notify.error(t('settings.system.exportFailed')))}>
            <Download size={15} /> {t('settings.system.exportUsersBtn')}
          </button>
        </div>
      </div>
    </>
  );
}

/* ───────────────────────── Intégrations ───────────────────────── */
function IntegrationsSection() {
  const { t } = useTranslation();
  const { data: list, loading } = useApiData(() => settingsService.getIntegrations(), []);
  if (loading && !list) return <Skeleton w="100%" h={240} r={14} />;
  return (
    <div className="set-integrations">
      {(list || []).map((it) => (
        <div className="card card-pad set-integration" key={it.key}>
          <div className="set-integration-head">
            <span className="set-integration-name">{it.label}</span>
            <span className={`set-integration-state ${it.configured ? 'ok' : 'off'}`}>
              <span className="dot" /> {it.configured ? t('settings.integrations.configured') : t('settings.integrations.notConfigured')}
            </span>
          </div>
          <p className="set-integration-detail">{it.detail}</p>
          {it.testable && (
            <button className="btn btn-sm" disabled title={t('settings.integrations.testV2Title')}>
              <Plug size={14} /> {it.testable === 'sms' ? t('settings.integrations.testSms') : t('settings.integrations.testPush')}
            </button>
          )}
        </div>
      ))}
      <div className="set-note"><AlertTriangle size={14} /> {t('settings.integrations.keysNote')}</div>
    </div>
  );
}

/* ───────────────────────── À propos ───────────────────────── */
function AboutSection({ user }) {
  const { t } = useTranslation();
  const { data: health } = useApiData(() => healthService.get(), []);
  const roleLabel = ROLE_KEYS[user.role] ? t(`settings.account.roles.${ROLE_KEYS[user.role]}`) : (user.role || '—');
  const items = useMemo(() => ([
    { k: t('settings.about.appVersion'), v: APP_VERSION, badge: true },
    { k: t('settings.about.backendVersion'), v: health?.version || '—' },
    { k: t('settings.about.nodeJs'), v: health?.system?.node || '—' },
    { k: t('settings.about.postgres'), v: health?.system?.postgres || '—' },
    { k: t('settings.about.connectedAs'), v: `${user.name || '—'} (${roleLabel})` },
  ]), [health, user, t, roleLabel]);

  return (
    <div className="card card-pad">
      <div className="set-about-head">
        <h3 className="card-title">{t('settings.about.cardTitle')}</h3>
        <span className="set-version-badge">{APP_VERSION}</span>
      </div>
      <dl className="kv" style={{ marginTop: 14 }}>
        {items.map((it) => (
          <div style={{ display: 'contents' }} key={it.k}>
            <dt>{it.k}</dt>
            <dd>{it.badge ? <span className="set-version-badge sm">{it.v}</span> : it.v}</dd>
          </div>
        ))}
      </dl>
      <div className="set-about-meta">{t('settings.about.lastUpdateDated')}</div>
      <div className="set-about-links">
        <a href="https://github.com/ndjoumessi/creveton" target="_blank" rel="noreferrer"><Globe size={14} /> {t('settings.about.github')}</a>
        <a href="/docs" target="_blank" rel="noreferrer"><Info size={14} /> {t('settings.about.documentation')}</a>
      </div>
      <div className="set-credits">{t('settings.about.creditsPrefix')} <span className="set-heart">❤</span> {t('settings.about.creditsSuffix')}</div>
    </div>
  );
}
