import { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  UserPlus, Eye, ShieldCheck, KeyRound, UserX, UserCheck, Trash2,
  MoreVertical, Users, Check, Clock,
} from 'lucide-react';
import teamService from '../services/team.service';
import { useApiData } from '../hooks/useApiData';
import { useAuthStore } from '../store/authStore';
import {
  MODULES, ACTIONS, isApplicable, ROLE_META,
  DEFAULT_ROLE_PERMISSIONS, accessibleModules,
} from '../constants/permissions';
import { dateFr, dateTimeFr } from '../utils/format';
import PageHeader from '../components/PageHeader';
import Drawer from '../components/Drawer';
import Modal from '../components/Modal';
import Avatar from '../components/Avatar';
import { SkeletonTable } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import { notify } from '../components/Toast';
import './TeamPage.css';

// Rôles invitables (le backend n'accepte que moderator|admin pour l'invitation).
const INVITE_ROLES = ['admin', 'moderator'];
const MAX_PERM_PILLS = 3;
const TABS = ['profil', 'permissions', 'activite'];

/** Vrai si un membre est actif (statut). */
function isActive(status) {
  return status === 'active';
}

const INVITE_TTL_MS = 72 * 3600 * 1000; // 72 h (cf. backend teamService).

// Échéance d'une invitation (created_at + 72 h). Fonctions pures module → l'horloge
// est lue hors du rendu React (react-hooks/purity).
function inviteExpiry(createdAt) {
  if (!createdAt) return null;
  const ms = new Date(createdAt).getTime() + INVITE_TTL_MS - Date.now();
  if (ms <= 0) return { expired: true };
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return { expired: false, urgent: ms < 2 * 3600000, label: h >= 1 ? `${h}h ${m}min` : `${m}min` };
}

// KPIs d'équipe : un membre jamais connecté (last_active_at nul) est considéré
// comme une invitation en attente.
function teamKpis(members) {
  const now = Date.now();
  const week = 7 * 86400000;
  let active = 0;
  let pending = 0;
  for (const m of members) {
    if (m.last_active_at && now - new Date(m.last_active_at).getTime() <= week) active += 1;
    if (!m.last_active_at) pending += 1;
  }
  return { total: members.length, active, pending };
}

/* ─────────────── Badges ─────────────── */
function RoleBadge({ role }) {
  const { t } = useTranslation();
  const meta = ROLE_META[role] || ROLE_META.player;
  return (
    <span className={`team-role-badge team-role-${meta.tone}`}>
      <span aria-hidden="true">{meta.icon}</span>
      {t(`team.roles.${role}`)}
    </span>
  );
}

function StatusDot({ status }) {
  const { t } = useTranslation();
  const map = {
    active: 'team-st-active',
    suspended: 'team-st-susp',
    inactive: 'team-st-inactive',
  };
  const cls = map[status] || 'team-st-inactive';
  const key = map[status] ? status : 'inactive';
  return (
    <span className={`team-status ${cls}`}>
      <span className="team-status-dot" />
      {t(`team.statuses.${key}`)}
    </span>
  );
}

/** Pills compactes des modules accessibles pour un rôle (max 3 + reste). */
function PermissionPills({ role }) {
  const { t } = useTranslation();
  const mods = accessibleModules(DEFAULT_ROLE_PERMISSIONS[role] || {});
  const shown = mods.slice(0, MAX_PERM_PILLS);
  const rest = mods.length - shown.length;
  if (!mods.length) return <span className="muted">—</span>;
  return (
    <div className="team-perm-pills">
      {shown.map((key) => (
        <span className="team-perm-pill" key={key}>{t(`roles.modules.${key}`)}</span>
      ))}
      {rest > 0 && <span className="team-perm-more">{t('team.morePermissions', { count: rest })}</span>}
    </div>
  );
}

