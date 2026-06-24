// ChallengesScreen — hub de duels 1v1 (API §9). Trois onglets : Reçus / Envoyés /
// Terminés, plus un bottom sheet « Nouveau challenge ».
//
// ⚠️ État backend (juin 2026) : seuls POST /challenges/create, /:id/accept,
// /:id/submit et GET /:id existent. Il N'Y A PAS encore d'endpoint de LISTE
// (GET /challenges?status=…), ni /decline, ni /users/search. Les trois onglets
// affichent donc des données de DÉMONSTRATION (bannière explicite) — voir les
// `// TODO: brancher API` ci-dessous. Le bouton « Lancer le challenge » utilise,
// lui, le vrai endpoint create (adversaire aléatoire tant que la recherche d'amis
// n'est pas branchée), pour qu'au moins le flux de création soit fonctionnel.

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  FlatList,
  Pressable,
  Modal,
  StyleSheet,
} from 'react-native';
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
import { challenges } from '../services/endpoints';
import { parseApiError } from '../services/api';
import { useGameStore } from '../store/gameStore';
import { levelForXp } from '../utils/format';
import { fonts, fontSizes, radius, spacing, shadow } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { hapticLight } from '../utils/haptics';

// ─── Données de démonstration (TODO: brancher GET /challenges?status=…) ──────────
const MOCK_RECEIVED = [
  { id: 'rcv-1', name: 'Jean-Paul Mbida', xp: 920, theme: 'histoire', questions: 10, sentAgo: '2h' },
  { id: 'rcv-2', name: 'Awa Ngono', xp: 350, theme: 'culture', questions: 10, sentAgo: '5h' },
  { id: 'rcv-3', name: 'Brice Talla', xp: 1500, theme: 'sport', questions: 10, sentAgo: '1j' },
];
const MOCK_SENT = [
  { id: 'snt-1', name: 'Amina Fouda', xp: 3200, theme: 'culture', questions: 10, myScore: 850 },
  { id: 'snt-2', name: 'Cédric Fotso', xp: 600, theme: 'science', questions: 10, myScore: 720 },
];
const MOCK_COMPLETED = [
  { id: 'cmp-1', name: 'Junior Kamga', outcome: 'win', myScore: 850, oppScore: 620, xp: 120 },
  { id: 'cmp-2', name: 'Cédric Fotso', outcome: 'loss', myScore: 720, oppScore: 980, xp: 30 },
];

const TABS = ['received', 'sent', 'completed'];

