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
  Modal,
  Switch,
  Share,
  ActivityIndicator,
  ScrollView,
  TextInput,
  BackHandler,
  useWindowDimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Screen, Avatar, AppButton, useToast } from '../components';
import { useAuthStore } from '../store/authStore';
import { useStatsStore } from '../store/statsStore';
import { wallet, users } from '../services/endpoints';
import { parseApiError } from '../services/api';
import { setLanguage } from '../i18n';
import { SEXES } from '../constants/config';
import { fonts, fontSizes, radius, spacing, shadow, motion } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { formatFcfa, levelProgress, avatarUri } from '../utils/format';
import { hapticLight } from '../utils/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const NOTIF_PREF_KEY = 'crv.notif_enabled';

const LANG_PILLS = [
  { key: 'fr', flag: '🇫🇷', label: 'Français' },
  { key: 'en', flag: '🇬🇧', label: 'English' },
];

// Badges dérivés honnêtement du niveau atteint.
function deriveBadges(level, t) {
  return [
    { key: 'first', emoji: '🎯', label: t('profile.badges.first'), min: 1 },
    { key: 'regular', emoji: '🔥', label: t('profile.badges.regular'), min: 3 },
    { key: 'expert', emoji: '🧠', label: t('profile.badges.expert'), min: 5 },
    { key: 'champion', emoji: '👑', label: t('profile.badges.champion'), min: 10 },
  ].map((b) => ({
    ...b,
    unlocked: level >= b.min,
    req: t('profile.badges.lockedByLevel', { min: b.min }),
  }));
}

function XpBar({ pct, height = 4 }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const fill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fill, { toValue: pct, duration: motion.enter, useNativeDriver: false }).start();
  }, [fill, pct]);
  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={[styles.xpTrack, { height, borderRadius: height / 2 }]}>
      <Animated.View style={[styles.xpFill, { width, borderRadius: height / 2 }]} />
    </View>
  );
}

/** Stat compacte de la rangée du header. `valueColor` met en valeur (rang/taux). */
function ProfStat({ value, label, divider, valueColor }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.profStat}>
      {divider ? <View style={styles.profDivider} /> : null}
      <Text style={[styles.profStatValue, valueColor && { color: valueColor }]}>{value}</Text>
      <Text style={styles.profStatLabel}>{label}</Text>
    </View>
  );
}

