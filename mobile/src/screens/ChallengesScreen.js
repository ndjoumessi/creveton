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

import React, { useState } from 'react';
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
  AppInput,
  Avatar,
  ThemeBadge,
  useToast,
} from '../components';
import { THEMES, LEVELS } from '../constants/config';
import { challenges } from '../services/endpoints';
import { parseApiError } from '../services/api';
import { useGameStore } from '../store/gameStore';
import { levelForXp } from '../utils/format';
import { colors, fonts, fontSizes, radius, spacing, shadow } from '../constants/theme';
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
  const { t } = useTranslation();
  const toast = useToast();
  const startGame = useGameStore((s) => s.startGame);

  const [tab, setTab] = useState('received');
  const [received, setReceived] = useState(MOCK_RECEIVED);
  const [sent, setSent] = useState(MOCK_SENT);
  const [completed] = useState(MOCK_COMPLETED);

  // Bottom sheet « Nouveau »
  const [sheetOpen, setSheetOpen] = useState(false);
  const [theme, setTheme] = useState(THEMES[0].key);
  const [level, setLevel] = useState(LEVELS[1].key);
  const [search, setSearch] = useState('');
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
          <Title color={colors.cream}>⚔️ {t('challengesHub.title')}</Title>
          <Pressable
            style={styles.newBtn}
            onPress={() => {
              hapticLight();
              setSheetOpen(true);
            }}
            hitSlop={8}
          >
            <Text style={styles.newBtnText}>+ {t('challengesHub.new')}</Text>
          </Pressable>
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
          ListEmptyComponent={<EmptyChallenges t={t} tab={tab} />}
          renderItem={renderItem}
        />
      </View>

      {/* Bottom sheet — Nouveau challenge */}
      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSheetOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Heading style={styles.sheetTitle}>{t('challengesHub.sheet.title')}</Heading>

          <Text style={styles.fieldLabel}>{t('challengesHub.sheet.theme')}</Text>
          <View style={styles.chips}>
            {THEMES.map((th) => {
              const active = th.key === theme;
              return (
                <Pressable key={th.key} onPress={() => setTheme(th.key)} style={[styles.chip, active && styles.chipActive]}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {th.emoji} {th.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>{t('challengesHub.sheet.level')}</Text>
          <View style={styles.chips}>
            {LEVELS.map((l) => {
              const active = l.key === level;
              return (
                <Pressable key={l.key} onPress={() => setLevel(l.key)} style={[styles.chip, active && styles.chipActive]}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{l.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>{t('challengesHub.sheet.opponent')}</Text>
          <AppInput
            value={search}
            onChangeText={setSearch}
            placeholder={t('challengesHub.sheet.searchPlaceholder')}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {/* TODO: brancher GET /users/search?q=… ; pour l'instant, recherche placeholder. */}
          <Body muted style={styles.searchNote}>
            {t('challengesHub.sheet.searchSoon')}
          </Body>

          <AppButton
            variant="primary"
            title={t('challengesHub.sheet.launch')}
            fullWidth
            loading={launching}
            style={styles.launchBtn}
            onPress={launch}
          />
        </View>
      </Modal>
    </Screen>
  );
}

function OpponentRow({ t, name, xp, theme, questions, right }) {
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
  return (
    <AppCard tone="light" padding="md" radius={radius.lg} style={styles.card}>
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
  return (
    <AppCard tone="light" padding="md" radius={radius.lg} style={styles.card}>
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
  const win = item.outcome === 'win';
  return (
    <AppCard tone="light" padding="md" radius={radius.lg} style={styles.card}>
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

function EmptyChallenges({ t, tab }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyEmoji}>⚔️</Text>
      <Body muted style={styles.emptyText}>
        {t(`challengesHub.empty.${tab}`)}
      </Body>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  newBtn: {
    backgroundColor: colors.gold500,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    ...shadow.gold,
  },
  newBtnText: { fontFamily: fonts.titleBold, fontSize: fontSizes.sm, color: colors.green900 },

  tabs: { flexDirection: 'row', gap: spacing.xl },
  tab: { alignItems: 'center', paddingBottom: spacing.xs },
  tabLabel: { fontFamily: fonts.titleSemiBold, fontSize: fontSizes.base, color: colors.textOnDarkMuted },
  tabLabelActive: { color: colors.gold400 },
  tabUnderline: { height: 3, width: '100%', marginTop: spacing.xs, borderRadius: radius.pill, backgroundColor: 'transparent' },
  tabUnderlineActive: { backgroundColor: colors.gold500 },

  body: { flex: 1, backgroundColor: colors.cream },
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
  sentScore: { fontFamily: fonts.titleSemiBold, fontSize: fontSizes.md, color: colors.green900 },
  sentWaiting: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, color: colors.textMuted },
  sentSpacer: { flex: 1 },
  cancelLink: { fontFamily: fonts.bodySemiBold, fontSize: fontSizes.sm, color: colors.red600 },

  completedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  completedEmoji: { fontSize: 32 },
  completedOutcome: { fontFamily: fonts.titleBold, fontSize: fontSizes.base },
  completedVs: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, color: colors.textBody },
  completedScores: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, color: colors.textMuted, marginTop: 2 },

  empty: { alignItems: 'center', paddingTop: spacing.xxxl, gap: spacing.sm },
  emptyEmoji: { fontSize: 48, opacity: 0.85 },
  emptyText: { textAlign: 'center' },

  // Bottom sheet
  sheetBackdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: radius.pill, backgroundColor: colors.border, marginBottom: spacing.sm },
  sheetTitle: { color: colors.green900, marginBottom: spacing.xs },
  fieldLabel: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, color: colors.textBody, marginTop: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { borderColor: colors.green500, backgroundColor: colors.successBgSoft },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, color: colors.textBody },
  chipTextActive: { color: colors.green900 },
  searchNote: { fontSize: fontSizes.xs, marginTop: -spacing.xs },
  launchBtn: { marginTop: spacing.lg },
});
