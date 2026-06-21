// HomeScreen — tableau de bord : « Jouer », tournois ouverts, podium, stats.

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Logo,
  Heading,
  Body,
  Label,
  AppCard,
  AppButton,
  Avatar,
  ThemeBadge,
  LevelBadge,
  Skeleton,
} from '../components';
import { useAuthStore } from '../store/authStore';
import { useLeaderboardStore } from '../store/leaderboardStore';
import { tournaments as tournamentsApi } from '../services/endpoints';
import { runSync } from '../services/sync';
import {
  colors,
  fonts,
  fontSizes,
  radius,
  spacing,
  shadow,
  emeraldGradient,
} from '../constants/theme';
import { formatDateTime } from '../utils/format';

const STAT_DEFS = [
  { key: 'games', emoji: '🎯', label: 'Parties jouées' },
  { key: 'avg', emoji: '⭐', label: 'Score moyen' },
  { key: 'rate', emoji: '📈', label: 'Taux de réussite' },
  { key: 'streak', emoji: '🔥', label: 'Série actuelle' },
];

function medalFor(rank) {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉';
}

// Dérive les 4 valeurs de stats depuis user.stats (tolérant aux noms variés).
function deriveStats(stats) {
  if (!stats) {
    return { games: '—', avg: '—', rate: '—', streak: '—' };
  }
  const games =
    stats.games_played ?? stats.total_sessions ?? stats.sessions ?? null;
  const avg = stats.avg_score ?? stats.average_score ?? null;
  const rate =
    stats.success_rate ?? stats.accuracy ?? stats.correct_rate ?? null;
  const streak = stats.current_streak ?? stats.streak ?? null;
  const dash = (v) => (v === null || v === undefined ? '—' : v);
  return {
    games: dash(games),
    avg: avg === null || avg === undefined ? '—' : Math.round(avg),
    rate:
      rate === null || rate === undefined
        ? '—'
        : `${Math.round(rate <= 1 ? rate * 100 : rate)}%`,
    streak: dash(streak),
  };
}

function StatusPill({ tournament }) {
  const full =
    tournament.max_players &&
    tournament.registered_players >= tournament.max_players;
  const paid = tournament.entry_fee > 0;
  const label = full ? 'Complet' : paid ? 'Payant' : 'Gratuit';
  return (
    <View
      style={[
        styles.statusPill,
        { backgroundColor: paid ? colors.goldVeil : colors.borderOnDark },
      ]}
    >
      <Label color={paid ? colors.gold400 : colors.green300} style={styles.statusText}>
        {label}
      </Label>
    </View>
  );
}

