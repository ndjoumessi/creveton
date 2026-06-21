import './Parametres.css';
import { useMemo, useState } from 'react';
import {
  User, Shield, ToggleLeft, Bell, Settings as Cog, Plug, Info,
  Camera, Save, Check, Monitor, Database, Zap, Server, Download,
  RefreshCw, LogOut, KeyRound, AlertTriangle, Globe,
} from 'lucide-react';
import settingsService from '../services/settings.service';
import healthService from '../services/health.service';
import authService from '../services/auth.service';
import { useApiData } from '../hooks/useApiData';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { num } from '../utils/format';
import PageHeader from '../components/PageHeader';
import Avatar from '../components/Avatar';
import PasswordInput from '../components/PasswordInput';
import { Skeleton } from '../components/Skeleton';
import { notify } from '../components/Toast';

const SECTIONS = [
  { key: 'account', label: 'Compte', icon: User },
  { key: 'security', label: 'Sécurité', icon: Shield },
  { key: 'flags', label: 'Feature flags', icon: ToggleLeft },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'system', label: 'Système', icon: Cog },
  { key: 'integrations', label: 'Intégrations', icon: Plug },
  { key: 'about', label: 'À propos', icon: Info },
];

const ROLE_LABELS = { player: 'Joueur', moderator: 'Modérateur', admin: 'Administrateur', super_admin: 'Super admin' };
const APP_VERSION = '1.0.0-MVP';

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