export default function ChallengesScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const { t } = useTranslation();
  const toast = useToast();
  const startGame = useGameStore((s) => s.startGame);

  const [tab, setTab] = useState('received');
  const [received, setReceived] = useState(MOCK_RECEIVED);
  const [sent, setSent] = useState(MOCK_SENT);
  const [completed] = useState(MOCK_COMPLETED);

  // Bottom sheet « Nouveau »
  const [sheetOpen, setSheetOpen] = useState(false);
  const [theme, setTheme] = useState(null); // aucun thème pré-sélectionné → Start désactivé à l'ouverture
  const [level, setLevel] = useState(LEVELS[0].key); // 'beginner' par défaut
  // Sélecteur d'adversaire (visuel) : 'random' branché ; 'friend' désactivé tant que
  // GET /users/search n'existe pas. Dans tous les cas, create part en opponent_id null.
  const [opponent, setOpponent] = useState('random');
  const [launching, setLaunching] = useState(false);

  const declineChallenge = (item) => {
    // TODO: brancher DELETE /challenges/:id/decline. Données mockées → retrait local.
    hapticLight();
    setReceived((l) => l.filter((c) => c.id !== item.id));
    toast.show({ type: 'info', message: t('challengesHub.notify.declined') });
  };

  const acceptChallenge = () => {
    // TODO: brancher POST /challenges/:id/accept → startGame(res.questions) → navigate('Quiz').
    // Impossible sur des données mockées (ids fictifs) : on signale, sans rien casser.
    hapticLight();
    toast.show({ type: 'info', message: t('challengesHub.notify.soon') });
  };

  const cancelSent = (item) => {
    // TODO: brancher l'annulation côté API. Données mockées → retrait local.
    hapticLight();
    setSent((l) => l.filter((c) => c.id !== item.id));
    toast.show({ type: 'info', message: t('challengesHub.notify.cancelled') });
  };

  const launch = async () => {
    setLaunching(true);
    try {
      // TODO: brancher GET /users/search pour cibler un ami précis. En attendant,
      // create accepte opponent_id null = adversaire aléatoire (flux réel fonctionnel).
      const res = await challenges.create({ opponent_id: null, theme, level, stake: 0 });
      startGame({ mode: 'challenge', theme, level, questions: res.questions || [] });
      setLaunching(false);
      setSheetOpen(false);
      navigation.navigate('Quiz');
    } catch (e) {
      setLaunching(false);
      toast.show({ type: 'error', message: parseApiError(e).message });
    }
  };

  const list = tab === 'received' ? received : tab === 'sent' ? sent : completed;
  // Défis « actifs » = reçus + envoyés en attente (données de démo, cf. bannière).
  const activeCount = received.length + sent.length;
  const openSheet = () => {
    hapticLight();
    setSheetOpen(true);
  };
  const renderItem = ({ item }) => {
    if (tab === 'received') return <ReceivedCard t={t} item={item} onAccept={acceptChallenge} onDecline={declineChallenge} />;
    if (tab === 'sent') return <SentCard t={t} item={item} onCancel={cancelSent} />;
    return <CompletedCard t={t} item={item} />;
  };

  return (
    <Screen dark padded={false}>
      {/* En-tête sombre */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerTitleWrap}>
            <Title color={colors.textOnDark}>⚔️ {t('challengesHub.title')}</Title>
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
            const count = key === 'received' ? received.length : 0;
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
        {/* Bannière honnêteté : ces listes sont des données de démonstration. */}
        <View style={styles.demoBanner}>
          <Text style={styles.demoBannerText}>ⓘ {t('challengesHub.demoBanner')}</Text>
        </View>

        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<EmptyChallenges t={t} onLaunch={openSheet} />}
          renderItem={renderItem}
        />
      </View>

      {/* FAB — nouveau défi (ouvre le bottom sheet) */}
      <Pressable
        style={styles.fab}
        onPress={openSheet}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('challengesHub.launchCta')}
      >
        <Text style={styles.fabIcon}>+</Text>
      </Pressable>

      {/* Bottom sheet — Nouveau challenge */}
      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSheetOpen(false)} />
        <View style={styles.sheet}>
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

          {/* Adversaire — aléatoire branché ; recherche d'ami à venir (désactivée) */}
          <Text style={styles.fieldLabel}>{t('challengesHub.sheet.opponent')}</Text>
          <View style={styles.oppRow}>
            <Pressable
              onPress={() => {
                hapticLight();
                setOpponent('random');
              }}
              style={[styles.oppChip, opponent === 'random' && styles.oppChipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: opponent === 'random' }}
            >
              <Text style={[styles.oppChipText, opponent === 'random' && styles.oppChipTextActive]} numberOfLines={1}>
                {t('challengesHub.sheet.randomOpponent')}
              </Text>
            </Pressable>
            <View style={[styles.oppChip, styles.oppChipDisabled]} accessibilityState={{ disabled: true }}>
              <Text style={styles.oppChipText} numberOfLines={1}>
                {t('challengesHub.sheet.friendSoon')}
              </Text>
            </View>
          </View>

          <AppButton
            variant="primary"
            title={t('challengesHub.sheet.launch')}
            fullWidth
            loading={launching}
            disabled={!theme}
            style={styles.launchBtn}
            onPress={launch}
          />
        </View>
      </Modal>
    </Screen>
  );
}

function OpponentRow({ t, name, xp, theme, questions, right }) {
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
          <Text style={styles.cardMetaText}>{t('challengesHub.card.level', { n: levelForXp(xp) })}</Text>
          {theme ? (
            <>
              <Text style={styles.cardMetaDot}>·</Text>
              <ThemeBadge theme={theme} size="sm" />
              <Text style={styles.cardMetaDot}>·</Text>
              <Text style={styles.cardMetaText}>{t('challengesHub.card.questions', { n: questions })}</Text>
            </>
          ) : null}
        </View>
      </View>
      {right}
    </View>
  );
}