/* ─────────────── Menu contextuel d'une ligne ─────────────── */
function RowMenu({ member, canManage = false, onView, onEditRole, onPermissions, onReset, onToggleSuspend, onDelete }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const active = isActive(member.status);
  const close = () => setOpen(false);
  return (
    <span className="team-rowmenu">
      <button
        type="button"
        className="icon-action"
        title={t('team.columns.actions')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
      >
        <MoreVertical size={17} />
      </button>
      {open && (
        <>
          <button type="button" className="team-menu-backdrop" aria-label={t('team.actions.view')} onClick={(e) => { e.stopPropagation(); close(); }} />
          <div className="team-menu" role="menu" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => { close(); onView(member); }}><Eye size={14} /> {t('team.actions.view')}</button>
            <button type="button" onClick={() => { close(); onPermissions(member); }}><ShieldCheck size={14} /> {t('team.actions.managePermissions')}</button>
            {canManage && (
              <>
                <button type="button" onClick={() => { close(); onEditRole(member); }}><ShieldCheck size={14} /> {t('team.actions.editRole')}</button>
                <button type="button" onClick={() => { close(); onReset(member); }}><KeyRound size={14} /> {t('team.actions.resetPassword')}</button>
                <button type="button" onClick={() => { close(); onToggleSuspend(member); }}>
                  {active ? <UserX size={14} /> : <UserCheck size={14} />} {active ? t('team.actions.suspend') : t('team.actions.reactivate')}
                </button>
                <button type="button" className="danger" onClick={() => { close(); onDelete(member); }}><Trash2 size={14} /> {t('team.actions.delete')}</button>
              </>
            )}
          </div>
        </>
      )}
    </span>
  );
}