export default function HomeScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const loadLeaderboard = useLeaderboardStore((s) => s.load);
  const top = useLeaderboardStore((s) => s.data);

  const [activeTournaments, setActiveTournaments] = useState([]);
  const [tournLoading, setTournLoading] = useState(true);
  const [lbLoading, setLbLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAll = useCallback(async () => {
    const lb = loadLeaderboard({ scope: 'global', limit: 5 }).finally(() =>
      setLbLoading(false)
    );
    const tourn = tournamentsApi
      .list({ status: 'open' })
      .then((r) => setActiveTournaments(r.data || []))
      .catch(() => setActiveTournaments([]))
      .finally(() => setTournLoading(false));
    await Promise.all([lb, tourn, refreshProfile?.()]);
  }, [loadLeaderboard, refreshProfile]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const onRefresh = async () => {
    setRefreshing(true);
    runSync?.();
    await loadAll();
    setRefreshing(false);
  };

  const firstName = user?.name?.split(' ')[0] || 'Joueur';
  const stats = deriveStats(user?.stats);
  const podium = (top || []).slice(0, 3);

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.gold400}
            colors={[colors.green500]}
          />
        }
      >
        {/* En-tête sombre */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.greetingRow}>
              <Logo size={40} />
              <Body style={styles.greeting}>Bonjour, {firstName} 👋</Body>
            </View>
            <View style={styles.levelWrap}>
              <LevelBadge level={user?.level ?? 1} xp={user?.total_xp ?? 0} />
            </View>
          </View>
          <View style={styles.headerRight}>
            <Pressable
              onPress={() => navigation.navigate('Profile')}
              hitSlop={6}
              accessibilityLabel="Ouvrir le profil"
            >
              <Avatar name={user?.name || firstName} size={48} gold />
            </Pressable>
            <Pressable
              style={styles.bell}
              hitSlop={6}
              accessibilityLabel="Notifications"
            >
              <Body style={styles.bellEmoji}>🔔</Body>
            </Pressable>
          </View>
        </View>

        {/* Corps cream */}
        <View style={styles.body}>
          {/* Jouer maintenant */}
          <LinearGradient
            colors={emeraldGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.playCard}
          >
            <View style={styles.playText}>
              <Heading color={colors.white} style={styles.playTitle}>
                Prêt pour un nouveau quiz ?
              </Heading>
              <Body color={colors.textOnDarkMuted} style={styles.playDesc}>
                Choisis ton thème et bats ton record.
              </Body>
              <AppButton
                title="Jouer"
                variant="primary"
                size="md"
                fullWidth={false}
                onPress={() => navigation.navigate('Play')}
                style={styles.playBtn}
              />
            </View>
            <Body style={styles.playEmoji}>⚡</Body>
          </LinearGradient>

          {/* Tournois */}
          <View style={styles.sectionHeader}>
            <Heading color={colors.green900}>Tournois</Heading>
            <Pressable
              onPress={() => navigation.navigate('Tournaments')}
              hitSlop={6}
            >
              <Body style={styles.seeAll}>Voir tout →</Body>
            </Pressable>
          </View>

          {tournLoading ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hScroll}
            >
              {[0, 1, 2].map((i) => (
                <Skeleton
                  key={i}
                  width={120}
                  height={160}
                  radius={radius.lg}
                  dark
                  style={styles.tSkeleton}
                />
              ))}
            </ScrollView>
          ) : activeTournaments.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hScroll}
            >
              {activeTournaments.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => navigation.navigate('Tournaments')}
                  style={styles.tCard}
                >
                  <ThemeBadge theme={t.theme} size="sm" showLabel={false} />
                  <Body
                    color={colors.white}
                    numberOfLines={2}
                    style={styles.tName}
                  >
                    {t.name}
                  </Body>
                  <View style={styles.tFooter}>
                    <Label color={colors.textOnDarkMuted}>
                      {t.registered_players ?? 0} joueurs
                    </Label>
                    <StatusPill tournament={t} />
                    <Label color={colors.textOnDarkFaint} style={styles.tDate}>
                      {formatDateTime(t.starts_at)}
                    </Label>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <AppCard tone="cream" padding="md" elevation="soft">
              <Body muted>Aucun tournoi ouvert.</Body>
            </AppCard>
          )}

          {/* Classement */}
          <View style={styles.sectionHeaderTight}>
            <Heading color={colors.green900}>Classement</Heading>
          </View>

          {lbLoading ? (
            <View style={styles.podium}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.podiumCol}>
                  <Skeleton width={48} height={48} radius={radius.pill} />
                  <Skeleton width={56} height={12} style={styles.podiumGap} />
                  <Skeleton width={32} height={14} style={styles.podiumGap} />
                </View>
              ))}
            </View>
          ) : podium.length ? (
            <View style={styles.podium}>
              {[1, 0, 2].map((slot) => {
                const row = podium[slot];
                if (!row) return <View key={slot} style={styles.podiumCol} />;
                const isFirst = slot === 0;
                const rank = row.rank ?? slot + 1;
                return (
                  <View
                    key={row.user_id || slot}
                    style={[styles.podiumCol, isFirst && styles.podiumColFirst]}
                  >
                    <Body style={styles.medal}>{medalFor(rank)}</Body>
                    <View style={isFirst ? styles.firstRing : null}>
                      <Avatar
                        name={row.name}
                        size={isFirst ? 52 : 44}
                        gold={isFirst}
                      />
                    </View>
                    <Body
                      color={colors.green900}
                      numberOfLines={1}
                      style={styles.podiumName}
                    >
                      {row.name}
                    </Body>
                    <Body
                      style={[
                        styles.podiumScore,
                        isFirst && styles.podiumScoreFirst,
                      ]}
                    >
                      {row.score}
                    </Body>
                  </View>
                );
              })}
            </View>
          ) : (
            <AppCard tone="cream" padding="md" elevation="soft">
              <Body muted>Classement indisponible.</Body>
            </AppCard>
          )}

          <AppButton
            title="Voir le classement complet"
            variant="ghost"
            size="md"
            onPress={() => navigation.navigate('Stats')}
            style={styles.lbButton}
          />

          {/* Mes stats rapides */}
          <View style={styles.sectionHeaderTight}>
            <Heading color={colors.green900}>Mes stats rapides</Heading>
          </View>

          <View style={styles.statsGrid}>
            {STAT_DEFS.map((def) => (
              <AppCard
                key={def.key}
                tone="cream"
                padding="md"
                elevation="soft"
                style={styles.statCard}
              >
                <Body style={styles.statEmoji}>{def.emoji}</Body>
                <Body style={styles.statValue}>{stats[def.key]}</Body>
                <Label muted style={styles.statLabel}>
                  {def.label}
                </Label>
              </AppCard>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.green900 },
  scroll: { backgroundColor: colors.cream },

  // En-tête
  header: {
    backgroundColor: colors.green900,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  headerLeft: { flex: 1, paddingRight: spacing.md },
  greetingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  greeting: {
    flexShrink: 1,
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.xl,
    color: colors.white,
  },
  levelWrap: { marginTop: spacing.sm },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  bell: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(94, 202, 132, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellEmoji: { fontSize: 18, color: colors.white },

  // Corps
  body: {
    backgroundColor: colors.cream,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    marginTop: -spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },

  // Jouer
  playCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadow.card,
  },
  playText: { flex: 1 },
  playTitle: { color: colors.white, fontSize: fontSizes.lg },
  playDesc: { marginTop: spacing.xs, fontSize: fontSizes.sm, lineHeight: 19 },
  playBtn: { marginTop: spacing.lg, alignSelf: 'flex-start' },
  playEmoji: { fontSize: 56, marginLeft: spacing.sm },

  // Sections
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionHeaderTight: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  seeAll: { fontFamily: fonts.bodySemiBold, color: colors.gold500 },

  // Tournois
  hScroll: { gap: spacing.md, paddingRight: spacing.lg, paddingBottom: spacing.xs },
  tSkeleton: { marginRight: 0 },
  tCard: {
    width: 120,
    height: 160,
    backgroundColor: colors.green900,
    borderRadius: radius.lg,
    padding: spacing.md,
    justifyContent: 'space-between',
    ...shadow.soft,
  },
  tName: {
    fontFamily: fonts.titleSemiBold,
    fontSize: fontSizes.md,
    lineHeight: 19,
    marginTop: spacing.sm,
  },
  tFooter: { gap: spacing.xs },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
  },
  statusText: { fontFamily: fonts.bodyBold, fontSize: fontSizes.xs },
  tDate: { fontSize: fontSizes.xs },

  // Podium
  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    paddingVertical: spacing.sm,
  },
  podiumCol: { flex: 1, alignItems: 'center' },
  podiumColFirst: { marginBottom: spacing.sm },
  medal: { fontSize: 22, marginBottom: spacing.xs },
  firstRing: {
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.gold500,
    padding: 3,
  },
  podiumName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.sm,
    marginTop: spacing.sm,
    maxWidth: 88,
    textAlign: 'center',
  },
  podiumScore: {
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.base,
    color: colors.green700,
    marginTop: 2,
  },
  podiumScoreFirst: { color: colors.gold500, fontSize: fontSizes.lg },
  podiumGap: { marginTop: spacing.sm },
  lbButton: { marginTop: spacing.lg },

  // Stats
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  statCard: { width: '47.5%' },
  statEmoji: { fontSize: 22 },
  statValue: {
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.xxl,
    color: colors.green900,
    marginTop: spacing.xs,
  },
  statLabel: { marginTop: 2 },
});
