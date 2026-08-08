// HomeScreen — tableau de bord : « Jouer », tournois ouverts, podium, stats
// réelles (dérivées de l'historique des parties) et dernières parties.

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { HelpCircle, Target, TrendingUp, WifiOff } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import Icon from '../components/Icon';
import {
  Logo,
  Title,
  Heading,
  Body,
  Label,
  AppCard,
  AppButton,
  Avatar,
  ThemeBadge,
  LevelBadge,
  Skeleton,
  ErrorScreen,
  SectionHeader,
  SessionCard,
  Podium,
  PendingSyncBadge,
} from '../components';
import { useAuthStore } from '../store/authStore';
import { useLeaderboardStore } from '../store/leaderboardStore';
import { useStatsStore } from '../store/statsStore';
import { tournaments as tournamentsApi } from '../services/endpoints';
import { runSync } from '../services/sync';
import {
  colors,
  radius,
  spacing,
  shadow,
} from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { formatDateTime, avatarUri } from '../utils/format';

// Pastels des tuiles d'icônes de stats (décoratif, non sémantique).
// Import statique de `colors` → valeurs claires figées dans les deux thèmes.
const ICON_BG = {
  games: colors.successBg, // #dcfce7
  avg: colors.pastelYellow,
  rate: colors.pastelBlue,
  streak: colors.errorBg, // #fee2e2
};

// Modes de jeu mis en avant sur l'accueil → deep-link vers GameStart (presetMode).
// La couleur sémantique (vert/rouge/or) est doublée d'un libellé (charte).
const PLAY_MODES = [
  { key: 'normal', emoji: '⚡', color: colors.green500, bg: colors.successBg },
  { key: 'blitz', emoji: '⏱', color: colors.red400, bg: colors.errorBg },
  { key: 'marathon', emoji: '🏃', color: colors.gold500, bg: colors.goldVeil },
];

const fmtNum = (n) => Number(n || 0).toLocaleString('fr-FR');

// Couleur du taux de réussite : vert > 70 %, or 50–70 %, rouge < 50 %.
function rateColor(pct, colors) {
  if (pct === null || pct === undefined) return colors.textDark;
  if (pct > 70) return colors.green500;
  if (pct >= 50) return colors.green700;
  return colors.red400;
}

function StatCard({ icon, iconBg, value, valueColor, label, sub }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // `icon` est soit un composant Lucide (UI), soit une chaîne emoji (contenu/brand).
  // Les icônes Lucide sont des composants forwardRef → typeof === 'object', PAS
  // 'function'. On discrimine donc sur la chaîne (emoji) vs tout le reste (composant).
  const isLucide = typeof icon !== 'string';
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: iconBg }]}>
        {isLucide ? (
          // green900 (marque, ne flippe pas) — comme SettingRow : lisible sur
          // pastille claire fixe dans les 2 thèmes. textDark virait blanc → invisible en dark.
          <Icon icon={icon} size={24} color={colors.green900} />
        ) : (
          <Text style={styles.statIconText}>{icon}</Text>
        )}
      </View>
      <Title weight="extrabold" style={[styles.statValue, valueColor ? { color: valueColor } : null]}>
        {value}
      </Title>
      <Label size="xs" style={styles.statLabel} numberOfLines={1}>
        {label}
      </Label>
      {sub ? (
        <Label size="xs" color={colors.green500} style={styles.statSub} numberOfLines={1}>
          {sub}
        </Label>
      ) : null}
    </View>
  );
}

function StatCardSkeleton() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.statCard}>
      <Skeleton width={44} height={44} radius={radius.md} />
      <Skeleton width={64} height={26} style={styles.skelGap} />
      <Skeleton width={80} height={11} style={styles.skelGapSm} />
    </View>
  );
}

function StatusPill({ tournament, t }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const full =
    tournament.max_players &&
    tournament.registered_players >= tournament.max_players;
  const paid = tournament.entry_fee > 0;
  const label = full
    ? t('home.misc.statusFull')
    : paid
      ? t('home.misc.statusPaid')
      : t('home.misc.statusFree');
  return (
    <View
      style={[
        styles.statusPill,
        { backgroundColor: paid ? colors.goldVeil : colors.borderOnDark },
      ]}
    >
      <Label weight="bold" size="xs" color={paid ? colors.gold400 : colors.green300}>
        {label}
      </Label>
    </View>
  );
}

