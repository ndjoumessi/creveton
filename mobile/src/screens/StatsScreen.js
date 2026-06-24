// StatsScreen — onglet « Stats ». Données réelles dérivées de l'historique des
// parties (GET /users/me/history) : KPI, courbe d'évolution du score, performance
// par thème, historique. Onglet « Classement » : ma position, podium, liste (API §7/§10).

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
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
import { THEMES } from '../constants/config';
import {
  colors,
  fonts,
  fontSizes,
  radius,
  spacing,
  shadow,
  motion,
} from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { themeEmoji, themeLabel, levelLabel, timeAgo, levelProgress, avatarUri } from '../utils/format';
import { hapticLight } from '../utils/haptics';

const TABS = [
  { key: 'stats', emoji: '📊', labelKey: 'stats.tabs.myStats' },
  { key: 'rank', emoji: '🏆', labelKey: 'stats.tabs.leaderboard' },
];

const PODIUM_MEDALS = ['🥇', '🥈', '🥉'];
const fmt = (n) => Number(n || 0).toLocaleString('fr-FR');

// Médailles classement : or (1) · argent (2) · bronze (3). En dessous : texte neutre.
const SILVER = '#C0C0C0';
const BRONZE = '#CD7F32';
function rankColor(rank, c) {
  if (rank === 1) return c.gold500;
  if (rank === 2) return SILVER;
  if (rank === 3) return BRONZE;
  return c.textDark;
}
// Nom tronqué à 14 caractères max (ellipsis) pour les cartes podium.
function truncName(name, max = 14) {
  const s = String(name || '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// Géométrie de la courbe d'évolution (pleine largeur - paddings écran + carte).
const WIN_W = Dimensions.get('window').width;
const CHART_W = WIN_W - spacing.lg * 2 - spacing.md * 2;
const CHART_H = 140;

function rateColor(pct, c = colors) {
  if (pct === null || pct === undefined) return c.textDark;
  if (pct >= 70) return c.green500; // vert
  if (pct >= 40) return c.gold500; // ambre (≈ orange)
  return c.red400; // rouge
}

// Accent (bordure gauche historique) par mode de jeu.
const MODE_ACCENT = { normal: colors.green500, blitz: colors.red400, marathon: colors.gold500 };
// Emoji thème (réutilisé pour la méta d'une partie normale).
const THEME_EMOJI = {
  culture: '🎭',
  geographie: '🗺️',
  histoire: '📜',
  industrie: '🏭',
  sport: '⚽',
  science: '🔬',
};

// ── Courbe d'évolution du score (SVG, ligne + aire + points) ───────────────
function ScoreChart({ data }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (!data || data.length === 0) {
    return (
      <View style={styles.chartEmpty}>
        <Text style={styles.chartEmptyEmoji}>📈</Text>
        <Body muted style={styles.chartEmptyText}>
          {t('stats.misc.chartEmpty')}
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
            r={i === n - 1 ? 5 : 4}
            fill={i === n - 1 ? colors.green500 : colors.white}
            stroke={colors.green500}
            strokeWidth={2}
          />
        ))}
        {/* Valeur au-dessus du dernier point */}
        <SvgText
          x={points[n - 1].x}
          y={points[n - 1].y - 9}
          fontSize={11}
          fontWeight="bold"
          fill={colors.green700}
          textAnchor={n === 1 ? 'middle' : 'end'}
        >
          {fmt(values[n - 1])}
        </SvgText>
      </Svg>
      <View style={styles.chartAxis}>
        <Text style={styles.chartAxisLabel}>{n > 1 ? `J-${n - 1}` : ''}</Text>
        <Text style={styles.chartAxisLabel}>
          {n === 1 ? t('stats.misc.chartAxisPlayMore') : t('stats.misc.chartAxisLast')}
        </Text>
      </View>
    </View>
  );
}

// ── Barre de performance par thème (green500, animée au mount) ─────────────
function ThemeBar({ pct }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const fill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fill, {
      toValue: pct == null ? 0 : pct / 100,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [fill, pct]);
  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={styles.barTrack}>
      <Animated.View style={[styles.barFill, { width }]} />
    </View>
  );
}

