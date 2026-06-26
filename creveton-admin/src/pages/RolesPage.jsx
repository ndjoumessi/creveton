import './RolesPage.css';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Users, Lock, SlidersHorizontal, Check, ShieldAlert } from 'lucide-react';
import teamService from '../services/team.service';
import { useApiData } from '../hooks/useApiData';
import {
  MODULES,
  ACTIONS,
  isApplicable,
  ROLE_META,
  ROLE_ORDER,
  accessibleModules,
  deniedModules,
} from '../constants/permissions';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import { notify } from '../components/Toast';

/** Tri des rôles selon ROLE_ORDER (super_admin → player). */
function sortRoles(list) {
  return [...list].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
}

/** Copie profonde d'une matrice de permissions { module: { action: bool } }. */
function cloneMatrix(matrix) {
  const out = {};
  for (const m of MODULES) {
    out[m.key] = {};
    for (const a of ACTIONS) {
      if (isApplicable(m.key, a)) out[m.key][a] = Boolean(matrix?.[m.key]?.[a]);
    }
  }
  return out;
}

/* ───────────────────────── Carte de rôle ───────────────────────── */
function RoleCard({ role, onEdit }) {
  const { t } = useTranslation();
  const meta = ROLE_META[role.role] || { icon: '•', tone: 'gray' };
  const allowed = accessibleModules(role.permissions);
  const denied = deniedModules(role.permissions);
  const isSuper = role.role === 'super_admin';
  const isPlayer = role.role === 'player';

  return (
    <div className={`roles-card roles-tone-${meta.tone}`}>
      <header className="roles-card-head">
        <span className="roles-card-icon" aria-hidden="true">{meta.icon}</span>
        <div className="roles-card-id">
          <div className="roles-card-name">
            {t(`team.roles.${role.role}`)}
            {role.system && <span className="roles-badge-system">{t('roles.system')}</span>}
          </div>
          <div className="roles-card-members">
            <Users size={13} aria-hidden="true" /> {t('roles.membersCount', { count: role.members ?? 0 })}
          </div>
        </div>
      </header>

      <div className="roles-card-body">
        <p className="roles-card-desc">{t(`roles.descriptions.${role.role}`)}</p>

        {isSuper ? (
          <div className="roles-super">
            <span className="roles-pill roles-pill-on">{t('roles.fullAccess')}</span>
            <p className="roles-super-risk"><ShieldAlert size={14} aria-hidden="true" /> {t('roles.superAdminRisk')}</p>
          </div>
        ) : isPlayer ? (
          <>
            <p className="roles-card-sub">{t('roles.playerDesc')}</p>
            <div className="roles-pills">
              <span className="roles-pill roles-pill-off">{t('roles.playerDenied')}</span>
            </div>
          </>
        ) : (
          <div className="roles-pills">
            {allowed.map((k) => (
              <span className="roles-pill roles-pill-on" key={`a-${k}`}>{t(`roles.modules.${k}`)}</span>
            ))}
            {denied.map((k) => (
              <span className="roles-pill roles-pill-off" key={`d-${k}`}>{t(`roles.modules.${k}`)}</span>
            ))}
          </div>
        )}
      </div>

      <footer className="roles-card-foot">
        <Link className="card-link" to="/team">
          <Users size={14} aria-hidden="true" /> {t('roles.viewMembers')}
        </Link>
        {role.system ? (
          <span className="roles-locked" title={t('roles.notEditable')}>
            <Lock size={14} aria-hidden="true" /> {t('roles.protected')}
          </span>
        ) : (
          <button type="button" className="btn btn-sm" onClick={() => onEdit(role)}>
            <SlidersHorizontal size={14} aria-hidden="true" /> {t('roles.editPermissions')}
          </button>
        )}
      </footer>
    </div>
  );
}

