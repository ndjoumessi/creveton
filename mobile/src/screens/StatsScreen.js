// StatsScreen — onglet « Stats ». Données réelles dérivées de l'historique des
// parties (GET /users/me/history) : KPI, courbe d'évolution du score, performance
// par thème, historique. Onglet « Classement » : ma position, podium, liste (API §7/§10).

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  Dimensions,
} from 'react-native';
import { BarChart2, Trophy, Target, TrendingUp, WifiOff } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Screen, Avatar, AppButton, Body, Skeleton, ErrorScreen, EmptyState, XpBar, FillBar, Podium, SessionCard, MiniLineChart, SegmentedTabs } from '../components';
import Icon from '../components/Icon';
import PendingSyncBadge from '../components/PendingSyncBadge';
import { useAuthStore } from '../store/authStore';
import { useStatsStore } from '../store/statsStore';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { THEMES } from '../constants/config';
import {
  colors,
  fonts,
  fontSizes,
  radius,
  spacing,
  shadow,
  MIN_TOUCH,
} from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { levelProgress, avatarUri } from '../utils/format';
import { medalColor } from '../utils/rank';
import { hapticLight } from '../utils/haptics';

const TABS = [
  { key: 'stats', icon: BarChart2, labelKey: 'stats.tabs.myStats' },
  { key: 'rank', icon: Trophy, labelKey: 'stats.tabs.leaderboard' },
];

const fmt = (n) => Number(n || 0).toLocaleString('fr-FR');

// Médailles / couleurs de rang : voir `utils/rank.js` (medalColor ici ; le
// podium top 3 est rendu par le composant partagé `Podium`, variante card).

// Géométrie de la courbe d'évolution (pleine largeur - paddings écran + carte).
const WIN_W = Dimensions.get('window').width;
const CHART_W = WIN_W - spacing.lg * 2 - spacing.md * 2;
const CHART_H = 140;

function rateColor(pct, c = colors, isDark = false) {
  if (pct === null || pct === undefined) return c.textDark;
  // green500 (#2a8a4f) tombe à ~2:1 sur la carte KPI sombre (colors.white →
  // #162a1e en dark) → en dark on prend green300, lisible sur fond sombre.
  if (pct >= 70) return isDark ? c.green300 : c.green500; // vert
  if (pct >= 40) return c.gold500; // ambre (≈ orange) — lisible sur les deux fonds
  return c.red400; // rouge — lisible sur les deux fonds
}

// Couleur de la barre de perf par thème (feu tricolore, doublée d'un libellé %) :
// ≥70 vert, 40–69 or, <40 rouge. green500 conservé (barre, pas texte → contraste
// moins strict que rateColor qui bascule en green300 pour le texte sur fond sombre).
function barColor(pct, c) {
  if (pct == null) return c.border;
  if (pct >= 70) return c.green500;
  if (pct >= 40) return c.gold500;
  return c.red400;
}

export default function StatsScreen({ navigation }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const user = useAuthStore((s) => s.user);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const { isOffline } = useNetworkStatus();

  const history = useStatsStore((s) => s.history);
  const stats = useStatsStore((s) => s.stats);
  const histLoading = useStatsStore((s) => s.histLoading);
  const loadHistory = useStatsStore((s) => s.loadHistory);
  const error = useStatsStore((s) => s.error);

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
      {/* Header sombre */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Avatar name={user?.name || ''} size={72} gold uri={avatarUri(user)} />
          <View style={styles.headerInfo}>
            <Text style={styles.headerName} numberOfLines={1}>
              {user?.name || t('profile.misc.defaultName')}
            </Text>
            <Body color={colors.gold400}>{t('stats.misc.headerLevel', { level })}</Body>
            <PendingSyncBadge style={styles.pendingSync} />
          </View>
        </View>
        <View style={styles.xpRow}>
          <XpBar current={progress.current} max={progress.needed} />
          <View style={styles.xpLabels}>
            <Text style={styles.xpLabel}>{fmt(progress.current)} {t('common.xp')}</Text>
            <Text style={styles.xpLabel}>
              {progress.isMax ? t('stats.misc.levelMax') : `${fmt(progress.needed)} ${t('common.xp')}`}
            </Text>
          </View>
        </View>
      </View>

      {/* Tabs — pills (actif : or / texte vert), composant partagé SegmentedTabs */}
      <SegmentedTabs
        variant="pills"
        tabs={TABS.map((tabItem) => ({
          key: tabItem.key,
          icon: tabItem.icon,
          label: t(tabItem.labelKey),
        }))}
        activeKey={tab}
        onChange={setTab}
        style={styles.tabs}
      />

      <View style={styles.body}>
        {tab === 'stats' ? (
          <StatsTab
            stats={stats}
            history={history}
            loading={loadingStats}
            error={error}
            isOffline={isOffline}
            onRetry={() => loadHistory()}
            onPlay={() => navigation.navigate('Play')}
            onViewHistory={() => navigation.navigate('SessionsHistory')}
          />
        ) : (
          <RankTab
            data={leaderboard}
            myRank={myRank}
            totalPlayers={totalPlayers}
            loading={lbLoading}
            error={error}
            isOffline={isOffline}
            onRetry={() => loadLeaderboard({ scope: 'global', currentUserId: user?.id })}
            currentUserId={user?.id}
            onPlay={() => navigation.navigate('Play')}
          />
        )}
      </View>
    </Screen>
  );
}