export default function HomeScreen({ navigation }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // En-têtes de section : vert clair (green300) en sombre — lisibles sur la page
  // sombre ; vert profond (green900) en clair, inchangé.
  // Titres de section : couleur de titre standard (thème-aware) — textDark vire
  // clair en dark. NB: en dark, un vert vif (green300) se lisait comme un titre
  // « en vert » plutôt que comme un simple intitulé de section.
  const sectionColor = colors.textDark;
  const { isOffline } = useNetworkStatus();
  const user = useAuthStore((s) => s.user);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const loadLeaderboard = useLeaderboardStore((s) => s.load);
  const top = useLeaderboardStore((s) => s.data);
  const lbError = useLeaderboardStore((s) => s.error);

  const history = useStatsStore((s) => s.history);
  const stats = useStatsStore((s) => s.stats);
  const histLoading = useStatsStore((s) => s.histLoading);
  const loadHistory = useStatsStore((s) => s.loadHistory);
  const statsError = useStatsStore((s) => s.error);

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
    await Promise.all([lb, tourn, loadHistory(), refreshProfile?.()]);
  }, [loadLeaderboard, loadHistory, refreshProfile]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Rafraîchit l'historique (→ taux de réussite + streak max) au retour sur l'accueil,
  // par ex. après une partie — sinon les stats resteraient figées.
  useFocusEffect(
    useCallback(() => { loadHistory(); }, [loadHistory]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    runSync?.();
    await loadAll();
    setRefreshing(false);
  };

  const firstName = user?.name?.split(' ')[0] || 'Joueur';
  const podium = (top || []).slice(0, 3);
  // Streak max dérivé de l'historique (— si aucune partie jouée).
  const streakMax = stats.totalGames > 0 ? stats.maxStreak : null;
  const loadingStats = histLoading && history === null;
  const recent = (history || []).slice(0, 3);

  // Aucune donnée dynamique chargée (parties, classement, tournois) ET cause =
  // réseau/serveur (hors-ligne ou erreur de fetch). On distingue ce cas de
  // l'état « nouveau joueur » (en ligne, sans erreur) pour ne pas afficher un
  // tableau de bord de zéros trompeur. Le cache présent → on affiche normalement.
  const loadError = statsError || lbError;
  const dataEmpty =
    !(history && history.length) && !(top && top.length) && !activeTournaments.length;
  const blockingIssue = dataEmpty && (isOffline || !!loadError);

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
            tintColor={colors.gold500}
            colors={[colors.gold500]}
          />
        }
      >
        {/* En-tête sombre */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.greetingRow}>
              <Logo size={40} />
              <Heading weight="bold" size="xl" color={colors.textOnDark} style={styles.greeting}>{t('home.greeting', { name: firstName })}</Heading>
            </View>
            <Body weight="medium" size="sm" color={colors.gold400} style={styles.heroSubtitle}>{t('home.heroSubtitle')}</Body>
            <View style={styles.levelWrap}>
              <LevelBadge level={user?.level ?? 1} xp={user?.total_xp ?? 0} />
            </View>
            <PendingSyncBadge style={styles.pendingSync} />
          </View>
          <View style={styles.headerRight}>
            <Pressable
              onPress={() => navigation.navigate('Profile')}
              hitSlop={6}
              accessibilityLabel={t('home.a11y.openProfile')}
            >
              <Avatar name={user?.name || firstName} size={48} gold uri={avatarUri(user)} />
            </Pressable>
          </View>
        </View>

        {/* Corps cream */}
        <View style={styles.body}>
          {/* Choisir un mode — cartes horizontales → GameStart pré-réglé */}
          <SectionHeader title={t('home.chooseMode')} color={sectionColor} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.modesScroll}
          >
            {PLAY_MODES.map((m) => (
              <Pressable
                key={m.key}
                onPress={() => navigation.navigate('Play', { presetMode: m.key })}
                style={styles.modeCard}
                accessibilityRole="button"
                accessibilityLabel={t(`gameStart.modes.${m.key}.name`)}
              >
                <View style={[styles.modeIcon, { backgroundColor: m.bg }]}>
                  <Text style={styles.modeIconText}>{m.emoji}</Text>
                </View>
                <Heading weight="bold" size="base" style={styles.modeName}>
                  {t(`gameStart.modes.${m.key}.name`)}
                </Heading>
                <Body size="xs" muted style={styles.modeDesc} numberOfLines={2}>
                  {t(`gameStart.modes.${m.key}.desc`)}
                </Body>
              </Pressable>
            ))}
          </ScrollView>

          {/* Défi du jour */}
          <LinearGradient
            colors={[colors.gold500, colors.gold400]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.challengeCard}
          >
            <View style={styles.challengeTitleRow}>
              <Icon icon={HelpCircle} size={20} color={colors.green900} />
              <Heading weight="bold" size="base" color={colors.green900}>
                {t('home.dailyChallenge.title')}
              </Heading>
            </View>
            <Body size="sm" color={colors.green900} style={styles.challengeDesc}>
              {t('home.dailyChallenge.subtitle')}
            </Body>
            <AppButton
              title={t('home.dailyChallenge.button')}
              variant="secondary"
              size="md"
              fullWidth={false}
              onPress={() => navigation.navigate('Play')}
              style={styles.challengeBtn}
            />
          </LinearGradient>

          {/* Données dynamiques : remplacées par un bloc hors-ligne / erreur quand
              rien n'a pu être chargé (≠ nouveau joueur). Sinon affichage normal. */}
          {blockingIssue ? (
            isOffline ? (
              <ErrorScreen
                inline
                dark={false}
                icon={WifiOff}
                title={t('offline.title')}
                message={t('offline.message')}
                onRetry={loadAll}
                retryLabel={t('common.retry')}
              />
            ) : (
              <ErrorScreen
                inline
                dark={false}
                title={t('common.error')}
                message={loadError}
                onRetry={loadAll}
                retryLabel={t('common.retry')}
              />
            )
          ) : (
            <>
          {/* Mes stats rapides */}
          <SectionHeader title={t('home.myStats.title')} color={sectionColor} />

          <View style={styles.statsGrid}>
            {loadingStats ? (
              [0, 1, 2, 3].map((i) => <StatCardSkeleton key={i} />)
            ) : (
              <>
                <StatCard
                  icon={Target}
                  iconBg={ICON_BG.games}
                  value={fmtNum(stats.totalGames)}
                  label={t('home.myStats.games')}
                  sub={stats.todayGames > 0 ? t('home.misc.todayGames', { count: stats.todayGames }) : null}
                />
                <StatCard
                  icon="⭐"
                  iconBg={ICON_BG.avg}
                  value={fmtNum(stats.avgScore)}
                  // Pas de valueColor fixe : le <Title> par défaut est textDark
                  // (thème-aware). green900 (fixe) disparaissait sur la carte KPI
                  // sombre en dark mode (colors.white → surface sombre) — même
                  // correctif que StatsScreen (kpi avgScore = colors.textDark).
                  label={t('home.myStats.avgScore')}
                  sub={stats.totalGames > 0 ? t('home.misc.outOfGames', { count: stats.totalGames }) : null}
                />
                <StatCard
                  icon={TrendingUp}
                  iconBg={ICON_BG.rate}
                  value={stats.totalGames > 0 ? `${stats.successRate}%` : '—'}
                  valueColor={stats.totalGames > 0 ? rateColor(stats.successRate, colors) : colors.textDark}
                  label={t('home.myStats.successRate')}
                />
                <StatCard
                  icon="🔥"
                  iconBg={ICON_BG.streak}
                  value={streakMax > 0 ? `🔥 ${fmtNum(streakMax)}` : streakMax != null ? String(streakMax) : '—'}
                  label={t('home.myStats.maxStreak')}
                />
              </>
            )}
          </View>

          {/* Dernières parties */}
          {recent.length > 0 ? (
            <>
              <SectionHeader
                title={t('home.misc.lastGames')}
                color={sectionColor}
                actionLabel={t('home.misc.seeAll')}
                onAction={() => navigation.navigate('SessionsHistory')}
              />
              <View style={styles.lastList}>
                {recent.map((g, i) => (
                  <SessionCard
                    key={String(g.session_id || i)}
                    game={g}
                    showIncomplete
                    onPress={() => navigation.navigate('SessionDetail', { sessionId: g.session_id || g.id })}
                  />
                ))}
              </View>
              <AppButton
                variant="outlineGold"
                size="sm"
                title={`📋 ${t('home.lastGames.viewAll')}`}
                onPress={() => navigation.navigate('SessionsHistory')}
                style={styles.historyBtn}
              />
            </>
          ) : null}

          {/* Tournois */}
          <SectionHeader
            title={t('home.tournaments.title')}
            color={sectionColor}
            actionLabel={t('home.tournaments.seeAll')}
            onAction={() => navigation.navigate('Tournaments')}
          />

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
              {activeTournaments.map((tournament) => (
                <Pressable
                  key={tournament.id}
                  onPress={() => navigation.navigate('Tournaments')}
                  style={styles.tCard}
                >
                  <ThemeBadge theme={tournament.theme} size="sm" showLabel={false} />
                  <Heading
                    size="md"
                    color={colors.white}
                    numberOfLines={2}
                    style={styles.tName}
                  >
                    {tournament.name}
                  </Heading>
                  <View style={styles.tFooter}>
                    <Label color={colors.textOnDarkMuted}>
                      {t('home.misc.players', { count: tournament.registered_players ?? 0 })}
                    </Label>
                    <StatusPill tournament={tournament} t={t} />
                    <Label size="xs" color={colors.textOnDarkFaint}>
                      {formatDateTime(tournament.starts_at)}
                    </Label>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            // Même impasse que l'onglet Tournois avant 796af25 : du texte nu,
            // aucune sortie. Le « Voir tout → » de l'en-tête mène à un onglet
            // lui aussi vide. On propose donc la même action que l'onglet —
            // jouer — en gardant le format compact d'une section d'accueil
            // (un EmptyState pleine hauteur serait hors d'échelle ici).
            <AppCard tone="cream" padding="md" elevation="soft">
              <Body muted>{t('home.tournaments.none')}</Body>
              <AppButton
                title={t('tournaments.emptyCta')}
                variant="ghost"
                size="sm"
                fullWidth={false}
                onPress={() => navigation.navigate('Play')}
                style={styles.tEmptyCta}
              />
            </AppCard>
          )}

          {/* Classement */}
          <SectionHeader title={t('home.leaderboard.title')} color={sectionColor} />

          {lbLoading ? (
            <Podium loading />
          ) : podium.length ? (
            <Podium players={podium} />
          ) : (
            <AppCard tone="cream" padding="md" elevation="soft">
              <Body muted>{t('home.empty.leaderboard')}</Body>
            </AppCard>
          )}

          <AppButton
            title={t('home.leaderboard.seeAll')}
            variant="ghost"
            size="md"
            onPress={() => navigation.navigate('Stats')}
            style={styles.lbButton}
          />
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors) => StyleSheet.create({
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
  },
  heroSubtitle: {
    marginTop: spacing.xs,
  },
  levelWrap: { marginTop: spacing.sm },
  pendingSync: { marginTop: spacing.sm },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },

  // Corps
  body: {
    backgroundColor: colors.cream,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    marginTop: -spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },

  // Choisir un mode
  modesScroll: {
    gap: spacing.md,
    paddingRight: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  modeCard: {
    width: 160,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.card,
  },
  modeIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeIconText: { fontSize: 22 },
  modeName: {
    marginTop: spacing.md,
  },
  modeDesc: {
    marginTop: 2,
    lineHeight: 15,
  },

  // Défi du jour
  challengeCard: {
    marginTop: spacing.lg,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.gold,
  },
  challengeTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  challengeDesc: { marginTop: spacing.xs },
  challengeBtn: { marginTop: spacing.md, alignSelf: 'flex-start' },

  // Stats
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  statCard: {
    width: '47.5%',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.soft,
  },
  statIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statIconText: { fontSize: 24 },
  statValue: {
    marginTop: spacing.md,
  },
  statLabel: {
    marginTop: 2,
  },
  statSub: {
    marginTop: 2,
  },
  skelGap: { marginTop: spacing.md },
  skelGapSm: { marginTop: spacing.sm },

  // Dernières parties
  lastList: { gap: spacing.sm },
  historyBtn: { marginTop: spacing.sm },

  // Tournois
  hScroll: { gap: spacing.md, paddingRight: spacing.lg, paddingBottom: spacing.xs },
  tSkeleton: { marginRight: 0 },
  tEmptyCta: { alignSelf: 'flex-start', marginTop: spacing.sm },
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

  // Podium partagé : voir composant `Podium` (variante compact).
  lbButton: { marginTop: spacing.lg },
});
