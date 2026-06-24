// ProfileScreen — onglet « Profile ». Photo de profil (upload), header,
// rangée de stats, réglages sectionnés (compte / préférences / sécurité),
// badges, wallet (flag), déconnexion (API §10/§11).

import React, { useEffect, useState, useCallback, useRef } from 'react';
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
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Screen, Avatar, AppButton, AppInput, useToast } from '../components';
import { useAuthStore } from '../store/authStore';
import { useStatsStore } from '../store/statsStore';
import { wallet, users } from '../services/endpoints';
import { parseApiError } from '../services/api';
import { setLanguage } from '../i18n';
import { SEXES } from '../constants/config';
import { colors, fonts, fontSizes, radius, spacing, shadow, motion } from '../constants/theme';
import { formatFcfa, levelProgress, avatarUri } from '../utils/format';
import { hapticLight } from '../utils/haptics';

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

/** Stat compacte de la rangée du header. */
function ProfStat({ value, label, divider }) {
  return (
    <View style={styles.profStat}>
      {divider ? <View style={styles.profDivider} /> : null}
      <Text style={styles.profStatValue}>{value}</Text>
      <Text style={styles.profStatLabel}>{label}</Text>
    </View>
  );
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

/** Ligne de réglage : pastille icône + libellé + (valeur | droite) + chevron. */
function SettingRow({ icon, iconBg, label, value, valueMuted, right, onPress, isLast }) {
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
  const toast = useToast();
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
  console.log('[photoUri] baseAvatar:', baseAvatar, 'avatarBust:', avatarBust); // TEMP debug

  // Préférence locale de notifications (persistée AsyncStorage).
  const [notifEnabled, setNotifEnabled] = useState(true);
  useEffect(() => {
    AsyncStorage.getItem(NOTIF_PREF_KEY).then((v) => setNotifEnabled(v !== 'false'));
  }, []);
  const toggleNotif = useCallback((val) => {
    setNotifEnabled(val);
    AsyncStorage.setItem(NOTIF_PREF_KEY, val ? 'true' : 'false');
  }, []);

  // Édition du profil (bottom sheet)
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nom, setNom] = useState('');
  const [ville, setVille] = useState('');
  const [age, setAge] = useState('');
  const [sexe, setSexe] = useState('N');
  const [lang, setLang] = useState('fr');

  const openEdit = useCallback(() => {
    hapticLight();
    setNom(user?.name || '');
    setVille(user?.ville || '');
    setAge(user?.age != null ? String(user.age) : '');
    setSexe(user?.sexe || 'N');
    setLang(user?.lang || 'fr');
    setEditOpen(true);
  }, [user]);

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
      setEditOpen(false);
      toast.show({ type: 'success', message: t('profile.notify.updated') });
    } catch (e) {
      toast.show({ type: 'error', message: parseApiError(e).message });
    } finally {
      setSaving(false);
    }
  }, [nom, ville, age, sexe, lang, updateUser, toast, t]);

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
    console.log('[onRefresh] user.avatar_url after refresh:', useAuthStore.getState().user?.avatar_url); // TEMP debug
    // refreshProfile() a pu changer user.avatar_url → on bust le cache pour
    // forcer <Image> à recharger la photo fraîche.
    setAvatarBust(Date.now());
    console.log('[onRefresh] photoUri will be:', avatarUri(useAuthStore.getState().user) + '?cb=' + Date.now()); // TEMP debug
    setRefreshing(false);
  }, [refreshProfile, loadWallet, loadHistory, loadLeaderboard]);

  const totalXp = user?.total_xp ?? 0;
  const progress = levelProgress(totalXp);
  const level = progress.level;
  const badges = deriveBadges(level, t);

  return (
    <Screen dark={false} scroll padded={false} refreshing={refreshing} onRefresh={onRefresh}>
      {/* A. Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.avatarWrap}
          onPress={() => {
            hapticLight();
            setAvatarSheet(true);
          }}
          disabled={uploadingAvatar}
        >
          <Avatar name={user?.name || ''} size={88} gold uri={photoUri} style={styles.avatarBorder} />
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
          {t('profile.misc.levelXp', {
            level,
            xp: totalXp.toLocaleString('fr-FR'),
            defaultValue: 'Niveau {{level}} · {{xp}} XP',
          })}
        </Text>
        <View style={styles.headerXpWrap}>
          <XpBar pct={progress.pct} />
        </View>
      </View>

      {/* B. Rangée de stats (green700) */}
      <View style={styles.statsRow}>
        <ProfStat value={String(stats.totalGames || 0)} label={t('profile.stats.games', 'Parties')} />
        <ProfStat
          divider
          value={stats.totalGames > 0 ? `${stats.successRate}%` : '—'}
          label={t('profile.stats.successRate', 'Taux')}
        />
        <ProfStat
          divider
          value={stats.totalGames > 0 ? `${stats.maxStreak}` : '—'}
          label={t('profile.stats.streak', 'Streak')}
        />
        <ProfStat
          divider
          value={myRank?.rank ? `#${myRank.rank}` : '—'}
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
                  const active = i18n.language === l.key;
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
            icon="🔔"
            iconBg="#fef9c3"
            label={t('profile.rows.notifications')}
            right={
              <Switch
                value={notifEnabled}
                onValueChange={toggleNotif}
                trackColor={{ false: '#d1d5db', true: colors.green500 }}
                thumbColor={colors.white}
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
            onPress={() => toast.show({ type: 'info', message: t('profile.changePasswordSoon') })}
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

      {/* Bottom sheet — édition du profil */}
      <Modal visible={editOpen} transparent animationType="slide" onRequestClose={() => setEditOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setEditOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{t('profile.editModal.title')}</Text>

          <AppInput
            label={t('profile.editModal.name')}
            value={nom}
            onChangeText={setNom}
            placeholder={t('profile.misc.defaultName')}
          />
          <AppInput
            label={t('profile.editModal.city')}
            value={ville}
            onChangeText={setVille}
            placeholder={t('profile.placeholder.city')}
          />
          <AppInput
            label={t('profile.editModal.age')}
            value={age}
            onChangeText={setAge}
            keyboardType="number-pad"
            placeholder={t('profile.placeholder.age')}
          />

          <Text style={styles.fieldLabel}>{t('profile.editModal.gender')}</Text>
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

          <View style={styles.sheetActions}>
            <AppButton variant="primary" title={t('profile.editModal.save')} fullWidth loading={saving} onPress={saveEdit} />
            <AppButton variant="ghost" title={t('profile.editModal.cancel')} fullWidth onPress={() => setEditOpen(false)} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  avatarWrap: { width: 88, height: 88, marginBottom: spacing.xs },
  avatarBorder: { borderWidth: 3, borderColor: colors.gold500, ...shadow.gold },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 44,
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
  headerName: { fontFamily: fonts.titleBold, fontSize: fontSizes.xl, color: colors.white, marginTop: spacing.xs },
  headerLevel: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.md, color: colors.gold400 },
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
  profStatValue: { fontFamily: fonts.titleBold, fontSize: fontSizes.lg, color: colors.white },
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
  langPillActive: { backgroundColor: colors.green900, borderColor: colors.green900 },
  langPillText: { fontFamily: fonts.bodyBold, fontSize: fontSizes.xs, color: colors.textBody },
  langPillTextActive: { color: colors.white },

  // Code parrainage
  referralRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  referralCode: { fontFamily: fonts.titleBold, fontSize: fontSizes.sm, color: colors.green900, flexShrink: 1 },
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
    backgroundColor: '#f3f4f6',
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
  walletBalance: { fontFamily: fonts.titleExtraBold, fontSize: fontSizes.xl, color: colors.green900, marginTop: 2 },

  logout: { marginTop: spacing.sm },

  // Bottom sheets
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
  sheetTitle: { fontFamily: fonts.titleSemiBold, fontSize: fontSizes.lg, color: colors.green900, marginBottom: spacing.sm },

  // Action sheet (photo)
  actionRow: {
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.cream,
    alignItems: 'center',
  },
  actionText: { fontFamily: fonts.bodySemiBold, fontSize: fontSizes.base, color: colors.green900 },
  actionCancel: { backgroundColor: 'transparent' },
  actionCancelText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.base, color: colors.textMuted },

  // Edit sheet fields
  fieldLabel: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, color: colors.textBody, marginTop: spacing.xs },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pill: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillActive: { backgroundColor: colors.green500, borderColor: colors.green500 },
  pillText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, color: colors.textBody },
  pillTextActive: { color: colors.white },
  sheetActions: { marginTop: spacing.lg, gap: spacing.sm },
});
