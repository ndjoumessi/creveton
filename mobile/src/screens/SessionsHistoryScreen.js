// SessionsHistoryScreen — historique complet et paginé des parties du joueur.
// Accessible depuis l'accueil (« Dernières parties → Voir tout »). Filtres thème
// et niveau appliqués CÔTÉ CLIENT (l'API /users/me/history ne filtre pas) ;
// pagination par curseur (offset), 20 parties par page, bouton « Charger plus »
// (pas de scroll infini). Chaque partie est rendue avec le composant SessionCard.

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  FlatList,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import Icon from '../components/Icon';
import { AppButton, Skeleton, SessionCard, ErrorScreen, EmptyState, Heading, Label } from '../components';
import { users as usersApi } from '../services/endpoints';
import { parseApiError } from '../services/api';
import { THEMES, LEVELS } from '../constants/config';
import { themeLabel, levelLabel } from '../utils/format';
import { fonts, radius, spacing, MIN_TOUCH } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

const PAGE_SIZE = 20;

// Pastille de filtre (thème / niveau). Actif = vert profond + texte clair (jamais
// d'or sur fond clair) ; inactif = surface + bordure.
function FilterPill({ label, emoji, active, onPress, colors, styles }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.pill, active && styles.pillActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Label
        weight={active ? 'bold' : undefined}
        color={active ? colors.textOnDark : colors.textBody}
        numberOfLines={1}
      >
        {emoji ? `${emoji} ` : ''}
        {label}
      </Label>
    </Pressable>
  );
}

