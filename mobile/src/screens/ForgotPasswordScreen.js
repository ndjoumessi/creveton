// ForgotPasswordScreen — étape 1 de « mot de passe oublié » : on demande
// l'adresse, le serveur envoie un code à 6 chiffres par email.
//
// Point non négociable : le serveur répond 204 que le compte existe ou non
// (anti-énumération). L'écran ne doit donc JAMAIS afficher « email inconnu » —
// il ne le sait pas, et le prétendre transformerait l'app en annuaire d'adresses.
// D'où la confirmation au conditionnel : « si un compte existe… ».
//
// L'email saisi sur l'écran de connexion est transmis en paramètre : dans neuf
// cas sur dix l'utilisateur vient d'échouer à se connecter, il l'a déjà tapé.

import React, { useRef, useState, useMemo } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { MailQuestion } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Screen, Logo, Title, Body, AuthField, AppButton, useToast } from '../components';
import Icon from '../components/Icon';
import { useAuthStore } from '../store/authStore';
import { isValidEmail } from '../utils/validation';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { radius, spacing } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

export default function ForgotPasswordScreen({ navigation, route }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const toast = useToast();
  const { isOnline } = useNetworkStatus();
  const forgotPassword = useAuthStore((s) => s.forgotPassword);

  // Champ non contrôlé (motif AuthField) : la frappe ne re-rend pas l'écran, le
  // clavier ne réinitialise donc pas le formulaire.
  const prefill = route.params?.email || '';
  const value = useRef({ email: prefill });
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  const onSubmit = async () => {
    const email = value.current.email.trim().toLowerCase();
    setError(null);

    if (!isValidEmail(email)) {
      setError(t('auth.forgot.invalidEmail'));
      return;
    }
    if (!isOnline) {
      setError(t('offline.loginRequired'));
      return;
    }

    setSending(true);
    const res = await forgotPassword(email);
    setSending(false);

    if (!res.ok) {
      // Seuls les vrais échecs remontent ici (réseau, 429). Un compte inexistant
      // renvoie 204 et passe donc par le chemin nominal ci-dessous.
      const msg = res.error?.message || t('auth.forgot.notify.failed');
      setError(msg);
      return;
    }

    toast.show({ type: 'success', message: t('auth.forgot.notify.sent') });
    navigation.navigate('ResetPassword', { email });
  };

  return (
    <Screen scroll contentStyle={styles.content}>
      <Pressable
        style={styles.back}
        onPress={() => navigation.goBack()}
        hitSlop={8}
        accessibilityRole="button"
      >
        <Body weight="semibold" color={colors.green500}>{t('auth.register.back')}</Body>
      </Pressable>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.center}>
          <Logo size={40} />
          <View style={styles.badge}>
            <Icon icon={MailQuestion} size={38} color={colors.green500} />
          </View>
          <Title size="xl" style={styles.heading}>{t('auth.forgot.title')}</Title>
          <Body muted style={styles.subtitle}>{t('auth.forgot.subtitle')}</Body>
        </View>

        <AuthField
          label={t('auth.email')}
          defaultValue={prefill}
          onChangeText={(v) => (value.current.email = v)}
          error={error}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="send"
          onSubmitEditing={onSubmit}
        />

        <AppButton
          title={t('auth.forgot.submit')}
          variant="primary"
          size="lg"
          fullWidth
          loading={sending}
          disabled={!isOnline}
          onPress={onSubmit}
          style={styles.submit}
        />

        {/* Le code met parfois une minute à arriver : on le dit avant l'attente
            plutôt que de laisser l'utilisateur conclure que ça n'a pas marché. */}
        <Body size="xs" muted style={styles.hint}>{t('auth.forgot.hint')}</Body>

        <Pressable
          style={styles.altRow}
          onPress={() => navigation.navigate('ResetPassword', { email: value.current.email })}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Body size="md" color={colors.green500}>{t('auth.forgot.haveCode')}</Body>
        </Pressable>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    content: { paddingBottom: spacing.xxl },
    back: { alignSelf: 'flex-start', marginBottom: spacing.lg },
    center: { alignItems: 'center', marginBottom: spacing.xl },
    badge: {
      width: 76,
      height: 76,
      borderRadius: radius.pill,
      backgroundColor: colors.successBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.lg,
      marginBottom: spacing.lg,
    },
    heading: { textAlign: 'center', marginBottom: spacing.sm },
    subtitle: { textAlign: 'center', lineHeight: 22 },
    submit: { marginTop: spacing.sm },
    hint: { textAlign: 'center', marginTop: spacing.md, lineHeight: 18 },
    altRow: { alignSelf: 'center', marginTop: spacing.xl },
  });
