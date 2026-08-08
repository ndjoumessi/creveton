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
import { Logo, AppButton, AuthField, ChoiceChips, Title, Heading, Body, Label } from '../components';
import Icon from '../components/Icon';
import { useAuthStore } from '../store/authStore';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import {
  normalizePhone,
  isValidName,
  isValidPhone,
  isValidEmail,
  passwordIssues,
  callingCodeFor,
  DEFAULT_COUNTRY,
} from '../utils/validation';
import { COUNTRIES, countryName, countryByIso } from '../constants/countries';
import { SEXES, LANGS } from '../constants/config';
import { fontSizes, radius, spacing, shadow } from '../constants/theme';
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
    phoneNational: '', // numéro SANS indicatif ; le pays vit dans l'état `country`
    email: '',
    password: '',
    confirm: '',
    age: '',
  });

  const [step, setStep] = useState(0);
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [ville, setVille] = useState('');
  const [sexe, setSexe] = useState('N');
  const [lang, setLang] = useState('fr');
  const [cityOpen, setCityOpen] = useState(false);
  // Pays de l'indicatif. Défaut Cameroun (marché principal) ; la diaspora en
  // change au premier écran. Ne concerne QUE le téléphone du compte — le
  // Mobile Money reste camerounais côté backend (MOMO_PHONE_REGEX).
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [countryOpen, setCountryOpen] = useState(false);
  const [errors, setErrors] = useState({});

  const setErr = (e) => setErrors(e);

  const validateStep = () => {
    const e = {};
    if (step === 0) {
      if (!isValidName(values.current.name)) e.name = t('auth.register.validation.name');
      if (!isValidPhone(values.current.phoneNational, country))
        e.phone = t('auth.register.validation.phone');
    } else if (step === 1) {
      if (!isValidEmail(values.current.email)) e.email = t('auth.register.validation.email');
      // On désigne la règle qui BLOQUE plutôt que de réciter les trois : avec
      // « 8 caractères min., 1 chiffre, 1 majuscule », un mot de passe long et
      // chiffré à qui il ne manque que la majuscule renvoie l'utilisateur à
      // relire les trois règles pour deviner laquelle échoue.
      const issues = passwordIssues(values.current.password);
      if (issues.length)
        e.password = issues.map((k) => t(`auth.register.validation.password_${k}`)).join(' ');
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
    const phone = normalizePhone(values.current.phoneNational, country);
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

          <Label size="xs" color={colors.gold500}>{t('auth.register.misc.stepCounter', { n: STEPS[step].n })}</Label>
          <Title size="xl" style={styles.title}>{t(STEPS[step].titleKey)}</Title>

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
              <Label color={colors.textBody} style={styles.fieldLabel}>{t('auth.register.phone')}</Label>
              <View style={styles.phoneRow}>
                <Pressable
                  style={styles.prefix}
                  onPress={() => setCountryOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel={t('auth.register.misc.countryPickerTitle')}
                  hitSlop={4}
                >
                  <Body weight="bold" color={colors.textOnDark}>
                    {`${countryByIso(country).flag} +${callingCodeFor(country)}`}
                  </Body>
                  <Text style={styles.prefixChevron}>▾</Text>
                </Pressable>
                <View style={[styles.phoneField, errors.phone && styles.phoneFieldError]}>
                  <PhoneInput
                    key={country} /* remonte le champ quand le pays change (longueur/format différents) */
                    defaultValue={values.current.phoneNational}
                    placeholder={t('auth.register.placeholder.phone')}
                    onChangeText={(v) => (values.current.phoneNational = v.replace(/[^\d]/g, '').slice(0, 15))}
                  />
                </View>
              </View>
              {errors.phone ? <Label size="xs" color={colors.red400} style={styles.err}>{errors.phone}</Label> : null}
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
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
                rightToggle={{ active: showConfirm, onToggle: () => setShowConfirm((v) => !v) }}
              />
            </>
          ) : null}

          {step === 2 ? (
            <>
              <Label color={colors.textBody} style={styles.fieldLabel}>{t('auth.register.city')}</Label>
              <Pressable style={styles.select} onPress={() => setCityOpen(true)}>
                <Body weight="medium" color={colors.textDark} style={!ville && styles.selectPlaceholder}>
                  {ville || t('auth.register.placeholder.city')}
                </Body>
                <Text style={styles.chevron}>▾</Text>
              </Pressable>

              {/* Champ libre auparavant sans aucune indication : l'utilisateur
                  ne savait ni qu'il est facultatif, ni quelle plage est admise
                  (le backend rejette hors 6–99). */}
              <AuthField
                label={t('auth.register.age')}
                defaultValue={values.current.age}
                onChangeText={(t) => (values.current.age = t.replace(/\D/g, '').slice(0, 2))}
                keyboardType="number-pad"
                placeholder={t('auth.register.placeholder.age')}
                style={styles.ageField}
              />
              <Label size="xs" color={colors.textFaint} style={styles.hint}>
                {t('auth.register.misc.ageHint')}
              </Label>

              <Label color={colors.textBody} style={styles.fieldLabel}>{t('auth.register.gender')}</Label>
              <ChoiceChips
                options={SEXES.map((o) => ({
                  ...o,
                  label: t(`auth.register.gender${o.key === 'H' ? 'M' : o.key}`),
                }))}
                value={sexe}
                onChange={setSexe}
              />

              <Label color={colors.textBody} style={[styles.fieldLabel, styles.mt]}>{t('auth.register.language')}</Label>
              <ChoiceChips options={LANGS} value={lang} onChange={setLang} />
            </>
          ) : null}

          {isLast && !isOnline ? (
            <View style={styles.errRow}>
              <Icon icon={WifiOff} size={14} color={colors.red400} />
              <Label size="xs" color={colors.red400} style={styles.err}>{t('offline.loginRequired')}</Label>
            </View>
          ) : null}
          {errors._global ? <Label size="xs" color={colors.red400} style={styles.err}>{errors._global}</Label> : null}

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
            <Label size="md">{t('auth.register.back')}</Label>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Sélecteur de ville */}
      <Modal visible={cityOpen} transparent animationType="slide" onRequestClose={() => setCityOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCityOpen(false)}>
          <View style={styles.modalSheet}>
            <Heading style={styles.modalTitle}>{t('auth.register.misc.cityPickerTitle')}</Heading>
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
                  <Body weight="medium" color={colors.textDark}>{item}</Body>
                  {ville === item ? <Body weight="bold" color={colors.green500}>✓</Body> : null}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>

      {/* Sélecteur d'indicatif pays (téléphone du compte) */}
      <Modal visible={countryOpen} transparent animationType="slide" onRequestClose={() => setCountryOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCountryOpen(false)}>
          <View style={styles.modalSheet}>
            <Heading style={styles.modalTitle}>{t('auth.register.misc.countryPickerTitle')}</Heading>
            <FlatList
              data={COUNTRIES}
              keyExtractor={(c) => c.iso}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.cityRow}
                  onPress={() => {
                    setCountry(item.iso);
                    setCountryOpen(false);
                  }}
                  accessibilityRole="button"
                >
                  <Body weight="medium" color={colors.textDark} style={styles.countryLabel}>
                    {`${item.flag}  ${countryName(item, lang)}`}
                  </Body>
                  <Body color={colors.textMuted}>{`+${callingCodeFor(item.iso)}`}</Body>
                  {country === item.iso ? <Body weight="bold" color={colors.green500}>✓</Body> : null}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// Saisie téléphone non contrôlée (numéro national, sans indicatif).
