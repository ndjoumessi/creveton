// StatsScreen — onglet « Stats ». Stats personnelles (KPI, performance par
// thème, historique) + classement global avec podium et rang du joueur (API §7/§10).

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, StyleSheet, Pressable, Text, Animated } from 'react-native';
import { Screen, Avatar, AppCard, Body, Skeleton } from '../components';
import { useAuthStore } from '../store/authStore';
import { useLeaderboardStore } from '../store/leaderboardStore';
import { users } from '../services/endpoints';
import { THEMES } from '../constants/config';
import {
  colors,
  fonts,
  fontSizes,
  radius,
  spacing,
  shadow,
  themeAccent,
  motion,
} from '../constants/theme';
import { themeEmoji, levelLabel, timeAgo, levelProgress } from '../utils/format';

const TABS = [
  { key: 'stats', label: 'Mes stats' },
  { key: 'rank', label: 'Classement' },
];

const PODIUM_MEDALS = ['🥇', '🥈', '🥉'];

// Dérive les 4 KPI depuis user.stats (tolérant aux noms variés).
function deriveStats(stats) {
  if (!stats) return { games: '—', avg: '—', rate: '—', streak: '—' };
  const games = stats.games_played ?? stats.total_sessions ?? stats.sessions ?? null;
  const avg = stats.avg_score ?? stats.average_score ?? null;
  const rate = stats.success_rate ?? stats.accuracy ?? stats.correct_rate ?? null;
  const streak = stats.max_streak ?? stats.best_streak ?? stats.streak_max ?? stats.current_streak ?? null;
  const dash = (v) => (v === null || v === undefined ? '—' : v);
  return {
    games: dash(games),
    avg: avg === null || avg === undefined ? '—' : Math.round(avg),
    rate: rate === null || rate === undefined ? '—' : `${Math.round(rate <= 1 ? rate * 100 : rate)}%`,
    streak: dash(streak),
  };
}

// Taux de réussite par thème, normalisé en %, sinon null.
function themeRate(byTheme, key) {
  if (!byTheme) return null;
  const entry = byTheme[key];
  if (entry === null || entry === undefined) return null;
  const v = typeof entry === 'object' ? entry.success_rate ?? entry.rate ?? entry.accuracy : entry;
  if (v === null || v === undefined) return null;
  return Math.round(v <= 1 ? v * 100 : v);
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

function ThemeRateBar({ accent, pct }) {
  const fill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fill, {
      toValue: pct / 100,
      duration: motion.enter,
      useNativeDriver: false,
    }).start();
  }, [fill, pct]);
  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={styles.rateTrack}>
      <Animated.View style={[styles.rateFill, { width, backgroundColor: accent }]} />
    </View>
  );
}

export default function StatsScreen() {
  const user = useAuthStore((s) => s.user);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  const lbData = useLeaderboardStore((s) => s.data);
  const lbMe = useLeaderboardStore((s) => s.me);
  const lbLoading = useLeaderboardStore((s) => s.loading);
  const loadLeaderboard = useLeaderboardStore((s) => s.load);

  const [tab, setTab] = useState('stats');
  const [history, setHistory] = useState(null); // null = chargement
  const [refreshing, setRefreshing] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      const res = await users.history({ limit: 5 });
      setHistory(res.data || []);
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (tab === 'rank' && lbData.length === 0) {
      loadLeaderboard({ scope: 'global' });
    }
  }, [tab, lbData.length, loadLeaderboard]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (tab === 'stats') {
      await Promise.all([refreshProfile?.(), loadHistory()]);
    } else {
      await loadLeaderboard({ scope: 'global' });
    }
    setRefreshing(false);
  }, [tab, refreshProfile, loadHistory, loadLeaderboard]);

  const totalXp = user?.total_xp ?? 0;
  const progress = levelProgress(totalXp);
  // Niveau effectif dérivé de l'XP (cohérent même si user.level est périmé).
  const level = progress.level;
  const kpi = deriveStats(user?.stats);
  const byTheme = user?.stats?.by_theme ?? user?.stats?.themes ?? null;

  return (
    <Screen dark={false} scroll padded={false} refreshing={refreshing} onRefresh={onRefresh}>
      {/* Header sombre */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Avatar name={user?.name || ''} size={64} gold />
          <View style={styles.headerInfo}>
            <Text style={styles.headerName} numberOfLines={1}>
              {user?.name || 'Joueur'}
            </Text>
            <Body color={colors.textOnDarkMuted}>Niveau {level} — Joueur</Body>
          </View>
        </View>
        <View style={styles.xpRow}>
          <XpBar pct={progress.pct} />
          <Text style={styles.xpLabel}>
            {progress.current.toLocaleString('fr-FR')} / {progress.needed.toLocaleString('fr-FR')} XP
          </Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)} style={styles.tab}>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              <View style={[styles.tabUnderline, active && styles.tabUnderlineActive]} />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.body}>
        {tab === 'stats' ? (
          <StatsTab kpi={kpi} byTheme={byTheme} history={history} />
        ) : (
          <RankTab data={lbData} me={lbMe} loading={lbLoading} currentUserId={user?.id} />
        )}
      </View>
    </Screen>
  );
}

