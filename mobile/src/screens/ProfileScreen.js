// ProfileScreen — onglet « Profile ». Infos perso, progression, wallet (flag),
// badges, déconnexion (API §10/§11).

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, StyleSheet, Pressable, Text, Animated, Modal, Share } from 'react-native';
import { Screen, Avatar, AppCard, AppButton, AppInput, Body, useToast } from '../components';
import { useAuthStore } from '../store/authStore';
import { wallet, users } from '../services/endpoints';
import { parseApiError } from '../services/api';
import { LANGS, SEXES } from '../constants/config';
import {
  colors,
  fonts,
  fontSizes,
  radius,
  spacing,
  motion,
} from '../constants/theme';
import { formatFcfa, levelProgress } from '../utils/format';
import { hapticLight } from '../utils/haptics';

const LANG_LABEL = (key) =>
  LANGS.find((l) => l.key === key)?.label || (key === 'en' ? 'English' : 'Français');

// Badges dérivés honnêtement du niveau atteint.
function deriveBadges(level) {
  return [
    { key: 'first', emoji: '🎯', label: 'Première partie', min: 1 },
    { key: 'regular', emoji: '🔥', label: 'Habitué', min: 3 },
    { key: 'expert', emoji: '🧠', label: 'Cerveau', min: 5 },
    { key: 'champion', emoji: '👑', label: 'Champion', min: 10 },
  ].map((b) => ({
    ...b,
    unlocked: level >= b.min,
    req: `Atteins le niveau ${b.min} pour débloquer`,
  }));
}

function XpBar({ pct }) {
  const fill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fill, {
      toValue: pct,
      duration: motion.enter,
      useNativeDriver: false,
    }).start();
  }, [fill, pct]);
  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={styles.xpTrack}>
      <Animated.View style={[styles.xpFill, { width }]} />
    </View>
  );
}

