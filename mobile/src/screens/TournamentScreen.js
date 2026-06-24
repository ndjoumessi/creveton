// TournamentScreen — liste scannable des tournois par statut (Actifs / À venir /
// Terminés). Gratuits au lancement ; le payant est derrière un flag (API §8).
// En-tête sombre, corps clair (crème) avec cartes blanches.

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { View, Text, Animated, FlatList, StyleSheet, Pressable, Modal } from 'react-native';
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
import { fonts, fontSizes, radius, spacing, themeAccent, shadow } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { formatDateTime } from '../utils/format';
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

// Renvoie « Xh Ymin » si starts_at est dans les 24 prochaines heures, sinon null.
function formatCountdown(startsAt) {
  if (!startsAt) return null;
  const ms = new Date(startsAt).getTime() - Date.now();
  if (Number.isNaN(ms) || ms <= 0 || ms > 24 * 60 * 60 * 1000) return null;
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return h > 0 ? `${h}h ${min}min` : `${min}min`;
}

export default function TournamentScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t: tr } = useTranslation();
  const toast = useToast();
  const navigation = useNavigation();
  const [tab, setTab] = useState('active');
  // Inscription en cours (désactive le bouton de confirmation le temps de l'appel).
  const [joining, setJoining] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  // Tournoi en attente de confirmation d'inscription (null = modale fermée).
  const [confirm, setConfirm] = useState(null);

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

  const onJoin = (t) => {
    hapticLight();
    setConfirm(t);
  };

  // POST /tournaments/:id/join (gratuit → 201 confirmed) puis bascule sur la
  // manche live. Erreurs (complet, fermé, flag payant…) → toast du message API.
  const confirmJoin = async () => {
    const target = confirm;
    if (!target || joining) return;
    setJoining(true);
    try {
      await tournamentsApi.join(target.id);
      setConfirm(null);
      navigation.navigate('TournamentLive', { tournamentId: target.id });
    } catch (e) {
      setConfirm(null);
      toast.show({ type: 'error', message: parseApiError(e).message || tr('tournamentLive.joinError') });
    } finally {
      setJoining(false);
    }
  };

  return (
    <Screen dark padded={false}>
      {/* En-tête sombre */}
      <View style={styles.header}>
        <Title color={colors.textOnDark}>{tr('tournaments.title')}</Title>

        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            {tr('tournaments.freeBanner')}
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
                  {tr(`tournaments.tabs.${t.labelKey}`)}
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
            refreshing={refreshing}
            onRefresh={onRefresh}
            ListEmptyComponent={<EmptyTournaments />}
            renderItem={({ item }) => <TournamentCard t={item} onJoin={onJoin} />}
          />
        )}
      </View>

      {/* Confirmation d'inscription */}
      <Modal
        visible={!!confirm}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirm(null)}
      >
        <Pressable style={styles.confirmBackdrop} onPress={() => setConfirm(null)} />
        <View style={styles.confirmWrap} pointerEvents="box-none">
          <View style={styles.confirmCard}>
            <Text style={styles.confirmEmoji}>🏆</Text>
            <Heading style={styles.confirmTitle}>
              {tr('tournaments.confirmJoin.message', { name: confirm?.name })}
            </Heading>
            <Body muted style={styles.confirmText}>
              {tr('tournaments.confirmJoin.reward')}
            </Body>
            <View style={styles.confirmActions}>
              <AppButton
                variant="primary"
                title={tr('tournaments.confirmJoin.confirm')}
                fullWidth
                disabled={joining}
                onPress={confirmJoin}
              />
              <AppButton
                variant="ghost"
                title={tr('tournaments.confirmJoin.cancel')}
                fullWidth
                style={styles.confirmCancel}
                onPress={() => setConfirm(null)}
              />
            </View>
          </View>
        </View>
      </Modal>
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
            <Heading numberOfLines={1} style={styles.cardTitle}>
              {t.name}
            </Heading>
            <View style={styles.badgesRow}>
              <ThemeBadge theme={t.theme} size="sm" />
              <View style={styles.typePill}>
                <Text style={styles.typePillText}>
                  {TYPE_LABEL[t.type] ? tr(`tournaments.misc.type.${TYPE_LABEL[t.type]}`) : t.type}
                </Text>
              </View>
            </View>
          </View>
          {running ? <RunningPill /> : null}
        </View>

        <View style={styles.metaBlock}>
          <Body style={styles.metaLine}>
            👥 {t.registered_players ?? 0} / {t.max_players ?? 0} {tr('tournaments.card.players')}
          </Body>
          <FillBar ratio={ratio} />
          {countdown ? (
            <Body style={styles.countdownLine}>⏳ {tr('tournaments.card.startsIn')} {countdown}</Body>
          ) : (
            <Body muted style={styles.metaLineMuted}>
              📅 {formatDateTime(t.starts_at) || tr('tournaments.misc.dateTbd')}
            </Body>
          )}
          {/* `format` n'est pas stocké en base (count/time passés au /start) → l'API
              renvoie null. On masque la ligne plutôt que d'afficher des tirets. */}
          {t.format?.questions != null && t.format?.time_per_q_s != null ? (
            <Body muted style={styles.metaLineMuted}>
              ⏱ {t.format.questions} {tr('tournaments.card.questions')} · {t.format.time_per_q_s}
              {tr('tournaments.card.perQ')}
            </Body>
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

function FillBar({ ratio }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const grow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(grow, {
      toValue: ratio,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [grow, ratio]);
  const width = grow.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={styles.fillTrack}>
      <Animated.View style={[styles.fillBar, { width }]} />
    </View>
  );
}

function RunningPill() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t: tr } = useTranslation();
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
      <Text style={styles.runningText}>{tr('tournaments.card.running')}</Text>
    </Animated.View>
  );
}

function EmptyTournaments() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t: tr } = useTranslation();
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyEmoji}>🏆</Text>
      <Heading style={styles.emptyTitle}>{tr('tournaments.empty')}</Heading>
      <Body muted style={styles.emptyText}>
        {tr('tournaments.emptySubtitle')}
      </Body>
    </View>
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
  countdownLine: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.gold500,
  },

  cta: { marginTop: spacing.xs },

  // Modale de confirmation
  confirmBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  confirmWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    ...shadow.card,
  },
  confirmEmoji: { fontSize: 44 },
  confirmTitle: { color: colors.textDark, textAlign: 'center' },
  confirmText: { textAlign: 'center' },
  confirmActions: { width: '100%', marginTop: spacing.lg, gap: spacing.sm },
  confirmCancel: { marginTop: 0 },

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
