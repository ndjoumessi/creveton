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
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WifiOff, Check } from 'lucide-react-native';
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
import { COUNTRIES, countryName, countryByIso, matchesQuery } from '../constants/countries';
import { normalizeLang } from '../utils/i18n';
import { searchNormalize } from '../utils/format';
import { SEXES, LANGS } from '../constants/config';
import { fonts, fontSizes, radius, spacing, shadow } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

const STEPS = [
  { titleKey: 'auth.register.step1', n: '1/3' },
  { titleKey: 'auth.register.step2', n: '2/3' },
  { titleKey: 'auth.register.step3', n: '3/3' },
];

// Sentinelle « autre ville » — stockée telle quelle en base (le backend accepte
// `ville` libre) mais AFFICHÉE traduite.
const OTHER_CITY = 'Autre';

const CITIES = [
  'Yaoundé', 'Douala', 'Bafoussam', 'Bamenda', 'Garoua', 'Maroua',
  'Ngaoundéré', 'Bertoua', 'Ebolowa', 'Buea', 'Kribi', 'Limbe',
  'Edéa', 'Kumba', 'Dschang', 'Foumban',
  // `OTHER_CITY` sort de la liste : les autres entrées sont des noms propres
  // (invariants d'une langue à l'autre), celui-ci est un MOT — il affichait
  // « Autre » dans une interface anglaise.
  OTHER_CITY,
];

