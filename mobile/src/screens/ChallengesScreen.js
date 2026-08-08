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
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { Swords, ArrowLeft } from 'lucide-react-native';
import Icon from '../components/Icon';
import {
  Screen,
  Title,
  Heading,
  Body,
  Label,
  AppCard,
  AppButton,
  Avatar,
  BottomSheet,
  ThemeBadge,
  SegmentedTabs,
  ChoiceChips,
  EmptyState,
  FAB,
  useConfirm,
  useToast,
} from '../components';
import { THEMES, LEVELS } from '../constants/config';
import { challenges, users } from '../services/endpoints';
import { parseApiError } from '../services/api';
import { useGameStore } from '../store/gameStore';
import { timeAgo } from '../utils/format';
import { fonts, fontSizes, radius, spacing, shadow } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { hapticLight } from '../utils/haptics';

const TABS = ['received', 'sent', 'completed'];
const PAGE_SIZE = 50;
const emptyTabState = { loading: false, error: null, loaded: false };

export default function ChallengesScreen({ navigation, route }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const { t } = useTranslation();
  const { isOnline } = useNetworkStatus();
  const toast = useToast();
  const confirm = useConfirm();
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

  // Ouverture directe du bottom sheet quand on arrive depuis « Défier un ami »
  // (GameStartScreen) ou l'ancienne route « Challenge » redirigée. On consomme le
  // param une seule fois pour ne pas rouvrir le sheet à chaque focus/re-render.
  const openCreateParam = route.params?.openCreate;
  useEffect(() => {
    if (openCreateParam) {
      setSheetOpen(true);
      navigation.setParams({ openCreate: undefined });
    }
  }, [openCreateParam, navigation]);

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

  const declineChallenge = async (item) => {
    const ok = await confirm({
      title: t('challengesHub.actions.decline'),
      message: t('challengesHub.confirmDecline'),
      confirmLabel: t('challengesHub.actions.decline'),
      destructive: true,
    });
    if (!ok) return;
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
  };

  const cancelSent = async (item) => {
    const ok = await confirm({
      title: t('challengesHub.actions.cancel'),
      message: t('challengesHub.confirmCancel'),
      confirmLabel: t('challengesHub.actions.cancel'),
      destructive: true,
    });
    if (!ok) return;
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
          <Label style={styles.stateText}>{st.error}</Label>
          <Pressable onPress={() => fetchTab(tab)} hitSlop={8}>
            <Label weight="semibold" color={colors.green500}>{t('common.retry')}</Label>
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
              {/* Retour : cet écran était un ONGLET, il n'avait donc pas besoin
                  de sortie. Passé en pile (08-2026, 6 onglets → 4), il en faut
                  une — le geste de retour ne suffit pas sur Android. */}
              <Pressable
                onPress={() => navigation.goBack()}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('common.back', 'Retour')}
              >
                <Icon icon={ArrowLeft} size={24} color={colors.textOnDark} />
              </Pressable>
              <Icon icon={Swords} size={22} color={colors.textOnDark} />
              <Title color={colors.textOnDark}>{t('challengesHub.title')}</Title>
            </View>
            <Body weight="medium" size="sm" color={colors.gold400}>{t('challengesHub.subtitle')}</Body>
          </View>
          {activeCount > 0 ? (
            <View style={styles.countPill}>
              <Title size="xs" color={colors.textOnDark}>
                {t('challengesHub.activeCount', { count: activeCount })}
              </Title>
            </View>
          ) : null}
        </View>

        <SegmentedTabs
          tabs={TABS.map((key) => ({
            key,
            label: t(`challengesHub.tabs.${key}`),
            count: key === 'received' ? data.received.length : 0,
          }))}
          activeKey={tab}
          onChange={setTab}
        />
      </View>

      {/* Corps clair */}
      <View style={styles.body}>
        {/* Bannière hors-ligne : les défis nécessitent une connexion. */}
        {!isOnline ? (
          <View style={styles.offlineBanner}>
            <Icon icon={Swords} size={15} color={colors.green900} />
            <Label weight="semibold" color={colors.green900}>{t('offline.challenges')}</Label>
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
      <FAB
        onPress={openSheet}
        disabled={!isOnline}
        accessibilityLabel={t('challengesHub.launchCta')}
      />

      {/* Bottom sheet — Nouveau challenge */}
      <BottomSheet visible={sheetOpen} onClose={resetSheet} title={t('challengesHub.sheet.title')}>
          {/* Thème — 2 rangées de 3 tuiles (lisibilité petits écrans) */}
          <Label weight="semibold" size="caption" style={styles.fieldLabel}>{t('challengesHub.sheet.theme')}</Label>
          <ChoiceChips
            layout="grid"
            haptic
            options={THEMES.map((th) => ({ key: th.key, label: th.label, emoji: th.emoji }))}
            value={theme}
            onChange={setTheme}
          />

          {/* Difficulté — 3 pills pleine largeur (même motif que GameStartScreen) */}
          <Label weight="semibold" size="caption" style={styles.fieldLabel}>{t('challengesHub.sheet.level')}</Label>
          <ChoiceChips
            haptic
            options={LEVELS.map((l) => ({
              key: l.key,
              label: t(`gameStart.levels.${l.key}`, l.label),
            }))}
            value={level}
            onChange={setLevel}
          />

          {/* Adversaire — aléatoire ou recherche d'un ami précis */}
          <Label weight="semibold" size="caption" style={styles.fieldLabel}>{t('challengesHub.sheet.opponent')}</Label>
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
              <Label color={colors.textDark} numberOfLines={1}>
                {t('challengesHub.sheet.randomOpponent')}
              </Label>
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
              <Label color={colors.textDark} numberOfLines={1}>
                {t('challengesHub.sheet.friend')}
              </Label>
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
                  <Label weight="semibold" color={colors.textDark} style={styles.selectedFriendName} numberOfLines={1}>{selectedFriend.name}</Label>
                  <Title size="lg" color={colors.textMuted} style={styles.selectedFriendChange}>{t('common.close')}</Title>
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
                    <Label style={styles.searchEmpty}>{t('challengesHub.sheet.noResults')}</Label>
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
                      <Label weight="semibold" color={colors.textDark} style={styles.resultName} numberOfLines={1}>{u.name}</Label>
                      <Label size="xs">{t('common.level')} {u.level}</Label>
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
      </BottomSheet>
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
        <Heading weight="bold" size="base" numberOfLines={1}>
          {name}
        </Heading>
        <View style={styles.cardMeta}>
          {level != null ? (
            <Label size="xs">{t('challengesHub.card.level', { n: level })}</Label>
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
      <Body muted size="xs" style={styles.cardSub}>
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
          <Heading size="md">{t('challengesHub.card.myScore', { score: item.your_score })}</Heading>
        ) : null}
        <Label>
          {item.your_score != null ? '· ' : ''}{t('challengesHub.card.waiting')}
        </Label>
        <View style={styles.sentSpacer} />
        <Pressable onPress={() => onCancel(item)} disabled={disabled} hitSlop={8}>
          <Label weight="semibold" color={colors.red600} style={disabled && styles.cancelLinkDisabled}>
            {t('challengesHub.actions.cancel')}
          </Label>
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
          <Title size="base" color={labelColor}>
            {label}
            <Label size="sm" color={colors.textBody}>  {t('challengesHub.card.vs')} {name}</Label>
          </Title>
          <Label style={styles.completedScores}>
            {item.your_score ?? 0} {t('challengesHub.card.vs')} {item.opponent_score ?? 0}
          </Label>
        </View>
      </View>
    </AppCard>
  );
}

function EmptyChallenges({ t, tab, onLaunch }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <EmptyState
      icon="⚔️"
      iconSize={64}
      title={t('challengesHub.empty.title')}
      message={t(`challengesHub.empty.${tab}`, t('challengesHub.empty.sub'))}
      ctaLabel={t('challengesHub.launchCta')}
      onCta={onLaunch}
      style={styles.empty}
    />
  );
}

