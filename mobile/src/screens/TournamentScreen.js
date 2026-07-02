// TournamentScreen — liste scannable des tournois par statut (Actifs / À venir /
// Terminés). Gratuits au lancement ; le payant est derrière un flag (API §8).
// En-tête sombre, corps clair (crème) avec cartes blanches.

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { View, FlatList, StyleSheet } from 'react-native';
import { Users, Clock, Calendar, Timer } from 'lucide-react-native';
import Icon from '../components/Icon';
import {
  Screen,
  Title,
  Heading,
  Body,
  AppCard,
  AppButton,
  ThemeBadge,
  ErrorScreen,
  Skeleton,
  StatusBadge,
  FillBar,
  SegmentedTabs,
  EmptyState,
  useConfirm,
  useToast,
} from '../components';
import { tournaments as tournamentsApi } from '../services/endpoints';
import { parseApiError } from '../services/api';
import { radius, spacing, themeAccent, shadow } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { formatDateTime, formatCountdown } from '../utils/format';
import { hapticLight } from '../utils/haptics';

// labelKey → clé i18n (tournaments.tabs.*) résolue au rendu ; key/statuses = logique.
const TABS = [
  { key: 'active', labelKey: 'active', statuses: ['open', 'running'] },
  { key: 'upcoming', labelKey: 'upcoming', statuses: ['scheduled'] },
  { key: 'past', labelKey: 'finished', statuses: ['closed', 'paid'] },
];

// labelKey → clé i18n (tournaments.misc.type.*) résolue au rendu.
const TYPE_LABEL = {
  free: 'free',
  flash: 'flash',
  mini: 'mini',
  grand: 'grand',
  premium: 'premium',
};

export default function TournamentScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t: tr } = useTranslation();
  const { isOnline } = useNetworkStatus();
  const toast = useToast();
  const confirm = useConfirm();
  const navigation = useNavigation();
  const [tab, setTab] = useState('active');
  // Inscription en cours (ignore les taps le temps de l'appel).
  const [joining, setJoining] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(
    async (tabKey, { isRefresh = false } = {}) => {
      const def = TABS.find((t) => t.key === tabKey) || TABS[0];
      if (!isRefresh) setLoading(true);
      try {
        // L'API filtre par un statut ; on agrège les statuts d'un onglet.
        const results = await Promise.all(
          def.statuses.map((status) => tournamentsApi.list({ status }))
        );
        const merged = results.flatMap((r) => r?.data || []);
        setItems(merged);
        setError(null);
      } catch (e) {
        setError(parseApiError(e).message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  const onRefresh = () => {
    setRefreshing(true);
    load(tab, { isRefresh: true });
  };

  // Confirmation native (useConfirm) puis POST /tournaments/:id/join (gratuit →
  // 201 confirmed) et bascule sur la manche live. Erreurs (complet, fermé, flag
  // payant…) → toast du message API.
  const onJoin = async (t) => {
    if (joining) return;
    hapticLight();
    const ok = await confirm({
      title: tr('tournaments.confirmJoin.title'),
      message: `${tr('tournaments.confirmJoin.message', { name: t.name })}\n\n${tr('tournaments.confirmJoin.reward')}`,
      confirmLabel: tr('tournaments.confirmJoin.confirm'),
      cancelLabel: tr('tournaments.confirmJoin.cancel'),
    });
    if (!ok) return;
    setJoining(true);
    try {
      await tournamentsApi.join(t.id);
      navigation.navigate('TournamentLive', { tournamentId: t.id });
    } catch (e) {
      toast.show({ type: 'error', message: parseApiError(e).message || tr('tournamentLive.joinError') });
    } finally {
      setJoining(false);
    }
  };

  return (
    <Screen dark padded={false} edges={['top']}>
      {/* En-tête sombre */}
      <View style={styles.header}>
        <Title color={colors.textOnDark}>{tr('tournaments.title')}</Title>

        <View style={styles.banner}>
          <Body weight="semibold" size="md" color={colors.gold500}>
            {tr('tournaments.freeBanner')}
          </Body>
        </View>

        <SegmentedTabs
          tabs={TABS.map((t) => ({ key: t.key, label: tr(`tournaments.tabs.${t.labelKey}`) }))}
          activeKey={tab}
          onChange={setTab}
        />
      </View>

      {/* Corps clair */}
      <View style={styles.body}>
        {!isOnline ? (
          <EmptyState
            icon="🏆"
            iconSize={48}
            title={tr('offline.tournaments')}
            style={styles.offlineBox}
            titleStyle={styles.offlineTitle}
          />
        ) : loading ? (
          <View style={styles.loading}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={150} radius={radius.lg} style={styles.skeleton} />
            ))}
          </View>
        ) : error ? (
          <ErrorScreen
            inline
            dark={false}
            emoji="🦐"
            title={tr('tournaments.error.title')}
            message={error}
            onRetry={() => load(tab)}
          />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(t, i) => String(t.id ?? i)}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshing={items.length > 0 && refreshing}
            onRefresh={onRefresh}
            ListEmptyComponent={
              <EmptyState
                icon="🏆"
                title={tr('tournaments.empty')}
                message={tr('tournaments.emptySubtitle')}
                style={styles.empty}
              />
            }
            renderItem={({ item }) => <TournamentCard t={item} onJoin={onJoin} />}
          />
        )}
      </View>
    </Screen>
  );
}

