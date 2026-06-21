// StatsScreen — onglet « Stats ». Données réelles dérivées de l'historique des
// parties (GET /users/me/history) : KPI, courbe d'évolution du score, performance
// par thème, historique. Onglet « Classement » : ma position, podium, liste (API §7/§10).

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  Animated,
  Dimensions,
} from 'react-native';
import Svg, { Path, Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { Screen, Avatar, AppButton, Body, Skeleton } from '../components';
import { useAuthStore } from '../store/authStore';
import { useStatsStore } from '../store/statsStore';
import { profileStreak } from '../services/stats.service';
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
import { themeEmoji, themeLabel, levelLabel, timeAgo, levelProgress } from '../utils/format';
import { hapticLight } from '../utils/haptics';

const TABS = [
  { key: 'stats', emoji: '📊', labelKey: 'stats.tabs.myStats' },
  { key: 'rank', emoji: '🏆', labelKey: 'stats.tabs.leaderboard' },
];

const PODIUM_MEDALS = ['🥇', '🥈', '🥉'];
const fmt = (n) => Number(n || 0).toLocaleString('fr-FR');

// Géométrie de la courbe d'évolution (pleine largeur - paddings écran + carte).
const WIN_W = Dimensions.get('window').width;
const CHART_W = WIN_W - spacing.lg * 2 - spacing.md * 2;
const CHART_H = 140;

function rateColor(pct) {
  if (pct === null || pct === undefined) return colors.green900;
  if (pct > 70) return colors.green500;
  if (pct >= 50) return colors.gold500;
  return colors.red400;
}

// ── Courbe d'évolution du score (SVG, ligne + aire + points) ───────────────
function ScoreChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <View style={styles.chartEmpty}>
        <Text style={styles.chartEmptyEmoji}>📈</Text>
        <Body muted style={styles.chartEmptyText}>
          Aucune partie pour tracer ta courbe.
        </Body>
      </View>
    );
  }

  const padL = 10;
  const padR = 10;
  const padT = 14;
  const padB = 20;
  const innerW = CHART_W - padL - padR;
  const innerH = CHART_H - padT - padB;
  const baseY = padT + innerH;

  const values = data.map((d) => d.score);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const n = data.length;

  const points = data.map((d, i) => {
    const x = padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = padT + innerH - ((d.score - min) / span) * innerH;
    return { x, y };
  });
  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ');
  const area =
    `M ${points[0].x},${baseY} ` +
    points.map((p) => `L ${p.x},${p.y}`).join(' ') +
    ` L ${points[n - 1].x},${baseY} Z`;

  // 4 graduations Y.
  const grads = [0, 1, 2, 3].map((i) => {
    const y = padT + (innerH * i) / 3;
    const val = Math.round(max - (span * i) / 3);
    return { y, val };
  });

  return (
    <View style={styles.chartWrap}>
      <Svg width={CHART_W} height={CHART_H}>
        {grads.map((g, i) => (
          <Line
            key={`g${i}`}
            x1={padL}
            y1={g.y}
            x2={CHART_W - padR}
            y2={g.y}
            stroke={colors.divider}
            strokeWidth={1}
          />
        ))}
        {grads.map((g, i) => (
          <SvgText
            key={`t${i}`}
            x={CHART_W - padR}
            y={g.y - 2}
            fontSize={9}
            fill={colors.textFaint}
            textAnchor="end"
          >
            {fmt(g.val)}
          </SvgText>
        ))}
        {n > 1 ? <Path d={area} fill={colors.green500} fillOpacity={0.15} /> : null}
        {n > 1 ? (
          <Polyline
            points={polyline}
            fill="none"
            stroke={colors.green500}
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
        ) : null}
        {points.map((p, i) => (
          <Circle
            key={`p${i}`}
            cx={p.x}
            cy={p.y}
            r={4}
            fill={colors.white}
            stroke={colors.green500}
            strokeWidth={2}
          />
        ))}
      </Svg>
      <View style={styles.chartAxis}>
        <Text style={styles.chartAxisLabel}>
          {n > 1 ? `il y a ${n - 1}` : ''}
        </Text>
        <Text style={styles.chartAxisLabel}>
          {n === 1 ? 'Joue plus pour voir ta courbe' : 'Dernière'}
        </Text>
      </View>
    </View>
  );
}

// ── Barre de performance par thème (animée au mount) ───────────────────────
function ThemeBar({ accent, pct }) {
  const fill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fill, {
      toValue: pct === null ? 0 : pct / 100,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [fill, pct]);
  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={styles.barTrack}>
      <Animated.View style={[styles.barFill, { width, backgroundColor: accent }]} />
    </View>
  );
}

