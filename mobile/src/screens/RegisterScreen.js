// RegisterScreen — inscription en 3 étapes.
// Même fix clavier que Login : KeyboardAvoidingView (padding iOS / height
// Android), pas de ScrollView, champs non contrôlés (valeurs en ref) → le
// formulaire ne se réinitialise pas quand le clavier s'ouvre.

import React, { useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Modal,
  FlatList,
  StatusBar,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WifiOff } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Logo, AppButton, AuthField } from '../components';
import Icon from '../components/Icon';
import { useAuthStore } from '../store/authStore';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import {
  normalizePhone,
  isValidName,
  isValidPhone,
  isValidEmail,
  isValidPassword,
} from '../utils/validation';
import { SEXES, LANGS } from '../constants/config';
import { fonts, fontSizes, radius, spacing, shadow } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

const STEPS = [
  { titleKey: 'auth.register.step1', n: '1/3' },
  { titleKey: 'auth.register.step2', n: '2/3' },
  { titleKey: 'auth.register.step3', n: '3/3' },
];

const CITIES = [
  'Yaoundé', 'Douala', 'Bafoussam', 'Bamenda', 'Garoua', 'Maroua',
  'Ngaoundéré', 'Bertoua', 'Ebolowa', 'Buea', 'Kribi', 'Limbe',
  'Edéa', 'Kumba', 'Dschang', 'Foumban', 'Autre',
];