/* ───────────────────────── Modale matrice ───────────────────────── */
function PermissionsModal({ role, onClose, onSaved }) {
  const { t } = useTranslation();
  const [matrix, setMatrix] = useState(() => cloneMatrix(role?.permissions));
  const [busy, setBusy] = useState(false);

  const toggle = (moduleKey, action) => {
    setMatrix((prev) => ({
      ...prev,
      [moduleKey]: { ...prev[moduleKey], [action]: !prev[moduleKey]?.[action] },
    }));
  };

  const granted = useMemo(() => {
    const out = [];
    for (const m of MODULES) {
      for (const a of ACTIONS) {
        if (isApplicable(m.key, a) && matrix[m.key]?.[a]) {
          out.push(`${t(`roles.modules.${m.key}`)} · ${t(`roles.actions.${a}`)}`);
        }
      }
    }
    return out;
  }, [matrix, t]);

  const save = async () => {
    setBusy(true);
    try {
      await teamService.setRolePermissions(role.role, matrix);
      notify.success(t('roles.notify.saved'));
      onSaved();
      onClose();
    } catch {
      notify.error(t('roles.notify.failed'));
    } finally {
      setBusy(false);
    }
  };

  const footer = (
    <>
      <button type="button" className="btn" onClick={onClose} disabled={busy}>{t('roles.modal.cancel')}</button>
      <button type="button" className="btn btn-gold" onClick={save} disabled={busy}>{t('roles.modal.save')}</button>
    </>
  );

  return (
    <Modal open onClose={onClose} title={t('roles.modal.title', { role: t(`team.roles.${role.role}`) })} footer={footer} width={720}>
      <div className="roles-modal-grid">
        <div className="roles-matrix-wrap">
          <table className="roles-matrix">
            <thead>
              <tr>
                <th className="roles-matrix-modcol">{t('roles.module')}</th>
                {ACTIONS.map((a) => <th key={a}>{t(`roles.actions.${a}`)}</th>)}
              </tr>
            </thead>
            <tbody>
              {MODULES.map((m) => (
                <tr key={m.key}>
                  <th scope="row" className="roles-matrix-modcol">{t(`roles.modules.${m.key}`)}</th>
                  {ACTIONS.map((a) => (
                    <td key={a}>
                      {isApplicable(m.key, a) ? (
                        <button
                          type="button"
                          className={`roles-check ${matrix[m.key]?.[a] ? 'on' : ''}`}
                          onClick={() => toggle(m.key, a)}
                          role="checkbox"
                          aria-checked={Boolean(matrix[m.key]?.[a])}
                          aria-label={`${t(`roles.modules.${m.key}`)} — ${t(`roles.actions.${a}`)}`}
                        >
                          <Check size={13} strokeWidth={3} />
                        </button>
                      ) : (
                        <span className="roles-na" aria-hidden="true">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside className="roles-summary" aria-live="polite">
          <div className="roles-summary-can">
            <h4>{t('roles.modal.can')}</h4>
            {granted.length === 0 ? (
              <p className="roles-summary-empty">{t('roles.modal.nothing')}</p>
            ) : (
              <ul>{granted.map((g) => <li key={g}>{g}</li>)}</ul>
            )}
          </div>
        </aside>
      </div>
    </Modal>
  );
}

/* ───────────────────────── Page ───────────────────────── */
export default function RolesPage() {
  const { t } = useTranslation();
  const { data, loading, error, refetch } = useApiData(() => teamService.roles(), []);
  const [editing, setEditing] = useState(null);

  const roleList = useMemo(() => sortRoles(data?.roles || []), [data]);

  return (
    <>
      <PageHeader title={t('roles.title')} description={t('roles.subtitle')} />

      {loading && !data ? (
        <div className="roles-grid">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} w="100%" h={230} r={16} />)}
        </div>
      ) : error ? (
        <EmptyState icon={ShieldAlert} title={t('roles.notify.failed')} action={
          <button type="button" className="btn" onClick={refetch}>{t('common.retry')}</button>
        } />
      ) : (
        <div className="roles-grid">
          {roleList.map((r) => (
            <RoleCard key={r.role} role={r} onEdit={setEditing} />
          ))}
        </div>
      )}

      {editing && (
        <PermissionsModal
          role={editing}
          onClose={() => setEditing(null)}
          onSaved={refetch}
        />
      )}
    </>
  );
}
