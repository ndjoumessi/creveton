import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, ShieldCheck } from 'lucide-react';
import teamService from '../services/team.service';
import { notify } from '../components/Toast';
import PasswordInput from '../components/PasswordInput';
import Logo from '../components/Logo';

/**
 * Page PUBLIQUE d'acceptation d'invitation équipe (lien envoyé par un super_admin).
 * Lit ?token= dans l'URL, demande un mot de passe, appelle POST /admin/team/accept-invite,
 * puis redirige vers la connexion. Aucune session requise.
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

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--green900)', padding: 24 }}>
      <div style={{ width: 'min(420px, 94vw)' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'inline-flex', marginBottom: 14 }}><Logo size={64} /></div>
          <h1 style={{ fontFamily: 'Outfit', fontWeight: 700, color: '#fff', fontSize: 24, margin: 0 }}>{t('acceptInvite.title')}</h1>
          <p style={{ fontFamily: '"Space Grotesk", sans-serif', color: '#9ca3af', marginTop: 6, fontSize: 14 }}>{t('acceptInvite.subtitle')}</p>
        </div>

        {!token ? (
          <div className="card" style={{ padding: 26, textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 14 }}>{t('acceptInvite.missingToken')}</p>
          </div>
        ) : done ? (
          <div className="card" style={{ padding: 26, textAlign: 'center' }}>
            <Check size={28} color="#15803d" />
            <p style={{ marginTop: 10, marginBottom: 0, fontSize: 14 }}>{t('acceptInvite.success')}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="card" style={{ padding: 26 }}>
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

            <button className="btn btn-gold btn-block" type="submit" disabled={submitting} style={{ marginTop: 6, padding: '11px 16px' }}>
              {submitting ? <Loader2 size={17} className="spin" /> : <ShieldCheck size={17} />}
              {submitting ? t('acceptInvite.loading') : t('acceptInvite.submit')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