function StatsTab({ kpi, byTheme, history }) {
  const kpis = [
    { label: 'Parties jouées', value: kpi.games },
    { label: 'Score moyen', value: kpi.avg },
    { label: 'Taux réussite', value: kpi.rate },
    { label: 'Streak max', value: kpi.streak },
  ];

  return (
    <>
      {/* KPI 2×2 */}
      <View style={styles.kpiGrid}>
        {kpis.map((k) => (
          <AppCard key={k.label} tone="light" padding="md" elevation="soft" style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{k.value}</Text>
            <Text style={styles.kpiLabel}>{k.label}</Text>
          </AppCard>
        ))}
      </View>

      {/* Performance par thème */}
      <Text style={styles.sectionTitle}>Performance par thème</Text>
      {byTheme ? (
        <AppCard tone="light" padding="md" elevation="soft" style={styles.themeCard}>
          {THEMES.map((t, i) => {
            const rate = themeRate(byTheme, t.key);
            const accent = themeAccent[t.key] || colors.green500;
            return (
              <View key={t.key} style={[styles.themeRow, i === 0 && styles.themeRowFirst]}>
                <View style={styles.themeRowHead}>
                  <Text style={styles.themeRowLabel}>
                    {t.emoji} {t.label}
                  </Text>
                  <Text style={styles.themeRowPct}>{rate === null ? '—' : `${rate}%`}</Text>
                </View>
                <ThemeRateBar accent={accent} pct={rate ?? 0} />
              </View>
            );
          })}
        </AppCard>
      ) : (
        <View style={styles.hint}>
          <Body muted style={styles.hintText}>
            Joue quelques parties pour révéler tes forces par thème.
          </Body>
        </View>
      )}

      {/* Historique */}
      <Text style={styles.sectionTitle}>Historique des 5 dernières parties</Text>
      {history === null ? (
        <AppCard tone="light" padding="md" elevation="soft">
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.histRow, i === 0 && styles.histRowFirst]}>
              <Skeleton width={26} height={26} radius={13} />
              <View style={styles.histSkelMid}>
                <Skeleton width="60%" height={13} />
                <Skeleton width="35%" height={11} />
              </View>
              <Skeleton width={48} height={13} />
            </View>
          ))}
        </AppCard>
      ) : history.length === 0 ? (
        <View style={styles.hint}>
          <Body muted style={styles.hintText}>
            Aucune partie pour l’instant. Lance-toi !
          </Body>
        </View>
      ) : (
        <AppCard tone="light" padding="md" elevation="soft">
          {history.map((h, i) => (
            <View key={h.session_id || i} style={[styles.histRow, i === 0 && styles.histRowFirst]}>
              <Text style={styles.histEmoji}>{themeEmoji(h.theme)}</Text>
              <View style={styles.histMid}>
                <Text style={styles.histTitle} numberOfLines={1}>
                  {levelLabel(h.level)} · {h.score} pts
                </Text>
                <Text style={styles.histSub}>{timeAgo(h.played_at)}</Text>
              </View>
              <Text style={styles.histXp}>+{h.xp_earned} XP</Text>
            </View>
          ))}
        </AppCard>
      )}
    </>
  );
}

