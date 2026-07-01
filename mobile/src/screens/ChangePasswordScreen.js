// ChangePasswordScreen — modification du mot de passe (API §4).
// Écran sombre (green900) aligné sur Login : un seul KeyboardAvoidingView
// (padding iOS / height Android), PAS de ScrollView (évite le reset du
// formulaire à l'ouverture du clavier). Champs sécurisés NON contrôlés
// (valeurs en ref) avec bascule œil via AuthField.rightToggle.
//
// Validation client alignée sur la règle serveur (min 8 car. + 1 majuscule +
// 1 chiffre) pour éviter un rejet surprise. Mapping d'erreurs :
//   INVALID_CURRENT_PASSWORD → erreur inline sous « mot de passe actuel »
//   VALIDATION_ERROR         → message serveur sous « nouveau mot de passe »
//   réseau / timeout         → toast d'erreur

import React, { useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { AppButton, AuthField, useToast } from '../components';
import Icon from '../components/Icon';
import { auth } from '../services/endpoints';
import { parseApiError } from '../services/api';
import { fonts, fontSizes, radius, spacing, shadow, MIN_TOUCH } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

// Règle serveur : ≥ 8 caractères, au moins une majuscule et un chiffre.
const isStrongPassword = (pwd) =>
  pwd.length >= 8 && /[A-Z]/.test(pwd) && /[0-9]/.test(pwd);

export default function ChangePasswordScreen({ navigation }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const toast = useToast();

  // Valeurs en ref : aucune mise à jour d'état à la frappe (anti-reset clavier).
  const values = useRef({ current: '', next: '', confirm: '' });
  const currentRef = useRef(null);
  const nextRef = useRef(null);
  const confirmRef = useRef(null);

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  // Erreurs inline par champ.
  const [errors, setErrors] = useState({ current: null, next: null, confirm: null });

  const onSubmit = async () => {
    const current = values.current.current;
    const next = values.current.next;
    const confirm = values.current.confirm;

    // Validation client (avant l'appel API) — reflète la règle serveur.
    const nextErrors = { current: null, next: null, confirm: null };
    if (!current) {
      nextErrors.current = t('changePassword.currentRequired');
    }
    if (!isStrongPassword(next)) {
      nextErrors.next = t('changePassword.weak');
    } else if (next === current) {
      nextErrors.next = t('changePassword.samePassword');
    }
    if (confirm !== next) {
      nextErrors.confirm = t('changePassword.mismatch');
    }
    if (nextErrors.current || nextErrors.next || nextErrors.confirm) {
      setErrors(nextErrors);
      return;
    }
    setErrors({ current: null, next: null, confirm: null });

    setLoading(true);
    try {
      await auth.changePassword({ current_password: current, new_password: next });
      toast.show({ type: 'success', message: t('changePassword.success') });
      navigation.goBack();
    } catch (e) {
      const { code, message } = parseApiError(e);
      if (code === 'INVALID_CURRENT_PASSWORD') {
        setErrors((prev) => ({ ...prev, current: t('changePassword.wrongCurrent') }));
      } else if (code === 'VALIDATION_ERROR') {
        setErrors((prev) => ({ ...prev, next: message || t('changePassword.weak') }));
      } else {
        toast.show({ type: 'error', message });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />

      {/* Header : bouton retour + titre + sous-titre */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={10}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Icon icon={ArrowLeft} size={22} color={colors.textOnDark} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kav}
      >
        <Text style={styles.title}>{t('changePassword.title')}</Text>
        <Text style={styles.subtitle}>{t('changePassword.subtitle')}</Text>

        <View style={styles.card}>
          <AuthField
            ref={currentRef}
            label={t('changePassword.current')}
            defaultValue=""
            onChangeText={(v) => (values.current.current = v)}
            error={errors.current}
            secureTextEntry={!showCurrent}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="default"
            textContentType="password"
            returnKeyType="next"
            onSubmitEditing={() => nextRef.current?.focus()}
            blurOnSubmit={false}
            accessibilityLabel={t('changePassword.current')}
            rightToggle={{ active: showCurrent, onToggle: () => setShowCurrent((v) => !v) }}
          />
          <AuthField
            ref={nextRef}
            label={t('changePassword.new')}
            defaultValue=""
            onChangeText={(v) => (values.current.next = v)}
            error={errors.next}
            secureTextEntry={!showNext}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="default"
            textContentType="newPassword"
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
            blurOnSubmit={false}
            accessibilityLabel={t('changePassword.new')}
            rightToggle={{ active: showNext, onToggle: () => setShowNext((v) => !v) }}
          />
          <AuthField
            ref={confirmRef}
            label={t('changePassword.confirm')}
            defaultValue=""
            onChangeText={(v) => (values.current.confirm = v)}
            error={errors.confirm}
            secureTextEntry={!showConfirm}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="default"
            textContentType="newPassword"
            returnKeyType="done"
            onSubmitEditing={onSubmit}
            accessibilityLabel={t('changePassword.confirm')}
            rightToggle={{ active: showConfirm, onToggle: () => setShowConfirm((v) => !v) }}
          />

          <AppButton
            title={t('changePassword.submit')}
            variant="primary"
            size="lg"
            fullWidth
            loading={loading}
            onPress={onSubmit}
            style={styles.submit}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.green900 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  backBtn: {
    minWidth: MIN_TOUCH,
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kav: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, marginTop: -MIN_TOUCH },
  title: {
    fontFamily: fonts.titleBold,
    fontSize: 26,
    color: colors.textOnDark,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.md,
    color: colors.textOnDarkMuted,
    marginBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xxl,
    padding: 28,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.floating,
  },
  submit: { marginTop: spacing.sm },
});
