// ProfileScreen — onglet « Profile ». Photo de profil (upload), header,
// rangée de stats, réglages sectionnés (compte / préférences / sécurité),
// badges, wallet (flag), déconnexion (API §10/§11).

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  Animated,
  Switch,
  Share,
  ActivityIndicator,
  ScrollView,
  TextInput,
  BackHandler,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  Camera,
  User,
  Mail,
  Smartphone,
  MapPin,
  Globe,
  Moon,
  Sun,
  Bell,
  Gift,
  Key,
  Lock,
  Wallet,
  BarChart2,
  X,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, Avatar, AppButton, BottomSheet, EmailVerifySheet, XpBar, useConfirm, useToast, Title, Heading, Body, Label } from '../components';
import FillBar from '../components/FillBar';
import Icon from '../components/Icon';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { getBadgesSeenLevel, setBadgesSeenLevel } from '../services/storage';
import { useAuthStore } from '../store/authStore';
import { useStatsStore } from '../store/statsStore';
import { wallet, users } from '../services/endpoints';
import { parseApiError } from '../services/api';
import { setLanguage } from '../i18n';
import { SEXES } from '../constants/config';
import { fonts, radius, spacing, shadow, motion, MIN_TOUCH } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { successRateColor } from '../utils/rank';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { formatFcfa, levelProgress, avatarUri, MAX_LEVEL } from '../utils/format';
import { hapticLight } from '../utils/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const NOTIF_PREF_KEY = 'crv.notif_enabled';

const LANG_PILLS = [
  { key: 'fr', flag: '🇫🇷', label: 'Français' },
  { key: 'en', flag: '🇬🇧', label: 'English' },
];

// Badges dérivés honnêtement du niveau atteint.
//
// L'échelle était 1 / 3 / 5 / 10 — écrite pour une progression qui n'existe
// pas : `MAX_LEVEL` vaut 5 (XP_LEVELS a 5 paliers). Le badge « Champion »
// exigeait donc le niveau 10 et ne pouvait JAMAIS être débloqué. Sur le profil
// d'un joueur au maximum, l'en-tête affichait « Niveau 5 — Champion · Niveau
// max » pendant que le badge juste en dessous affichait « Champion 🔒 Niveau
// 5/10 ». Les deux se contredisaient.
//
// Ré-étalée sur la plage réelle (1–5), un palier par cran significatif. Le
// dernier badge coïncide maintenant avec le niveau max, donc avec le titre
// « Champion » de l'en-tête au lieu de le contredire.
function deriveBadges(level, t) {
  return [
    { key: 'first', emoji: '🎯', label: t('profile.badges.first'), min: 1 },
    { key: 'regular', emoji: '🔥', label: t('profile.badges.regular'), min: 2 },
    { key: 'expert', emoji: '🧠', label: t('profile.badges.expert'), min: 3 },
    { key: 'champion', emoji: '👑', label: t('profile.badges.champion'), min: MAX_LEVEL },
  ].map((b) => ({
    ...b,
    unlocked: level >= b.min,
  }));
}

/** Stat compacte de la rangée du header. `valueColor` met en valeur (rang/taux). */
function ProfStat({ value, label, divider, valueColor }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.profStat}>
      {divider ? <View style={styles.profDivider} /> : null}
      <Title size="lg" color={valueColor || colors.textOnDark}>{value}</Title>
      <Label size="caption" color={colors.textOnDarkMuted}>{label}</Label>
    </View>
  );
}

function Section({ title, children }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.section}>
      <Title size="sm" color={colors.textMuted} style={styles.sectionLabel}>{title}</Title>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

/** Ligne de réglage : pastille icône + libellé + (valeur | droite) + chevron.
 *  `icon` = composant Lucide (ex. `User`), rendu dans la pastille via <Icon>. */
