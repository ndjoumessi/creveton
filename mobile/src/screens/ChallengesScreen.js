// ChallengesScreen — hub de duels 1v1 (API §9). Trois onglets : Reçus / Envoyés /
// Terminés, plus un bottom sheet « Nouveau challenge ».
//
// Données réelles (branché juillet 2026) :
//   - GET /challenges?status=received|sent|completed  → listes des onglets
//   - POST /challenges/:id/accept                      → accepter + jouer
//   - DELETE /challenges/:id/decline                   → refuser (destinataire)
//   - DELETE /challenges/:id                           → annuler (émetteur)
//   - GET /users/search?q=                             → cibler un ami précis

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { Swords } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import {
  Screen,
  Title,
  Heading,
  Body,
  AppCard,
  AppButton,
  Avatar,
  ThemeBadge,
  useToast,
} from '../components';
import { THEMES, LEVELS } from '../constants/config';
import { challenges, users } from '../services/endpoints';
import { parseApiError } from '../services/api';
import { useGameStore } from '../store/gameStore';
import { timeAgo } from '../utils/format';
import { fonts, fontSizes, radius, spacing, shadow, MIN_TOUCH } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { hapticLight } from '../utils/haptics';

const TABS = ['received', 'sent', 'completed'];
const PAGE_SIZE = 50;
const emptyTabState = { loading: false, error: null, loaded: false };

