// TournamentScreen — liste scannable des tournois par statut (Actifs / À venir /
// Terminés). Gratuits au lancement ; le payant est derrière un flag (API §8).
// En-tête sombre, corps clair (crème) avec cartes blanches.

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, Animated, FlatList, StyleSheet, Pressable } from 'react-native';
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
  useToast,
} from '../components';
import { tournaments as tournamentsApi } from '../services/endpoints';
import { parseApiError } from '../services/api';
import { colors, fonts, fontSizes, radius, spacing, themeAccent, shadow } from '../constants/theme';
import { formatDateTime } from '../utils/format';

const TABS = [
  { key: 'active', label: 'Actifs', statuses: ['open', 'running'] },
  { key: 'upcoming', label: 'À venir', statuses: ['scheduled'] },
  { key: 'past', label: 'Terminés', statuses: ['closed', 'paid'] },
];

const TYPE_LABEL = {
  free: 'Gratuit',
  flash: 'Flash',
  mini: 'Mini',
  grand: 'Grand',
  premium: 'Premium',
};

export default function TournamentScreen() {
  const toast = useToast();
  const [tab, setTab] = useState('active');
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

  const onJoin = () => {
    toast.show({ type: 'info', message: 'Inscription bientôt disponible.' });
  };

  return (
    <Screen dark padded={false}>
      {/* En-tête sombre */}
      <View style={styles.header}>
        <Title color={colors.cream}>Tournois</Title>

        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            🏆 Tournois gratuits — XP & badges à gagner !
          </Text>
        </View>

        <View style={styles.tabs}>
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={styles.tab}
                hitSlop={8}
              >
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                  {t.label}
                </Text>
                <View style={[styles.tabUnderline, active && styles.tabUnderlineActive]} />
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Corps clair */}
      <View style={styles.body}>
        {loading ? (
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
            title="Chargement impossible"
            message={error}
            onRetry={() => load(tab)}
          />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(t, i) => String(t.id ?? i)}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshing={refreshing}
            onRefresh={onRefresh}
            ListEmptyComponent={<EmptyTournaments />}
            renderItem={({ item }) => <TournamentCard t={item} onJoin={onJoin} />}
          />
        )}
      </View>
    </Screen>
  );
}

function TournamentCard({ t, onJoin }) {
  const accent = themeAccent[t.theme] || colors.green500;
  const free = (t.entry_fee ?? 0) === 0 || t.type === 'free';
  const full = (t.registered_players ?? 0) >= (t.max_players ?? 0);
  const open = t.status === 'open';
  const running = t.status === 'running';
  const ratio = t.max_players
    ? Math.min(1, (t.registered_players ?? 0) / t.max_players)
    : 0;

  let ctaTitle = "S'inscrire";
  let ctaVariant = 'primary';
  let ctaDisabled = false;
  if (!free) {
    ctaTitle = 'Bientôt disponible';
    ctaVariant = 'ghost';
    ctaDisabled = true;
  } else if (full) {
    ctaTitle = 'Complet';
    ctaVariant = 'ghost';
    ctaDisabled = true;
  } else if (!open) {
    ctaTitle = running ? 'Tournoi en cours' : 'Indisponible';
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
            <Heading numberOfLines={1} style={styles.cardTitle}>
              {t.name}
            </Heading>
            <View style={styles.badgesRow}>
              <ThemeBadge theme={t.theme} size="sm" />
              <View style={styles.typePill}>
                <Text style={styles.typePillText}>{TYPE_LABEL[t.type] || t.type}</Text>
              </View>
            </View>
          </View>
          {running ? <RunningPill /> : null}
        </View>

        <View style={styles.metaBlock}>
          <Body style={styles.metaLine}>
            👥 {t.registered_players ?? 0} / {t.max_players ?? 0} joueurs
          </Body>
          <View style={styles.fillTrack}>
            <View style={[styles.fillBar, { width: `${Math.round(ratio * 100)}%` }]} />
          </View>
          <Body muted style={styles.metaLineMuted}>
            📅 {formatDateTime(t.starts_at) || 'Date à venir'}
          </Body>
          <Body muted style={styles.metaLineMuted}>
            ⏱ {t.format?.questions ?? '—'} questions · {t.format?.time_per_q_s ?? '—'}s par
            question
          </Body>
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

function RunningPill() {
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View style={[styles.runningPill, { opacity: pulse }]}>
      <View style={styles.runningDot} />
      <Text style={styles.runningText}>EN COURS</Text>
    </Animated.View>
  );
}

function EmptyTournaments() {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyEmoji}>🏆</Text>
      <Heading style={styles.emptyTitle}>Aucun tournoi</Heading>
      <Body muted style={styles.emptyText}>
        Reviens bientôt pour de nouveaux tournois.
      </Body>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  banner: {
    backgroundColor: colors.goldVeil,
    borderWidth: 1,
    borderColor: colors.goldVeilBorder,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  bannerText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.gold500,
  },

  tabs: { flexDirection: 'row', gap: spacing.xl },
  tab: { alignItems: 'center', paddingBottom: spacing.xs },
  tabLabel: {
    fontFamily: fonts.titleSemiBold,
    fontSize: fontSizes.base,
    color: colors.textOnDarkMuted,
  },
  tabLabelActive: { color: colors.gold400 },
  tabUnderline: {
    height: 3,
    width: '100%',
    marginTop: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: 'transparent',
  },
  tabUnderlineActive: { backgroundColor: colors.gold500 },

  body: { flex: 1, backgroundColor: colors.cream },
  loading: { padding: spacing.lg, gap: spacing.md },
  skeleton: { marginBottom: spacing.xs },

  list: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },

  card: { ...shadow.card },
  cardAccent: { height: 5, width: '100%' },
  cardInner: { padding: spacing.lg, gap: spacing.md },

  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cardTitleWrap: { flex: 1, gap: spacing.sm },
  cardTitle: {
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.base,
    color: colors.textDark,
  },
  badgesRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  typePill: {
    backgroundColor: colors.successBg,
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
  },
  typePillText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.successText,
  },

  metaBlock: { gap: spacing.xs },
  metaLine: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.textBody,
  },
  metaLineMuted: { fontSize: fontSizes.md },
  fillTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginVertical: spacing.xxs,
  },
  fillBar: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.green500 },

  cta: { marginTop: spacing.xs },

  runningPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorBg,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
  },
  runningDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.red600,
  },
  runningText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.red600,
    letterSpacing: 0.5,
  },

  empty: { alignItems: 'center', paddingTop: spacing.xxxl, paddingHorizontal: spacing.xl, gap: spacing.sm },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { color: colors.textDark },
  emptyText: { textAlign: 'center' },
});