function SettingRow({ icon, iconBg, label, value, valueMuted, right, onPress, isLast }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const content = (
    <View style={[styles.row, !isLast && styles.rowDivider]}>
      <View style={[styles.rowIcon, { backgroundColor: iconBg || colors.cream }]}>
        <Icon icon={icon} size={18} color={colors.green900} />
      </View>
      <Label size={15} color={colors.textDark} style={styles.rowLabel}>{label}</Label>
      <View style={styles.rowRight}>
        {right != null ? (
          right
        ) : value != null ? (
          <Label color={colors.textBody} style={valueMuted && styles.rowValueMuted} numberOfLines={1}>
            {value || '—'}
          </Label>
        ) : null}
        {onPress && right == null ? <Title size="lg" color={colors.textFaint}>›</Title> : null}
      </View>
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: colors.divider }}
      accessibilityRole="button"
    >
      {content}
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const toast = useToast();
  const confirm = useConfirm();
  const reduceMotion = useReduceMotion();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { isOnline } = useNetworkStatus();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const updateUser = useAuthStore((s) => s.updateUser);

  const stats = useStatsStore((s) => s.stats);
  const myRank = useStatsStore((s) => s.myRank);
  const loadHistory = useStatsStore((s) => s.loadHistory);
  const loadLeaderboard = useStatsStore((s) => s.loadLeaderboard);

  const [walletState, setWalletState] = useState('loading');
  const [refreshing, setRefreshing] = useState(false);

  // Photo de profil. `avatarUri` renvoie déjà l'URL TELLE QUELLE si elle est
  // absolue (Cloudinary https://…) ; on ne préfixe SOCKET_URL que pour un chemin
  // relatif. `avatarBust` force `<Image>` à recharger après un upload : sans ça,
  // RN garde en cache l'ancienne image (ou un échec) si l'URL ne change pas.
  const [avatarSheet, setAvatarSheet] = useState(false);
  const [emailSheet, setEmailSheet] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarBust, setAvatarBust] = useState(0);
  const baseAvatar = avatarUri(user);
  const photoUri =
    baseAvatar && avatarBust
      ? `${baseAvatar}${baseAvatar.includes('?') ? '&' : '?'}cb=${avatarBust}`
      : baseAvatar;

  // Préférence locale de notifications (persistée AsyncStorage).
  const [notifEnabled, setNotifEnabled] = useState(true);
  useEffect(() => {
    AsyncStorage.getItem(NOTIF_PREF_KEY).then((v) => setNotifEnabled(v !== 'false'));
  }, []);
  const toggleNotif = useCallback((val) => {
    setNotifEnabled(val);
    AsyncStorage.setItem(NOTIF_PREF_KEY, val ? 'true' : 'false');
  }, []);

  // Édition du profil — overlay in-screen (PAS un <Modal> RN). Sur Android, le
  // <Modal> vit dans une fenêtre séparée qui rejoue son animation « slide » quand
  // le clavier redimensionne la fenêtre (adjustResize) → effet « la modale se
  // ré-ouvre en boucle », surtout sous Expo Go où softwareKeyboardLayoutMode:"pan"
  // est ignoré. Un overlay dans la même fenêtre + ScrollView supprime le souci.
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nom, setNom] = useState('');
  const [ville, setVille] = useState('');
  const [age, setAge] = useState('');
  const [sexe, setSexe] = useState('N');
  const [lang, setLang] = useState('fr');
  const [focusedField, setFocusedField] = useState(null);
  const { height: windowHeight } = useWindowDimensions();
  const editAnim = useRef(new Animated.Value(0)).current;

  const openEdit = useCallback(() => {
    hapticLight();
    setNom(user?.name || '');
    setVille(user?.ville || '');
    setAge(user?.age != null ? String(user.age) : '');
    setSexe(user?.sexe || 'N');
    setLang(user?.lang || 'fr');
    setEditOpen(true);
    editAnim.setValue(0);
    Animated.timing(editAnim, { toValue: 1, duration: motion.enter, useNativeDriver: true }).start();
  }, [user, editAnim]);

  // Ferme avec l'animation de sortie, puis démonte l'overlay.
  const closeEdit = useCallback(() => {
    Animated.timing(editAnim, { toValue: 0, duration: motion.base, useNativeDriver: true }).start(
      ({ finished }) => {
        if (finished) setEditOpen(false);
      },
    );
  }, [editAnim]);

  // Bouton retour Android = fermer l'overlay (équivalent onRequestClose du Modal).
  useEffect(() => {
    if (!editOpen) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeEdit();
      return true;
    });
    return () => sub.remove();
  }, [editOpen, closeEdit]);

  const saveEdit = useCallback(async () => {
    setSaving(true);
    // Champs non vides uniquement (pas d'undefined → pas d'écrasement au merge).
    const patch = { sexe, lang };
    if (nom.trim()) patch.name = nom.trim();
    if (ville.trim()) patch.ville = ville.trim();
    if (Number(age)) patch.age = Number(age);
    try {
      const updated = await users.update(patch);
      // Merge LOCAL sans refetch → pas de rechargement du profil à la fermeture.
      updateUser(updated || patch);
      closeEdit();
      toast.show({ type: 'success', message: t('profile.notify.updated') });
    } catch (e) {
      toast.show({ type: 'error', message: parseApiError(e).message });
    } finally {
      setSaving(false);
    }
  }, [nom, ville, age, sexe, lang, updateUser, toast, t, closeEdit]);

  // ── Photo de profil : sélection + upload ──────────────────────────────────
  const uploadAvatar = useCallback(
    async (uri) => {
      setUploadingAvatar(true);
      try {
        const form = new FormData();
        form.append('avatar', { uri, type: 'image/jpeg', name: 'avatar.jpg' });
        const data = await users.uploadAvatar(form);
        if (data?.avatar_url) updateUser({ avatar_url: data.avatar_url });
        setAvatarBust(Date.now()); // force le rechargement de l'<Image>
        toast.show({ type: 'success', message: t('profile.avatar.updated') });
      } catch (e) {
        toast.show({ type: 'error', message: parseApiError(e).message });
      } finally {
        setUploadingAvatar(false);
      }
    },
    [updateUser, toast, t],
  );

  const pickAvatar = useCallback(
    async (source) => {
      setAvatarSheet(false);
      try {
        // PAS de cropper natif : `allowsEditing` + `aspect` ouvre l'éditeur Android
        // « REDIMENSIONNER » qui ne valide pas le crop (bug). On recadre/redimensionne
        // nous-mêmes ensuite — le backend stocke l'image telle quelle (limite 2 Mo,
        // pas de redimensionnement serveur), d'où l'intérêt de produire un petit 200×200.
        const opts = { allowsEditing: false, quality: 1 };
        let res;
        if (source === 'camera') {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) {
            toast.show({ type: 'error', message: t('profile.avatar.permission') });
            return;
          }
          res = await ImagePicker.launchCameraAsync(opts);
        } else {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) {
            toast.show({ type: 'error', message: t('profile.avatar.permission') });
            return;
          }
          res = await ImagePicker.launchImageLibraryAsync(opts);
        }
        if (res.canceled) return;
        const asset = res.assets?.[0];
        if (!asset?.uri) return;

        // Recadrage carré centré (si dimensions connues) puis 200×200, JPEG q0.7
        // → petit fichier garanti < 2 Mo, pas de déformation.
        const actions = [];
        if (asset.width && asset.height) {
          const side = Math.min(asset.width, asset.height);
          actions.push({
            crop: {
              originX: Math.floor((asset.width - side) / 2),
              originY: Math.floor((asset.height - side) / 2),
              width: side,
              height: side,
            },
          });
        }
        actions.push({ resize: { width: 200, height: 200 } });
        const out = await ImageManipulator.manipulateAsync(asset.uri, actions, {
          compress: 0.7,
          format: ImageManipulator.SaveFormat.JPEG,
        });
        await uploadAvatar(out.uri);
      } catch (e) {
        toast.show({ type: 'error', message: parseApiError(e).message });
      }
    },
    [uploadAvatar, toast, t],
  );

  const changeLanguage = useCallback(
    async (next) => {
      if (next === i18n.language) return;
      hapticLight();
      await setLanguage(next);
      setLang(next);
      toast.show({ type: 'success', message: t('profile.notify.languageChanged') });
      try {
        const updated = await users.update({ lang: next });
        updateUser(updated || { lang: next }); // merge local, pas de refetch
      } catch (e) {
        toast.show({ type: 'error', message: parseApiError(e).message });
      }
    },
    [i18n.language, updateUser, toast, t],
  );

  const copyReferral = useCallback(async () => {
    const code = user?.referral_code;
    if (!code) {
      Share.share({ message: t('profile.inviteMessage', { code: 'CREV' }) });
      return;
    }
    await Clipboard.setStringAsync(code);
    toast.show({ type: 'success', message: t('profile.referral.copied') });
  }, [user, toast, t]);

  const loadWallet = useCallback(async () => {
    try {
      const res = await wallet.get();
      setWalletState({ balance: res.balance, currency: res.currency });
    } catch {
      setWalletState('disabled');
    }
  }, []);

  // Garde « une seule fois par montage ». Sur Android, l'ouverture du clavier
  // (resize/pan de la fenêtre) peut faire vaciller l'état de focus de l'écran et
  // ré-invoquer useFocusEffect en rafale → rechargement en boucle. Ce ref n'est
  // JAMAIS remis à zéro : le chargement n'a lieu qu'au premier focus. (Le
  // pull-to-refresh garde les stats à jour ; softwareKeyboardLayoutMode:"pan"
  // supprime par ailleurs le resize de fenêtre — cf. app.json.)
  const initializedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (initializedRef.current) return;
      initializedRef.current = true;
      loadWallet();
      loadHistory();
      loadLeaderboard({ currentUserId: useAuthStore.getState().user?.id });
    }, [loadWallet, loadHistory, loadLeaderboard]),
  );

  // Pull-to-refresh (action explicite) : on rafraîchit aussi le profil serveur.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      refreshProfile?.(),
      loadWallet(),
      loadHistory(),
      loadLeaderboard({ currentUserId: useAuthStore.getState().user?.id }),
    ]);
    // refreshProfile() a pu changer user.avatar_url → on bust le cache pour
    // forcer <Image> à recharger la photo fraîche.
    setAvatarBust(Date.now());
    setRefreshing(false);
  }, [refreshProfile, loadWallet, loadHistory, loadLeaderboard]);

  const totalXp = user?.total_xp ?? 0;
  const progress = levelProgress(totalXp);
  const level = progress.level;
  const badges = deriveBadges(level, t);

  // ── « Badge tout juste débloqué » ─────────────────────────────────────────
  // On compare le niveau courant au dernier niveau « vu » (persisté). Tout badge
  // dont le seuil `min` a été franchi depuis (min > vu ET min ≤ actuel) est
  // fraîchement débloqué → pop d'échelle (~500 ms) + halo doré (~2 s) + toast.
  // Au tout premier passage (aucun niveau stocké) on n'anime PAS : on ne peut
  // pas affirmer honnêtement que le franchissement vient d'avoir lieu ; on se
  // contente d'enregistrer le niveau de référence.
  const [justUnlockedKeys, setJustUnlockedKeys] = useState([]);
  const [badgeGlow, setBadgeGlow] = useState(false);
  const badgePop = useRef(new Animated.Value(1)).current;
  const badgesCheckedRef = useRef(false);
  const glowTimerRef = useRef(null);

  useEffect(() => {
    if (badgesCheckedRef.current) return;
    badgesCheckedRef.current = true;
    let cancelled = false;
    (async () => {
      const raw = await getBadgesSeenLevel();
      const seen = raw != null ? Number(raw) : null;
      // Baseline manquante → on enregistre sans animer.
      if (seen == null || Number.isNaN(seen)) {
        await setBadgesSeenLevel(level);
        return;
      }
      if (cancelled) return;
      if (level > seen) {
        const fresh = deriveBadges(level, t).filter((b) => b.min > seen && b.min <= level);
        if (fresh.length > 0) {
          setJustUnlockedKeys(fresh.map((b) => b.key));
          // Toast récap (le dernier badge franchi = le plus prestigieux).
          const top = fresh[fresh.length - 1];
          toast.show({ type: 'success', message: t('profile.badges.unlocked', { name: top.label }) });
          if (!reduceMotion) {
            badgePop.setValue(0);
            Animated.sequence([
              Animated.timing(badgePop, { toValue: 1, duration: 300, useNativeDriver: true }),
              Animated.timing(badgePop, { toValue: 2, duration: 200, useNativeDriver: true }),
            ]).start();
            setBadgeGlow(true);
            glowTimerRef.current = setTimeout(() => setBadgeGlow(false), 2000);
          }
        }
      }
      await setBadgesSeenLevel(level);
    })();
    return () => {
      cancelled = true;
    };
    // Effet « une fois par montage » (garde badgesCheckedRef) — deps volontairement figées.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => clearTimeout(glowTimerRef.current), []);

  // 0→1.2→1.0 : pic à mi-parcours puis retour à l'échelle normale.
  const badgePopScale = badgePop.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [0, 1.2, 1],
  });

  // Mises en valeur de la rangée de stats : rang #1 en or, taux <50 % rouge /
  // >70 % vert, + liseré haut coloré selon le rang (top 1 or, top 10 vert).
  const rank = myRank?.rank;
  const rate = stats.totalGames > 0 ? stats.successRate : null;
  const rankValueColor = rank === 1 ? colors.gold500 : undefined;
  // Même barème que les Stats (utils/rank) : les deux écrans divergeaient sur le
  // même chiffre. Voir successRateColor.
  const rateValueColor = rate == null ? undefined : successRateColor(rate, colors, isDark);
  const stripBorderColor =
    rank === 1 ? colors.gold400 : rank && rank <= 10 ? colors.green300 : 'transparent';

  const editTranslateY = editAnim.interpolate({ inputRange: [0, 1], outputRange: [windowHeight, 0] });

  return (
    <View style={styles.flexRoot}>
      <Screen
        dark={false}
        scroll
        padded={false}
        edges={['top']}
        topInsetColor={colors.green900}
        statusBarStyle="light-content"
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
      {/* A. Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.avatarWrap}
          onPress={() => {
            hapticLight();
            if (!isOnline) {
              toast.show({ type: 'info', message: t('offline.avatarDisabled') });
              return;
            }
            setAvatarSheet(true);
          }}
          disabled={uploadingAvatar}
          accessibilityRole="button"
          accessibilityLabel={t('profile.avatar.sheetTitle')}
        >
          <Avatar name={user?.name || ''} size={110} gold uri={photoUri} style={styles.avatarBorder} />
          {uploadingAvatar ? (
            <View style={styles.avatarOverlay}>
              <ActivityIndicator color={colors.gold400} />
            </View>
          ) : null}
          <View style={styles.cameraBadge}>
            <Icon icon={Camera} size={14} color={colors.textDark} />
          </View>
        </Pressable>

        <Title weight="extrabold" size="screenTitle" color={colors.textOnDark} style={styles.headerName} numberOfLines={1}>
          {user?.name || t('profile.misc.defaultName')}
        </Title>
        <Label weight="semibold" size="md" color={colors.gold400}>
          {`${t('profile.misc.level', { level })} — ${t(`common.levelNames.${level}`)}`}
        </Label>
        <View style={styles.headerXpWrap}>
          <XpBar current={progress.current} max={progress.needed} height={4} />
        </View>
      </View>

      {/* B. Rangée de stats (green700) — liseré haut coloré selon le rang.
          Devenue PRESSABLE (08-2026) : « Stats » ayant quitté la barre d'onglets,
          c'est ici que passe l'accès aux statistiques détaillées et au classement.
          Le bandeau affichait déjà ces quatre chiffres — le rendre cliquable est
          le geste attendu, plutôt qu'une ligne de menu supplémentaire. */}
      <Pressable
        onPress={() => navigation.navigate('Stats')}
        accessibilityRole="button"
        accessibilityLabel={t('profile.stats.openStats', 'Voir mes statistiques')}
        style={[styles.statsRow, { borderTopWidth: 3, borderTopColor: stripBorderColor }]}
      >
        <ProfStat value={String(stats.totalGames || 0)} label={t('profile.stats.games', 'Parties')} />
        <ProfStat
          divider
          value={rate != null ? `${rate}%` : '—'}
          valueColor={rateValueColor}
          label={t('profile.stats.successRate', 'Taux')}
        />
        <ProfStat
          divider
          value={stats.totalGames > 0 ? `${stats.maxStreak}` : '—'}
          label={t('profile.stats.streak', 'Streak')}
        />
        <ProfStat
          divider
          value={rank ? `#${rank}` : '—'}
          valueColor={rankValueColor}
          label={t('profile.stats.rank', 'Rang')}
        />
      </Pressable>

      <View style={styles.body}>
        {/* Accès aux statistiques. « Stats » ayant quitté la barre d'onglets
            (6 → 4), le bandeau de chiffres ci-dessus a été rendu pressable —
            mais SANS affordance : ni chevron ni libellé, alors que toutes les
            autres lignes de l'écran en ont un. Un pressable invisible n'existe
            pas. Cette ligne rend l'accès explicite, au motif du reste de l'écran. */}
        <Section title={t('profile.sections.progress')}>
          <SettingRow
            icon={BarChart2}
            iconBg={colors.pastelIndigo}
            label={t('profile.rows.myStats')}
            onPress={() => navigation.navigate('Stats')}
            isLast
          />
        </Section>

        {/* C. MON COMPTE */}
        {/* Pastilles d'icônes : tokens `pastel*` (theme.js) — pastels clairs FIXES,
            identiques en sombre (successBg/errorBg flippent foncé en dark, rendant
            l'icône green900 invisible ; les pastel* ne flippent jamais). */}
        <Section title={t('profile.sections.account')}>
          <SettingRow icon={User} iconBg={colors.pastelGreen} label={t('profile.fields.name')} value={user?.name} onPress={openEdit} />
          {/* L'adresse n'est plus une donnée morte : elle est vérifiable et
              corrigeable. Non vérifiée, elle porte une pastille — pas un rouge
              d'erreur (rien n'est cassé) mais un ambre d'action en attente,
              doublé du libellé comme l'exige la charte. */}
          <SettingRow
            icon={Mail}
            iconBg={colors.pastelBlue}
            label={t('profile.fields.email')}
            onPress={() => setEmailSheet(true)}
            right={
              <View style={styles.emailRight}>
                <Label
                  color={colors.textBody}
                  style={styles.emailValue}
                  numberOfLines={1}
                >
                  {user?.email || '—'}
                </Label>
                {user?.email && !user?.email_verified ? (
                  <View style={styles.emailBadge}>
                    <Label weight="bold" size="xs" color={colors.green900}>
                      {t('profile.email.unverified')}
                    </Label>
                  </View>
                ) : null}
              </View>
            }
          />
          <SettingRow icon={Smartphone} iconBg={colors.pastelYellow} label={t('profile.fields.phone')} value={user?.phone} valueMuted />
          <SettingRow icon={MapPin} iconBg={colors.pastelRed} label={t('profile.fields.city')} value={user?.ville} onPress={openEdit} isLast />
        </Section>

        {/* C. PRÉFÉRENCES */}
        <Section title={t('profile.sections.preferences')}>
          <SettingRow
            icon={Globe}
            iconBg={colors.pastelGreen}
            label={t('profile.fields.language')}
            right={
              <View style={styles.langPills}>
                {LANG_PILLS.map((l) => {
                  // startsWith (et non ===) : robuste si i18n.language est un code
                  // régional ('en-US', 'fr-FR') alors que l.key est 'en'/'fr'.
                  const active = (i18n.language || '').startsWith(l.key);
                  return (
                    <Pressable
                      key={l.key}
                      onPress={() => changeLanguage(l.key)}
                      style={[styles.langPill, active && styles.langPillActive]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active, checked: active }}
                    >
                      <Label weight="bold" size="xs" color={active ? colors.green900 : colors.textBody}>
                        {l.key.toUpperCase()}
                      </Label>
                    </Pressable>
                  );
                })}
              </View>
            }
          />
          <SettingRow
            icon={isDark ? Moon : Sun}
            iconBg={colors.pastelIndigo}
            label={t('profile.rows.appearance')}
            right={
              <View style={styles.themeToggle}>
                <Icon icon={Sun} size={13} color={colors.textMuted} />
                <Switch
                  value={isDark}
                  onValueChange={toggleTheme}
                  trackColor={{ false: colors.borderInput, true: colors.green700 }}
                  thumbColor={isDark ? colors.gold500 : colors.white}
                />
                <Icon icon={Moon} size={13} color={colors.textMuted} />
              </View>
            }
          />
          <SettingRow
            icon={Bell}
            iconBg={colors.pastelYellow}
            label={t('profile.rows.notifications')}
            right={
              <Switch
                value={notifEnabled}
                onValueChange={toggleNotif}
                trackColor={{ false: colors.borderInput, true: colors.green500 }}
                thumbColor={colors.white}
              />
            }
          />
          <SettingRow
            icon={Gift}
            iconBg={colors.pastelViolet}
            label={t('profile.referral.label')}
            isLast
            right={
              <View style={styles.referralRight}>
                <Title size="sm" style={styles.referralCode} numberOfLines={1}>
                  {user?.referral_code || 'CREV'}
                </Title>
                <Pressable
                  onPress={copyReferral}
                  style={styles.copyBtn}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={t('a11y.copyCode')}
                >
                  <Label weight="bold" size="xs" color={colors.gold500}>{t('profile.referral.copy')}</Label>
                </Pressable>
              </View>
            }
          />
        </Section>

        {/* D. Badges — dérivés du niveau. Un badge verrouillé montre sa progression
            (niveau courant / seuil requis) ; un tap en explique la condition. */}
        <Title size="sm" color={colors.textMuted} style={styles.sectionLabel}>{t('profile.badges.title')}</Title>
        <View style={styles.badgeGrid}>
          {badges.map((b) => {
            const isFresh = justUnlockedKeys.includes(b.key);
            const pct = b.min > 0 ? Math.min(1, level / b.min) * 100 : 100;
            return (
              <AnimatedPressable
                key={b.key}
                disabled={b.unlocked}
                onPress={() =>
                  Alert.alert(
                    b.label,
                    `${t('profile.badges.condition', { min: b.min })}\n\n${t(
                      'profile.badges.levelProgress',
                      { current: level, req: b.min },
                    )}`,
                  )
                }
                accessibilityRole="button"
                accessibilityLabel={b.label}
                style={[
                  styles.badge,
                  b.unlocked ? styles.badgeUnlocked : styles.badgeLocked,
                  isFresh && badgeGlow && shadow.gold,
                  isFresh && { transform: [{ scale: badgePopScale }] },
                ]}
              >
                <View style={styles.badgeTop}>
                  {b.unlocked ? (
                    <Text style={styles.badgeEmoji}>{b.emoji}</Text>
                  ) : (
                    <Icon icon={Lock} size={22} color={colors.textFaint} />
                  )}
                  <Label
                    weight="semibold"
                    color={b.unlocked ? colors.gold500 : colors.textFaint}
                    style={styles.badgeLabel}
                  >
                    {b.label}
                  </Label>
                </View>
                {!b.unlocked ? (
                  <View style={styles.badgeProgress}>
                    <FillBar pct={pct} color={colors.gold500} height={4} />
                    <Label size="xs">
                      {t('profile.badges.levelProgress', { current: level, req: b.min })}
                    </Label>
                  </View>
                ) : null}
              </AnimatedPressable>
            );
          })}
        </View>

        {/* E. Wallet (compact) */}
        {walletState === 'disabled' ? (
          <View style={styles.walletLocked}>
            <Icon icon={Lock} size={22} color={colors.textMuted} />
            <View style={styles.walletLockBody}>
              <Heading size="md" color={colors.textMuted}>{t('profile.wallet.title')}</Heading>
              <Body size="xs" muted style={styles.walletLockText}>{t('profile.wallet.unavailable')}</Body>
            </View>
          </View>
        ) : walletState === 'loading' ? null : (
          <View style={styles.walletCard}>
            <View>
              <View style={styles.walletLabelRow}>
                <Icon icon={Wallet} size={14} color={colors.textMuted} />
                <Label>{t('profile.wallet.label')}</Label>
              </View>
              <Title weight="extrabold" size="xl" style={styles.walletBalance}>{formatFcfa(walletState.balance)}</Title>
            </View>
            <AppButton
              variant="secondary"
              size="sm"
              fullWidth={false}
              title={t('profile.wallet.topUp')}
              onPress={() => toast.show({ type: 'info', message: t('profile.wallet.topUpSoon') })}
            />
          </View>
        )}

        {/* C. SÉCURITÉ */}
        <Section title={t('profile.sections.security')}>
          <SettingRow
            icon={Key}
            iconBg={colors.pastelBlue}
            label={t('profile.rows.changePassword')}
            value={!isOnline ? t('offline.banner') : undefined}
            valueMuted={!isOnline}
            onPress={() =>
              isOnline
                ? navigation.navigate('ChangePassword')
                : toast.show({ type: 'info', message: t('offline.banner') })
            }
            isLast
          />
        </Section>

        <AppButton
          variant="danger"
          title={t('profile.logout')}
          fullWidth
          style={styles.logout}
          onPress={async () => {
            const ok = await confirm({
              title: t('profile.logoutTitle'),
              message: t('profile.logoutMessage'),
              confirmLabel: t('profile.logout'),
              destructive: true,
            });
            if (ok) logout();
          }}
        />
      </View>

      {/* Action sheet — photo de profil */}
      <BottomSheet
        visible={avatarSheet}
        onClose={() => setAvatarSheet(false)}
        title={t('profile.avatar.sheetTitle')}
        style={styles.avatarSheet}
      >
        <Pressable style={styles.actionRow} onPress={() => pickAvatar('camera')} accessibilityRole="button">
          <Body weight="semibold" color={colors.textDark}>{t('profile.avatar.camera')}</Body>
        </Pressable>
        <Pressable style={styles.actionRow} onPress={() => pickAvatar('gallery')} accessibilityRole="button">
          <Body weight="semibold" color={colors.textDark}>{t('profile.avatar.gallery')}</Body>
        </Pressable>
        <Pressable
          style={[styles.actionRow, styles.actionCancel]}
          onPress={() => setAvatarSheet(false)}
          accessibilityRole="button"
        >
          <Body weight="medium" muted>{t('profile.avatar.cancel')}</Body>
        </Pressable>
      </BottomSheet>

      {/* Vérification / correction de l'adresse email. `refreshProfile` recharge
          `email` et `email_verified` depuis le serveur : on ne les devine pas. */}
      <EmailVerifySheet
        visible={emailSheet}
        onClose={() => setEmailSheet(false)}
        email={user?.email}
        onVerified={refreshProfile}
      />

      </Screen>

      {/* Overlay d'édition — même fenêtre que l'écran (pas un <Modal> RN).
          ScrollView (pas de KeyboardAvoidingView) → le contenu défile sous le
          clavier sans rejouer d'animation de fenêtre. Cf. note sur openEdit. */}
      {editOpen ? (
        <View style={styles.editOverlay} pointerEvents="box-none">
          <AnimatedPressable
            style={[StyleSheet.absoluteFill, styles.sheetBackdrop, { opacity: editAnim }]}
            onPress={closeEdit}
          />
          <Animated.View
            style={[
              styles.editSheet,
              { paddingBottom: spacing.lg + insets.bottom },
              { transform: [{ translateY: editTranslateY }] },
            ]}
          >
            {/* A. Header : drag handle + titre + ✕ */}
            <View style={styles.sheetHandle} />
            <View style={styles.sheetTitleRow}>
              <Title size="cardTitle">{t('profile.editModal.title')}</Title>
              <Pressable
                onPress={closeEdit}
                hitSlop={10}
                style={styles.sheetClose}
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
              >
                <Icon icon={X} size={20} color={colors.textMuted} />
              </Pressable>
            </View>

            {/* B. Champs : label statique + TextInput (focus → bordure or) */}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.sheetScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.fieldGroup}>
                <Label size="caption" style={styles.inputLabel}>{t('profile.editModal.name')}</Label>
                <TextInput
                  value={nom}
                  onChangeText={setNom}
                  onFocus={() => setFocusedField('name')}
                  onBlur={() => setFocusedField(null)}
                  placeholder={t('profile.misc.defaultName')}
                  placeholderTextColor={colors.textFaint}
                  style={[styles.input, focusedField === 'name' && styles.inputFocused]}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Label size="caption" style={styles.inputLabel}>{t('profile.editModal.city')}</Label>
                <TextInput
                  value={ville}
                  onChangeText={setVille}
                  onFocus={() => setFocusedField('city')}
                  onBlur={() => setFocusedField(null)}
                  placeholder={t('profile.placeholder.city')}
                  placeholderTextColor={colors.textFaint}
                  style={[styles.input, focusedField === 'city' && styles.inputFocused]}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Label size="caption" style={styles.inputLabel}>{t('profile.editModal.age')}</Label>
                <TextInput
                  value={age}
                  onChangeText={setAge}
                  onFocus={() => setFocusedField('age')}
                  onBlur={() => setFocusedField(null)}
                  keyboardType="number-pad"
                  placeholder={t('profile.placeholder.age')}
                  placeholderTextColor={colors.textFaint}
                  style={[styles.input, focusedField === 'age' && styles.inputFocused]}
                />
              </View>

              {/* C. Sexe : pills (style inchangé) */}
              <View style={styles.fieldGroup}>
                <Label size="caption" style={styles.inputLabel}>{t('profile.editModal.gender')}</Label>
                <View style={styles.pillRow}>
                  {SEXES.map((s) => {
                    const sel = s.key === sexe;
                    return (
                      <Pressable
                        key={s.key}
                        onPress={() => setSexe(s.key)}
                        style={[styles.pill, sel && styles.pillActive]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: sel, checked: sel }}
                      >
                        <Label weight={sel ? 'semibold' : 'medium'} color={sel ? colors.green900 : colors.textBody}>
                          {t(`profile.misc.gender.${s.key}`)}
                        </Label>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* D. Boutons */}
              <View style={styles.sheetActions}>
                <AppButton variant="primary" title={t('common.save')} fullWidth loading={saving} onPress={saveEdit} />
                <AppButton variant="ghost" title={t('common.cancel')} fullWidth onPress={closeEdit} />
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  // A. Header
  header: {
    backgroundColor: colors.green900,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  avatarWrap: { width: 110, height: 110, marginBottom: spacing.xs },
  avatarBorder: { borderWidth: 3, borderColor: colors.gold400, ...shadow.gold },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.pill, // cercle (voile sur avatar 110px)
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: radius.pill, // cercle (pastille 26px)
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerName: { marginTop: spacing.xs },
  headerXpWrap: { width: '100%', paddingHorizontal: spacing.xl, marginTop: spacing.md },

  // B. Stats row
  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.green700,
    paddingVertical: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: -spacing.md,
    borderRadius: radius.lg,
    ...shadow.card,
  },
  profStat: { flex: 1, alignItems: 'center', gap: 2 },
  profDivider: {
    position: 'absolute',
    left: 0,
    top: '15%',
    height: '70%',
    width: 1,
    backgroundColor: colors.borderOnDark,
  },
  body: { padding: spacing.lg },

  // Sections
  section: { marginBottom: spacing.lg },
  sectionLabel: {
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  sectionCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    ...shadow.soft,
  },

  // F. Rows
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowIcon: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, maxWidth: '55%' },
  rowValueMuted: { color: colors.textMuted },
  // Ligne Email : valeur + pastille d'état. `flexShrink` sur la valeur pour que
  // ce soit l'adresse qui tronque, jamais la pastille — c'est elle qui porte
  // l'action à faire.
  emailRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
  emailValue: { flexShrink: 1 },
  emailBadge: {
    backgroundColor: colors.pastelYellow,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },

  // Langue (pills inline)
  langPills: { flexDirection: 'row', gap: spacing.xs },
  langPill: {
    minHeight: MIN_TOUCH, // cible tactile ≥44/48
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Actif = or (état actif de la charte) : indispensable en mode sombre, où
  // green900 se confondait avec la surface (cream→#0a1b10) → pastille « invisible ».
  // Or sur green900/cream = lisible dans les deux thèmes (cf. pills Sexe, même écran).
  langPillActive: { backgroundColor: colors.gold500, borderColor: colors.gold500 },
  themeToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },

  // Code parrainage
  referralRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  referralCode: { flexShrink: 1 },
  copyBtn: {
    minHeight: MIN_TOUCH, // cible tactile ≥44/48
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.goldVeil,
    borderWidth: 1,
    borderColor: colors.goldVeilBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // D. Badges
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.lg },
  badge: {
    width: '47.5%',
    flexGrow: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'column',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
  },
  // Rangée icône + libellé (haut de la tuile).
  badgeTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badgeUnlocked: { backgroundColor: colors.goldVeil, borderColor: colors.goldVeilBorder },
  // Verrouillé : dé-emphasé par la couleur (libellé textFaint) plutôt qu'une
  // opacité globale, pour que la barre de progression reste lisible.
  badgeLocked: { backgroundColor: colors.surface, borderColor: colors.border },
  badgeEmoji: { fontSize: 22 },
  badgeLabel: { flexShrink: 1 },
  // Progression sous un badge verrouillé : FillBar + « Niveau X/Y ».
  badgeProgress: { gap: spacing.xxs },

  // E. Wallet
  walletLocked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceCream,
    opacity: 0.5,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  walletLockBody: { flex: 1 },
  walletLockText: { marginTop: 1 },
  walletCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...shadow.soft,
  },
  walletLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  walletBalance: { marginTop: 2 },

  logout: { marginTop: spacing.sm },

  // Bottom sheets
  flexRoot: { flex: 1 },
  // Overlay d'édition : couvre l'écran, ancre la feuille en bas.
  editOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  sheetBackdrop: { flex: 1, backgroundColor: colors.overlay },
  // Overrides du <BottomSheet> photo : feuille blanche (les rangées d'action
  // sont crème dessus), interligne sm comme avant.
  avatarSheet: { backgroundColor: colors.white, gap: spacing.sm },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  // Sheet d'édition (overlay) — ancré en bas, coins arrondis, ombre vers le haut.
  // Borné à 88% pour que le ScrollView défile sous le clavier.
  editSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    padding: 20,
    maxHeight: '88%',
    shadowColor: colors.green900,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 20,
  },
  sheetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sheetClose: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    backgroundColor: colors.border,
  },
  sheetScrollContent: { paddingBottom: 40 },

  // Action sheet (photo)
  actionRow: {
    minHeight: MIN_TOUCH, // cible tactile ≥44/48
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCancel: { backgroundColor: 'transparent' },

  // Edit sheet fields
  fieldGroup: { marginBottom: spacing.lg },
  inputLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    fontFamily: fonts.bodyRegular,
    fontSize: 15,
    color: colors.textDark,
    backgroundColor: colors.white,
  },
  inputFocused: { borderColor: colors.gold500 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pill: {
    minHeight: MIN_TOUCH, // cible tactile ≥44/48
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Pill sélectionné = or (état actif autorisé) + texte green900 pour le contraste
  // (blanc sur or échouerait le ratio ≥ 4.5:1 de la charte).
  pillActive: { backgroundColor: colors.gold500, borderColor: colors.gold500 },
  sheetActions: { marginTop: spacing.sm, gap: 10 },
});
