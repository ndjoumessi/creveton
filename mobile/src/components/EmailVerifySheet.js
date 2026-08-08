// EmailVerifySheet — confirmer son adresse email, ou la corriger.
//
// Les deux gestes vivent dans la MÊME feuille parce qu'ils partagent la même
// preuve : un code envoyé à l'adresse visée. Les séparer aurait produit deux
// écrans quasi identiques, et surtout aurait laissé sans issue le cas qui
// justifie tout le reste — une faute de frappe à l'inscription. `PATCH
// /users/me` n'accepte pas `email` : sans le chemin « corriger », une adresse
// erronée était définitive et le compte perdait sa récupération pour toujours.
//
// Rien n'est écrit tant que le code n'est pas confirmé : la nouvelle adresse ne
// remplace l'ancienne qu'au moment de la validation, côté serveur, dans la même
// opération que le drapeau « vérifié ».

import React, { useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import BottomSheet from './BottomSheet';
import CodeInput from './CodeInput';
import AuthField from './AuthField';
import AppButton from './AppButton';
import { Body, Label } from './Text';
import { useToast } from './Toast';
import { users as usersApi } from '../services/endpoints';
import { parseApiError } from '../services/api';
import { isValidEmail } from '../utils/validation';
import { spacing } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

const LENGTH = 6;

export default function EmailVerifySheet({ visible, onClose, email, onVerified }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const toast = useToast();

  // 'intro' → on explique et on propose d'envoyer ; 'code' → saisie.
  const [step, setStep] = useState('intro');
  // Adresse VISÉE : celle du compte, ou la nouvelle si l'utilisateur corrige.
  const [target, setTarget] = useState(email || '');
  const [editing, setEditing] = useState(false);
  const newEmail = useRef({ value: '' });

  const codeRef = useRef(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setStep('intro');
    setEditing(false);
    setCode('');
    setError(null);
    setTarget(email || '');
    newEmail.current.value = '';
  };

  const close = () => {
    reset();
    onClose?.();
  };

  const sendCode = async () => {
    setError(null);
    const changing = editing;
    const value = changing ? newEmail.current.value.trim().toLowerCase() : email;

    if (changing && !isValidEmail(value)) {
      setError(t('profile.email.invalid'));
      return;
    }

    setBusy(true);
    try {
      const res = changing ? await usersApi.changeEmail(value) : await usersApi.requestEmailCode();
      setTarget(res?.email || value);
      setCode('');
      setStep('code');
      // `sent: false` = le prestataire a refusé (constaté en local : domaine non
      // vérifié chez Resend). Annoncer « code envoyé » ferait attendre un email
      // qui n'arrivera jamais. Rien ne justifie de le cacher ici : le flux est
      // authentifié, il n'y a pas d'énumération à empêcher.
      if (res?.sent === false) {
        setError(t('profile.email.notify.notDelivered'));
      } else {
        toast.show({ type: 'success', message: t('profile.email.notify.sent') });
      }
    } catch (e) {
      const err = parseApiError(e);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (code.length !== LENGTH) {
      setError(t('profile.email.codeRequired'));
      codeRef.current?.shake();
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await usersApi.verifyEmail(code);
      toast.show({
        type: 'success',
        message: res?.changed ? t('profile.email.notify.changed') : t('profile.email.notify.verified'),
      });
      close();
      // Le parent recharge le profil : `email` et `email_verified` viennent du
      // serveur, on ne les devine pas côté client.
      onVerified?.();
    } catch (e) {
      const err = parseApiError(e);
      setError(err.message);
      // Code refusé/expiré : on vide les cases plutôt que d'inviter à retaper
      // par-dessus des chiffres déjà rejetés.
      if (['VERIFY_CODE_INVALID', 'VERIFY_CODE_EXPIRED', 'VERIFY_TOO_MANY_ATTEMPTS'].includes(err.code)) {
        codeRef.current?.shake();
        setCode('');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={close} title={t('profile.email.sheetTitle')}>
      {step === 'intro' ? (
        <>
          {/* Le « pourquoi » d'abord : sans lui, confirmer son adresse ressemble
              à une formalité administrative qu'on repousse indéfiniment. */}
          <Body color={colors.textBody} style={styles.intro}>
            {t('profile.email.why')}
          </Body>

          {editing ? (
            <AuthField
              label={t('profile.email.newAddress')}
              defaultValue=""
              onChangeText={(v) => (newEmail.current.value = v)}
              error={error}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="send"
              onSubmitEditing={sendCode}
            />
          ) : (
            <View style={styles.addressBox}>
              <Label size="caption" color={colors.textMuted}>{t('profile.email.current')}</Label>
              <Body weight="semibold" color={colors.textDark} numberOfLines={1}>{email || '—'}</Body>
            </View>
          )}

          {!editing && error ? (
            <Label color={colors.errorText} style={styles.error} accessibilityLiveRegion="polite">
              {error}
            </Label>
          ) : null}

          <AppButton
            title={t('profile.email.send')}
            variant="primary"
            fullWidth
            loading={busy}
            onPress={sendCode}
            style={styles.cta}
          />
          <AppButton
            title={editing ? t('profile.email.keepAddress') : t('profile.email.wrongAddress')}
            variant="ghost"
            fullWidth
            onPress={() => {
              setError(null);
              setEditing((v) => !v);
            }}
          />
        </>
      ) : (
        <>
          <Body color={colors.textBody} style={styles.intro}>
            {t('profile.email.codeSentTo')}{' '}
            <Body weight="bold" color={colors.textDark}>{target}</Body>
          </Body>

          <CodeInput
            ref={codeRef}
            length={LENGTH}
            value={code}
            onChange={(v) => {
              setCode(v);
              if (error) setError(null);
            }}
            onComplete={confirm}
            error={!!error}
            // Code reçu par email : pas d'autofill SMS à annoncer au système.
            autoComplete="off"
            accessibilityLabel={t('profile.email.codeLabel')}
          />

          {error ? (
            <Label color={colors.errorText} style={styles.error} accessibilityLiveRegion="polite">
              {error}
            </Label>
          ) : null}

          <AppButton
            title={t('profile.email.confirm')}
            variant="primary"
            fullWidth
            loading={busy}
            onPress={confirm}
            style={styles.cta}
          />
          <AppButton
            title={t('profile.email.back')}
            variant="ghost"
            fullWidth
            onPress={() => {
              setError(null);
              setCode('');
              setStep('intro');
            }}
          />
        </>
      )}
    </BottomSheet>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    intro: { lineHeight: 21, marginBottom: spacing.md },
    addressBox: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      gap: 2,
    },
    error: { marginTop: spacing.sm },
    cta: { marginTop: spacing.lg },
  });