function RankTab({ data, me, loading, currentUserId }) {
  if (loading && data.length === 0) {
    return (
      <AppCard tone="light" padding="md" elevation="soft">
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={[styles.rankRow, i === 0 && styles.rankRowFirst]}>
            <Skeleton width={24} height={16} />
            <Skeleton width={32} height={32} radius={16} style={styles.rankAvatarSkel} />
            <View style={styles.rankMid}>
              <Skeleton width="55%" height={13} />
            </View>
            <Skeleton width={44} height={13} />
          </View>
        ))}
      </AppCard>
    );
  }

  if (data.length === 0) {
    return (
      <View style={styles.hint}>
        <Body muted style={styles.hintText}>
          Le classement n’est pas encore disponible.
        </Body>
      </View>
    );
  }

  const podium = data.slice(0, 3);
  const rest = data.slice(3);

  return (
    <>
      {/* Podium top 3 */}
      <View style={styles.podium}>
        {podium.map((p, i) => (
          <AppCard key={p.user_id || i} tone="light" padding="sm" elevation="soft" style={styles.podiumCard}>
            <Text style={styles.podiumMedal}>{PODIUM_MEDALS[i]}</Text>
            <Avatar name={p.name || ''} size={40} gold={i === 0} />
            <Text style={styles.podiumName} numberOfLines={1}>
              {p.name}
            </Text>
            <Text style={styles.podiumScore}>{Number(p.score).toLocaleString('fr-FR')}</Text>
          </AppCard>
        ))}
      </View>

      {/* Reste du classement */}
      {rest.length > 0 ? (
        <AppCard tone="light" padding="md" elevation="soft">
          {rest.map((r, i) => {
            const isMe = (me && r.rank === me.rank) || (currentUserId && r.user_id === currentUserId);
            return (
              <View
                key={r.user_id || r.rank}
                style={[styles.rankRow, i === 0 && styles.rankRowFirst, isMe && styles.rankRowMe]}
              >
                <Text style={styles.rankNum}>{r.rank}</Text>
                <Avatar name={r.name || ''} size={32} style={styles.rankAvatar} />
                <View style={styles.rankMid}>
                  <Text style={styles.rankName} numberOfLines={1}>
                    {r.name}
                  </Text>
                  {r.ville ? <Text style={styles.rankVille}>{r.ville}</Text> : null}
                </View>
                <Text style={styles.rankScore}>{Number(r.score).toLocaleString('fr-FR')}</Text>
              </View>
            );
          })}
        </AppCard>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  // Header
  header: {
    backgroundColor: colors.green900,
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerInfo: { flex: 1 },
  headerName: {
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.xl,
    color: colors.cream,
    marginBottom: 2,
  },
  xpRow: { marginTop: spacing.lg, gap: spacing.xs },
  xpTrack: {
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.borderOnDark,
    overflow: 'hidden',
  },
  xpFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.gold400 },
  xpLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.xs,
    color: colors.textOnDarkMuted,
    textAlign: 'right',
  },

  // Tabs
  tabs: { flexDirection: 'row', backgroundColor: colors.green900 },
  tab: { flex: 1, alignItems: 'center' },
  tabText: {
    fontFamily: fonts.titleSemiBold,
    fontSize: fontSizes.md,
    color: colors.textOnDarkMuted,
    paddingBottom: spacing.sm,
  },
  tabTextActive: { color: colors.cream },
  tabUnderline: { height: 3, width: '60%', backgroundColor: 'transparent', borderRadius: 2 },
  tabUnderlineActive: { backgroundColor: colors.gold400 },

  body: { padding: spacing.lg },

  // KPI grid
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  kpiCard: { width: '47.5%', flexGrow: 1, alignItems: 'flex-start' },
  kpiValue: {
    fontFamily: fonts.titleExtraBold,
    fontSize: fontSizes.xxl,
    color: colors.green900,
  },
  kpiLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    marginTop: 2,
  },

  sectionTitle: {
    fontFamily: fonts.titleSemiBold,
    fontSize: fontSizes.lg,
    color: colors.green900,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },

  // Performance par thème
  themeCard: { gap: 0 },
  themeRow: {
    paddingTop: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    marginTop: spacing.md,
  },
  themeRowFirst: { borderTopWidth: 0, marginTop: 0, paddingTop: 0 },
  themeRowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  themeRowLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.md,
    color: colors.textBody,
  },
  themeRowPct: {
    fontFamily: fonts.titleSemiBold,
    fontSize: fontSizes.md,
    color: colors.green900,
  },
  rateTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  rateFill: { height: '100%', borderRadius: radius.pill },

  // Historique
  histRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.md,
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  histRowFirst: { borderTopWidth: 0, marginTop: 0, paddingTop: 0 },
  histEmoji: { fontSize: 22 },
  histSkelMid: { flex: 1, gap: 6 },
  histMid: { flex: 1 },
  histTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.textDark,
  },
  histSub: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    marginTop: 1,
  },
  histXp: {
    fontFamily: fonts.titleSemiBold,
    fontSize: fontSizes.sm,
    color: colors.successText,
  },

  // Podium
  podium: { flexDirection: 'row', gap: spacing.md },
  podiumCard: { flex: 1, alignItems: 'center', gap: spacing.xs },
  podiumMedal: { fontSize: 24 },
  podiumName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.xs,
    color: colors.textDark,
    textAlign: 'center',
  },
  podiumScore: {
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.base,
    color: colors.green900,
  },

  // Liste de rangs
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.xs,
    borderRadius: radius.md,
  },
  rankRowFirst: { marginTop: 0 },
  rankRowMe: {
    backgroundColor: colors.goldVeil,
    borderWidth: 1,
    borderColor: colors.goldVeilBorder,
  },
  rankNum: {
    width: 24,
    fontFamily: fonts.titleSemiBold,
    fontSize: fontSizes.md,
    color: colors.textMuted,
    textAlign: 'center',
  },
  rankAvatar: {},
  rankAvatarSkel: {},
  rankMid: { flex: 1 },
  rankName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.textDark,
  },
  rankVille: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  rankScore: {
    fontFamily: fonts.titleSemiBold,
    fontSize: fontSizes.md,
    color: colors.green900,
  },

  // Hints / empty
  hint: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceCream,
    padding: spacing.lg,
    alignItems: 'center',
    ...shadow.soft,
  },
  hintText: { textAlign: 'center' },
});