// `maxLength` à 15 = maximum E.164 tous pays confondus ; la longueur RÉELLE
// attendue dépend du pays et est vérifiée par libphonenumber-js à la validation
// (un cap à 9 chiffres, hérité du Cameroun, tronquait les numéros étrangers).
// `numberOfLines`/`multiline={false}` : la tuile d'indicatif ayant grandi (drapeau
// + code + chevron), le champ restant est étroit et un placeholder un peu long
// repassait à la ligne pour se faire couper par la hauteur fixe du champ.
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
      maxLength={15}
      multiline={false}
      numberOfLines={1}
    />
  );
}

const makeStyles = (colors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.green900 },
  kav: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.lg },
  brand: { alignItems: 'center', marginBottom: spacing.lg },
  card: { backgroundColor: colors.white, borderRadius: radius.xxl, padding: 24, ...shadow.floating },
  progress: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  seg: { flex: 1, height: 6, borderRadius: radius.pill },
  title: { marginBottom: spacing.lg },
  fieldLabel: { marginBottom: spacing.sm },
  mt: { marginTop: spacing.md },
  phoneRow: { flexDirection: 'row', gap: spacing.sm },
  // Tuile d'indicatif : pressable (ouvre le sélecteur de pays) depuis que le
  // téléphone du compte est international — c'était un simple libellé « +237 ».
  prefix: {
    height: 52,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.green900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prefixChevron: { color: colors.textOnDark, fontSize: fontSizes.sm },
  countryLabel: { flex: 1 },
  phoneField: { flex: 1 },
  phoneFieldError: {},
  phoneInner: { marginBottom: 0 },
  ageField: { marginTop: spacing.xs },
  hint: { marginTop: -spacing.sm, marginBottom: spacing.md },
  errRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  err: { marginBottom: spacing.md },
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
  selectPlaceholder: { color: colors.textMuted },
  chevron: { fontSize: fontSizes.base, color: colors.textMuted },
  submit: { marginTop: spacing.lg },
  backBtn: { alignItems: 'center', marginTop: spacing.md },
  modalBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    maxHeight: '60%',
  },
  modalTitle: { marginBottom: spacing.md },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
