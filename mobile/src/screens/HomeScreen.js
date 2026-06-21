// HomeScreen — dashboard : défi du jour, tournois actifs, top 5 classement.

import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  Screen,
  Title,
  Heading,
  Body,
  Label,
  Card,
  Button,
  Badge,
  SyncBadge,
} from '../components';
import { useAuthStore } from '../store/authStore';
import { useLeaderboardStore } from '../store/leaderboardStore';
import { tournaments as tournamentsApi } from '../services/endpoints';
import { runSync } from '../services/sync';
import { THEMES } from '../constants/config';
import { colors, fonts, fontSizes, spacing } from '../constants/theme';
import { formatDateTime } from '../utils/format';

// Défi du jour : thème dérivé du jour de l'année (déterministe, sans API dédiée).
function dailyTheme() {
  const day = Math.floor(Date.now() / 86400000);
  return THEMES[day % THEMES.length];
}

export default function HomeScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const loadLeaderboard = useLeaderboardStore((s) => s.load);
  const top = useLeaderboardStore((s) => s.data);
  const me = useLeaderboardStore((s) => s.me);

  const [activeTournaments, setActiveTournaments] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const daily = dailyTheme();

  const loadAll = useCallback(async () => {
    await Promise.all([
      loadLeaderboard({ scope: 'global', limit: 5 }),
      tournamentsApi
        .list({ status: 'open' })
        .then((r) => setActiveTournaments(r.data || []))
        .catch(() => setActiveTournaments([])),
      refreshProfile(),
    ]);
  }, [loadLeaderboard, refreshProfile]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadAll(), runSync()]);
    setRefreshing(false);
  };

  return (
    <Screen dark scroll refreshing={refreshing} onRefresh={onRefresh}>
      {/* En-tête */}
      <View style={styles.header}>
        <View>
          <Label color={colors.textOnDarkMuted}>Salut,</Label>
          <Title color={colors.cream}>{user?.name?.split(' ')[0] || 'Joueur'} 👋</Title>
        </View>
        <SyncBadge />
      </View>

      {/* Bandeau XP / niveau */}
      <Card dark style={styles.xpCard}>
        <View style={styles.xpRow}>
          <View>
            <Label color={colors.textOnDarkMuted}>Niveau</Label>
            <Heading color={colors.gold400}>{user?.level ?? 1}</Heading>
          </View>
          <View style={styles.xpRight}>
            <Label color={colors.textOnDarkMuted}>XP total</Label>
            <Heading color={colors.cream}>{user?.total_xp ?? 0}</Heading>
          </View>
        </View>
      </Card>

      {/* Défi du jour */}
      <Heading color={colors.cream} style={styles.sectionTitle}>
        🔥 Défi du jour
      </Heading>
      <Card style={styles.dailyCard}>
        <Badge label={daily.label} tone="gold" />
        <Heading style={styles.dailyTitle}>
          {daily.emoji} 10 questions de {daily.label}
        </Heading>
        <Body muted style={styles.dailyDesc}>
          Relève le défi quotidien et gagne un bonus d'XP.
        </Body>
        <Button
          title="Relever le défi"
          onPress={() =>
            navigation.navigate('Play', {
              presetTheme: daily.key,
            })
          }
        />
      </Card>

      {/* Tournois actifs */}
      <View style={styles.sectionHeader}>
        <Heading color={colors.cream}>🏆 Tournois actifs</Heading>
        <Body
          color={colors.gold400}
          onPress={() => navigation.navigate('Tournaments')}
        >
          Voir tout
        </Body>
      </View>
      {activeTournaments.length ? (
        activeTournaments.slice(0, 2).map((t) => (
          <Card key={t.id} style={styles.tCard}>
            <View style={styles.tRow}>
              <View style={styles.flex}>
                <Heading numberOfLines={1}>{t.name}</Heading>
                <Label style={styles.tMeta}>
                  {t.registered_players}/{t.max_players} joueurs ·{' '}
                  {formatDateTime(t.starts_at)}
                </Label>
              </View>
              <Badge
                label={t.entry_fee > 0 ? 'Payant' : 'Gratuit'}
                tone={t.entry_fee > 0 ? 'red' : 'green'}
              />
            </View>
          </Card>
        ))
      ) : (
        <Card>
          <Body muted>Aucun tournoi ouvert pour le moment.</Body>
        </Card>
      )}

      {/* Top 5 */}
      <Heading color={colors.cream} style={styles.sectionTitle}>
        📊 Top 5
      </Heading>
      <Card padded={false} style={styles.lbCard}>
        {top.slice(0, 5).map((row, i) => (
          <View
            key={row.user_id || i}
            style={[styles.lbRow, i < 4 && styles.lbDivider]}
          >
            <Body style={styles.lbRank}>{medal(row.rank ?? i + 1)}</Body>
            <Body style={styles.flex} numberOfLines={1}>
              {row.name}
            </Body>
            <Label>Niv. {row.level}</Label>
            <Body style={styles.lbScore}>{row.score}</Body>
          </View>
        ))}
        {!top.length ? (
          <View style={styles.lbRow}>
            <Body muted>Classement indisponible.</Body>
          </View>
        ) : null}
        {me ? (
          <View style={[styles.lbRow, styles.meRow]}>
            <Body style={styles.lbRank} color={colors.gold500}>
              #{me.rank}
            </Body>
            <Body style={styles.flex} color={colors.green700}>
              Toi
            </Body>
            <Body style={styles.lbScore} color={colors.green700}>
              {me.score}
            </Body>
          </View>
        ) : null}
      </Card>
    </Screen>
  );
}

function medal(rank) {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  xpCard: { marginBottom: spacing.lg },
  xpRow: { flexDirection: 'row', justifyContent: 'space-between' },
  xpRight: { alignItems: 'flex-end' },
  sectionTitle: { marginBottom: spacing.md, marginTop: spacing.sm },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  dailyCard: { marginBottom: spacing.lg, gap: spacing.sm },
  dailyTitle: { marginTop: spacing.xs },
  dailyDesc: { marginBottom: spacing.sm },
  tCard: { marginBottom: spacing.sm },
  tRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tMeta: { marginTop: 2 },
  lbCard: { overflow: 'hidden' },
  lbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  lbDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  lbRank: { width: 32, fontFamily: fonts.titleBold },
  lbScore: { fontFamily: fonts.bodyBold },
  meRow: { backgroundColor: 'rgba(212,160,23,0.12)' },
});