export default function RegisterScreen({ navigation }) {
  const { t, i18n } = useTranslation();
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
  // ⚠ `lang` est la langue DU COMPTE en cours de création (choisie à l'étape 3),
  // pas celle de l'interface. Le sélecteur de pays s'en servait pour AFFICHER les
  // noms : sur une interface anglaise, il listait donc « Cameroun / Tchad /
  // Centrafrique » — la valeur par défaut du futur compte, décidée deux étapes
  // plus loin. L'affichage suit désormais `uiLang`.
  const [lang, setLang] = useState('fr');
  const uiLang = normalizeLang(i18n.language);
  const [countryQuery, setCountryQuery] = useState('');
  const [cityQuery, setCityQuery] = useState('');
  const ageRef = useRef(null);
  const [cityOpen, setCityOpen] = useState(false);
  // Pays de l'indicatif. Défaut Cameroun (marché principal) ; la diaspora en
  // change au premier écran. Ne concerne QUE le téléphone du compte — le
  // Mobile Money reste camerounais côté backend (MOMO_PHONE_REGEX).
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [countryOpen, setCountryOpen] = useState(false);
  const [errors, setErrors] = useState({});

  // La ville n'est demandée qu'au Cameroun (liste CM-only, cf. étape 3).
  const isCameroon = country === DEFAULT_COUNTRY;

  // Changer de pays vide la ville : sans ça, un utilisateur qui choisit
  // « Douala » puis bascule sur 🇫🇷 enverrait une ville camerounaise avec un
  // compte français — le champ étant devenu invisible, il ne pourrait plus
  // la corriger.
  // Filtrage mémoïsé : la liste se recalcule à chaque frappe, sur 35 entrées —
  // négligeable, mais `useMemo` évite aussi de recréer le tableau à chaque rendu
  // du formulaire (qui se re-rend à chaque étape).
  const filteredCountries = useMemo(
    () => COUNTRIES.filter((c) => matchesQuery(c, countryQuery, callingCodeFor(c.iso))),
    [countryQuery]
  );

  // Villes : même recherche insensible aux accents. « ngaoundere » trouve
  // « Ngaoundéré » — personne ne compose les accents au clavier d'un téléphone.
  const filteredCities = useMemo(
    () => CITIES.filter((c) => searchNormalize(c).includes(searchNormalize(cityQuery))),
    [cityQuery]
  );

  // Saisie LIBRE quand rien ne correspond. La liste est camerounaise et le
  // sélecteur de pays est international depuis 08-2026 : un joueur tchadien
  // n'avait que « Autre », qui stocke littéralement la chaîne « Autre » — une
  // donnée sans valeur. Le champ `ville` est déjà du texte libre côté serveur
  // (Joi `string().max(100)`) ET côté profil, où l'édition est un simple champ
  // texte : on n'ouvre donc rien de nouveau, on rattrape l'inscription.
  //
  // Première lettre capitalisée : le filtre admin compare `ville = $1` À
  // L'IDENTIQUE ; « douala » saisi en minuscules ne remonterait pas avec
  // « Douala ». Ça ne règle pas les fautes de frappe, mais ça règle le cas
  // dominant.
  const customCity = useMemo(() => {
    const v = cityQuery.trim();
    if (!v || filteredCities.length) return null;
    return v.charAt(0).toUpperCase() + v.slice(1);
  }, [cityQuery, filteredCities.length]);

  const chooseCity = (value) => {
    setVille(value);
    setCityOpen(false);
    setCityQuery('');
  };

  const onSelectCountry = (iso) => {
    setCountry(iso);
    if (iso !== DEFAULT_COUNTRY) setVille('');
    setCountryOpen(false);
    setCountryQuery(''); // sinon la prochaine ouverture rouvre sur l'ancien filtre
  };

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
                    // Déjà nettoyé par PhoneInput — on ne fait que stocker.
                    onChangeText={(v) => (values.current.phoneNational = v)}
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
              {/* Ville : la liste ne contient que des villes CAMEROUNAISES et
                  alimente l'affichage du classement. Hors Cameroun elle n'a
                  aucun choix juste à proposer — on ne la demande donc pas.
                  `ville` reste simplement `undefined`, ce que le backend
                  accepte déjà (Joi : `ville` optionnel). */}
              {isCameroon ? (
                <>
                  <Label color={colors.textBody} style={styles.fieldLabel}>{t('auth.register.city')}</Label>
                  <Pressable
                    style={styles.select}
                    onPress={() => setCityOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel={t('a11y.selectCity')}
                    accessibilityValue={{ text: ville || undefined }}
                  >
                    <Body weight="medium" color={colors.textDark} style={!ville && styles.selectPlaceholder}>
                      {ville || t('auth.register.placeholder.city')}
                    </Body>
                    <Text style={styles.chevron}>▾</Text>
                  </Pressable>
                </>
              ) : null}

              {/* Champ libre auparavant sans aucune indication : l'utilisateur
                  ne savait ni qu'il est facultatif, ni quelle plage est admise
                  (le backend rejette hors 6–99). */}
              <AuthField
                ref={ageRef}
                label={t('auth.register.age')}
                defaultValue={values.current.age}
                // `AuthField` est NON CONTRÔLÉ (defaultValue, par conception :
                // la frappe ne doit pas re-rendre le formulaire). Nettoyer la
                // valeur dans `onChangeText` ne corrigeait donc QUE le ref :
                // l'écran continuait d'afficher « 223366 » pendant que l'app
                // enregistrait « 22 ». Un champ qui ment sur ce qu'il va
                // sauvegarder est pire qu'un champ permissif.
                //
                // `maxLength` fait le gros du travail au niveau du système ;
                // `setNativeProps` rattrape ce qu'il ne couvre pas (collage,
                // séparateur décimal proposé par certains claviers numériques)
                // sans repasser en contrôlé.
                maxLength={2}
                onChangeText={(raw) => {
                  const clean = raw.replace(/\D/g, '').slice(0, 2);
                  values.current.age = clean;
                  if (clean !== raw) ageRef.current?.setNativeProps({ text: clean });
                }}
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
          <Pressable style={styles.backBtn} onPress={onBack} hitSlop={8} accessibilityRole="button">
            <Label size="md">{t('auth.register.back')}</Label>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Sélecteur de ville */}
      <Modal visible={cityOpen} transparent animationType="slide" onRequestClose={() => setCityOpen(false)}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => {
            setCityOpen(false);
            setCityQuery('');
          }}
          accessible={false}
          importantForAccessibility="no"
        >
          <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
            <Heading style={styles.modalTitle}>{t('auth.register.misc.cityPickerTitle')}</Heading>
            <TextInput
              style={styles.searchInput}
              value={cityQuery}
              onChangeText={setCityQuery}
              placeholder={t('auth.register.misc.citySearch')}
              placeholderTextColor={colors.textFaint}
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel={t('auth.register.misc.citySearch')}
            />
            <View style={styles.searchDivider} />
            <FlatList
              data={filteredCities}
              keyExtractor={(c) => c}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.pickerListContent}
              ListEmptyComponent={
                customCity ? (
                  <Pressable
                    style={styles.cityRow}
                    onPress={() => chooseCity(customCity)}
                    accessibilityRole="button"
                  >
                    <Body weight="medium" color={colors.green500}>
                      {t('auth.register.misc.cityUse', { city: customCity })}
                    </Body>
                  </Pressable>
                ) : null
              }
              renderItem={({ item }) => (
                <Pressable
                  style={styles.cityRow}
                  onPress={() => chooseCity(item)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: ville === item, checked: ville === item }}
                >
                  <Body weight="medium" color={colors.textDark}>
                    {item === OTHER_CITY ? t('auth.register.misc.cityOther') : item}
                  </Body>
                  {ville === item ? <Icon icon={Check} size={18} color={colors.green500} strokeWidth={3} /> : null}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>

      {/* Sélecteur d'indicatif pays (téléphone du compte) */}
      <Modal visible={countryOpen} transparent animationType="slide" onRequestClose={() => setCountryOpen(false)}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => {
            setCountryOpen(false);
            setCountryQuery('');
          }}
          accessible={false}
          importantForAccessibility="no"
        >
          {/* `onStartShouldSetResponder` : sans lui, un tap DANS la feuille
              remonterait au voile et fermerait la modale — y compris un tap dans
              le champ de recherche. */}
          <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
            <Heading style={styles.modalTitle}>{t('auth.register.misc.countryPickerTitle')}</Heading>
            {/* Recherche : 35 pays, c'est trois écrans de défilement pour qui
                n'est pas camerounais. Pas d'`autoFocus` — le Cameroun est en
                TÊTE de liste et couvre le cas majoritaire ; ouvrir le clavier
                d'office masquerait la moitié de la liste pour rien. */}
            <TextInput
              style={styles.searchInput}
              value={countryQuery}
              onChangeText={setCountryQuery}
              placeholder={t('auth.register.misc.countrySearch')}
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel={t('auth.register.misc.countrySearch')}
            />
            <View style={styles.searchDivider} />
            <FlatList
              data={filteredCountries}
              keyExtractor={(c) => c.iso}
              keyboardShouldPersistTaps="handled"
              // L'ascenseur Android se dessine PAR-DESSUS le contenu, au ras du
              // bord droit — c'est-à-dire pile sur la coche de la ligne
              // sélectionnée. Quelques pixels de retrait suffisent à lui laisser
              // sa gouttière.
              contentContainerStyle={styles.pickerListContent}
              ListEmptyComponent={
                <Body muted style={styles.pickerEmpty}>
                  {t('auth.register.misc.countryNoResult')}
                </Body>
              }
              renderItem={({ item }) => (
                <Pressable
                  style={styles.cityRow}
                  onPress={() => onSelectCountry(item.iso)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: country === item.iso, checked: country === item.iso }}
                >
                  <Body weight="medium" color={colors.textDark} style={styles.countryLabel}>
                    {`${item.flag}  ${countryName(item, uiLang)}`}
                  </Body>
                  <Body color={colors.textMuted}>{`+${callingCodeFor(item.iso)}`}</Body>
                  {/* Emplacement de coche TOUJOURS rendu : sans lui, la ligne
                      sélectionnée était la seule à décaler son indicatif vers la
                      gauche pour faire place à la coche, et la colonne des
                      indicatifs perdait son alignement sur cette ligne-là. */}
                  <View style={styles.checkSlot}>
                    {country === item.iso ? (
                      <Icon icon={Check} size={18} color={colors.green500} strokeWidth={3} />
                    ) : null}
                  </View>
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
  const ref = useRef(null);

  // Le nettoyage vit ICI et non dans le formulaire : c'est une propriété du
  // champ, pas de l'écran. Et il doit corriger l'AFFICHAGE, pas seulement la
  // valeur remontée — le champ est non contrôlé (cf. AuthField), donc un
  // `replace` dans `onChangeText` laissait l'écran montrer autre chose que ce
  // qui serait envoyé. Un clavier `phone-pad` propose « + », espaces et
  // parenthèses : saisir « +237690000001 » dans le champ NATIONAL affichait ce
  // texte et transmettait « 237690000001 », qui, préfixé de l'indicatif,
  // donnait un numéro faux.
  const handleChange = (raw) => {
    const clean = raw.replace(/[^\d]/g, '').slice(0, 15);
    if (clean !== raw) ref.current?.setNativeProps({ text: clean });
    onChangeText(clean);
  };

  return (
    <AuthField
      ref={ref}
      style={styles.phoneInner}
      label={null}
      defaultValue={defaultValue}
      onChangeText={handleChange}
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
  card: { backgroundColor: colors.white, borderRadius: radius.sheet, padding: 24, ...shadow.floating },
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
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    // Marge basse ajoutée : la feuille s'arrêtait pile au bord de l'écran, donc
    // la dernière ligne tombait sous la barre de gestes. `maxHeight` monté à
    // 75 % pour compenser la hauteur prise par le champ de recherche — sinon on
    // gagnait une recherche mais on perdait deux lignes de résultats.
    paddingBottom: spacing.xl,
    maxHeight: '75%',
  },
  // Champ de recherche des sélecteurs (pays, ville).
  searchInput: {
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.borderInput,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.base,
    color: colors.textDark,
  },
  // Séparateur sous la recherche. La liste défile juste en dessous : sans
  // frontière visible, la ligne à demi coupée en haut du défilement se lit comme
  // un défaut de rendu, alors qu'elle dit simplement « il y a du contenu
  // au-dessus ». Le trait rend cette limite explicite.
  searchDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    marginHorizontal: -spacing.lg, // pleine largeur de la feuille (qui est paddée)
  },
  pickerEmpty: { textAlign: 'center', paddingVertical: spacing.xl },
  pickerListContent: { paddingRight: spacing.sm },
  checkSlot: { width: 18, marginLeft: spacing.sm, alignItems: 'flex-end' },
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
