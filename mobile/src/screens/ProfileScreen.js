// ProfileScreen — infos joueur, niveau & progression XP, wallet, déconnexion.

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import {
  Screen,
  Title,
  Heading,
  Body,
  Label,
  Card,
  Button,
  Badge,
} from '../components';
import { useAuthStore } from '../store/authStore';
import { wallet as walletApi } from '../services/endpoints';
import { colors, fonts, fontSizes, spacing } from '../constants/theme';
import { formatFcfa, levelProgress } from '../utils/format';

export default function ProfileScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  const [refreshing, setRefreshing] = useState(false);
  const [balance, setBalance] = useState(user?.wallet_balance ?? 0);
  const [walletDisabled, setWalletDisabled] = useState(false);

  const loadWallet = async () => {
    try {
      const w = await walletApi.get();
      setBalance(w.balance ?? 0);
      setWalletDisabled(false);
    } catch (e) {
      // 403 FEATURE_DISABLED au lancement (flag payant inactif).
      if (e?.response?.data?.error?.code === 'FEATURE_DISABLED') {
        setWalletDisabled(true);
      }
    }
  };

  useEffect(() => {
    refreshProfile();
    loadWallet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshProfile(), loadWallet()]);
    setRefreshing(false);
  };

  const level = user?.level ?? 1;
  const { pct, current, needed } = levelProgress(user?.total_xp ?? 0, level);
  const initials = (user?.name || 'J')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <Screen dark scroll refreshing={refreshing} onRefresh={onRefresh}>
      {/* Avatar + identité */}
      <View style={styles.head}>
        <View style={styles.avatar}>
          <Body style={styles.initials}>{initials}</Body>
        </View>
        <Title color={colors.cream} style={styles.name}>
          {user?.name || 'Joueur'}
        </Title>
        <Body color={colors.textOnDarkMuted}>{user?.email}</Body>
        <View style={styles.badges}>
          <Badge label={`Niveau ${level}`} tone="gold" />
          {user?.ville ? <Badge label={user.ville} tone="light" /> : null}
        </View>
      </View>

      {/* Progression XP */}
      <Card dark style={styles.xpCard}>
        <View style={styles.xpHead}>
          <Label color={colors.textOnDarkMuted}>Progression niveau {level + 1}</Label>
          <Label color={colors.gold400}>
            {current} / {needed} XP
          </Label>
        </View>
        <View style={styles.xpTrack}>
          <View style={[styles.xpFill, { width: `${Math.round(pct * 100)}%` }]} />
        </View>
        <Label color={colors.textOnDarkMuted} style={styles.xpTotal}>
          {user?.total_xp ?? 0} XP au total
        </Label>
      </Card>

      {/* Wallet */}
      <Heading color={colors.cream} style={styles.sectionTitle}>
        💰 Wallet
      </Heading>
      <Card style={styles.walletCard}>
        {walletDisabled ? (
          <View>
            <Body>Le wallet sera disponible avec les tournois payants.</Body>
            <Label style={styles.soon}>Bientôt 🔒</Label>
          </View>
        ) : (
          <View style={styles.row}>
            <View>
              <Label>Solde</Label>
              <Heading>{formatFcfa(balance)}</Heading>
            </View>
            <Button
              title="Recharger"
              variant="secondary"
              fullWidth={false}
              onPress={() => {}}
            />
          </View>
        )}
      </Card>

      {/* Infos compte */}
      <Heading color={colors.cream} style={styles.sectionTitle}>
        Compte
      </Heading>
      <Card padded={false}>
        <InfoRow label="Téléphone" value={user?.phone} divider />
        <InfoRow
          label="Code parrain"
          value={user?.referral_code || '—'}
          divider
        />
        <InfoRow
          label="Vérifié"
          value={user?.phone_verified ? 'Oui ✅' : 'Non'}
          divider
        />
        <InfoRow label="Langue" value={user?.lang === 'en' ? 'English' : 'Français'} />
      </Card>

      <Button
        title="Se déconnecter"
        variant="danger"
        onPress={logout}
        style={styles.logout}
      />
    </Screen>
  );
}

function InfoRow({ label, value, divider }) {
  return (
    <View style={[styles.infoRow, divider && styles.infoDivider]}>
      <Label>{label}</Label>
      <Body style={styles.infoValue}>{value}</Body>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.lg },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.gold400,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  initials: {
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.xxl,
    color: colors.green900,
  },
  name: { marginTop: spacing.xs },
  badges: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  xpCard: { marginVertical: spacing.md },
  xpHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  xpTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.borderOnDark,
    overflow: 'hidden',
  },
  xpFill: { height: '100%', backgroundColor: colors.gold400, borderRadius: 5 },
  xpTotal: { marginTop: spacing.sm },
  sectionTitle: { marginTop: spacing.md, marginBottom: spacing.sm },
  walletCard: {},
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  soon: { marginTop: spacing.xs, color: colors.gold500 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
  },
  infoDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  infoValue: { fontFamily: fonts.bodyMedium },
  logout: { marginTop: spacing.lg },
});
