import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, Check, ArrowRight, Loader2 } from 'lucide-react';
import teamService from '../services/team.service';
import { notify } from '../components/Toast';
import PasswordInput from '../components/PasswordInput';
import './AcceptInvite.css';

// Lattice de losanges (décor du panneau gauche), miroir du Login.
const DIAMONDS = (() => {
  const out = [];
  const SP = 88;
  const R = 27;
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 7; col += 1) {
      const cx = col * SP + (row % 2 ? SP / 2 : 0);
      const cy = row * SP;
      out.push({ cx, cy, r: R });
    }
  }
  return out;
})();

/**
 * Page PUBLIQUE d'acceptation d'invitation équipe (lien envoyé par un super_admin).
 * Lit ?token= dans l'URL, demande un mot de passe, appelle POST /admin/team/accept-invite,
 * puis redirige vers la connexion. Aucune session requise.
 *
 * NB métier : le flux réel ne collecte QUE le mot de passe — l'email, le nom et le
 * rôle de l'invité sont fixés côté serveur à la création de l'invitation et ne sont
 * pas lisibles depuis le token (opaque). On affiche donc le contexte d'invitation
 * (jeton tronqué + rappel) sans fabriquer de données absentes.
 */
export default function AcceptInvite() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: { password: '', confirm: '' },
  });

  const onSubmit = async ({ password }) => {
    setSubmitting(true);
    try {
      await teamService.acceptInvite(token, password);
      setDone(true);
      notify.success(t('acceptInvite.notify.success'));
      setTimeout(() => navigate('/login', { replace: true }), 1600);
    } catch (err) {
      const code = err?.response?.data?.error?.code;
      notify.error(code === 'INVITE_EXPIRED' ? t('acceptInvite.notify.expired') : t('acceptInvite.notify.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const shortToken = token.length > 14 ? `${token.slice(0, 8)}…${token.slice(-4)}` : token;

  const steps = [
    { label: t('acceptInvite.stepper.step1'), state: 'done' },
    { label: t('acceptInvite.stepper.step2'), state: done ? 'done' : 'active' },
    { label: t('acceptInvite.stepper.step3'), state: done ? 'done' : 'inactive' },
  ];

  const roles = [
    { tone: 'green', name: t('acceptInvite.roles.superAdmin'), desc: t('acceptInvite.roles.superAdminDesc') },
    { tone: 'gold', name: t('acceptInvite.roles.admin'), desc: t('acceptInvite.roles.adminDesc') },
    { tone: 'muted', name: t('acceptInvite.roles.moderator'), desc: t('acceptInvite.roles.moderatorDesc') },
  ];

  return (
    <div className="rg-shell">
      {/* ─────────── Panneau gauche (contexte invitation) ─────────── */}
      <div className="rg-left">
        <svg className="rg-grid" viewBox="0 0 616 792" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          {DIAMONDS.map((d, i) => (
            <path
              key={i}
              className="rg-diamond"
              d={`M ${d.cx} ${d.cy - d.r} L ${d.cx + d.r} ${d.cy} L ${d.cx} ${d.cy + d.r} L ${d.cx - d.r} ${d.cy} Z`}
            />
          ))}
        </svg>

        <div className="rg-brand">
          <span className="rg-brand-logo">C</span>
          <div>
            <div className="rg-brand-name">Creveton</div>
            <div className="rg-brand-tag">{t('login.brandTag')}</div>
          </div>
        </div>

        <div className="rg-left-body">
          <div className="rg-eyebrow">{t('acceptInvite.eyebrow')}</div>
          <h1 className="rg-headline">
            {t('acceptInvite.headlineA')} <em>{t('acceptInvite.headlineEm')}</em> {t('acceptInvite.headlineB')}
          </h1>
          <p className="rg-headline-sub">{t('acceptInvite.sub')}</p>

          <div className="rg-invite-box">
            <span className="rg-invite-ic"><Mail size={18} /></span>
            <div>
              <div className="rg-invite-title">{t('acceptInvite.inviteTitle')}</div>
              <p className="rg-invite-text">{t('acceptInvite.inviteText')}</p>
            </div>
          </div>

          <ul className="rg-roles">
            {roles.map((r) => (
              <li className="rg-role" key={r.name}>
                <span className={`rg-role-dot rg-role-dot--${r.tone}`} aria-hidden="true" />
                <div>
                  <span className="rg-role-name">{r.name}</span>
                  <span className="rg-role-desc">{r.desc}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="rg-left-footer">
          <div className="rg-pills" aria-hidden="true">
            <span className="rg-pill rg-pill-a">A</span>
            <span className="rg-pill rg-pill-b">B</span>
            <span className="rg-pill rg-pill-c">C</span>
            <span className="rg-pill rg-pill-d">D</span>
          </div>
          <span className="rg-footer-copy">© 2026 Creveton</span>
        </div>
      </div>

      {/* ─────────── Panneau droit (formulaire) ─────────── */}
      <div className="rg-right">
        <div className="rg-form">
          <h2 className="rg-form-title">{t('acceptInvite.formTitle')}</h2>
          <p className="rg-form-sub">{t('acceptInvite.subtitle')}</p>

          {/* Stepper */}
          <ol className="rg-stepper">
            {steps.map((s, i) => (
              <li className={`rg-step rg-step--${s.state}`} key={s.label}>
                <span className="rg-step-circle">
                  {s.state === 'done' ? <Check size={14} /> : i + 1}
                </span>
                <span className="rg-step-label">{s.label}</span>
                {i < steps.length - 1 && <span className="rg-step-line" aria-hidden="true" />}
              </li>
            ))}
          </ol>

          {!token ? (
            <div className="rg-alert">
              <p className="rg-alert-text">{t('acceptInvite.missingToken')}</p>
              <Link className="rg-alert-link" to="/login">{t('acceptInvite.loginLink')}</Link>
            </div>
          ) : done ? (
            <div className="rg-success">
              <span className="rg-success-ic"><Check size={26} /></span>
              <p className="rg-success-text">{t('acceptInvite.success')}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)}>
              {/* Bannière invitation — jeton réel (tronqué). L'email/le rôle ne sont
                  pas exposés côté client (dérivés du token, serveur). */}
              <div className="rg-invite-banner">
                <div className="rg-invite-banner-row">
                  <span className="rg-invite-banner-label">{t('acceptInvite.tokenLabel')}</span>
                  <span className="rg-invite-banner-token">{shortToken}</span>
                </div>
                <p className="rg-invite-banner-note">{t('acceptInvite.inviteNote')}</p>
              </div>

              <div className="field">
                <label>{t('acceptInvite.password')}</label>
                <PasswordInput
                  {...register('password', {
                    required: t('acceptInvite.validation.passwordRequired'),
                    minLength: { value: 8, message: t('acceptInvite.validation.passwordPolicy') },
                    pattern: { value: /^(?=.*[A-Z])(?=.*\d).+$/, message: t('acceptInvite.validation.passwordPolicy') },
                  })}
                />
                {errors.password && <span className="field-error">{errors.password.message}</span>}
              </div>

              <div className="field">
                <label>{t('acceptInvite.confirm')}</label>
                <PasswordInput
                  {...register('confirm', {
                    required: t('acceptInvite.validation.confirmRequired'),
                    validate: (v) => v === watch('password') || t('acceptInvite.validation.mismatch'),
                  })}
                />
                {errors.confirm && <span className="field-error">{errors.confirm.message}</span>}
              </div>

              <button className="rg-submit" type="submit" disabled={submitting}>
                {submitting && <Loader2 size={17} className="spin" />}
                <span>{submitting ? t('acceptInvite.loading') : t('acceptInvite.submit')}</span>
                {!submitting && <ArrowRight size={17} className="rg-arrow" />}
              </button>
            </form>
          )}

          <div className="rg-form-footer">
            <span>{t('acceptInvite.loginText')}</span>{' '}
            <Link className="rg-login-link" to="/login">{t('acceptInvite.loginLink')}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