const makeStyles = (colors, isDark) => StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg, gap: spacing.md },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  headerTitleWrap: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  countPill: {
    backgroundColor: colors.green700,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
  },

  body: { flex: 1, backgroundColor: colors.cream, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
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
  listContent: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md, flexGrow: 1 },

  // États de chargement / erreur de l'onglet.
  stateBox: { alignItems: 'center', justifyContent: 'center', paddingTop: spacing.xxxl, gap: spacing.sm },
  stateText: { textAlign: 'center' },

  card: { ...shadow.card },
  cardReceived: { borderLeftWidth: 4, borderLeftColor: colors.gold500 },
  cardSent: { borderLeftWidth: 4, borderLeftColor: colors.green500 },
  cardCompleted: { borderLeftWidth: 4, borderLeftColor: colors.textMuted },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardMid: { flex: 1, gap: 2 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  cardMetaDot: { color: colors.textFaint, fontSize: fontSizes.xs },
  cardSub: { marginTop: spacing.sm },

  cardActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  actionGhost: { flex: 1 },
  actionPrimary: { flex: 1.4 },

  sentFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md, flexWrap: 'wrap' },
  sentSpacer: { flex: 1 },
  cancelLinkDisabled: { opacity: 0.4 },

  completedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  completedEmoji: { fontSize: 32 },
  completedScores: { marginTop: 2 },

  // État vide : EmptyState partagé, ancré haut de liste (pas de padding bas).
  empty: { paddingTop: spacing.xxxl, paddingBottom: 0 },

  // Bottom sheet « Nouveau challenge » — conteneur/handle/titre → <BottomSheet>.
  fieldLabel: {
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: isDark ? colors.green300 : colors.textMuted,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },

  // Thème (grille 2×3) & difficulté (3 pills) : composant partagé ChoiceChips.

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
  searchEmpty: { paddingVertical: spacing.sm },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
  },
  resultName: { flex: 1 },
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
  selectedFriendName: { flex: 1 },
  selectedFriendChange: { paddingHorizontal: spacing.xs },

  launchBtn: { marginTop: spacing.lg },
});