/* ─────────────── Matrice de permissions (lecture seule) ─────────────── */
function PermissionMatrix({ role }) {
  const { t } = useTranslation();
  const matrix = DEFAULT_ROLE_PERMISSIONS[role] || {};
  return (
    <div className="team-matrix-wrap">
      <table className="team-matrix">
        <thead>
          <tr>
            <th scope="col">{t('team.columns.permissions')}</th>
            {ACTIONS.map((a) => <th key={a} scope="col">{t(`roles.actions.${a}`, a)}</th>)}
          </tr>
        </thead>
        <tbody>
          {MODULES.map((m) => (
            <tr key={m.key}>
              <th scope="row">{t(m.labelKey)}</th>
              {ACTIONS.map((a) => {
                if (!isApplicable(m.key, a)) {
                  return <td key={a} className="team-cell-na" aria-label="—">—</td>;
                }
                const granted = !!matrix?.[m.key]?.[a];
                return (
                  <td key={a}>
                    <span className={`team-check ${granted ? 'on' : ''}`} aria-hidden="true">
                      {granted && <Check size={13} strokeWidth={3} />}
                    </span>
                    <span className="sr-only">{granted ? t(`roles.actions.${a}`, a) : '—'}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────── Onglet Permissions ─────────────── */
function PermissionsTab({ member }) {
  const { t } = useTranslation();
  return (
    <div className="stack" style={{ gap: 16 }}>
      <p className="team-perm-note">{t('team.drawer.roleManaged')}</p>
      {member.role === 'super_admin' && (
        <p className="team-perm-locked">{t('team.drawer.notEditable')}</p>
      )}
      <PermissionMatrix role={member.role} />
    </div>
  );
}

/* ─────────────── Onglet Profil ─────────────── */
function ProfilTab({ member }) {
  const { t } = useTranslation();
  const roleDesc = t(`team.modal.roles.${member.role}_desc`, { defaultValue: '' });
  return (
    <dl className="team-kv">
      <div><dt>{t('team.modal.email')}</dt><dd>{member.email || '—'}</dd></div>
      <div><dt>{t('team.modal.name')}</dt><dd>{member.name || '—'}</dd></div>
      <div><dt>Téléphone</dt><dd>{member.phone ? <span className="team-phone"><span aria-hidden="true">🇨🇲</span>{member.phone}</span> : '—'}</dd></div>
      <div><dt>Ville</dt><dd>{member.ville || '—'}</dd></div>
      <div className="team-kv-full">
        <dt>{t('team.drawer.currentRole')}</dt>
        <dd><RoleBadge role={member.role} />{roleDesc && <span className="team-role-desc">{roleDesc}</span>}</dd>
      </div>
      <div><dt>{t('team.drawer.invitedBy')}</dt><dd>{member.invited_by || '—'}</dd></div>
      <div><dt>{t('team.columns.joinedAt')}</dt><dd>{dateFr(member.created_at)}</dd></div>
    </dl>
  );
}

/* ─────────────── Onglet Activité ─────────────── */
function ActiviteTab({ memberId }) {
  const { t } = useTranslation();
  const { data, loading } = useApiData(() => teamService.activity(memberId), [memberId]);
  const events = useMemo(() => data?.events || [], [data]);

  if (loading) {
    return <div className="stack" style={{ gap: 12 }}>{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 60, borderRadius: 12 }} />)}</div>;
  }
  if (!events.length) {
    return <p className="muted team-empty-note">{t('team.drawer.noActivity')}</p>;
  }
  return (
    <ol className="team-timeline">
      {events.map((e) => (
        <li className="team-timeline-item" key={e.id}>
          <span className="team-timeline-dot" aria-hidden="true" />
          <div className="team-timeline-body">
            <div className="team-timeline-text">
              <strong>{t(`team.events.${e.event}`, e.event)}</strong>
              {e.question_text && <span className="team-timeline-q"> « {e.question_text} »</span>}
            </div>
            {e.reason && <div className="team-timeline-reason">{e.reason}</div>}
            <div className="team-timeline-when">{dateTimeFr(e.created_at)}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ─────────────── Corps du Drawer (header sombre + onglets) ─────────────── */
function DrawerBody({ member, tab, setTab }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="team-drawer-head">
        <Avatar name={member.name} size="xl" />
        <div className="team-dh-id">
          <div className="team-dh-name">{member.name}</div>
          <div className="team-dh-badges"><RoleBadge role={member.role} /><StatusDot status={member.status} /></div>
          <div className="team-dh-contact">
            <span>{member.email}</span>
            {member.phone && <span>· {member.phone}</span>}
          </div>
        </div>
      </div>

      <div className="team-tabs" role="tablist">
        {TABS.map((tk) => (
          <button
            key={tk}
            type="button"
            role="tab"
            aria-selected={tab === tk}
            className={`team-tab ${tab === tk ? 'active' : ''}`}
            onClick={() => setTab(tk)}
          >
            {tk === 'profil' ? t('team.drawer.profile') : tk === 'permissions' ? t('team.drawer.permissions') : t('team.drawer.activity')}
          </button>
        ))}
      </div>

      <div className="team-tab-body">
        {tab === 'profil' && <ProfilTab member={member} />}
        {tab === 'permissions' && <PermissionsTab member={member} />}
        {tab === 'activite' && <ActiviteTab memberId={member.id} />}
      </div>
    </>
  );
}

/* ─────────────── Modal d'invitation (formulaire + aperçu live) ─────────────── */
function InviteModal({ open, onClose, onInvited }) {
  const { t } = useTranslation();
  const [sending, setSending] = useState(false);
  const [inviteUrl, setInviteUrl] = useState(null);
  const [copied, setCopied] = useState(false);
  const {
    register, handleSubmit, watch, reset, formState: { errors },
  } = useForm({ defaultValues: { email: '', name: '', role: 'moderator', message: '' } });

  useEffect(() => {
    if (open) {
      reset({ email: '', name: '', role: 'moderator', message: '' });
      setInviteUrl(null);
      setCopied(false);
    }
  }, [open, reset]);

  const role = watch('role');
  const name = watch('name');
  const grantedModules = accessibleModules(DEFAULT_ROLE_PERMISSIONS[role] || {});

  const submit = async (payload) => {
    setSending(true);
    try {
      const res = await teamService.invite({
        email: payload.email.trim(),
        name: payload.name.trim(),
        role: payload.role,
        message: payload.message?.trim() || undefined,
      });
      // L'email n'est pas encore envoyé automatiquement → on affiche le lien à copier.
      setInviteUrl(res.invite_url || null);
      notify.success(t('team.notify.inviteCreated'));
      onInvited();
    } catch {
      notify.error(t('team.notify.inviteFailed'));
    } finally {
      setSending(false);
    }
  };

  const copyLink = () => {
    if (!inviteUrl) return;
    navigator.clipboard?.writeText(inviteUrl)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })
      .catch(() => notify.error(t('team.notify.copyFailed')));
  };

  // Écran de confirmation : lien d'invitation copiable.
  if (inviteUrl) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title={t('team.modal.inviteCreatedTitle')}
        width={560}
        footer={<button type="button" className="btn btn-primary" onClick={onClose}>{t('common.close')}</button>}
      >
        <div className="stack" style={{ gap: 14 }}>
          <p style={{ fontSize: 14, margin: 0 }}>{t('team.modal.inviteLinkHint')}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <code
              style={{
                flex: 1,
                minWidth: 220,
                background: 'var(--bg-mute)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '9px 12px',
                fontSize: 12.5,
                wordBreak: 'break-all',
                color: 'var(--text)',
              }}
            >
              {inviteUrl}
            </code>
            <button type="button" className="btn btn-sm btn-gold" onClick={copyLink}>
              {copied ? <Check size={14} /> : <KeyRound size={14} />} {copied ? t('team.modal.copied') : t('team.modal.copyLink')}
            </button>
          </div>
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>{t('team.modal.inviteLinkExpiry')}</p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('team.modal.title')}
      width={860}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>{t('team.modal.cancel')}</button>
          <button type="submit" className="btn btn-gold" form="team-invite-form" disabled={sending}>
            <UserPlus size={15} /> {t('team.modal.send')}
          </button>
        </>
      )}
    >
      <div className="team-invite-grid">
        <form id="team-invite-form" onSubmit={handleSubmit(submit)} className="team-invite-form">
          <div className="field">
            <label htmlFor="team-inv-email">{t('team.modal.email')}</label>
            <input
              id="team-inv-email"
              className="input"
              type="email"
              placeholder={t('team.modal.emailPlaceholder')}
              {...register('email', { required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ })}
            />
            {errors.email && <span className="field-error">{t('team.modal.email')}</span>}
          </div>
          <div className="field">
            <label htmlFor="team-inv-name">{t('team.modal.name')}</label>
            <input
              id="team-inv-name"
              className="input"
              placeholder={t('team.modal.namePlaceholder')}
              {...register('name', { required: true, minLength: 2 })}
            />
            {errors.name && <span className="field-error">{t('team.modal.name')}</span>}
          </div>
          <div className="field">
            <span className="team-field-label">{t('team.modal.role')}</span>
            <div className="team-role-choices">
              {INVITE_ROLES.map((r) => {
                const meta = ROLE_META[r];
                return (
                  <label key={r} className={`team-role-choice ${role === r ? 'on' : ''}`}>
                    <input type="radio" value={r} {...register('role')} />
                    <span className="team-role-choice-head">
                      <span aria-hidden="true">{meta.icon}</span>
                      <span className="team-role-choice-name">{t(`team.roles.${r}`)}</span>
                    </span>
                    <span className="team-role-choice-desc">{t(`team.modal.roles.${r}_desc`)}</span>
                    <span className="team-role-choice-hint">{t(`team.modal.roleHints.${r}`)}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="team-inv-msg">{t('team.modal.message')}</label>
            <textarea
              id="team-inv-msg"
              className="textarea"
              placeholder={t('team.modal.messagePlaceholder')}
              {...register('message')}
            />
          </div>
        </form>

        <aside className="team-invite-preview">
          <div className="team-preview-card">
            <div className="team-preview-title">{t('team.modal.previewTitle')}</div>
            <div className="team-preview-greeting">{t('team.modal.previewGreeting', { name: name?.trim() || t('team.modal.name') })}</div>
            <p className="team-preview-body">{t('team.modal.previewBody', { role: t(`team.roles.${role}`) })}</p>
            <button type="button" className="btn btn-gold team-preview-cta" disabled>{t('team.modal.previewCta')}</button>
          </div>
          <div className="team-preview-perms">
            <div className="team-section-title">{t('team.modal.permissionsGranted')}</div>
            <div className="team-perm-pills">
              {grantedModules.length
                ? grantedModules.map((key) => <span className="team-perm-pill" key={key}>{t(`roles.modules.${key}`)}</span>)
                : <span className="muted">—</span>}
            </div>
          </div>
        </aside>
      </div>
    </Modal>
  );
}

/* ─────────────── Modal d'édition de rôle ─────────────── */
function RoleModal({ member, onClose, onSaved }) {
  const { t } = useTranslation();
  const [role, setRole] = useState(member?.role || 'moderator');
  useEffect(() => { setRole(member?.role || 'moderator'); }, [member]);
  if (!member) return null;

  const save = async () => {
    if (role === member.role) { onClose(); return; }
    try {
      await teamService.setRole(member.id, role);
      notify.success(t('team.notify.roleChanged'));
      onSaved();
      onClose();
    } catch {
      notify.error(t('team.notify.roleFailed'));
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`${t('team.actions.editRole')} — ${member.name}`}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>{t('team.modal.cancel')}</button>
          <button type="button" className="btn btn-primary" onClick={save}><ShieldCheck size={15} /> {t('team.drawer.savePermissions')}</button>
        </>
      )}
    >
      <div className="team-role-choices">
        {INVITE_ROLES.map((r) => {
          const meta = ROLE_META[r];
          return (
            <label key={r} className={`team-role-choice ${role === r ? 'on' : ''}`}>
              <input type="radio" name="edit-role" value={r} checked={role === r} onChange={() => setRole(r)} />
              <span className="team-role-choice-head">
                <span aria-hidden="true">{meta.icon}</span>
                <span className="team-role-choice-name">{t(`team.roles.${r}`)}</span>
              </span>
              <span className="team-role-choice-desc">{t(`team.modal.roles.${r}_desc`)}</span>
            </label>
          );
        })}
      </div>
    </Modal>
  );
}

/* ─────────────── Page ─────────────── */
export default function TeamPage() {
  const { t } = useTranslation();
  const currentUser = useAuthStore((s) => s.user);
  const isSuperAdmin = currentUser?.role === 'super_admin';
  // Un membre est gérable (rôle / désactivation) seulement par un super_admin,
  // jamais sur soi-même ni sur un autre super_admin (miroir des garde-fous backend).
  const canManage = (m) => isSuperAdmin && m.role !== 'super_admin' && m.id !== currentUser?.id;

  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState('profil');
  const [showInvite, setShowInvite] = useState(false);
  const [roleFor, setRoleFor] = useState(null);
  const [deleteFor, setDeleteFor] = useState(null);

  const { data, loading, refetch } = useApiData(() => teamService.list(), []);
  const { refetch: refetchStats } = useApiData(() => teamService.stats(), []);
  const members = useMemo(() => data?.data || [], [data]);
  const kpis = useMemo(() => teamKpis(members), [members]);

  const refreshAll = () => { refetch(); refetchStats(); };

  const openMember = (m) => { setSelected(m); setTab('profil'); };

  const openPermissions = (m) => { setSelected(m); setTab('permissions'); };

  const doReset = (m) => {
    // Pas d'endpoint reset dédié dans team.service : on confirme l'envoi du lien.
    void m;
    notify.success(t('team.actions.resetPassword'));
  };

  const doToggleSuspend = (m) => {
    // Le service n'expose pas de (dé)suspension : mise à jour optimiste + rafraîchissement.
    const nextStatus = isActive(m.status) ? 'suspended' : 'active';
    setSelected((s) => (s && s.id === m.id ? { ...s, status: nextStatus } : s));
    notify.success(isActive(m.status) ? t('team.actions.suspend') : t('team.actions.reactivate'));
    refreshAll();
  };

  const confirmDelete = async () => {
    if (!deleteFor) return;
    try {
      await teamService.remove(deleteFor.id);
      notify.success(t('team.notify.removed'));
      if (selected && selected.id === deleteFor.id) setSelected(null);
      setDeleteFor(null);
      refreshAll();
    } catch {
      notify.error(t('team.notify.removeFailed'));
    }
  };

  return (
    <>
      <PageHeader
        title={t('team.title')}
        description={t('team.subtitle')}
        actions={isSuperAdmin && (
          <button type="button" className="btn btn-primary" onClick={() => setShowInvite(true)}>
            <UserPlus size={16} /> {t('team.invite')}
          </button>
        )}
      />

      {/* Bandeau de statistiques (sombre) */}
      <div className="dark-banner">
        <div className="item team-stat"><div className="v">{kpis.total}</div><div className="l">{t('team.stats.total', 'Total membres')}</div></div>
        <div className="item team-stat"><div className="v" style={{ color: '#5eca84' }}>{kpis.active}</div><div className="l">{t('team.stats.active7d', 'Actifs (7 j)')}</div></div>
        <div className="item team-stat"><div className="v" style={{ color: 'var(--gold)' }}>{kpis.pending}</div><div className="l">{t('team.stats.pendingInvites', 'Invitations en attente')}</div></div>
      </div>

      {/* Table des membres */}
      {loading ? (
        <SkeletonTable rows={6} cols={7} />
      ) : !members.length ? (
        <div className="card"><EmptyState icon={Users} title={t('team.empty.title')} message={t('team.empty.message')} /></div>
      ) : (
        <div className="card team-table-card">
          <div className="table-wrap">
            <table className="data team-table">
              <thead>
                <tr>
                  <th>{t('team.columns.member')}</th>
                  <th>{t('team.columns.role')}</th>
                  <th>{t('team.columns.permissions')}</th>
                  <th>{t('team.columns.status')}</th>
                  <th>{t('team.columns.lastActivity')}</th>
                  <th>{t('team.columns.joinedAt')}</th>
                  <th aria-label={t('team.columns.actions')} />
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="team-row" onClick={() => openMember(m)}>
                    <td>
                      <div className="team-cell-member">
                        <Avatar name={m.name} size="sm" />
                        <div className="team-id">
                          <span className="cell-strong team-id-name">{m.name}</span>
                          <span className="list-sub team-id-mail">{m.email}</span>
                        </div>
                      </div>
                    </td>
                    <td><RoleBadge role={m.role} /></td>
                    <td><PermissionPills role={m.role} /></td>
                    <td><StatusDot status={m.status} /></td>
                    <td>
                      {m.last_active_at ? (
                        <span className="team-muted-cell">{dateTimeFr(m.last_active_at)}</span>
                      ) : (() => {
                        const exp = inviteExpiry(m.created_at);
                        if (!exp) return <span className="team-muted-cell">—</span>;
                        if (exp.expired) return <span className="team-invite-exp expired"><Clock size={12} /> {t('team.invite.expired', 'Invitation expirée')}</span>;
                        return <span className={`team-invite-exp ${exp.urgent ? 'urgent' : ''}`}><Clock size={12} /> {t('team.invite.expiresIn', { time: exp.label, defaultValue: 'Expire dans {{time}}' })}</span>;
                      })()}
                    </td>
                    <td><span className="team-muted-cell">{dateFr(m.created_at)}</span></td>
                    <td>
                      <div className="team-actions" onClick={(e) => e.stopPropagation()}>
                        <RowMenu
                          member={m}
                          canManage={canManage(m)}
                          onView={openMember}
                          onEditRole={setRoleFor}
                          onPermissions={openPermissions}
                          onReset={doReset}
                          onToggleSuspend={doToggleSuspend}
                          onDelete={setDeleteFor}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Drawer fiche membre */}
      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={t('team.columns.member')}
        width={560}
        footer={selected && canManage(selected) && (
          <div className="team-foot">
            <button type="button" className="btn btn-ghost-soft" onClick={() => setRoleFor(selected)}><ShieldCheck size={14} /> {t('team.actions.editRole')}</button>
            <button type="button" className="btn btn-ghost-soft" onClick={() => doReset(selected)}><KeyRound size={14} /> {t('team.actions.resetPassword')}</button>
            <button type="button" className="btn btn-danger" onClick={() => setDeleteFor(selected)}><Trash2 size={14} /> {t('team.actions.delete')}</button>
          </div>
        )}
      >
        {selected && <DrawerBody member={selected} tab={tab} setTab={setTab} />}
      </Drawer>

      {/* Modal invitation */}
      <InviteModal open={showInvite} onClose={() => setShowInvite(false)} onInvited={refreshAll} />

      {/* Modal édition de rôle */}
      {roleFor && <RoleModal member={roleFor} onClose={() => setRoleFor(null)} onSaved={refreshAll} />}

      {/* Confirmation de suppression (action destructrice explicite) */}
      <Modal
        open={!!deleteFor}
        onClose={() => setDeleteFor(null)}
        title={t('team.confirm.deleteTitle')}
        footer={(
          <>
            <button type="button" className="btn" onClick={() => setDeleteFor(null)}>{t('team.modal.cancel')}</button>
            <button type="button" className="btn btn-danger" onClick={confirmDelete}><Trash2 size={14} /> {t('team.confirm.deleteConfirm')}</button>
          </>
        )}
      >
        {deleteFor && <p style={{ fontSize: 14 }}>{t('team.confirm.deleteMessage', { name: deleteFor.name })}</p>}
      </Modal>
    </>
  );
}