export default function RegisterScreen({ navigation }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const register = useAuthStore((s) => s.register);
  const loading = useAuthStore((s) => s.loading);
  const { isOnline } = useNetworkStatus();

  const values = useRef({
    name: '',
    phone9: '', // 9 chiffres après +237
    email: '',
    password: '',
    confirm: '',
    age: '',
  });

  const [step, setStep] = useState(0);
  const [showPwd, setShowPwd] = useState(false);
  const [ville, setVille] = useState('');
  const [sexe, setSexe] = useState('N');
  const [lang, setLang] = useState('fr');
  const [cityOpen, setCityOpen] = useState(false);
  const [errors, setErrors] = useState({});

  const setErr = (e) => setErrors(e);

  const validateStep = () => {
    const e = {};
    if (step === 0) {
      if (!isValidName(values.current.name)) e.name = t('auth.register.validation.name');
      if (!isValidPhone(`+237${values.current.phone9}`))
        e.phone = t('auth.register.validation.phone');
    } else if (step === 1) {
      if (!isValidEmail(values.current.email)) e.email = t('auth.register.validation.email');
      if (!isValidPassword(values.current.password))
        e.password = t('auth.register.validation.password');
      else if (values.current.password !== values.current.confirm)
        e.confirm = t('auth.register.validation.passwordMismatch');
    }
    setErr(e);
    return Object.keys(e).length === 0;
  };

  const onNext = () => {
    if (!validateStep()) return;
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else onSubmit();
  };

  const onBack = () => {
    setErr({});
    if (step > 0) setStep((s) => s - 1);
    else navigation.goBack();
  };

  const onSubmit = async () => {
    if (!isOnline) {
      setErr({ _global: t('offline.loginRequired') });
      return;
    }
    const phone = normalizePhone(`+237${values.current.phone9}`);
    const payload = {
      name: values.current.name.trim(),
      email: values.current.email.trim().toLowerCase(),
      phone,
      password: values.current.password,
      ville: ville || undefined,
      age: values.current.age ? Number(values.current.age) : undefined,
      sexe,
      lang,
    };
    const res = await register(payload);
    if (res.ok) {
      navigation.navigate('OTP', { phone, otpExpiresAt: res.data.otp_expires_at });
      return;
    }
    const code = res.error?.code;
    if (code === 'EMAIL_ALREADY_USED') {
      setErr({ email: t('auth.register.notify.emailUsed') });
      setStep(1);
    } else if (code === 'PHONE_ALREADY_USED') {
      setErr({ phone: t('auth.register.notify.phoneUsed') });
      setStep(0);
    } else {
      setErr({ _global: res.error?.message || t('auth.register.notify.registerFailed') });
    }
  };

  const isLast = step === STEPS.length - 1;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kav}
      >
        <View style={styles.brand}>
          <Logo size={48} />
        </View>

        <View style={styles.card}>
          {/* Progress 3 segments */}
          <View style={styles.progress}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[styles.seg, { backgroundColor: i <= step ? colors.gold500 : colors.border }]}
              />
            ))}
          </View>

          <Text style={styles.stepN}>{t('auth.register.misc.stepCounter', { n: STEPS[step].n })}</Text>
          <Text style={styles.title}>{t(STEPS[step].titleKey)}</Text>

          {step === 0 ? (
            <>
              <AuthField
                label={t('auth.register.fullName')}
                defaultValue={values.current.name}
                onChangeText={(t) => (values.current.name = t)}
                error={errors.name}
                autoCapitalize="words"
                textContentType="name"
              />
              <Text style={styles.fieldLabel}>{t('auth.register.phone')}</Text>
              <View style={styles.phoneRow}>
                <View style={styles.prefix}>
                  <Text style={styles.prefixText}>+237</Text>
                </View>
                <View style={[styles.phoneField, errors.phone && styles.phoneFieldError]}>
                  <PhoneInput
                    defaultValue={values.current.phone9}
                    placeholder={t('auth.register.placeholder.phone')}
                    onChangeText={(v) => (values.current.phone9 = v.replace(/\D/g, '').slice(0, 9))}
                  />
                </View>
              </View>
              {errors.phone ? <Text style={styles.err}>{errors.phone}</Text> : null}
            </>
          ) : null}

          {step === 1 ? (
            <>
              <AuthField
                label={t('auth.register.email')}
                defaultValue={values.current.email}
                onChangeText={(t) => (values.current.email = t)}
                error={errors.email}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
              />
              <AuthField
                label={t('auth.register.password')}
                defaultValue={values.current.password}
                onChangeText={(t) => (values.current.password = t)}
                error={errors.password}
                secureTextEntry={!showPwd}
                autoCapitalize="none"
                rightToggle={{ active: showPwd, onToggle: () => setShowPwd((v) => !v) }}
              />
              <AuthField
                label={t('auth.register.confirmPassword')}
                defaultValue={values.current.confirm}
                onChangeText={(t) => (values.current.confirm = t)}
                error={errors.confirm}
                secureTextEntry={!showPwd}
                autoCapitalize="none"
              />
            </>
          ) : null}

          {step === 2 ? (
            <>
              <Text style={styles.fieldLabel}>{t('auth.register.city')}</Text>
              <Pressable style={styles.select} onPress={() => setCityOpen(true)}>
                <Text style={[styles.selectText, !ville && styles.selectPlaceholder]}>
                  {ville || t('auth.register.placeholder.city')}
                </Text>
                <Text style={styles.chevron}>▾</Text>
              </Pressable>

              <AuthField
                label={t('auth.register.age')}
                defaultValue={values.current.age}
                onChangeText={(t) => (values.current.age = t.replace(/\D/g, '').slice(0, 2))}
                keyboardType="number-pad"
                style={styles.ageField}
              />

              <Text style={styles.fieldLabel}>{t('auth.register.gender')}</Text>
              <Pills
                options={SEXES.map((o) => ({
                  ...o,
                  label: t(`auth.register.gender${o.key === 'H' ? 'M' : o.key}`),
                }))}
                value={sexe}
                onChange={setSexe}
              />

              <Text style={[styles.fieldLabel, styles.mt]}>{t('auth.register.language')}</Text>
              <Pills options={LANGS} value={lang} onChange={setLang} />
            </>
          ) : null}

          {isLast && !isOnline ? (
            <View style={styles.errRow}>
              <Icon icon={WifiOff} size={14} color={colors.red400} />
              <Text style={styles.err}>{t('offline.loginRequired')}</Text>
            </View>
          ) : null}
          {errors._global ? <Text style={styles.err}>{errors._global}</Text> : null}

          <AppButton
            title={isLast ? t('auth.register.create') : t('auth.register.next')}
            variant="primary"
            size="lg"
            loading={loading && isLast}
            disabled={isLast && !isOnline}
            onPress={onNext}
            style={styles.submit}
          />
          <Pressable style={styles.backBtn} onPress={onBack} hitSlop={8}>
            <Text style={styles.backText}>{t('auth.register.back')}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Sélecteur de ville */}
      <Modal visible={cityOpen} transparent animationType="slide" onRequestClose={() => setCityOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCityOpen(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{t('auth.register.misc.cityPickerTitle')}</Text>
            <FlatList
              data={CITIES}
              keyExtractor={(c) => c}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.cityRow}
                  onPress={() => {
                    setVille(item);
                    setCityOpen(false);
                  }}
                >
                  <Text style={styles.cityText}>{item}</Text>
                  {ville === item ? <Text style={styles.cityCheck}>✓</Text> : null}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// Saisie téléphone non contrôlée (9 chiffres).
function PhoneInput({ defaultValue, onChangeText, placeholder }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <AuthField
      style={styles.phoneInner}
      label={null}
      defaultValue={defaultValue}
      onChangeText={onChangeText}
      keyboardType="phone-pad"
      placeholder={placeholder}
      maxLength={9}
    />
  );
}