function TournamentCard({ t, onJoin }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t: tr } = useTranslation();
  const accent = themeAccent[t.theme] || colors.green500;
  const free = (t.entry_fee ?? 0) === 0 || t.type === 'free';
  const full = (t.registered_players ?? 0) >= (t.max_players ?? 0);
  const open = t.status === 'open';
  const running = t.status === 'running';
  const ratio = t.max_players
    ? Math.min(1, (t.registered_players ?? 0) / t.max_players)
    : 0;
  const countdown = formatCountdown(t.starts_at);

  let ctaTitle = tr('tournaments.card.join');
  let ctaVariant = 'primary';
  let ctaDisabled = false;
  if (!free) {
    ctaTitle = tr('tournaments.misc.status.soon');
    ctaVariant = 'ghost';
    ctaDisabled = true;
  } else if (full) {
    ctaTitle = tr('tournaments.misc.status.full');
    ctaVariant = 'ghost';
    ctaDisabled = true;
  } else if (!open) {
    ctaTitle = running ? tr('tournaments.misc.status.running') : tr('tournaments.misc.status.unavailable');
    ctaVariant = 'ghost';
    ctaDisabled = true;
  }

  return (
    <AppCard tone="light" padding="none" radius={radius.lg} style={styles.card}>
      {/* Accent thème en bandeau supérieur (bloc structurel, pas une stripe latérale) */}
      <View style={[styles.cardAccent, { backgroundColor: accent }]} />

      <View style={styles.cardInner}>
        <View style={styles.cardTop}>
          <View style={styles.cardTitleWrap}>
            <Heading weight="bold" size="base" numberOfLines={1}>
              {t.name}
            </Heading>
            <View style={styles.badgesRow}>
              <ThemeBadge theme={t.theme} size="sm" />
              <View style={styles.typePill}>
                <Body weight="bold" size="xs" color={colors.successText}>
                  {TYPE_LABEL[t.type] ? tr(`tournaments.misc.type.${TYPE_LABEL[t.type]}`) : t.type}
                </Body>
              </View>
            </View>
          </View>
          {running ? <StatusBadge status="running" label={tr('tournaments.card.running')} live /> : null}
        </View>

        <View style={styles.metaBlock}>
          <View style={styles.metaRow}>
            <Icon icon={Users} size={15} color={colors.textBody} />
            <Body weight="semibold" size="md">
              {t.registered_players ?? 0} / {t.max_players ?? 0} {tr('tournaments.card.players')}
            </Body>
          </View>
          <FillBar pct={ratio * 100} />
          {countdown ? (
            <View style={styles.metaRow}>
              <Icon icon={Clock} size={15} color={colors.gold500} />
              <Body weight="semibold" size="md" color={colors.gold500}>{tr('tournaments.card.startsIn')} {countdown}</Body>
            </View>
          ) : (
            <View style={styles.metaRow}>
              <Icon icon={Calendar} size={15} color={colors.textMuted} />
              <Body muted size="md">
                {formatDateTime(t.starts_at) || tr('tournaments.misc.dateTbd')}
              </Body>
            </View>
          )}
          {/* `format` n'est pas stocké en base (count/time passés au /start) → l'API
              renvoie null. On masque la ligne plutôt que d'afficher des tirets. */}
          {t.format?.questions != null && t.format?.time_per_q_s != null ? (
            <View style={styles.metaRow}>
              <Icon icon={Timer} size={15} color={colors.textMuted} />
              <Body muted size="md">
                {t.format.questions} {tr('tournaments.card.questions')} · {t.format.time_per_q_s}
                {tr('tournaments.card.perQ')}
              </Body>
            </View>
          ) : null}
        </View>

        <AppButton
          title={ctaTitle}
          variant={ctaVariant}
          disabled={ctaDisabled}
          onPress={() => onJoin(t)}
          fullWidth
          style={styles.cta}
        />
      </View>
    </AppCard>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  banner: {
    backgroundColor: colors.goldVeil,
    borderWidth: 1,
    borderColor: colors.goldVeilBorder,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  body: { flex: 1, backgroundColor: colors.cream },
  loading: { padding: spacing.lg, gap: spacing.md },
  skeleton: { marginBottom: spacing.xs },
  // Hors-ligne : EmptyState centré verticalement, titre atténué.
  offlineBox: { flex: 1, justifyContent: 'center', paddingVertical: spacing.xl, gap: spacing.md },
  offlineTitle: { color: colors.textMuted },

  list: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },

  card: { ...shadow.card },
  cardAccent: { height: 5, width: '100%' },
  cardInner: { padding: spacing.lg, gap: spacing.md },

  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cardTitleWrap: { flex: 1, gap: spacing.sm },
  badgesRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  typePill: {
    backgroundColor: colors.successBg,
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
  },

  metaBlock: { gap: spacing.xs },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },

  cta: { marginTop: spacing.xs },

  // État vide : EmptyState partagé, ancré haut de liste (pas de padding bas).
  empty: { paddingTop: spacing.xxxl, paddingBottom: 0 },
});