function InfoRow({ emoji, label, value, first }) {
  return (
    <View style={[styles.infoRow, first && styles.infoRowFirst]}>
      <Text style={styles.infoEmoji}>{emoji}</Text>
      <View style={styles.infoMid}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Body style={styles.infoValue} numberOfLines={1}>
          {value || '—'}
        </Body>
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const toast = useToast();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const setUser = useAuthStore((s) => s.setUser);

  // walletState: 'loading' | 'disabled' | { balance, currency }
  const [walletState, setWalletState] = useState('loading');
  const [refreshing, setRefreshing] = useState(false);

  // Édition du profil (bottom sheet)
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ville, setVille] = useState('');
  const [age, setAge] = useState('');
  const [sexe, setSexe] = useState('N');
  const [lang, setLang] = useState('fr');

  const openEdit = useCallback(() => {
    setVille(user?.ville || '');
    setAge(user?.age != null ? String(user.age) : '');
    setSexe(user?.sexe || 'N');
    setLang(user?.lang || 'fr');
    setEditOpen(true);
  }, [user]);

  const saveEdit = useCallback(async () => {
    setSaving(true);
    try {
      const updated = await users.update({
        ville: ville.trim() || undefined,
        age: Number(age) || undefined,
        sexe,
        lang,
      });
      if (updated) setUser(updated);
      else await refreshProfile?.();
      setEditOpen(false);
      toast.show({ type: 'success', message: 'Profil mis à jour' });
    } catch (e) {
      toast.show({ type: 'error', message: parseApiError(e).message });
    } finally {
      setSaving(false);
    }
  }, [ville, age, sexe, lang, setUser, refreshProfile, toast]);

  const loadWallet = useCallback(async () => {
    try {
      const res = await wallet.get();
      setWalletState({ balance: res.balance, currency: res.currency });
    } catch {
      // FEATURE_DISABLED ou indisponible → même rendu désactivé.
      setWalletState('disabled');
    }
  }, []);

  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshProfile?.(), loadWallet()]);
    setRefreshing(false);
  }, [refreshProfile, loadWallet]);

  const totalXp = user?.total_xp ?? 0;
  const progress = levelProgress(totalXp);
  // Niveau effectif dérivé de l'XP (cohérent même si user.level est périmé).
  const level = progress.level;
  const remaining = progress.remaining;
  const badges = deriveBadges(level);

  return (
    <Screen dark={false} scroll padded={false} refreshing={refreshing} onRefresh={onRefresh}>
      {/* Header sombre */}
      <View style={styles.header}>
        <Pressable
          style={styles.editBtn}
          hitSlop={10}
          onPress={() => {
            hapticLight();
            openEdit();
          }}
        >
          <Text style={styles.editIcon}>✏️</Text>
        </Pressable>
        <Avatar name={user?.name || ''} size={80} gold />
        <Text style={styles.headerName} numberOfLines={1}>
          {user?.name || 'Joueur'}
        </Text>
        <Body color={colors.textOnDarkMuted}>Niveau {level} · Champion en devenir</Body>
      </View>

      <View style={styles.body}>
        {/* Infos */}
        <AppCard
          tone="light"
          padding="md"
          elevation="card"
          radius={radius.xl}
          style={styles.infoCard}
        >
          <InfoRow emoji="📧" label="Email" value={user?.email} first />
          <InfoRow emoji="📱" label="Téléphone" value={user?.phone} />
          <InfoRow emoji="📍" label="Ville" value={user?.ville} />
          <InfoRow emoji="🌐" label="Langue" value={LANG_LABEL(user?.lang)} />
        </AppCard>

        {/* Progression */}
        <AppCard tone="light" padding="md" elevation="soft" radius={radius.xl} style={styles.card}>
          <Text style={styles.cardTitle}>Mon niveau</Text>
          <View style={styles.progressHead}>
            <Text style={styles.progressLevel}>Niveau {level}</Text>
            <Text style={styles.progressXp}>
              {progress.current.toLocaleString('fr-FR')} /{' '}
              {progress.needed.toLocaleString('fr-FR')} XP
            </Text>
          </View>
          <XpBar pct={progress.pct} />
          <Body muted style={styles.progressHint}>
            {progress.isMax
              ? 'Niveau maximum atteint 🏆'
              : `Encore ${remaining.toLocaleString('fr-FR')} XP pour le niveau suivant.`}
          </Body>
        </AppCard>

        {/* Wallet */}
        {walletState === 'disabled' ? (
          <AppCard tone="cream" padding="md" elevation="soft" radius={radius.xl} style={styles.card}>
            <Text style={styles.cardTitle}>💰 Wallet FCFA</Text>
            <Body color={colors.textMuted} style={styles.walletHint}>
              Disponible avec les tournois payants.
            </Body>
          </AppCard>
        ) : walletState === 'loading' ? null : (
          <AppCard tone="light" padding="md" elevation="soft" radius={radius.xl} style={styles.card}>
            <Text style={styles.cardTitle}>💰 Wallet</Text>
            <Text style={styles.walletBalance}>{formatFcfa(walletState.balance)}</Text>
            <View style={styles.walletBtn}>
              <AppButton
                variant="secondary"
                size="sm"
                title="Recharger"
                onPress={() =>
                  toast.show({ type: 'info', message: 'Recharge bientôt disponible' })
                }
              />
            </View>
          </AppCard>
        )}

        {/* Badges */}
        <Text style={styles.sectionTitle}>Mes badges</Text>
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

        {/* Inviter un ami */}
        <AppButton
          variant="ghost"
          title="Inviter un ami 🎁"
          fullWidth
          style={styles.invite}
          onPress={() =>
            Share.share({
              message: `Rejoins-moi sur Creveton ! Code : ${user?.referral_code || 'CREV'}`,
            })
          }
        />

        {/* Déconnexion */}
        <AppButton
          variant="danger"
          title="Se déconnecter"
          fullWidth
          style={styles.logout}
          onPress={logout}
        />
      </View>

      {/* Bottom sheet — édition du profil */}
      <Modal
        visible={editOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setEditOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setEditOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Modifier mon profil</Text>

          <AppInput
            label="Ville"
            value={ville}
            onChangeText={setVille}
            placeholder="Ta ville"
          />
          <AppInput
            label="Âge"
            value={age}
            onChangeText={setAge}
            keyboardType="number-pad"
            placeholder="Ton âge"
          />

          <Text style={styles.fieldLabel}>Sexe</Text>
          <View style={styles.pillRow}>
            {SEXES.map((s) => {
              const sel = s.key === sexe;
              return (
                <Pressable
                  key={s.key}
                  onPress={() => setSexe(s.key)}
                  style={[styles.pill, sel && styles.pillActive]}
                >
                  <Text style={[styles.pillText, sel && styles.pillTextActive]}>
                    {s.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>Langue</Text>
          <View style={styles.pillRow}>
            {LANGS.map((l) => {
              const sel = l.key === lang;
              return (
                <Pressable
                  key={l.key}
                  onPress={() => setLang(l.key)}
                  style={[styles.pill, sel && styles.pillActive]}
                >
                  <Text style={[styles.pillText, sel && styles.pillTextActive]}>
                    {l.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.sheetActions}>
            <AppButton
              variant="primary"
              title="Enregistrer"
              fullWidth
              loading={saving}
              onPress={saveEdit}
            />
            <AppButton
              variant="ghost"
              title="Annuler"
              fullWidth
              style={styles.sheetCancel}
              onPress={() => setEditOpen(false)}
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.green900,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxxl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  editBtn: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.cardOnDark,
    borderWidth: 1,
    borderColor: colors.borderOnDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editIcon: { fontSize: 18 },
  headerName: {
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.xl,
    color: colors.cream,
    marginTop: spacing.xs,
  },

  body: { padding: spacing.lg },

  infoCard: { marginTop: -spacing.xl },
  card: { marginTop: spacing.lg },

  // Infos
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.md,
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  infoRowFirst: { borderTopWidth: 0, marginTop: 0, paddingTop: 0 },
  infoEmoji: { fontSize: 20 },
  infoMid: { flex: 1 },
  infoLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    marginBottom: 1,
  },
  infoValue: { fontFamily: fonts.bodySemiBold, color: colors.textDark },

  // Cards
  cardTitle: {
    fontFamily: fonts.titleSemiBold,
    fontSize: fontSizes.lg,
    color: colors.green900,
    marginBottom: spacing.md,
  },
  progressHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  progressLevel: {
    fontFamily: fonts.titleSemiBold,
    fontSize: fontSizes.md,
    color: colors.textDark,
  },
  progressXp: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  xpTrack: {
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  xpFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.gold400 },
  progressHint: { marginTop: spacing.sm },

  // Wallet
  walletHint: { marginTop: -spacing.xs },
  walletBalance: {
    fontFamily: fonts.titleExtraBold,
    fontSize: fontSizes.xxl,
    color: colors.green900,
  },
  walletBtn: { marginTop: spacing.md, alignSelf: 'flex-start' },

  // Badges
  sectionTitle: {
    fontFamily: fonts.titleSemiBold,
    fontSize: fontSizes.lg,
    color: colors.green900,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
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
  badgeLocked: { backgroundColor: colors.surface, borderColor: colors.border },
  badgeEmoji: { fontSize: 22 },
  badgeEmojiLocked: { opacity: 0.6 },
  badgeLabel: { fontFamily: fonts.bodySemiBold, fontSize: fontSizes.sm, flexShrink: 1 },
  badgeLabelUnlocked: { color: colors.gold500 },
  badgeLabelLocked: { color: colors.textFaint },

  invite: { marginTop: spacing.xl },
  logout: { marginTop: spacing.md },

  // Bottom sheet
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
  sheetTitle: {
    fontFamily: fonts.titleSemiBold,
    fontSize: fontSizes.lg,
    color: colors.green900,
    marginBottom: spacing.sm,
  },
  fieldLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    color: colors.textBody,
    marginTop: spacing.xs,
  },
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
  pillText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    color: colors.textBody,
  },
  pillTextActive: { color: colors.white },
  sheetActions: { marginTop: spacing.lg, gap: spacing.sm },
  sheetCancel: { marginTop: 0 },
});