// ── Barre d'XP du header ───────────────────────────────────────────────────
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

export default function StatsScreen({ navigation }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  const history = useStatsStore((s) => s.history);
  const stats = useStatsStore((s) => s.stats);
  const histLoading = useStatsStore((s) => s.histLoading);
  const loadHistory = useStatsStore((s) => s.loadHistory);

  const leaderboard = useStatsStore((s) => s.leaderboard);
  const myRank = useStatsStore((s) => s.myRank);
  const totalPlayers = useStatsStore((s) => s.totalPlayers);
  const lbLoading = useStatsStore((s) => s.lbLoading);
  const loadLeaderboard = useStatsStore((s) => s.loadLeaderboard);

  const [tab, setTab] = useState('stats');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (tab === 'rank' && leaderboard.length === 0) {
      loadLeaderboard({ scope: 'global', currentUserId: user?.id });
    }
  }, [tab, leaderboard.length, loadLeaderboard, user?.id]);

  const onRefresh = useCallback(async () => {
    hapticLight();
    setRefreshing(true);
    if (tab === 'stats') {
      await Promise.all([refreshProfile?.(), loadHistory()]);
    } else {
      await loadLeaderboard({ scope: 'global', currentUserId: user?.id });
    }
    setRefreshing(false);
  }, [tab, refreshProfile, loadHistory, loadLeaderboard, user?.id]);

  const progress = levelProgress(user?.total_xp ?? 0);
  const level = progress.level;
  const streak = profileStreak(user?.stats);
  const loadingStats = histLoading && history === null;

  return (
    <Screen dark={false} scroll padded={false} refreshing={refreshing} onRefresh={onRefresh}>
      {/* Header sombre */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Avatar name={user?.name || ''} size={72} gold />
          <View style={styles.headerInfo}>
            <Text style={styles.headerName} numberOfLines={1}>
              {user?.name || 'Joueur'}
            </Text>
            <Body color={colors.textOnDarkMuted}>Niveau {level} — Joueur</Body>
          </View>
        </View>
        <View style={styles.xpRow}>
          <XpBar pct={progress.pct} />
          <View style={styles.xpLabels}>
            <Text style={styles.xpLabel}>{fmt(progress.current)} {t('common.xp')}</Text>
            <Text style={styles.xpLabel}>
              {progress.isMax ? 'Niveau max' : `${fmt(progress.needed)} ${t('common.xp')}`}
            </Text>
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map((tabItem) => {
          const active = tabItem.key === tab;
          return (
            <Pressable key={tabItem.key} onPress={() => setTab(tabItem.key)} style={styles.tab}>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {tabItem.emoji} {t(tabItem.labelKey)}
              </Text>
              <View style={[styles.tabUnderline, active && styles.tabUnderlineActive]} />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.body}>
        {tab === 'stats' ? (
          <StatsTab
            stats={stats}
            history={history}
            loading={loadingStats}
            streak={streak}
            onPlay={() => navigation.navigate('Play')}
          />
        ) : (
          <RankTab
            data={leaderboard}
            myRank={myRank}
            totalPlayers={totalPlayers}
            loading={lbLoading}
            currentUserId={user?.id}
            onPlay={() => navigation.navigate('Play')}
          />
        )}
      </View>
    </Screen>
  );
}

// ── Onglet Mes stats ───────────────────────────────────────────────────────
function StatsTab({ stats, history, loading, streak, onPlay }) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <View style={styles.kpiGrid}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.kpiCard}>
            <Skeleton width={44} height={44} radius={radius.md} />
            <Skeleton width={70} height={30} style={styles.skelGap} />
            <Skeleton width={90} height={12} style={styles.skelGapSm} />
          </View>
        ))}
      </View>
    );
  }

  // État vide : aucune partie jouée.
  if (history && history.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyEmoji}>🎮</Text>
        <Text style={styles.emptyTitle}>Tu n’as pas encore joué !</Text>
        <Body muted style={styles.emptyText}>
          Lance ta première partie pour voir tes stats, ta courbe de progression et
          ton classement.
        </Body>
        <AppButton title="Jouer maintenant" variant="primary" size="lg" onPress={onPlay} style={styles.emptyBtn} />
      </View>
    );
  }

  const KPI = [
    { icon: '🎯', bg: colors.successBg, value: fmt(stats.totalGames), label: t('stats.kpi.games') },
    {
      icon: '⭐',
      bg: '#fef9c3',
      value: fmt(stats.avgScore),
      color: stats.avgScore > 500 ? colors.gold500 : colors.green900,
      label: t('stats.kpi.avgScore'),
    },
    {
      icon: '📈',
      bg: '#dbeafe',
      value: `${stats.successRate}%`,
      color: rateColor(stats.successRate),
      label: t('stats.kpi.successRate'),
    },
    {
      icon: '🔥',
      bg: colors.errorBg,
      value: streak.max ?? '—',
      label: t('stats.kpi.maxStreak'),
    },
  ];

  const recent = (history || []).slice(0, 10);

  return (
    <>
      {/* KPI 2×2 */}
      <View style={styles.kpiGrid}>
        {KPI.map((k) => (
          <View key={k.label} style={styles.kpiCard}>
            <View style={[styles.kpiIcon, { backgroundColor: k.bg }]}>
              <Text style={styles.kpiIconText}>{k.icon}</Text>
            </View>
            <Text style={[styles.kpiValue, k.color ? { color: k.color } : null]}>{k.value}</Text>
            <Text style={styles.kpiLabel}>{k.label}</Text>
          </View>
        ))}
      </View>

      {/* Évolution du score */}
      <Text style={styles.sectionTitle}>Évolution du score</Text>
      <View style={styles.card}>
        <ScoreChart data={stats.scoreEvolution} />
      </View>

      {/* Performance par thème */}
      <Text style={styles.sectionTitle}>{t('stats.performanceByTheme')}</Text>
      <View style={styles.card}>
        {THEMES.map((theme, i) => {
          const entry = stats.byTheme?.[theme.key];
          const games = entry?.games ?? 0;
          const rate = entry?.rate ?? null;
          const accent = themeAccent[theme.key] || colors.green500;
          return (
            <View key={theme.key} style={[styles.themeRow, i === 0 && styles.themeRowFirst]}>
              <View style={styles.themeHead}>
                <Text style={styles.themeLabel}>
                  {theme.emoji} {theme.label}
                </Text>
                <Text style={styles.themeMeta}>
                  {games > 0 ? `${games} partie${games > 1 ? 's' : ''}` : 'Pas encore joué'}
                </Text>
              </View>
              <View style={styles.themeBarRow}>
                <ThemeBar accent={accent} pct={rate} />
                <Text style={styles.themePct}>{rate === null ? '—' : `${rate}%`}</Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* Historique */}
      <Text style={styles.sectionTitle}>{t('stats.history')}</Text>
      <View style={styles.histList}>
        {recent.map((g, i) => (
          <HistoryRow key={String(g.session_id || i)} game={g} />
        ))}
      </View>
    </>
  );
}

function HistoryRow({ game }) {
  const { t } = useTranslation();
  const total = Number(game.total_questions) || 0;
  const correct = Number(game.correct_count) || 0;
  const rate = total > 0 ? Math.round((correct / total) * 100) : null;
  const accent = themeAccent[game.theme] || colors.green500;

  let badge = null;
  if (rate !== null) {
    if (rate >= 70) badge = { icon: '✓', color: colors.green500, bg: colors.successBg };
    else if (rate >= 50) badge = { icon: '○', color: colors.gold500, bg: colors.goldVeil };
    else badge = { icon: '✕', color: colors.red400, bg: colors.errorBg };
  }

  return (
    <View style={styles.histCard}>
      <View style={[styles.histBand, { backgroundColor: accent }]} />
      <View style={styles.histBody}>
        <View style={styles.histTop}>
          <Text style={styles.histEmoji}>{themeEmoji(game.theme)}</Text>
          <Text style={styles.histTitle} numberOfLines={1}>
            {themeLabel(game.theme)} · {levelLabel(game.level)}
          </Text>
          <Text style={styles.histAgo}>{timeAgo(game.played_at)}</Text>
        </View>
        <View style={styles.histBottom}>
          <Text style={styles.histScore}>{fmt(game.score)} {t('common.pts')}</Text>
          {rate !== null ? (
            <Text style={styles.histCorrect}>✓ {correct}/{total}</Text>
          ) : null}
          {game.xp_earned ? (
            <Text style={styles.histXp}>⚡ +{fmt(game.xp_earned)} {t('common.xp')}</Text>
          ) : null}
        </View>
      </View>
      {badge ? (
        <View style={[styles.histBadge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.histBadgeText, { color: badge.color }]}>{badge.icon}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ── Onglet Classement ──────────────────────────────────────────────────────
function RankTab({ data, myRank, totalPlayers, loading, currentUserId, onPlay }) {
  const { t } = useTranslation();
  if (loading && data.length === 0) {
    return (
      <View style={styles.card}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={[styles.rankRow, i === 0 && styles.rankRowFirst]}>
            <Skeleton width={24} height={16} />
            <Skeleton width={36} height={36} radius={18} style={styles.rankAvatarSkel} />
            <View style={styles.rankMid}>
              <Skeleton width="55%" height={13} />
            </View>
            <Skeleton width={44} height={13} />
          </View>
        ))}
      </View>
    );
  }

  if (data.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyEmoji}>🏆</Text>
        <Text style={styles.emptyTitle}>Classement indisponible</Text>
        <Body muted style={styles.emptyText}>
          Réessaie dans un instant.
        </Body>
        <AppButton title="Jouer maintenant" variant="primary" size="lg" onPress={onPlay} style={styles.emptyBtn} />
      </View>
    );
  }

  const podium = data.slice(0, 3);
  const rest = data.slice(3);
  // Ordre visuel du podium : 2e (gauche) · 1er (centre) · 3e (droite).
  const podiumOrder = [podium[1], podium[0], podium[2]];

  return (
    <>
      {/* Ma position */}
      <View style={styles.myRankCard}>
        <Text style={styles.myRankLabel}>{t('stats.myPosition')}</Text>
        {myRank ? (
          <>
            <Text style={styles.myRankValue}>{t('common.rank', { n: fmt(myRank.rank) })}</Text>
            {totalPlayers ? (
              <Text style={styles.myRankSub}>sur {fmt(totalPlayers)} joueurs</Text>
            ) : (
              <Text style={styles.myRankSub}>Classement global</Text>
            )}
            <Text style={styles.myRankScore}>{fmt(myRank.score)} {t('common.pts')}</Text>
          </>
        ) : (
          <Text style={styles.myRankEmpty}>Joue ta première partie pour apparaître !</Text>
        )}
      </View>

      {/* Podium top 3 */}
      <View style={styles.podium}>
        {podiumOrder.map((p, idx) => {
          if (!p) return <View key={idx} style={styles.podiumCol} />;
          const isFirst = idx === 1;
          const medalIdx = isFirst ? 0 : idx === 0 ? 1 : 2;
          return (
            <View
              key={p.user_id || idx}
              style={[styles.podiumCol, isFirst ? styles.podiumFirst : styles.podiumSide]}
            >
              <Text style={styles.podiumMedal}>{PODIUM_MEDALS[medalIdx]}</Text>
              <Avatar name={p.name || ''} size={isFirst ? 56 : 44} gold={isFirst} />
              <Text style={styles.podiumName} numberOfLines={1}>
                {p.name}
              </Text>
              {p.ville ? (
                <Text style={styles.podiumVille} numberOfLines={1}>
                  {p.ville}
                </Text>
              ) : null}
              <Text style={[styles.podiumScore, isFirst && styles.podiumScoreFirst]}>
                {fmt(p.score)}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Classement complet */}
      {rest.length > 0 ? (
        <View style={styles.card}>
          {rest.map((r, i) => {
            const isMe = currentUserId && r.user_id === currentUserId;
            return (
              <View
                key={r.user_id || r.rank}
                style={[styles.rankRow, i === 0 && styles.rankRowFirst, isMe && styles.rankRowMe]}
              >
                <Text style={styles.rankNum}>{r.rank}</Text>
                <Avatar name={r.name || ''} size={36} />
                <View style={styles.rankMid}>
                  <View style={styles.rankNameRow}>
                    <Text style={styles.rankName} numberOfLines={1}>
                      {r.name}
                    </Text>
                    {isMe ? (
                      <View style={styles.mePill}>
                        <Text style={styles.mePillText}>Vous</Text>
                      </View>
                    ) : null}
                  </View>
                  {r.ville ? <Text style={styles.rankVille}>{r.ville}</Text> : null}
                </View>
                <Text style={styles.rankScore}>{fmt(r.score)}</Text>
              </View>
            );
          })}
        </View>
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
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.borderOnDark,
    overflow: 'hidden',
  },
  xpFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.gold400 },
  xpLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  xpLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.xs,
    color: colors.textOnDarkMuted,
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

  // Carte générique
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.soft,
  },

  // KPI grid
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  kpiCard: {
    width: '47.5%',
    flexGrow: 1,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.soft,
  },
  kpiIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiIconText: { fontSize: 24 },
  kpiValue: {
    fontFamily: fonts.titleExtraBold,
    fontSize: fontSizes.xxl,
    color: colors.green900,
    marginTop: spacing.md,
  },
  kpiLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  skelGap: { marginTop: spacing.md },
  skelGapSm: { marginTop: spacing.sm },

  sectionTitle: {
    fontFamily: fonts.titleSemiBold,
    fontSize: fontSizes.lg,
    color: colors.green900,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },

  // Courbe
  chartWrap: { alignItems: 'center' },
  chartAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: CHART_W,
    marginTop: spacing.xs,
  },
  chartAxisLabel: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textFaint,
  },
  chartEmpty: { alignItems: 'center', paddingVertical: spacing.xl },
  chartEmptyEmoji: { fontSize: 32, marginBottom: spacing.sm },
  chartEmptyText: { textAlign: 'center' },

  // Performance par thème
  themeRow: {
    paddingTop: spacing.md,
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: spacing.sm,
  },
  themeRowFirst: { borderTopWidth: 0, marginTop: 0, paddingTop: 0 },
  themeHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  themeLabel: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.md, color: colors.textBody },
  themeMeta: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.xs, color: colors.textMuted },
  themeBarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  barTrack: {
    flex: 1,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: '#f3f4f6',
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: radius.pill },
  themePct: {
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.base,
    color: colors.green900,
    width: 44,
    textAlign: 'right',
  },

  // Historique
  histList: { gap: spacing.sm },
  histCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.white,
    borderRadius: radius.md,
    overflow: 'hidden',
    ...shadow.soft,
  },
  histBand: { width: 4 },
  histBody: { flex: 1, padding: spacing.md, gap: spacing.xs },
  histTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  histEmoji: { fontSize: 18 },
  histTitle: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.textDark,
  },
  histAgo: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.xs, color: colors.textMuted },
  histBottom: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  histScore: { fontFamily: fonts.titleBold, fontSize: fontSizes.lg, color: colors.green900 },
  histCorrect: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, color: colors.textMuted },
  histXp: { fontFamily: fonts.titleSemiBold, fontSize: fontSizes.sm, color: colors.gold500 },
  histBadge: {
    width: 32,
    alignSelf: 'center',
    aspectRatio: 1,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  histBadgeText: { fontFamily: fonts.titleBold, fontSize: fontSizes.base },

  // Ma position
  myRankCard: {
    backgroundColor: colors.cream,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.gold500,
    padding: spacing.lg,
    alignItems: 'center',
    ...shadow.soft,
  },
  myRankLabel: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.xs, color: colors.textMuted },
  myRankValue: {
    fontFamily: fonts.titleBlack,
    fontSize: fontSizes.display,
    color: colors.green900,
    marginVertical: 2,
  },
  myRankSub: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.sm, color: colors.textMuted },
  myRankScore: {
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.xl,
    color: colors.gold500,
    marginTop: spacing.sm,
  },
  myRankEmpty: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.md,
    color: colors.textBody,
    textAlign: 'center',
    marginTop: spacing.sm,
  },

  // Podium
  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  podiumCol: { flex: 1, alignItems: 'center', borderRadius: radius.lg, padding: spacing.md, gap: 2 },
  podiumFirst: { backgroundColor: colors.goldVeil, borderWidth: 2, borderColor: colors.gold500 },
  podiumSide: { backgroundColor: '#f8f9fa', borderWidth: 1, borderColor: colors.border },
  podiumMedal: { fontSize: 22, marginBottom: 2 },
  podiumName: {
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.sm,
    color: colors.textDark,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  podiumVille: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.xs, color: colors.textMuted },
  podiumScore: {
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.base,
    color: colors.green900,
    marginTop: 2,
  },
  podiumScoreFirst: { fontFamily: fonts.titleExtraBold, fontSize: fontSizes.xl, color: colors.gold500 },

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
    width: 28,
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.lg,
    color: colors.textFaint,
    textAlign: 'center',
  },
  rankAvatarSkel: {},
  rankMid: { flex: 1 },
  rankNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  rankName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.textDark,
    flexShrink: 1,
  },
  mePill: {
    backgroundColor: colors.gold500,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
  },
  mePillText: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.green900 },
  rankVille: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.xs, color: colors.textMuted },
  rankScore: { fontFamily: fonts.titleSemiBold, fontSize: fontSizes.md, color: colors.green900 },

  // États vides
  empty: { alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
  emptyEmoji: { fontSize: 56, marginBottom: spacing.md },
  emptyTitle: {
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.xl,
    color: colors.green900,
    marginBottom: spacing.sm,
  },
  emptyText: { textAlign: 'center', lineHeight: 20 },
  emptyBtn: { marginTop: spacing.xl, alignSelf: 'stretch' },
});