// ── Barre d'XP du header ───────────────────────────────────────────────────
function XpBar({ pct }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
  const loadingStats = histLoading && history === null;

  return (
    <Screen dark={false} scroll padded={false} refreshing={refreshing} onRefresh={onRefresh}>
      {/* Header sombre */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Avatar name={user?.name || ''} size={72} gold uri={avatarUri(user)} />
          <View style={styles.headerInfo}>
            <Text style={styles.headerName} numberOfLines={1}>
              {user?.name || t('profile.misc.defaultName')}
            </Text>
            <Body color={colors.gold400}>{t('stats.misc.headerLevel', { level })}</Body>
          </View>
        </View>
        <View style={styles.xpRow}>
          <XpBar pct={progress.pct} />
          <View style={styles.xpLabels}>
            <Text style={styles.xpLabel}>{fmt(progress.current)} {t('common.xp')}</Text>
            <Text style={styles.xpLabel}>
              {progress.isMax ? t('stats.misc.levelMax') : `${fmt(progress.needed)} ${t('common.xp')}`}
            </Text>
          </View>
        </View>
      </View>

      {/* Tabs — pills (actif : or / texte vert) */}
      <View style={styles.tabs}>
        {TABS.map((tabItem) => {
          const active = tabItem.key === tab;
          return (
            <Pressable
              key={tabItem.key}
              onPress={() => setTab(tabItem.key)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {tabItem.emoji} {t(tabItem.labelKey)}
              </Text>
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
function StatsTab({ stats, history, loading, onPlay }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
        <Text style={styles.emptyTitle}>{t('stats.empty.statsTitle')}</Text>
        <Body muted style={styles.emptyText}>
          {t('stats.empty.statsText')}
        </Body>
        <AppButton title={t('stats.empty.play')} variant="primary" size="lg" onPress={onPlay} style={styles.emptyBtn} />
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
      color: rateColor(stats.successRate, colors),
      label: t('stats.kpi.successRate'),
    },
    {
      icon: '🔥',
      bg: colors.errorBg,
      // Streak max DÉRIVÉ de l'historique (streak_max persisté par partie), pas
      // du profil (souvent vide). 🔥 en préfixe seulement si > 0.
      value: stats.maxStreak > 0 ? `🔥 ${fmt(stats.maxStreak)}` : stats.maxStreak === 0 ? '0' : '—',
      label: t('stats.kpi.maxStreak'),
    },
  ];

  const recent = (history || []).slice(0, 10);
  // Parties en mode mixte (blitz/marathon) : thème null → ligne « Mix » dédiée.
  const mixGames = (history || []).filter((g) => g.mode === 'blitz' || g.mode === 'marathon').length;

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
      <Text style={styles.sectionTitle}>{t('stats.misc.scoreEvolution')}</Text>
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
          const played = games > 0;
          // Méta compacte « N parties · X% » sur une ligne.
          const meta = played
            ? `${t('stats.misc.themeGames', { games })}${rate !== null ? ` · ${rate}%` : ''}`
            : t('stats.misc.themeNotPlayed');
          return (
            <View key={theme.key} style={[styles.themeRow, i === 0 && styles.themeRowFirst]}>
              <View style={styles.themeHead}>
                <Text style={[styles.themeLabel, !played && styles.themeLabelMuted]}>
                  {theme.emoji} {theme.label}
                </Text>
                <Text style={styles.themeMeta}>{meta}</Text>
              </View>
              {/* Pas encore joué → pas de barre vide, juste l'état grisé. */}
              {played ? <ThemeBar pct={rate} /> : null}
            </View>
          );
        })}
        {/* Blitz/Marathon : pas de thème unique → ligne « Mix » dédiée. */}
        {mixGames > 0 ? (
          <View style={styles.themeRow}>
            <View style={styles.themeHead}>
              <Text style={styles.themeLabel}>🎲 Mix</Text>
              <Text style={styles.themeMeta}>{t('stats.misc.mix', { games: mixGames })}</Text>
            </View>
          </View>
        ) : null}
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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // L'historique (toView) expose `question_count` ; on tolère `total_questions`.
  const total = Number(game.question_count ?? game.total_questions) || 0;
  const correct = Number(game.correct_count) || 0;
  const score = Number(game.score) || 0;
  const rate = total > 0 ? Math.round((correct / total) * 100) : null;
  // Partie avortée / échouée : 0 pt ET 0 bonne réponse → grisée + « Incomplet ».
  const incomplete = score === 0 && correct === 0;

  // BUG : thème/niveau null en blitz/marathon → libellé du mode à la place.
  const meta =
    game.mode === 'blitz'
      ? { emoji: '⚡', label: t('gameStart.modes.blitz.name') }
      : game.mode === 'marathon'
        ? { emoji: '🏃', label: t('gameStart.modes.marathon.name') }
        : {
            emoji: THEME_EMOJI[game.theme] || themeEmoji(game.theme),
            label: `${themeLabel(game.theme)} · ${levelLabel(game.level)}`,
          };

  const accent = MODE_ACCENT[game.mode] || colors.green500;

  let badge = null;
  if (rate !== null) {
    if (rate >= 70) badge = { icon: '✓', color: colors.green500, bg: colors.successBg };
    else if (rate >= 40) badge = { icon: '○', color: colors.gold500, bg: colors.goldVeil };
    else badge = { icon: '✕', color: colors.red400, bg: colors.errorBg };
  }

  return (
    <View style={[styles.histCard, incomplete && styles.histCardIncomplete]}>
      <View style={[styles.histBand, { backgroundColor: incomplete ? colors.border : accent }]} />
      <View style={styles.histBody}>
        <View style={styles.histTop}>
          <Text style={styles.histEmoji}>{meta.emoji}</Text>
          <Text style={styles.histTitle} numberOfLines={1}>
            {meta.label}
          </Text>
          <Text style={styles.histAgo}>{timeAgo(game.played_at)}</Text>
        </View>
        <View style={styles.histBottom}>
          <Text style={styles.histScore}>{fmt(score)} {t('common.pts')}</Text>
          {rate !== null && !incomplete ? (
            <Text style={styles.histCorrect}>✓ {correct}/{total}</Text>
          ) : null}
          {game.xp_earned ? (
            <Text style={styles.histXp}>⚡ +{fmt(game.xp_earned)} {t('common.xp')}</Text>
          ) : null}
        </View>
      </View>
      {incomplete ? (
        <View style={styles.histIncompleteBadge}>
          <Text style={styles.histIncompleteText}>{t('stats.misc.incomplete')}</Text>
        </View>
      ) : badge ? (
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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
        <Text style={styles.emptyTitle}>{t('stats.empty.rankTitle')}</Text>
        <Body muted style={styles.emptyText}>
          {t('stats.empty.rankText')}
        </Body>
        <AppButton title={t('stats.empty.play')} variant="primary" size="lg" onPress={onPlay} style={styles.emptyBtn} />
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
        <Text style={styles.myRankLabel}>{t('stats.leaderboard.myPosition')}</Text>
        {myRank ? (
          <>
            <Text style={[styles.myRankValue, { color: rankColor(myRank.rank, colors) }]}>
              {t('common.rank', { n: fmt(myRank.rank) })}
            </Text>
            {totalPlayers ? (
              <Text style={styles.myRankSub}>{t('stats.leaderboard.outOf', { count: fmt(totalPlayers) })}</Text>
            ) : (
              <Text style={styles.myRankSub}>{t('stats.misc.globalRank')}</Text>
            )}
            <Text style={styles.myRankScore}>{fmt(myRank.score)} {t('stats.leaderboard.pts')}</Text>
            {/* Message motivant contextuel selon le rang */}
            {(() => {
              const r = myRank.rank;
              const msg =
                r === 1
                  ? { text: t('stats.leaderboard.rank1'), color: colors.gold500 }
                  : r <= 10
                    ? { text: t('stats.leaderboard.rankTop10'), color: colors.green300 }
                    : { text: t('stats.leaderboard.rankOther'), color: colors.textMuted };
              return <Text style={[styles.myRankMsg, { color: msg.color }]}>{msg.text}</Text>;
            })()}
          </>
        ) : (
          <Text style={styles.myRankEmpty}>{t('stats.empty.rankNoPosition')}</Text>
        )}
      </View>

      {/* Podium top 3 */}
      <View style={styles.podium}>
        {podiumOrder.map((p, idx) => {
          if (!p) return <View key={idx} style={styles.podiumCol} />;
          const isFirst = idx === 1;
          // Rang réel (les lignes data portent `rank`) → médaille + bordure colorée.
          const rank = p.rank || (isFirst ? 1 : idx === 0 ? 2 : 3);
          const borderColor = rank === 1 ? colors.gold400 : rank === 2 ? SILVER : BRONZE;
          return (
            <View
              key={p.user_id || idx}
              style={[
                styles.podiumCol,
                isFirst ? styles.podiumFirst : styles.podiumSide,
                { borderColor },
              ]}
            >
              <Text style={styles.podiumMedal}>{PODIUM_MEDALS[rank - 1] || PODIUM_MEDALS[2]}</Text>
              {/* avatar_url absent de la réponse leaderboard aujourd'hui → repli initiales
                  (Avatar gère uri→initiales). Prêt si le backend ajoute la photo. */}
              <Avatar name={p.name || ''} size={isFirst ? 56 : 44} gold={isFirst} uri={p.avatar_url || null} />
              <Text style={styles.podiumName} numberOfLines={1}>
                {truncName(p.name)}
              </Text>
              {p.ville ? (
                <Text style={styles.podiumVille} numberOfLines={1}>
                  {p.ville}
                </Text>
              ) : null}
              <Text style={[styles.podiumScore, isFirst && styles.podiumScoreFirst]}>
                {fmt(p.score)}
              </Text>
              <Text style={styles.podiumPts}>{t('stats.leaderboard.pts')}</Text>
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
                <Avatar name={r.name || ''} size={36} uri={r.avatar_url || null} />
                <View style={styles.rankMid}>
                  <View style={styles.rankNameRow}>
                    <Text style={styles.rankName} numberOfLines={1}>
                      {r.name}
                    </Text>
                    {isMe ? (
                      <View style={styles.mePill}>
                        <Text style={styles.mePillText}>{t('stats.misc.mePill')}</Text>
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

const makeStyles = (colors) => StyleSheet.create({
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
    color: colors.textOnDark,
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

  // Tabs — pills sur le header sombre.
  tabs: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.green900,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  tab: {
    flex: 1,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  tabActive: { backgroundColor: colors.gold500 },
  tabText: {
    fontFamily: fonts.titleSemiBold,
    fontSize: fontSizes.md,
    // Inactif sur en-tête vert profond : blanc à 88 % → nettement lisible (le
    // 60 % précédent était trop discret). Actif = vert sur or (contraste fort).
    color: 'rgba(255,255,255,0.88)',
  },
  tabTextActive: { fontFamily: fonts.titleBold, color: colors.green900 },

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
    ...shadow.card,
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
    fontSize: 32,
    color: colors.textDark,
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
    color: colors.textDark,
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
  themeLabelMuted: { color: colors.textFaint },
  themeMeta: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.xs, color: colors.textMuted },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 3, backgroundColor: colors.green500 },

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
  histCardIncomplete: { backgroundColor: colors.surfaceCream, opacity: 0.85 },
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
  histScore: { fontFamily: fonts.titleBold, fontSize: fontSizes.lg, color: colors.textDark },
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
  histIncompleteBadge: {
    alignSelf: 'center',
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginRight: spacing.md,
  },
  histIncompleteText: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.textMuted },

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
    color: colors.textDark,
    marginVertical: 2,
  },
  myRankSub: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.sm, color: colors.textMuted },
  myRankScore: {
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.xl,
    color: colors.gold500,
    marginTop: spacing.sm,
  },
  myRankMsg: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.sm,
    marginTop: spacing.xs,
    textAlign: 'center',
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
  podiumFirst: { backgroundColor: colors.goldVeil, borderWidth: 2, padding: spacing.xl },
  podiumSide: { backgroundColor: colors.surface, borderWidth: 1 },
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
    color: colors.textDark,
    marginTop: 2,
  },
  podiumScoreFirst: { fontFamily: fonts.titleExtraBold, fontSize: fontSizes.xl, color: colors.gold500 },
  podiumPts: { fontFamily: fonts.bodyMedium, fontSize: 10, color: colors.textMuted, marginTop: -2 },

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
  rankScore: { fontFamily: fonts.titleSemiBold, fontSize: fontSizes.md, color: colors.textDark },

  // États vides
  empty: { alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
  emptyEmoji: { fontSize: 56, marginBottom: spacing.md },
  emptyTitle: {
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.xl,
    color: colors.textDark,
    marginBottom: spacing.sm,
  },
  emptyText: { textAlign: 'center', lineHeight: 20 },
  emptyBtn: { marginTop: spacing.xl, alignSelf: 'stretch' },
});