function ReceivedCard({ t, item, onAccept, onDecline }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <AppCard tone="light" padding="md" radius={radius.lg} style={[styles.card, styles.cardReceived]}>
      <OpponentRow t={t} name={item.name} xp={item.xp} theme={item.theme} questions={item.questions} />
      <Body muted style={styles.cardSub}>
        {t('challengesHub.card.sentAgo', { ago: item.sentAgo })}
      </Body>
      <View style={styles.cardActions}>
        <AppButton variant="ghost" size="sm" title={t('challengesHub.actions.decline')} onPress={() => onDecline(item)} style={styles.actionGhost} />
        <AppButton variant="primary" size="sm" title={t('challengesHub.actions.accept')} onPress={() => onAccept(item)} style={styles.actionPrimary} />
      </View>
    </AppCard>
  );
}

function SentCard({ t, item, onCancel }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <AppCard tone="light" padding="md" radius={radius.lg} style={[styles.card, styles.cardSent]}>
      <OpponentRow t={t} name={item.name} xp={item.xp} theme={item.theme} questions={item.questions} />
      <View style={styles.sentFooter}>
        <Text style={styles.sentScore}>{t('challengesHub.card.myScore', { score: item.myScore })}</Text>
        <Text style={styles.sentWaiting}>· {t('challengesHub.card.waiting')}</Text>
        <View style={styles.sentSpacer} />
        <Pressable onPress={() => onCancel(item)} hitSlop={8}>
          <Text style={styles.cancelLink}>{t('challengesHub.actions.cancel')}</Text>
        </Pressable>
      </View>
    </AppCard>
  );
}

function CompletedCard({ t, item }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const win = item.outcome === 'win';
  return (
    <AppCard tone="light" padding="md" radius={radius.lg} style={[styles.card, styles.cardCompleted]}>
      <View style={styles.completedRow}>
        <Text style={styles.completedEmoji}>{win ? '🏆' : '💔'}</Text>
        <View style={styles.cardMid}>
          <Text style={[styles.completedOutcome, { color: win ? colors.green500 : colors.red400 }]}>
            {win ? t('challengesHub.result.win') : t('challengesHub.result.loss')}
            <Text style={styles.completedVs}>  {t('challengesHub.card.vs')} {item.name}</Text>
          </Text>
          <Text style={styles.completedScores}>
            {item.myScore} {t('challengesHub.card.vs')} {item.oppScore} · {t('challengesHub.result.xp', { xp: item.xp })}
          </Text>
        </View>
      </View>
    </AppCard>
  );
}

function EmptyChallenges({ t, onLaunch }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyEmoji}>⚔️</Text>
      <Heading style={styles.emptyTitle}>{t('challengesHub.empty.title')}</Heading>
      <Body muted style={styles.emptyText}>
        {t('challengesHub.empty.sub')}
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
  tab: { alignItems: 'center', paddingBottom: spacing.xs },
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
  fabIcon: { fontFamily: fonts.titleBold, fontSize: 30, color: colors.textOnDark, marginTop: -2 },
  demoBanner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.goldVeil,
    borderWidth: 1,
    borderColor: colors.goldVeilBorder,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  demoBannerText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.xs, color: colors.gold500 },
  listContent: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },

  card: { ...shadow.card },
  cardReceived: { borderLeftWidth: 4, borderLeftColor: colors.gold500 },
  cardSent: { borderLeftWidth: 4, borderLeftColor: colors.green500 },
  cardCompleted: { borderLeftWidth: 4, borderLeftColor: '#9ca3af' },
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
  sentWaiting: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, color: colors.textMuted },
  sentSpacer: { flex: 1 },
  cancelLink: { fontFamily: fonts.bodySemiBold, fontSize: fontSizes.sm, color: colors.red600 },

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
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
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

  // Adversaire — random (branché) + ami (à venir, désactivé)
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
  oppChipDisabled: { opacity: 0.5 },
  oppChipText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, color: colors.textDark },
  oppChipTextActive: { color: colors.textDark },

  launchBtn: { marginTop: spacing.lg },
});