function Pills({ options, value, onChange }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.pills}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[styles.pill, active && styles.pillActive]}
          >
            <Text style={[styles.pillText, active && styles.pillTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.green900 },
  kav: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.lg },
  brand: { alignItems: 'center', marginBottom: spacing.lg },
  card: { backgroundColor: colors.white, borderRadius: radius.xxl, padding: 24, ...shadow.floating },
  progress: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  seg: { flex: 1, height: 6, borderRadius: radius.pill },
  stepN: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.xs, color: colors.gold500 },
  title: { fontFamily: fonts.titleBold, fontSize: fontSizes.xl, color: colors.textDark, marginBottom: spacing.lg },
  fieldLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    color: colors.textBody,
    marginBottom: spacing.sm,
  },
  mt: { marginTop: spacing.md },
  phoneRow: { flexDirection: 'row', gap: spacing.sm },
  prefix: {
    height: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.green900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prefixText: { fontFamily: fonts.bodyBold, fontSize: fontSizes.base, color: colors.textOnDark },
  phoneField: { flex: 1 },
  phoneFieldError: {},
  phoneInner: { marginBottom: 0 },
  ageField: { marginTop: spacing.xs },
  errRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  err: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.xs, color: colors.red400, marginBottom: spacing.md },
  select: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.borderInput,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  selectText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.base, color: colors.textDark },
  selectPlaceholder: { color: colors.textFaint },
  chevron: { fontSize: fontSizes.base, color: colors.textMuted },
  pills: { flexDirection: 'row', gap: spacing.sm },
  pill: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.borderInput,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: { backgroundColor: colors.green900, borderColor: colors.green900 },
  pillText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, color: colors.textMuted },
  pillTextActive: { color: colors.textOnDark },
  submit: { marginTop: spacing.lg },
  backBtn: { alignItems: 'center', marginTop: spacing.md },
  backText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.md, color: colors.textMuted },
  modalBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    maxHeight: '60%',
  },
  modalTitle: { fontFamily: fonts.titleSemiBold, fontSize: fontSizes.lg, color: colors.textDark, marginBottom: spacing.md },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cityText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.base, color: colors.textDark },
  cityCheck: { fontFamily: fonts.bodyBold, fontSize: fontSizes.base, color: colors.green500 },
});