// Bloc d'échec de chargement (réseau/serveur) — distinct de l'état vide
// « nouveau joueur ». Hors-ligne → WifiOff + invite ; en ligne → message serveur.
// Réutilise ErrorScreen inline (même composant que le pattern Tournaments).
function LoadIssue({ isOffline, error, onRetry }) {
  const { t } = useTranslation();
  return isOffline ? (
    <ErrorScreen
      inline
      dark={false}
      icon={WifiOff}
      title={t('offline.title')}
      message={t('offline.message')}
      onRetry={onRetry}
      retryLabel={t('common.retry')}
    />
  ) : (
    <ErrorScreen
      inline
      dark={false}
      title={t('common.error')}
      message={error}
      onRetry={onRetry}
      retryLabel={t('common.retry')}
    />
  );
}

// ── Onglet Mes stats ───────────────────────────────────────────────────────
function StatsTab({ stats, history, loading, error, isOffline, onRetry, onPlay, onViewHistory }) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Tri LOCAL de la liste de thèmes (aucun appel API). Défaut = parties décroissantes
  // (comme le tri de computeStats). Re-taper le critère actif inverse le sens.
  const [sortBy, setSortBy] = useState('games'); // 'games' | 'rate'
  const [sortDir, setSortDir] = useState('desc'); // 'desc' | 'asc'
  const toggleSort = useCallback(
    (key) => {
      hapticLight();
      if (key === sortBy) {
        setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
      } else {
        setSortBy(key);
        setSortDir('desc');
      }
    },
    [sortBy]
  );

  // Liste de thèmes enrichie des agrégats + triée. Les thèmes non joués (games 0,
  // rate null) coulent en bas en tri décroissant (rate null → -1).
  const themeStats = useMemo(() => {
    const byTheme = stats?.byTheme || {};
    const rows = THEMES.map((theme) => {
      const entry = byTheme[theme.key];
      return {
        theme,
        games: entry?.games ?? 0,
        rate: entry?.rate ?? null,
        best: entry?.best ?? null,
      };
    });
    const sign = sortDir === 'desc' ? -1 : 1;
    return rows.sort((a, b) => {
      const av = sortBy === 'rate' ? (a.rate ?? -1) : a.games;
      const bv = sortBy === 'rate' ? (b.rate ?? -1) : b.games;
      return (av - bv) * sign;
    });
  }, [stats?.byTheme, sortBy, sortDir]);

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

  // Échec réseau/serveur : un loadHistory raté remet `history` à [] (pas null) →
  // sans ce garde, l'écran afficherait l'état vide « nouveau joueur ». `error`
  // (ou hors-ligne) est le discriminant.
  if ((!history || history.length === 0) && (isOffline || error)) {
    return <LoadIssue isOffline={isOffline} error={error} onRetry={onRetry} />;
  }

  // État vide LÉGITIME : nouveau joueur, aucune partie (online, sans erreur).
  if (history && history.length === 0) {
    return (
      <EmptyState
        icon="🎮"
        title={t('stats.empty.statsTitle')}
        message={t('stats.empty.statsText')}
        ctaLabel={t('stats.empty.play')}
        onCta={onPlay}
        ctaSize="lg"
        ctaFullWidth
        style={styles.empty}
        titleStyle={styles.emptyTitle}
        messageStyle={styles.emptyText}
      />
    );
  }

  // Pastilles d'icônes : tokens `pastel*` (theme.js) — pastels clairs FIXES sur les
  // 4 tuiles (vert/jaune/bleu/rouge), jamais surchargés en sombre (successBg/errorBg
  // flippaient foncé en dark, rendant l'icône green900 invisible).
  const KPI = [
    { icon: Target, bg: colors.pastelGreen, value: fmt(stats.totalGames), label: t('stats.kpi.games') },
    {
      icon: '⭐',
      bg: colors.pastelYellow,
      value: fmt(stats.avgScore),
      // Valeur en couleur de texte thème-aware : green900 ne flippe pas et
      // disparaissait sur la carte KPI sombre (colors.white → #162a1e en dark).
      color: colors.textDark,
      label: t('stats.kpi.avgScore'),
    },
    {
      icon: TrendingUp,
      bg: colors.pastelBlue,
      value: `${stats.successRate}%`,
      color: rateColor(stats.successRate, colors, isDark),
      label: t('stats.kpi.successRate'),
    },
    {
      icon: '🔥',
      bg: colors.pastelRed,
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
              {/* Icône Lucide = composant forwardRef (typeof 'object') ; emoji = chaîne. */}
              {typeof k.icon !== 'string' ? (
                // green900 (marque, ne flippe pas) — aligné sur SettingRow : lisible
                // sur pastille claire fixe en dark. textDark virait blanc → invisible.
                <Icon icon={k.icon} size={24} color={colors.green900} />
              ) : (
                <Text style={styles.kpiIconText}>{k.icon}</Text>
              )}
            </View>
            <Text style={[styles.kpiValue, k.color ? { color: k.color } : null]}>{k.value}</Text>
            <Text style={styles.kpiLabel}>{k.label}</Text>
          </View>
        ))}
      </View>

      {/* Évolution du score — courbe partagée MiniLineChart (mode « détaillé » :
          aire + graduations + points cerclés + valeur du dernier point). L'état
          vide et les libellés d'axe X restent locaux à l'écran. */}
      <Text style={styles.sectionTitle}>{t('stats.misc.scoreEvolution')}</Text>
      <View style={styles.card}>
        {(() => {
          const scoreValues = (stats.scoreEvolution || []).map((d) => d.score);
          const n = scoreValues.length;
          if (n === 0) {
            return (
              <View style={styles.chartEmpty}>
                <Text style={styles.chartEmptyEmoji}>📈</Text>
                <Body muted style={styles.chartEmptyText}>
                  {t('stats.misc.chartEmpty')}
                </Body>
              </View>
            );
          }
          return (
            <View style={styles.chartWrap}>
              <MiniLineChart
                data={scoreValues}
                width={CHART_W}
                height={CHART_H}
                color={colors.green500}
                paddingTop={14}
                paddingBottom={20}
                fillArea
                showGrid
                outlinedDots
                showLastValue
                scaleToData
                lastValueColor={colors.green700}
                formatValue={fmt}
              />
              <View style={styles.chartAxis}>
                <Text style={styles.chartAxisLabel}>{n > 1 ? `J-${n - 1}` : ''}</Text>
                <Text style={styles.chartAxisLabel}>
                  {n === 1 ? t('stats.misc.chartAxisPlayMore') : t('stats.misc.chartAxisLast')}
                </Text>
              </View>
            </View>
          );
        })()}
      </View>

      {/* Performance par thème */}
      <Text style={styles.sectionTitle}>{t('stats.performanceByTheme')}</Text>
      <View style={styles.card}>
        {/* Tri local : Réussite / Parties (le critère actif affiche le sens ↑/↓) */}
        <View style={styles.sortRow}>
          <Text style={styles.sortLabel}>{t('stats.themePerf.sortBy')}</Text>
          {[
            { key: 'rate', label: t('stats.themePerf.sortRate') },
            { key: 'games', label: t('stats.themePerf.sortGames') },
          ].map((opt) => {
            const active = sortBy === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => toggleSort(opt.key)}
                style={[styles.sortToggle, active && styles.sortToggleActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.sortToggleText, active && styles.sortToggleTextActive]}>
                  {opt.label} {active ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {themeStats.map(({ theme, games, rate, best }, i) => {
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
                <View style={styles.themeMetaRow}>
                  <Text style={styles.themeMeta}>{meta}</Text>
                  {/* Meilleur score RÉEL (max des parties complètes) — masqué si aucun. */}
                  {best != null ? (
                    <Text style={styles.themeBest}>{t('stats.themePerf.best', { pts: fmt(best) })}</Text>
                  ) : null}
                </View>
              </View>
              {/* Pas encore joué → pas de barre vide, juste l'état grisé. Barre
                  colorée (feu tricolore) + stagger 100ms via le prop delay. */}
              {played ? (
                <FillBar
                  pct={rate ?? 0}
                  height={6}
                  color={barColor(rate, colors)}
                  trackColor={colors.borderOnDark}
                  delay={i * 100}
                />
              ) : null}
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

      {/* Historique — même carte SessionCard que l'Accueil et l'écran Historique
          (rendu unifié) ; `showIncomplete` conserve la pastille « Incomplet »
          des parties avortées (0 pt, 0 bonne réponse). */}
      <Text style={styles.sectionTitle}>{t('stats.history')}</Text>
      <View style={styles.histList}>
        {recent.map((g, i) => (
          <SessionCard key={String(g.session_id || i)} game={g} showIncomplete />
        ))}
      </View>
      {/* Corps Stats = surface CLAIRE (Screen dark=false) → variant plein (comme
          le bouton d'état vide) ; l'outlineGold est réservé aux fonds sombres. */}
      <AppButton
        variant="primary"
        size="sm"
        title={`📋 ${t('home.lastGames.viewAll')}`}
        onPress={onViewHistory}
        style={styles.historyBtn}
      />
    </>
  );
}

// ── Onglet Classement ──────────────────────────────────────────────────────
function RankTab({ data, myRank, totalPlayers, loading, error, isOffline, onRetry, currentUserId, onPlay }) {
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

  // Échec réseau/serveur (≠ classement réellement vide) : on n'écrase l'état
  // vide légitime que si hors-ligne ou erreur de chargement.
  if (data.length === 0 && (isOffline || error)) {
    return <LoadIssue isOffline={isOffline} error={error} onRetry={onRetry} />;
  }

  if (data.length === 0) {
    return (
      <EmptyState
        icon="🏆"
        title={t('stats.empty.rankTitle')}
        message={t('stats.empty.rankText')}
        ctaLabel={t('stats.empty.play')}
        onCta={onPlay}
        ctaSize="lg"
        ctaFullWidth
        style={styles.empty}
        titleStyle={styles.emptyTitle}
        messageStyle={styles.emptyText}
      />
    );
  }

  const podium = data.slice(0, 3);
  const rest = data.slice(3);

  return (
    <>
      {/* Ma position */}
      <View style={styles.myRankCard}>
        <Text style={styles.myRankLabel}>{t('stats.leaderboard.myPosition')}</Text>
        {myRank ? (
          <>
            <Text style={[styles.myRankValue, { color: medalColor(myRank.rank, colors) }]}>
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

      {/* Podium top 3 — composant partagé avec l'Accueil (variante card). */}
      <Podium players={podium} variant="card" />

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
  pendingSync: { marginTop: spacing.xs },
  headerName: {
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.xl,
    color: colors.textOnDark,
    marginBottom: 2,
  },
  xpRow: { marginTop: spacing.lg, gap: spacing.xs },
  xpLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  xpLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.xs,
    color: colors.textOnDarkMuted,
  },

  // Tabs — bandeau du composant partagé SegmentedTabs (variant pills). Les
  // styles des pilules vivent dans SegmentedTabs ; ici on ne garde que le fond
  // vert profond qui prolonge le header + le padding du bandeau.
  tabs: {
    backgroundColor: colors.green900,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },

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
  themeHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  themeLabel: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.md, color: colors.textBody, flexShrink: 1 },
  themeLabelMuted: { color: colors.textMuted },
  themeMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 0 },
  themeMeta: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.xs, color: colors.textMuted },
  themeBest: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textMuted },

  // Tri local (Réussite / Parties)
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  sortLabel: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.xs, color: colors.textMuted },
  sortToggle: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sortToggleActive: { backgroundColor: colors.green900, borderColor: colors.green900 },
  sortToggleText: { fontFamily: fonts.bodySemiBold, fontSize: fontSizes.xs, color: colors.textBody },
  sortToggleTextActive: { color: colors.textOnDark },

  // Historique — cartes rendues par SessionCard (composant partagé avec l'Accueil).
  histList: { gap: spacing.sm },
  historyBtn: { marginTop: spacing.md },

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

  // Podium partagé : voir composant `Podium` (variante card).

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
    color: colors.textDark,
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

  // États vides — EmptyState partagé (titre Bold/xl et interligne propres à l'écran).
  empty: { paddingHorizontal: spacing.lg },
  emptyTitle: { fontFamily: fonts.titleBold, fontSize: fontSizes.xl },
  emptyText: { lineHeight: 20 },
});