export default function SessionsHistoryScreen({ navigation }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [rows, setRows] = useState(null); // null = pas encore chargé
  const [loading, setLoading] = useState(true); // chargement initial
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(null);
  const nextCursor = useRef(0); // offset de la prochaine page

  const [selectedTheme, setSelectedTheme] = useState('all');
  const [selectedLevel, setSelectedLevel] = useState('all');

  const loadPage = useCallback(async (initial) => {
    if (initial) {
      setLoading(true);
      setError(null);
      nextCursor.current = 0;
    } else {
      setLoadingMore(true);
    }
    try {
      const res = await usersApi.history({ limit: PAGE_SIZE, cursor: nextCursor.current });
      const batch = res?.data || [];
      setRows((prev) => (initial || !prev ? batch : [...prev, ...batch]));
      // « Charger plus » masqué dès qu'une page renvoie < 20 (dernière page).
      const more = res?.page?.has_more ?? batch.length === PAGE_SIZE;
      setHasMore(more);
      nextCursor.current =
        res?.page?.next_cursor != null
          ? Number(res.page.next_cursor)
          : nextCursor.current + batch.length;
    } catch (e) {
      setError(parseApiError(e).message);
      if (initial) setRows([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    loadPage(true);
  }, [loadPage]);

  // Cet écran vit dans MainStack, pas dans le navigateur d'onglets : `navigate('Play')`
  // remontait la pile sans jamais trouver la route (React Navigation ne descend pas
  // dans le navigateur enfant d'un frère) et le CTA « Jouer maintenant » ne faisait
  // rien. Voir le même correctif dans StatsScreen.
  const goPlay = useCallback(
    () => navigation.navigate('Tabs', { screen: 'Play' }),
    [navigation]
  );

  // Filtrage CÔTÉ CLIENT des parties chargées (l'API ne filtre pas thème/niveau).
  // Les modes chronométrés (blitz/marathon) ont thème/niveau null → exclus d'un
  // filtre spécifique, ce qui est correct.
  const filtered = useMemo(() => {
    let list = rows || [];
    if (selectedTheme !== 'all') list = list.filter((g) => g.theme === selectedTheme);
    if (selectedLevel !== 'all') list = list.filter((g) => g.level === selectedLevel);
    return list;
  }, [rows, selectedTheme, selectedLevel]);

  const filtering = selectedTheme !== 'all' || selectedLevel !== 'all';

  const renderFilters = () => (
    <View style={styles.filters}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillRow}
      >
        <FilterPill
          label={t('sessionsHistory.filterAll', 'Tous')}
          active={selectedTheme === 'all'}
          onPress={() => setSelectedTheme('all')}
          colors={colors}
          styles={styles}
        />
        {THEMES.map((th) => (
          <FilterPill
            key={th.key}
            label={themeLabel(th.key)}
            emoji={th.emoji}
            active={selectedTheme === th.key}
            onPress={() => setSelectedTheme(th.key)}
            colors={colors}
            styles={styles}
          />
        ))}
      </ScrollView>
      <View style={styles.levelRow}>
        <FilterPill
          label={t('sessionsHistory.filterAll', 'Tous')}
          active={selectedLevel === 'all'}
          onPress={() => setSelectedLevel('all')}
          colors={colors}
          styles={styles}
        />
        {LEVELS.map((lv) => (
          <FilterPill
            key={lv.key}
            label={levelLabel(lv.key)}
            active={selectedLevel === lv.key}
            onPress={() => setSelectedLevel(lv.key)}
            colors={colors}
            styles={styles}
          />
        ))}
      </View>
    </View>
  );

  const renderFooter = () => {
    if (!hasMore) return null;
    return (
      <View style={styles.footer}>
        <AppButton
          title={t('sessionsHistory.loadMore', 'Charger plus')}
          variant="ghost"
          size="md"
          loading={loadingMore}
          onPress={() => loadPage(false)}
        />
      </View>
    );
  };

  const renderBody = () => {
    // Chargement initial → squelettes.
    if (loading) {
      return (
        <View style={styles.skelList}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} width="100%" height={92} radius={radius.md} style={styles.skelCard} />
          ))}
        </View>
      );
    }

    // Échec réseau/serveur sans aucune donnée → erreur + réessayer.
    if (error && (!rows || rows.length === 0)) {
      return (
        <ErrorScreen
          inline
          dark={false}
          title={t('common.error')}
          message={error}
          onRetry={() => loadPage(true)}
          retryLabel={t('common.retry')}
        />
      );
    }

    // Filtre actif mais aucune partie ne correspond (des parties existent).
    if (filtered.length === 0 && rows && rows.length > 0 && filtering) {
      return (
        // L'action attendue ici n'est PAS de jouer (des parties existent, elles
        // sont juste masquées) mais de retirer le filtre qui les cache.
        //
        // Le filtre s'applique CÔTÉ CLIENT aux seules parties déjà chargées :
        // « aucun résultat » ne veut donc pas dire « aucune partie de ce thème »,
        // seulement « aucune dans les N premières ». Sans issue de chargement, le
        // filtre était un cul-de-sac (la liste — donc le pied « Charger plus » —
        // n'est pas rendue dans cette branche). On expose la suite tant qu'il
        // reste des pages, et on le dit dans le message.
        <EmptyState
          icon="🔍"
          title={t('sessionsHistory.noMatch', 'Aucune partie pour ce filtre')}
          message={hasMore ? t('sessionsHistory.noMatchMore') : undefined}
          ctaLabel={t('sessionsHistory.clearFilters', 'Retirer les filtres')}
          onCta={() => {
            setSelectedTheme('all');
            setSelectedLevel('all');
          }}
          secondaryLabel={hasMore ? t('sessionsHistory.loadMore', 'Charger plus') : undefined}
          secondaryLoading={loadingMore}
          onSecondary={hasMore ? () => loadPage(false) : undefined}
          style={styles.empty}
          titleStyle={styles.emptyTitle}
        />
      );
    }

    // Aucune partie jouée du tout → état vide + invite à jouer.
    if (filtered.length === 0) {
      return (
        <EmptyState
          icon="🎮"
          title={t('sessionsHistory.empty', 'Aucune partie jouée')}
          ctaLabel={t('sessionsHistory.playNow', 'Jouer maintenant')}
          onCta={goPlay}
          ctaSize="lg"
          ctaFullWidth
          style={styles.empty}
          titleStyle={styles.emptyTitle}
        />
      );
    }

    return (
      <FlatList
        data={filtered}
        keyExtractor={(g, i) => String(g.session_id || g.id || i)}
        renderItem={({ item }) => (
          <SessionCard
            game={item}
            style={styles.card}
            showIncomplete
            onPress={() => navigation.navigate('SessionDetail', { sessionId: item.session_id || item.id })}
          />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={renderFooter}
      />
    );
  };

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <StatusBar barStyle="light-content" />
      {/* En-tête sombre : retour + titre */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.back', 'Retour')}
        >
          <Icon icon={ArrowLeft} size={24} color={colors.textOnDark} />
        </Pressable>
        <Heading weight="bold" size="xl" color={colors.textOnDark}>{t('sessionsHistory.title', 'Historique')}</Heading>
      </View>

      <View style={styles.body}>
        {renderFilters()}
        <View style={styles.bodyList}>{renderBody()}</View>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.green900 },

    // En-tête sombre
    header: {
      backgroundColor: colors.green900,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.lg,
    },
    backBtn: {
      minWidth: MIN_TOUCH,
      minHeight: MIN_TOUCH,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Corps cream arrondi
    body: {
      flex: 1,
      backgroundColor: colors.cream,
      borderTopLeftRadius: radius.sheet,
      borderTopRightRadius: radius.sheet,
      marginTop: -spacing.sm,
      paddingTop: spacing.lg,
    },
    bodyList: { flex: 1 },

    // Filtres
    filters: { gap: spacing.sm, marginBottom: spacing.sm },
    pillRow: { gap: spacing.sm, paddingHorizontal: spacing.lg },
    levelRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
    pill: {
      minHeight: 36,
      paddingHorizontal: spacing.md,
      justifyContent: 'center',
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    pillActive: { backgroundColor: colors.green700, borderColor: colors.green700 },

    // Liste
    listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
    card: {},
    footer: { paddingTop: spacing.lg },

    // Squelettes
    skelList: { paddingHorizontal: spacing.lg, gap: spacing.sm },
    skelCard: {},

    // États vides — EmptyState partagé (titre en graisse Bold propre à l'écran).
    empty: { paddingHorizontal: spacing.lg },
    emptyTitle: { fontFamily: fonts.titleBold },
  });