/** Force d'un mot de passe → score 0–4 + libellé. */
function passwordStrength(pwd) {
  if (!pwd) return { score: 0, label: '—' };
  let s = 0;
  if (pwd.length >= 8) s += 1;
  if (/[A-Z]/.test(pwd)) s += 1;
  if (/\d/.test(pwd)) s += 1;
  if (/[^A-Za-z0-9]/.test(pwd)) s += 1;
  const labels = ['Très faible', 'Faible', 'Moyen', 'Fort', 'Très fort'];
  return { score: s, label: labels[s] };
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
  const [section, setSection] = useState('account');
  const user = useAuthStore((s) => s.user) || {};
  const lang = useUiStore((s) => s.lang);
  const setLang = useUiStore((s) => s.setLang);
  const setMaintenance = useUiStore((s) => s.setMaintenance);

  return (
    <>
      <PageHeader title="Paramètres" description="Compte, sécurité, feature flags, système et intégrations." />
      <div className="settings-layout">
        <nav className="settings-nav">
          {SECTIONS.map((sct) => {
            const Icon = sct.icon;
            return (
              <button key={sct.key} className={section === sct.key ? 'active' : ''} onClick={() => setSection(sct.key)}>
                <Icon size={16} /> {sct.label}
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
  const [name, setName] = useState(user.name || '');
  const [ville, setVille] = useState(user.ville || '');
  const [busy, setBusy] = useState(false);
  const dirty = name.trim() !== (user.name || '') || ville.trim() !== (user.ville || '');

  const save = async () => {
    if (!name.trim()) { notify.error('Le nom d’affichage est requis.'); return; }
    setBusy(true);
    try {
      const updated = await settingsService.updateMe({ name: name.trim(), ville: ville.trim() || undefined });
      useAuthStore.setState({ user: { ...user, ...updated } });
      try { sessionStorage.setItem('creveton_admin_user', JSON.stringify({ ...user, ...updated })); } catch { /* ignore */ }
      notify.success('Profil mis à jour.');
    } catch { notify.error('Mise à jour impossible.'); } finally { setBusy(false); }
  };

  return (
    <div className="card card-pad">
      <h3 className="card-title">Compte</h3>
      <p className="card-sub" style={{ marginBottom: 18 }}>Informations de votre compte administrateur.</p>

      <div className="set-identity">
        <div className="set-avatar">
          <Avatar name={user.name} size="xl" />
          <span className="set-avatar-cam" title="Changer l’avatar (à venir)"><Camera size={15} /></span>
        </div>
        <div>
          <div className="set-identity-name">{user.name || '—'}</div>
          <div className="set-identity-mail">{user.email || '—'}</div>
          <span className="badge badge-level" style={{ marginTop: 6, display: 'inline-block' }}>{ROLE_LABELS[user.role] || user.role}</span>
        </div>
      </div>

      <div className="set-form">
        <div className="field">
          <label>Nom d’affichage</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        </div>
        <div className="field">
          <label>Ville</label>
          <input className="input" value={ville} onChange={(e) => setVille(e.target.value)} maxLength={100} placeholder="Ex. Yaoundé" />
        </div>
        <div className="field">
          <label>Email (lecture seule)</label>
          <input className="input" value={user.email || ''} readOnly disabled />
        </div>
        <div className="field">
          <label>Langue de l’interface</label>
          <div className="set-lang">
            <button type="button" className={`set-lang-btn ${lang === 'fr' ? 'is-active' : ''}`} onClick={() => setLang('fr')}>FR</button>
            <button type="button" className={`set-lang-btn ${lang === 'en' ? 'is-active' : ''}`} onClick={() => setLang('en')}>EN</button>
          </div>
        </div>
      </div>

      <button className="btn btn-gold" disabled={!dirty || busy} onClick={save}>
        <Save size={15} /> Sauvegarder
      </button>
    </div>
  );
}

/* ───────────────────────── Sécurité ───────────────────────── */
function SecuritySection() {
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [cf, setCf] = useState('');
  const [busy, setBusy] = useState(false);
  const strength = passwordStrength(nw);
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
      notify.success('Mot de passe modifié.');
      setCur(''); setNw(''); setCf('');
    } catch (e) { notify.error(e?.response?.data?.error?.message || 'Échec du changement de mot de passe.'); }
    finally { setBusy(false); }
  };

  const revokeOthers = async () => {
    try {
      const r = await settingsService.revokeOtherSessions();
      notify.success(`${r.revoked} session(s) révoquée(s).`);
      refetch();
    } catch { notify.error('Révocation impossible.'); }
  };

  return (
    <>
      <div className="card card-pad">
        <h3 className="card-title">Changer le mot de passe</h3>
        <p className="card-sub" style={{ marginBottom: 16 }}>≥ 8 caractères, 1 majuscule, 1 chiffre, 1 caractère spécial.</p>
        <div className="set-form">
          <div className="field"><label>Mot de passe actuel</label><PasswordInput value={cur} onChange={(e) => setCur(e.target.value)} /></div>
          <div className="field"><label>Nouveau mot de passe</label><PasswordInput value={nw} onChange={(e) => setNw(e.target.value)} /></div>
          <div className="field"><label>Confirmer</label><PasswordInput value={cf} onChange={(e) => setCf(e.target.value)} /></div>
        </div>
        {nw && (
          <div className="set-strength">
            <div className="set-strength-bar">
              {[0, 1, 2, 3].map((i) => <span key={i} className={`set-strength-seg ${i < strength.score ? `s${strength.score}` : ''}`} />)}
            </div>
            <span className="set-strength-label">{strength.label}</span>
          </div>
        )}
        <ul className="set-rules">
          <li className={rules.len ? 'ok' : ''}><Check size={13} /> 8 caractères minimum</li>
          <li className={rules.maj ? 'ok' : ''}><Check size={13} /> Une majuscule</li>
          <li className={rules.num ? 'ok' : ''}><Check size={13} /> Un chiffre</li>
          <li className={rules.spec ? 'ok' : ''}><Check size={13} /> Un caractère spécial</li>
        </ul>
        {cf && nw !== cf && <div className="field-error">Les mots de passe ne correspondent pas.</div>}
        <button className="btn btn-gold" disabled={!canSubmit || busy} onClick={submit}><KeyRound size={15} /> Changer le mot de passe</button>
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div className="between">
          <div>
            <h3 className="card-title">Sessions actives</h3>
            <p className="card-sub">Sessions ouvertes via vos appareils (JWT / refresh tokens).</p>
          </div>
          <button className="btn btn-danger-ghost btn-sm" onClick={revokeOthers}><LogOut size={14} /> Révoquer les autres</button>
        </div>
        {loadingSessions ? (
          <Skeleton w="100%" h={48} r={10} style={{ marginTop: 10 }} />
        ) : (sessions || []).length === 0 ? (
          <p className="muted" style={{ marginTop: 10 }}>Aucune session active.</p>
        ) : (
          <div className="set-sessions">
            {sessions.map((s) => (
              <div className="set-session" key={s.sid}>
                <span className="set-session-ic"><Monitor size={16} /></span>
                <div className="set-session-main">
                  <span className="set-session-id">Session {s.masked}{s.current && <span className="set-session-cur">actuelle</span>}</span>
                  <span className="set-session-exp">{s.expires_in_s != null ? `Expire dans ${Math.round(s.expires_in_s / 86400)} j` : 'Expiration inconnue'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="set-note"><AlertTriangle size={14} /> L’historique détaillé des connexions (IP, appareil) n’est pas encore journalisé côté serveur.</div>
      </div>
    </>
  );
}

/* ───────────────────────── Feature flags ───────────────────────── */
function FlagsSection({ setMaintenance }) {
  const { data: flags, loading, setData } = useApiData(() => settingsService.getFlags(), []);

  const toggle = async (flag, enabled) => {
    // Optimiste.
    setData((prev) => (prev || []).map((f) => (f.key === flag.key ? { ...f, enabled } : f)));
    try {
      const updated = await settingsService.setFlag(flag.key, enabled);
      setData(updated);
      if (flag.key === 'maintenance_mode') setMaintenance(enabled);
      notify.success(`« ${flag.label} » ${enabled ? 'activé' : 'désactivé'}.`);
    } catch {
      setData((prev) => (prev || []).map((f) => (f.key === flag.key ? { ...f, enabled: !enabled } : f)));
      notify.error('Modification impossible (super admin requis).');
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
              {flag.locked && <span className="set-flag-badge" title="Cahier des charges §6">🔒 CDC §6</span>}
            </div>
            <p className="set-flag-desc">{flag.description}</p>
            {flag.locked && <p className="set-flag-status">Inactif depuis le lancement · requiert une licence du Ministère des Finances.</p>}
          </div>
          <Toggle checked={flag.enabled} onChange={(v) => toggle(flag, v)} disabled={!flag.editable} />
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── Notifications ───────────────────────── */
function NotificationsSection() {
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
        <h3 className="card-title">Alertes email</h3>
        {renderRow('signup', 'Nouvelle inscription')}
        {renderRow('perfect', 'Partie avec score parfait (10/10)')}
        {renderRow('reported', 'Question signalée incorrecte')}
        {renderRow('crash', 'Taux de crash > 1 %')}
        {renderRow('mod_24h', 'Question en attente de modération depuis > 24 h')}
      </div>
      <div className="card card-pad" style={{ marginTop: 16 }}>
        <h3 className="card-title">Alertes système</h3>
        {renderRow('latency', 'Latence API > 1 s')}
        {renderRow('redis', 'Redis indisponible')}
        {renderRow('disk', 'Espace disque > 80 %')}
      </div>
      <div className="card card-pad" style={{ marginTop: 16 }}>
        <h3 className="card-title">Résumé quotidien</h3>
        {renderRow('daily', 'Recevoir le résumé quotidien (inscriptions, parties)')}
      </div>
      <div className="set-note"><AlertTriangle size={14} /> Préférences enregistrées localement. L’envoi effectif des alertes sera branché en v2.</div>
    </>
  );
}

/* ───────────────────────── Système ───────────────────────── */
function ServiceCard({ icon, label, ok, latency, extra }) {
  return (
    <div className="set-sys-card">
      <span className="set-sys-ic">{icon}</span>
      <div className="set-sys-body">
        <div className="set-sys-name">{label}</div>
        <div className={`set-sys-state ${ok ? 'ok' : 'down'}`}>
          <span className="dot" /> {ok ? 'Opérationnel' : 'Indisponible'}{latency != null ? ` · ${latency} ms` : ''}
        </div>
        {extra && <div className="set-sys-extra">{extra}</div>}
      </div>
    </div>
  );
}

function SystemSection() {
  const { data: sys, loading } = useApiData(() => settingsService.getSystem(), [], { pollMs: 15000 });
  const [running, setRunning] = useState(null);

  const action = async (key, fn, label) => {
    setRunning(key);
    try {
      const r = await fn();
      notify.success(`${label} — ${r.updated != null ? `${num(r.updated)} lignes` : 'terminé'}.`);
    } catch { notify.error(`${label} : échec.`); } finally { setRunning(null); }
  };

  if (loading && !sys) return <Skeleton w="100%" h={320} r={14} />;
  const memPct = sys?.memory?.heap_total ? Math.round((sys.memory.heap_used / sys.memory.heap_total) * 100) : 0;
  const poolPct = sys?.db?.max ? Math.round((sys.db.pool_total / sys.db.max) * 100) : 0;

  return (
    <>
      <div className="card card-pad">
        <h3 className="card-title">État des services</h3>
        <div className="set-sys-grid">
          <ServiceCard icon={<Server size={18} />} label="Backend API" ok latency={null} extra={`Node ${sys?.node?.version} · uptime ${Math.floor((sys?.node?.uptime_s || 0) / 3600)} h`} />
          <ServiceCard icon={<Database size={18} />} label="PostgreSQL" ok={!sys?.pg?.error} latency={sys?.pg?.latency_ms} extra={`${sys?.pg?.version || ''} · ${sys?.pg?.connections ?? '—'} connexions`} />
          <ServiceCard icon={<Zap size={18} />} label="Redis" ok={sys?.redis?.status === 'ready'} latency={sys?.redis?.latency_ms} extra={`${sys?.redis?.keys ?? '—'} clés`} />
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <h3 className="card-title">Ressources</h3>
        <div className="set-res">
          <div className="set-res-row">
            <span className="set-res-label">Mémoire Node.js (heap)</span>
            <span className="progress"><span style={{ width: `${memPct}%` }} /></span>
            <span className="set-res-val">{bytesMb(sys?.memory?.heap_used)} / {bytesMb(sys?.memory?.heap_total)}</span>
          </div>
          <div className="set-res-row">
            <span className="set-res-label">Connexions DB actives</span>
            <span className="progress"><span style={{ width: `${poolPct}%` }} /></span>
            <span className="set-res-val">{sys?.db?.pool_total ?? 0} / {sys?.db?.max ?? 10}</span>
          </div>
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <h3 className="card-title">Maintenance</h3>
        <div className="set-maint">
          <button className="btn" disabled={running === 'sr'} onClick={() => action('sr', settingsService.recomputeSuccessRates, 'Taux de réussite recalculés')}>
            {running === 'sr' ? <RefreshCw size={15} className="spin" /> : <RefreshCw size={15} />} Recalculer les taux de réussite
          </button>
          <button className="btn" disabled={running === 'xp'} onClick={() => action('xp', settingsService.recomputeXp, 'Niveaux XP recalculés')}>
            {running === 'xp' ? <RefreshCw size={15} className="spin" /> : <RefreshCw size={15} />} Recalculer les niveaux XP
          </button>
          <button className="btn" onClick={() => settingsService.exportQuestions().then(() => notify.success('Export questions (JSON) téléchargé.')).catch(() => notify.error('Export impossible.'))}>
            <Download size={15} /> Exporter les questions (JSON)
          </button>
          <button className="btn" onClick={() => settingsService.exportUsers().then(() => notify.success('Export utilisateurs (CSV) téléchargé.')).catch(() => notify.error('Export impossible.'))}>
            <Download size={15} /> Exporter les utilisateurs (CSV)
          </button>
        </div>
      </div>
    </>
  );
}

/* ───────────────────────── Intégrations ───────────────────────── */
function IntegrationsSection() {
  const { data: list, loading } = useApiData(() => settingsService.getIntegrations(), []);
  if (loading && !list) return <Skeleton w="100%" h={240} r={14} />;
  return (
    <div className="set-integrations">
      {(list || []).map((it) => (
        <div className="card card-pad set-integration" key={it.key}>
          <div className="set-integration-head">
            <span className="set-integration-name">{it.label}</span>
            <span className={`set-integration-state ${it.configured ? 'ok' : 'off'}`}>
              <span className="dot" /> {it.configured ? 'Configuré' : 'Non configuré'}
            </span>
          </div>
          <p className="set-integration-detail">{it.detail}</p>
          {it.testable && (
            <button className="btn btn-sm" disabled title="Test disponible en v2">
              <Plug size={14} /> {it.testable === 'sms' ? 'Envoyer un SMS test' : 'Envoyer une notification test'}
            </button>
          )}
        </div>
      ))}
      <div className="set-note"><AlertTriangle size={14} /> Les clés API restent côté serveur (jamais exposées). Les envois de test seront branchés en v2.</div>
    </div>
  );
}

/* ───────────────────────── À propos ───────────────────────── */
function AboutSection({ user }) {
  const { data: health } = useApiData(() => healthService.get(), []);
  const items = useMemo(() => ([
    { k: 'Version application', v: APP_VERSION, badge: true },
    { k: 'Version backend', v: health?.version || '—' },
    { k: 'Node.js', v: health?.system?.node || '—' },
    { k: 'PostgreSQL', v: health?.system?.postgres || '—' },
    { k: 'Connecté en tant que', v: `${user.name || '—'} (${ROLE_LABELS[user.role] || user.role || '—'})` },
  ]), [health, user]);

  return (
    <div className="card card-pad">
      <div className="set-about-head">
        <h3 className="card-title">À propos de Creveton</h3>
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
      <div className="set-about-meta">Dernière mise à jour : 21 juin 2026</div>
      <div className="set-about-links">
        <a href="https://github.com/ndjoumessi/creveton" target="_blank" rel="noreferrer"><Globe size={14} /> GitHub</a>
        <a href="/docs" target="_blank" rel="noreferrer"><Info size={14} /> Documentation</a>
      </div>
      <div className="set-credits">Construit avec <span className="set-heart">❤</span> pour le Cameroun 🇨🇲</div>
    </div>
  );
}