export default function ChallengesScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { isOnline } = useNetworkStatus();
  const toast = useToast();
  const startGame = useGameStore((s) => s.startGame);

  const [tab, setTab] = useState('received');
  const [data, setData] = useState({ received: [], sent: [], completed: [] });
  const [status, setStatus] = useState({
    received: { ...emptyTabState },
    sent: { ...emptyTabState },
    completed: { ...emptyTabState },
  });
  const [refreshing, setRefreshing] = useState(false);

  // Charge (ou rafraîchit) un onglet depuis l'API.
  const fetchTab = useCallback(
    async (key, { refresh = false } = {}) => {
      if (!isOnline) return;
      setStatus((s) => ({ ...s, [key]: { ...s[key], loading: !refresh, error: null } }));
      try {
        const res = await challenges.list({ status: key, page: 1, limit: PAGE_SIZE });
        setData((d) => ({ ...d, [key]: res.data || [] }));
        setStatus((s) => ({ ...s, [key]: { loading: false, error: null, loaded: true } }));
      } catch (e) {
        setStatus((s) => ({ ...s, [key]: { loading: false, error: parseApiError(e).message, loaded: true } }));
      }
    },
    [isOnline]
  );

  // Onglet « Reçus » au montage (alimente la pastille de compteur).
  useEffect(() => {
    if (isOnline) fetchTab('received');
  }, [isOnline, fetchTab]);

  // Chargement paresseux du premier affichage de chaque onglet.
  useEffect(() => {
    if (isOnline && !status[tab].loaded && !status[tab].loading) fetchTab(tab);
  }, [tab, isOnline, status, fetchTab]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchTab(tab, { refresh: true });
    setRefreshing(false);
  }, [tab, fetchTab]);

  // Bottom sheet « Nouveau »
  const [sheetOpen, setSheetOpen] = useState(false);
  const [theme, setTheme] = useState(null); // aucun thème pré-sélectionné → Start désactivé à l'ouverture
  const [level, setLevel] = useState(LEVELS[0].key); // 'beginner' par défaut
  const [opponent, setOpponent] = useState('random'); // 'random' | 'friend'
  const [launching, setLaunching] = useState(false);
  // Recherche d'ami (GET /users/search).
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState(null);

  // Recherche débouncée (≥ 2 caractères) tant que le mode « ami » est actif.
  useEffect(() => {
    if (!sheetOpen || opponent !== 'friend') return undefined;
    const q = query.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return undefined;
    }
    let active = true;
    setSearching(true);
    const tid = setTimeout(async () => {
      try {
        const res = await users.search({ q, limit: 10 });
        if (active) setSearchResults(res.data || []);
      } catch {
        if (active) setSearchResults([]);
      } finally {
        if (active) setSearching(false);
      }
    }, 350);
    return () => {
      active = false;
      clearTimeout(tid);
    };
  }, [query, opponent, sheetOpen]);

  const resetSheet = () => {
    setSheetOpen(false);
    setOpponent('random');
    setQuery('');
    setSearchResults([]);
    setSelectedFriend(null);
  };

  const declineChallenge = (item) => {
    Alert.alert(
      t('challengesHub.actions.decline'),
      t('challengesHub.confirmDecline'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('challengesHub.actions.decline'),
          style: 'destructive',
          onPress: async () => {
            hapticLight();
            try {
              await challenges.decline(item.challenge_id);
              setData((d) => ({
                ...d,
                received: d.received.filter((c) => c.challenge_id !== item.challenge_id),
              }));
              toast.show({ type: 'info', message: t('challengesHub.notify.declined') });
            } catch (e) {
              toast.show({ type: 'error', message: parseApiError(e).message });
            }
          },
        },
      ]
    );
  };

  const cancelSent = (item) => {
    Alert.alert(
      t('challengesHub.actions.cancel'),
      t('challengesHub.confirmCancel'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('challengesHub.actions.cancel'),
          style: 'destructive',
          onPress: async () => {
            hapticLight();
            try {
              await challenges.cancel(item.challenge_id);
              setData((d) => ({
                ...d,
                sent: d.sent.filter((c) => c.challenge_id !== item.challenge_id),
              }));
              toast.show({ type: 'info', message: t('challengesHub.notify.cancelled') });
            } catch (e) {
              toast.show({ type: 'error', message: parseApiError(e).message });
            }
          },
        },
      ]
    );
  };

  const acceptChallenge = async (item) => {
    hapticLight();
    try {
      const res = await challenges.accept(item.challenge_id);
      startGame({
        mode: 'challenge',
        challengeId: res.challenge_id || item.challenge_id,
        theme: item.theme,
        level: item.level,
        questions: res.questions || [],
      });
      // Le défi quitte l'onglet « Reçus » une fois accepté.
      setData((d) => ({
        ...d,
        received: d.received.filter((c) => c.challenge_id !== item.challenge_id),
      }));
      navigation.navigate('Quiz');
    } catch (e) {
      toast.show({ type: 'error', message: parseApiError(e).message });
    }
  };

  const launch = async () => {
    setLaunching(true);
    try {
      const opponentId = opponent === 'friend' ? selectedFriend?.id ?? null : null;
      const res = await challenges.create({ opponent_id: opponentId, theme, level, stake: 0 });
      startGame({ mode: 'challenge', challengeId: res.challenge_id, theme, level, questions: res.questions || [] });
      setLaunching(false);
      resetSheet();
      navigation.navigate('Quiz');
    } catch (e) {
      setLaunching(false);
      toast.show({ type: 'error', message: parseApiError(e).message });
    }
  };

  const list = data[tab];
  const st = status[tab];
  // Défis « actifs » = reçus + envoyés en attente.
  const activeCount = data.received.length + data.sent.length;

  const openSheet = () => {
    hapticLight();
    setSheetOpen(true);
  };

  const renderItem = ({ item }) => {
    if (tab === 'received') return <ReceivedCard t={t} item={item} onAccept={acceptChallenge} onDecline={declineChallenge} disabled={!isOnline} />;
    if (tab === 'sent') return <SentCard t={t} item={item} onCancel={cancelSent} disabled={!isOnline} />;
    return <CompletedCard t={t} item={item} />;
  };

  // Contenu vide / chargement / erreur de l'onglet courant.
  const renderEmpty = () => {
    if (st.loading) {
      return (
        <View style={styles.stateBox}>
          <ActivityIndicator color={colors.green500} />
        </View>
      );
    }
    if (st.error) {
      return (
        <View style={styles.stateBox}>
          <Text style={styles.stateText}>{st.error}</Text>
          <Pressable onPress={() => fetchTab(tab)} hitSlop={8}>
            <Text style={styles.retryLink}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      );
    }
    return <EmptyChallenges t={t} tab={tab} onLaunch={openSheet} />;
  };

  const friendReady = opponent !== 'friend' || Boolean(selectedFriend);

  return (
    <Screen dark padded={false} edges={['top']}>
      {/* En-tête sombre */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerTitleWrap}>
            <View style={styles.titleRow}>
              <Icon icon={Swords} size={22} color={colors.textOnDark} />
              <Title color={colors.textOnDark}>{t('challengesHub.title')}</Title>
            </View>
            <Body style={styles.subtitle}>{t('challengesHub.subtitle')}</Body>
          </View>
          {activeCount > 0 ? (
            <View style={styles.countPill}>
              <Text style={styles.countPillText}>
                {t('challengesHub.activeCount', { count: activeCount })}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.tabs}>
          {TABS.map((key) => {
            const active = key === tab;
            const count = key === 'received' ? data.received.length : 0;
            return (
              <Pressable key={key} onPress={() => setTab(key)} style={styles.tab} hitSlop={6}>
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                  {t(`challengesHub.tabs.${key}`)}
                  {count > 0 ? ` •${count}` : ''}
                </Text>
                <View style={[styles.tabUnderline, active && styles.tabUnderlineActive]} />
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Corps clair */}
      <View style={styles.body}>
        {/* Bannière hors-ligne : les défis nécessitent une connexion. */}
        {!isOnline ? (
          <View style={styles.offlineBanner}>
            <Icon icon={Swords} size={15} color={colors.green900} />
            <Text style={styles.offlineBannerText}>{t('offline.challenges')}</Text>
          </View>
        ) : null}

        <FlatList
          data={list}
          keyExtractor={(item) => item.challenge_id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderEmpty()}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.green500} />
          }
        />
      </View>

      {/* FAB — nouveau défi (ouvre le bottom sheet). Désactivé hors ligne. */}
      <Pressable
        style={[styles.fab, !isOnline && styles.fabDisabled]}
        onPress={isOnline ? openSheet : undefined}
        disabled={!isOnline}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityState={{ disabled: !isOnline }}
        accessibilityLabel={t('challengesHub.launchCta')}
      >
        <Text style={styles.fabIcon}>+</Text>
      </Pressable>

      {/* Bottom sheet — Nouveau challenge */}
      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={resetSheet}>
        <Pressable style={styles.sheetBackdrop} onPress={resetSheet} />
        <View style={[styles.sheet, { paddingBottom: spacing.xxl + insets.bottom }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{t('challengesHub.sheet.title')}</Text>

          {/* Thème — 2 rangées de 3 tuiles (lisibilité petits écrans) */}
          <Text style={styles.fieldLabel}>{t('challengesHub.sheet.theme')}</Text>
          <View style={styles.themeGrid}>
            {THEMES.map((th) => {
              const active = th.key === theme;
              return (
                <Pressable
                  key={th.key}
                  onPress={() => {
                    hapticLight();
                    setTheme(th.key);
                  }}
                  style={[styles.themeChip, active && styles.themeChipActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={styles.themeChipEmoji}>{th.emoji}</Text>
                  <Text style={[styles.themeChipText, active && styles.themeChipTextActive]} numberOfLines={1}>
                    {th.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Difficulté — 3 pills pleine largeur (même motif que GameStartScreen) */}
          <Text style={styles.fieldLabel}>{t('challengesHub.sheet.level')}</Text>
          <View style={styles.levels}>
            {LEVELS.map((l) => {
              const active = l.key === level;
              return (
                <Pressable
                  key={l.key}
                  onPress={() => {
                    hapticLight();
                    setLevel(l.key);
                  }}
                  style={[styles.levelPill, active && styles.levelPillActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.levelText, active && styles.levelTextActive]}>
                    {t(`gameStart.levels.${l.key}`, l.label)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Adversaire — aléatoire ou recherche d'un ami précis */}
          <Text style={styles.fieldLabel}>{t('challengesHub.sheet.opponent')}</Text>
          <View style={styles.oppRow}>
            <Pressable
              onPress={() => {
                hapticLight();
                setOpponent('random');
                setSelectedFriend(null);
              }}
              style={[styles.oppChip, opponent === 'random' && styles.oppChipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: opponent === 'random' }}
            >
              <Text style={[styles.oppChipText, opponent === 'random' && styles.oppChipTextActive]} numberOfLines={1}>
                {t('challengesHub.sheet.randomOpponent')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                hapticLight();
                setOpponent('friend');
              }}
              style={[styles.oppChip, opponent === 'friend' && styles.oppChipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: opponent === 'friend' }}
            >
              <Text style={[styles.oppChipText, opponent === 'friend' && styles.oppChipTextActive]} numberOfLines={1}>
                {t('challengesHub.sheet.friend')}
              </Text>
            </Pressable>
          </View>

          {/* Recherche d'ami — visible en mode « ami » */}
          {opponent === 'friend' ? (
            <View style={styles.searchWrap}>
              {selectedFriend ? (
                <Pressable
                  style={styles.selectedFriend}
                  onPress={() => {
                    setSelectedFriend(null);
                    setQuery('');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('challengesHub.sheet.changeFriend')}
                >
                  <Avatar name={selectedFriend.name} size={32} uri={selectedFriend.avatar_url} />
                  <Text style={styles.selectedFriendName} numberOfLines={1}>{selectedFriend.name}</Text>
                  <Text style={styles.selectedFriendChange}>{t('common.close')}</Text>
                </Pressable>
              ) : (
                <>
                  <TextInput
                    style={styles.searchInput}
                    value={query}
                    onChangeText={setQuery}
                    placeholder={t('challengesHub.sheet.searchPlaceholder')}
                    placeholderTextColor={colors.textFaint}
                    autoCorrect={false}
                    returnKeyType="search"
                  />
                  {searching ? (
                    <ActivityIndicator style={styles.searchSpinner} color={colors.green500} />
                  ) : null}
                  {!searching && query.trim().length >= 2 && searchResults.length === 0 ? (
                    <Text style={styles.searchEmpty}>{t('challengesHub.sheet.noResults')}</Text>
                  ) : null}
                  {searchResults.map((u) => (
                    <Pressable
                      key={u.id}
                      style={styles.resultRow}
                      onPress={() => {
                        hapticLight();
                        setSelectedFriend(u);
                      }}
                      accessibilityRole="button"
                    >
                      <Avatar name={u.name} size={32} uri={u.avatar_url} />
                      <Text style={styles.resultName} numberOfLines={1}>{u.name}</Text>
                      <Text style={styles.resultLevel}>{t('common.level')} {u.level}</Text>
                    </Pressable>
                  ))}
                </>
              )}
            </View>
          ) : null}

          <AppButton
            variant="primary"
            title={t('challengesHub.sheet.launch')}
            fullWidth
            loading={launching}
            disabled={!theme || !friendReady}
            style={styles.launchBtn}
            onPress={launch}
          />
        </View>
      </Modal>
    </Screen>
  );
}

function OpponentRow({ t, name, level, theme, right }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.cardRow}>
      <Avatar name={name} size={44} />
      <View style={styles.cardMid}>
        <Heading numberOfLines={1} style={styles.cardName}>
          {name}
        </Heading>
        <View style={styles.cardMeta}>
          {level != null ? (
            <Text style={styles.cardMetaText}>{t('challengesHub.card.level', { n: level })}</Text>
          ) : null}
          {theme ? (
            <>
              {level != null ? <Text style={styles.cardMetaDot}>·</Text> : null}
              <ThemeBadge theme={theme} size="sm" />
            </>
          ) : null}
        </View>
      </View>
      {right}
    </View>
  );
}

function ReceivedCard({ t, item, onAccept, onDecline, disabled = false }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const name = item.opponent?.name || '—';
  return (
    <AppCard tone="light" padding="md" radius={radius.lg} style={[styles.card, styles.cardReceived]}>
      <OpponentRow t={t} name={name} level={item.opponent?.level} theme={item.theme} />
      <Body muted style={styles.cardSub}>
        {t('challengesHub.card.sentAgo', { ago: timeAgo(item.created_at) })}
      </Body>
      <View style={styles.cardActions}>
        <AppButton variant="ghost" size="sm" title={t('challengesHub.actions.decline')} disabled={disabled} onPress={() => onDecline(item)} style={styles.actionGhost} />
        <AppButton variant="primary" size="sm" title={t('challengesHub.actions.accept')} disabled={disabled} onPress={() => onAccept(item)} style={styles.actionPrimary} />
      </View>
    </AppCard>
  );
}

function SentCard({ t, item, onCancel, disabled = false }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const name = item.opponent?.name || t('challengesHub.sheet.randomOpponent');
  return (
    <AppCard tone="light" padding="md" radius={radius.lg} style={[styles.card, styles.cardSent]}>
      <OpponentRow t={t} name={name} level={item.opponent?.level} theme={item.theme} />
      <View style={styles.sentFooter}>
        {item.your_score != null ? (
          <Text style={styles.sentScore}>{t('challengesHub.card.myScore', { score: item.your_score })}</Text>
        ) : null}
        <Text style={styles.sentWaiting}>
          {item.your_score != null ? '· ' : ''}{t('challengesHub.card.waiting')}
        </Text>
        <View style={styles.sentSpacer} />
        <Pressable onPress={() => onCancel(item)} disabled={disabled} hitSlop={8}>
          <Text style={[styles.cancelLink, disabled && styles.cancelLinkDisabled]}>
            {t('challengesHub.actions.cancel')}
          </Text>
        </Pressable>
      </View>
    </AppCard>
  );
}

function CompletedCard({ t, item }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const win = item.won === true;
  const draw = item.won == null;
  const emoji = draw ? '🤝' : win ? '🏆' : '💔';
  const label = draw ? t('challengesHub.result.draw') : win ? t('challengesHub.result.win') : t('challengesHub.result.loss');
  const labelColor = draw ? colors.textMuted : win ? colors.green500 : colors.red400;
  const name = item.opponent?.name || '—';
  return (
    <AppCard tone="light" padding="md" radius={radius.lg} style={[styles.card, styles.cardCompleted]}>
      <View style={styles.completedRow}>
        <Text style={styles.completedEmoji}>{emoji}</Text>
        <View style={styles.cardMid}>
          <Text style={[styles.completedOutcome, { color: labelColor }]}>
            {label}
            <Text style={styles.completedVs}>  {t('challengesHub.card.vs')} {name}</Text>
          </Text>
          <Text style={styles.completedScores}>
            {item.your_score ?? 0} {t('challengesHub.card.vs')} {item.opponent_score ?? 0}
          </Text>
        </View>
      </View>
    </AppCard>
  );
}

function EmptyChallenges({ t, tab, onLaunch }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyEmoji}>⚔️</Text>
      <Heading style={styles.emptyTitle}>{t('challengesHub.empty.title')}</Heading>
      <Body muted style={styles.emptyText}>
        {t(`challengesHub.empty.${tab}`, t('challengesHub.empty.sub'))}
      </Body>
      <AppButton
        variant="primary"
        title={t('challengesHub.launchCta')}
        onPress={onLaunch}
        fullWidth={false}
        style={styles.emptyBtn}
      />
    </View>
  );
}

const makeStyles = (colors, isDark) => StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg, gap: spacing.md },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  headerTitleWrap: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  subtitle: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, color: colors.gold400 },
  countPill: {
    backgroundColor: colors.green700,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
  countPillText: { fontFamily: fonts.titleBold, fontSize: fontSizes.xs, color: colors.textOnDark },

  tabs: { flexDirection: 'row', gap: spacing.xl },
  tab: { minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center', paddingBottom: spacing.xs },
  tabLabel: { fontFamily: fonts.titleSemiBold, fontSize: fontSizes.base, color: colors.textOnDarkMuted },
  tabLabelActive: { color: colors.gold400 },
  tabUnderline: { height: 3, width: '100%', marginTop: spacing.xs, borderRadius: radius.pill, backgroundColor: 'transparent' },
  tabUnderlineActive: { backgroundColor: colors.gold500 },

  body: { flex: 1, backgroundColor: colors.cream, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.gold500,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    ...shadow.gold,
  },
  fabDisabled: { opacity: 0.45 },
  fabIcon: { fontFamily: fonts.titleBold, fontSize: 30, color: colors.textOnDark, marginTop: -2 },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.goldVeil,
    borderWidth: 1,
    borderColor: colors.goldVeilBorder,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  offlineBannerText: { fontFamily: fonts.bodySemiBold, fontSize: fontSizes.sm, color: colors.green900 },
  listContent: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md, flexGrow: 1 },

  // États de chargement / erreur de l'onglet.
  stateBox: { alignItems: 'center', justifyContent: 'center', paddingTop: spacing.xxxl, gap: spacing.sm },
  stateText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, color: colors.textMuted, textAlign: 'center' },
  retryLink: { fontFamily: fonts.bodySemiBold, fontSize: fontSizes.sm, color: colors.green500 },

  card: { ...shadow.card },
  cardReceived: { borderLeftWidth: 4, borderLeftColor: colors.gold500 },
  cardSent: { borderLeftWidth: 4, borderLeftColor: colors.green500 },
  cardCompleted: { borderLeftWidth: 4, borderLeftColor: colors.textMuted },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardMid: { flex: 1, gap: 2 },
  cardName: { fontFamily: fonts.titleBold, fontSize: fontSizes.base, color: colors.textDark },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  cardMetaText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.xs, color: colors.textMuted },
  cardMetaDot: { color: colors.textFaint, fontSize: fontSizes.xs },
  cardSub: { marginTop: spacing.sm, fontSize: fontSizes.xs },

  cardActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  actionGhost: { flex: 1 },
  actionPrimary: { flex: 1.4 },

  sentFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md, flexWrap: 'wrap' },
  sentScore: { fontFamily: fonts.titleSemiBold, fontSize: fontSizes.md, color: colors.textDark },
  sentSpacer: { flex: 1 },
  cancelLink: { fontFamily: fonts.bodySemiBold, fontSize: fontSizes.sm, color: colors.red600 },
  cancelLinkDisabled: { opacity: 0.4 },
  sentWaiting: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, color: colors.textMuted },

  completedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  completedEmoji: { fontSize: 32 },
  completedOutcome: { fontFamily: fonts.titleBold, fontSize: fontSizes.base },
  completedVs: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, color: colors.textBody },
  completedScores: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, color: colors.textMuted, marginTop: 2 },

  empty: { alignItems: 'center', paddingTop: spacing.xxxl, paddingHorizontal: spacing.xl, gap: spacing.sm },
  emptyEmoji: { fontSize: 64, opacity: 0.9 },
  emptyTitle: { fontFamily: fonts.titleSemiBold, fontSize: fontSizes.lg, color: colors.textDark },
  emptyText: { textAlign: 'center' },
  emptyBtn: { marginTop: spacing.md },

  // Bottom sheet « Nouveau challenge »
  sheetBackdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surfaceCream,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.xs,
  },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.sm },
  sheetTitle: { fontFamily: fonts.titleBold, fontSize: 20, color: colors.textDark, marginBottom: spacing.xs },
  fieldLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: isDark ? colors.green300 : colors.textMuted,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },

  // Thème — grille 2×3
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  themeChip: {
    flexBasis: '30%',
    flexGrow: 1,
    minWidth: 96,
    minHeight: MIN_TOUCH, // cible tactile ≥44/48
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  themeChipActive: { backgroundColor: colors.green900, borderColor: colors.gold400, borderWidth: 2 },
  themeChipEmoji: { fontSize: 20 },
  themeChipText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, color: colors.textDark },
  themeChipTextActive: { color: colors.textOnDark },

  // Difficulté — 3 pills pleine largeur
  levels: { flexDirection: 'row', gap: spacing.sm },
  levelPill: {
    flex: 1,
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelPillActive: { backgroundColor: colors.green900, borderColor: colors.gold400, borderWidth: 2 },
  levelText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, color: colors.textDark },
  levelTextActive: { color: colors.textOnDark },

  // Adversaire — random + recherche d'ami
  oppRow: { flexDirection: 'row', gap: spacing.sm },
  oppChip: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  oppChipActive: { borderColor: colors.gold400, borderWidth: 2 },
  oppChipText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, color: colors.textDark },
  oppChipTextActive: { color: colors.textDark },

  // Recherche d'ami
  searchWrap: { marginTop: spacing.sm, gap: spacing.xs },
  searchInput: {
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    color: colors.textDark,
  },
  searchSpinner: { marginTop: spacing.sm },
  searchEmpty: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, color: colors.textMuted, paddingVertical: spacing.sm },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
  },
  resultName: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: fontSizes.sm, color: colors.textDark },
  resultLevel: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.xs, color: colors.textMuted },
  selectedFriend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.gold400,
    backgroundColor: colors.surfaceElevated,
  },
  selectedFriendName: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: fontSizes.sm, color: colors.textDark },
  selectedFriendChange: { fontFamily: fonts.titleBold, fontSize: fontSizes.lg, color: colors.textMuted, paddingHorizontal: spacing.xs },

  launchBtn: { marginTop: spacing.lg },
});