function Section({ title, children }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

/** Ligne de réglage : pastille icône + libellé + (valeur | droite) + chevron. */
function SettingRow({ icon, iconBg, label, value, valueMuted, right, onPress, isLast }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const content = (
    <View style={[styles.row, !isLast && styles.rowDivider]}>
      <View style={[styles.rowIcon, { backgroundColor: iconBg || colors.cream }]}>
        <Text style={styles.rowIconText}>{icon}</Text>
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowRight}>
        {right != null ? (
          right
        ) : value != null ? (
          <Text style={[styles.rowValue, valueMuted && styles.rowValueMuted]} numberOfLines={1}>
            {value || '—'}
          </Text>
        ) : null}
        {onPress && right == null ? <Text style={styles.rowChevron}>›</Text> : null}
      </View>
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} android_ripple={{ color: colors.divider }}>
      {content}
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const toast = useToast();
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

  // Mises en valeur de la rangée de stats : rang #1 en or, taux <50 % rouge /
  // >70 % vert, + liseré haut coloré selon le rang (top 1 or, top 10 vert).
  const rank = myRank?.rank;
  const rate = stats.totalGames > 0 ? stats.successRate : null;
  const rankValueColor = rank === 1 ? colors.gold500 : undefined;
  const rateValueColor =
    rate == null ? undefined : rate < 50 ? colors.red400 : rate > 70 ? colors.green300 : undefined;
  const stripBorderColor =
    rank === 1 ? colors.gold400 : rank && rank <= 10 ? colors.green300 : 'transparent';

  const editTranslateY = editAnim.interpolate({ inputRange: [0, 1], outputRange: [windowHeight, 0] });

  return (
    <View style={styles.flexRoot}>
      <Screen dark={false} scroll padded={false} refreshing={refreshing} onRefresh={onRefresh}>
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
        >
          <Avatar name={user?.name || ''} size={110} gold uri={photoUri} style={styles.avatarBorder} />
          {uploadingAvatar ? (
            <View style={styles.avatarOverlay}>
              <ActivityIndicator color={colors.gold400} />
            </View>
          ) : null}
          <View style={styles.cameraBadge}>
            <Text style={styles.cameraBadgeIcon}>📷</Text>
          </View>
        </Pressable>

        <Text style={styles.headerName} numberOfLines={1}>
          {user?.name || t('profile.misc.defaultName')}
        </Text>
        <Text style={styles.headerLevel}>
          {`${t('profile.misc.level', { level })} — ${t(`profile.levelNames.${level}`)}`}
        </Text>
        <View style={styles.headerXpWrap}>
          <XpBar pct={progress.pct} />
        </View>
      </View>

      {/* B. Rangée de stats (green700) — liseré haut coloré selon le rang */}
      <View style={[styles.statsRow, { borderTopWidth: 3, borderTopColor: stripBorderColor }]}>
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
      </View>

      <View style={styles.body}>
        {/* C. MON COMPTE */}
        <Section title={t('profile.sections.account')}>
          <SettingRow icon="👤" iconBg="#e8f5ed" label={t('profile.fields.name')} value={user?.name} onPress={openEdit} />
          <SettingRow icon="📧" iconBg="#dbeafe" label={t('profile.fields.email')} value={user?.email} valueMuted />
          <SettingRow icon="📱" iconBg="#fef9c3" label={t('profile.fields.phone')} value={user?.phone} valueMuted />
          <SettingRow icon="📍" iconBg="#fee2e2" label={t('profile.fields.city')} value={user?.ville} onPress={openEdit} isLast />
        </Section>

        {/* C. PRÉFÉRENCES */}
        <Section title={t('profile.sections.preferences')}>
          <SettingRow
            icon="🌐"
            iconBg="#e8f5ed"
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
                    >
                      <Text style={[styles.langPillText, active && styles.langPillTextActive]}>
                        {l.key.toUpperCase()}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            }
          />
          <SettingRow
            icon={isDark ? '🌙' : '☀️'}
            iconBg="#e0e7ff"
            label={t('profile.rows.appearance')}
            right={
              <View style={styles.themeToggle}>
                <Text style={styles.themeToggleIcon}>☀️</Text>
                <Switch
                  value={isDark}
                  onValueChange={toggleTheme}
                  trackColor={{ false: colors.borderInput, true: colors.green700 }}
                  thumbColor={isDark ? colors.gold500 : '#ffffff'}
                />
                <Text style={styles.themeToggleIcon}>🌙</Text>
              </View>
            }
          />
          <SettingRow
            icon="🔔"
            iconBg="#fef9c3"
            label={t('profile.rows.notifications')}
            right={
              <Switch
                value={notifEnabled}
                onValueChange={toggleNotif}
                trackColor={{ false: colors.borderInput, true: colors.green500 }}
                thumbColor="#ffffff"
              />
            }
          />
          <SettingRow
            icon="🎁"
            iconBg="#f3e8ff"
            label={t('profile.referral.label')}
            isLast
            right={
              <View style={styles.referralRight}>
                <Text style={styles.referralCode} numberOfLines={1}>
                  {user?.referral_code || 'CREV'}
                </Text>
                <Pressable onPress={copyReferral} style={styles.copyBtn} hitSlop={6}>
                  <Text style={styles.copyBtnText}>{t('profile.referral.copy')}</Text>
                </Pressable>
              </View>
            }
          />
        </Section>

        {/* D. Badges */}
        <Text style={styles.sectionLabel}>{t('profile.badges.title')}</Text>
        <View style={styles.badgeGrid}>
          {badges.map((b) => (
            <Pressable
              key={b.key}
              disabled={b.unlocked}
              onPress={() => toast.show({ type: 'info', message: b.req })}
              style={[styles.badge, b.unlocked ? styles.badgeUnlocked : styles.badgeLocked]}
            >
              <Text style={[styles.badgeEmoji, !b.unlocked && styles.badgeEmojiLocked]}>
                {b.unlocked ? b.emoji : '🔒'}
              </Text>
              <Text
                style={[
                  styles.badgeLabel,
                  b.unlocked ? styles.badgeLabelUnlocked : styles.badgeLabelLocked,
                ]}
              >
                {b.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* E. Wallet (compact) */}
        {walletState === 'disabled' ? (
          <View style={styles.walletLocked}>
            <Text style={styles.walletLockIcon}>🔒</Text>
            <View style={styles.walletLockBody}>
              <Text style={styles.walletLockTitle}>{t('profile.wallet.title')}</Text>
              <Text style={styles.walletLockText}>{t('profile.wallet.unavailable')}</Text>
            </View>
          </View>
        ) : walletState === 'loading' ? null : (
          <View style={styles.walletCard}>
            <View>
              <Text style={styles.walletLabel}>💰 {t('profile.wallet.label')}</Text>
              <Text style={styles.walletBalance}>{formatFcfa(walletState.balance)}</Text>
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
            icon="🔑"
            iconBg="#dbeafe"
            label={t('profile.rows.changePassword')}
            value={!isOnline ? t('offline.banner') : undefined}
            valueMuted={!isOnline}
            onPress={() => toast.show({
              type: 'info',
              message: isOnline ? t('profile.changePasswordSoon') : t('offline.banner'),
            })}
            isLast
          />
        </Section>

        <AppButton
          variant="danger"
          title={t('profile.logout')}
          fullWidth
          style={styles.logout}
          onPress={logout}
        />
      </View>

      {/* Action sheet — photo de profil */}
      <Modal visible={avatarSheet} transparent animationType="slide" onRequestClose={() => setAvatarSheet(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setAvatarSheet(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{t('profile.avatar.sheetTitle')}</Text>
          <Pressable style={styles.actionRow} onPress={() => pickAvatar('camera')}>
            <Text style={styles.actionText}>{t('profile.avatar.camera')}</Text>
          </Pressable>
          <Pressable style={styles.actionRow} onPress={() => pickAvatar('gallery')}>
            <Text style={styles.actionText}>{t('profile.avatar.gallery')}</Text>
          </Pressable>
          <Pressable style={[styles.actionRow, styles.actionCancel]} onPress={() => setAvatarSheet(false)}>
            <Text style={styles.actionCancelText}>{t('profile.avatar.cancel')}</Text>
          </Pressable>
        </View>
      </Modal>

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
          <Animated.View style={[styles.editSheet, { transform: [{ translateY: editTranslateY }] }]}>
            {/* A. Header : drag handle + titre + ✕ */}
            <View style={styles.sheetHandle} />
            <View style={styles.sheetTitleRow}>
              <Text style={styles.sheetTitle}>{t('profile.editModal.title')}</Text>
              <Pressable
                onPress={closeEdit}
                hitSlop={10}
                style={styles.sheetClose}
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
              >
                <Text style={styles.sheetCloseText}>✕</Text>
              </Pressable>
            </View>

            {/* B. Champs : label statique + TextInput (focus → bordure or) */}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.sheetScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.fieldGroup}>
                <Text style={styles.inputLabel}>{t('profile.editModal.name')}</Text>
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
                <Text style={styles.inputLabel}>{t('profile.editModal.city')}</Text>
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
                <Text style={styles.inputLabel}>{t('profile.editModal.age')}</Text>
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
                <Text style={styles.inputLabel}>{t('profile.editModal.gender')}</Text>
                <View style={styles.pillRow}>
                  {SEXES.map((s) => {
                    const sel = s.key === sexe;
                    return (
                      <Pressable key={s.key} onPress={() => setSexe(s.key)} style={[styles.pill, sel && styles.pillActive]}>
                        <Text style={[styles.pillText, sel && styles.pillTextActive]}>
                          {t(`profile.misc.gender.${s.key}`)}
                        </Text>
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
    borderRadius: 55,
    backgroundColor: 'rgba(11,46,26,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cameraBadgeIcon: { fontSize: 14 },
  headerName: { fontFamily: fonts.titleExtraBold, fontSize: 24, color: colors.textOnDark, marginTop: spacing.xs },
  headerLevel: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.gold400 },
  headerXpWrap: { width: '100%', paddingHorizontal: spacing.xl, marginTop: spacing.md },
  xpTrack: { width: '100%', backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
  xpFill: { height: '100%', backgroundColor: colors.gold400 },

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
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  profStatValue: { fontFamily: fonts.titleBold, fontSize: fontSizes.lg, color: colors.textOnDark },
  profStatLabel: { fontFamily: fonts.bodyMedium, fontSize: 11, color: 'rgba(255,255,255,0.6)' },

  body: { padding: spacing.lg },

  // Sections
  section: { marginBottom: spacing.lg },
  sectionLabel: {
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
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
  rowIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rowIconText: { fontSize: 18 },
  rowLabel: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textDark },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, maxWidth: '55%' },
  rowValue: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, color: colors.textBody },
  rowValueMuted: { color: colors.textMuted },
  rowChevron: { fontFamily: fonts.titleBold, fontSize: fontSizes.lg, color: colors.textFaint },

  // Langue (pills inline)
  langPills: { flexDirection: 'row', gap: spacing.xs },
  langPill: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // Actif = or (état actif de la charte) : indispensable en mode sombre, où
  // green900 se confondait avec la surface (cream→#0d1f14) → pastille « invisible ».
  // Or sur green900/cream = lisible dans les deux thèmes (cf. pills Sexe, même écran).
  langPillActive: { backgroundColor: colors.gold500, borderColor: colors.gold500 },
  langPillText: { fontFamily: fonts.bodyBold, fontSize: fontSizes.xs, color: colors.textBody },
  langPillTextActive: { color: colors.green900 },
  themeToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  themeToggleIcon: { fontSize: 13 },

  // Code parrainage
  referralRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  referralCode: { fontFamily: fonts.titleBold, fontSize: fontSizes.sm, color: colors.textDark, flexShrink: 1 },
  copyBtn: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.goldVeil,
    borderWidth: 1,
    borderColor: colors.goldVeilBorder,
  },
  copyBtnText: { fontFamily: fonts.bodyBold, fontSize: fontSizes.xs, color: colors.gold500 },

  // D. Badges
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.lg },
  badge: {
    width: '47.5%',
    flexGrow: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
  },
  badgeUnlocked: { backgroundColor: colors.goldVeil, borderColor: colors.goldVeilBorder },
  badgeLocked: { backgroundColor: colors.surface, borderColor: colors.border, opacity: 0.4 },
  badgeEmoji: { fontSize: 22 },
  badgeEmojiLocked: { opacity: 0.8 },
  badgeLabel: { fontFamily: fonts.bodySemiBold, fontSize: fontSizes.sm, flexShrink: 1 },
  badgeLabelUnlocked: { color: colors.gold500 },
  badgeLabelLocked: { color: colors.textFaint },

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
  walletLockIcon: { fontSize: 22, opacity: 0.6 },
  walletLockBody: { flex: 1 },
  walletLockTitle: { fontFamily: fonts.titleSemiBold, fontSize: fontSizes.md, color: colors.textMuted },
  walletLockText: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 1 },
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
  walletLabel: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, color: colors.textMuted },
  walletBalance: { fontFamily: fonts.titleExtraBold, fontSize: fontSizes.xl, color: colors.textDark, marginTop: 2 },

  logout: { marginTop: spacing.sm },

  // Bottom sheets
  flexRoot: { flex: 1 },
  // Overlay d'édition : couvre l'écran, ancre la feuille en bas.
  editOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  sheetBackdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  sheetTitle: { fontFamily: fonts.titleBold, fontSize: 20, color: colors.textDark },
  // Sheet d'édition (overlay) — ancré en bas, coins arrondis, ombre vers le haut.
  // Borné à 88% pour que le ScrollView défile sous le clavier.
  editSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
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
  sheetCloseText: { fontFamily: fonts.bodySemiBold, fontSize: fontSizes.lg, color: colors.textMuted },
  sheetScrollContent: { paddingBottom: 40 },

  // Action sheet (photo)
  actionRow: {
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.cream,
    alignItems: 'center',
  },
  actionText: { fontFamily: fonts.bodySemiBold, fontSize: fontSizes.base, color: colors.textDark },
  actionCancel: { backgroundColor: 'transparent' },
  actionCancelText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.base, color: colors.textMuted },

  // Edit sheet fields
  fieldGroup: { marginBottom: spacing.lg },
  inputLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: colors.textMuted,
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
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  // Pill sélectionné = or (état actif autorisé) + texte green900 pour le contraste
  // (blanc sur or échouerait le ratio ≥ 4.5:1 de la charte).
  pillActive: { backgroundColor: colors.gold500, borderColor: colors.gold500 },
  pillText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, color: colors.textBody },
  pillTextActive: { color: colors.green900, fontFamily: fonts.bodySemiBold },
  sheetActions: { marginTop: spacing.sm, gap: 10 },
});
