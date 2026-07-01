// SessionsHistoryScreen — historique complet et paginé des parties du joueur.
// Accessible depuis l'accueil (« Dernières parties → Voir tout »). Filtres thème
// et niveau appliqués CÔTÉ CLIENT (l'API /users/me/history ne filtre pas) ;
// pagination par curseur (offset), 20 parties par page, bouton « Charger plus »
// (pas de scroll infini). Chaque partie est rendue avec le composant SessionCard.

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
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
import { AppButton, Skeleton, SessionCard, ErrorScreen } from '../components';
import { users as usersApi } from '../services/endpoints';
import { parseApiError } from '../services/api';
import { THEMES, LEVELS } from '../constants/config';
import { fonts, fontSizes, radius, spacing, MIN_TOUCH } from '../constants/theme';
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
      <Text style={[styles.pillText, active && styles.pillTextActive]} numberOfLines={1}>
        {emoji ? `${emoji} ` : ''}
        {label}
      </Text>
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
            label={th.label}
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
            label={lv.label}
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
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🔍</Text>
          <Text style={styles.emptyTitle}>{t('sessionsHistory.noMatch', 'Aucune partie pour ce filtre')}</Text>
        </View>
      );
    }

    // Aucune partie jouée du tout → état vide + invite à jouer.
    if (filtered.length === 0) {
      return (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🎮</Text>
          <Text style={styles.emptyTitle}>{t('sessionsHistory.empty', 'Aucune partie jouée')}</Text>
          <AppButton
            title={t('sessionsHistory.playNow', 'Jouer maintenant')}
            variant="primary"
            size="lg"
            onPress={() => navigation.navigate('Play')}
            style={styles.emptyBtn}
          />
        </View>
      );
    }

    return (
      <FlatList
        data={filtered}
        keyExtractor={(g, i) => String(g.session_id || g.id || i)}
        renderItem={({ item }) => <SessionCard game={item} style={styles.card} />}
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
        <Text style={styles.headerTitle}>{t('sessionsHistory.title', 'Historique')}</Text>
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
    headerTitle: {
      fontFamily: fonts.titleBold,
      fontSize: fontSizes.xl,
      color: colors.textOnDark,
    },

    // Corps cream arrondi
    body: {
      flex: 1,
      backgroundColor: colors.cream,
      borderTopLeftRadius: radius.xxl,
      borderTopRightRadius: radius.xxl,
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
    pillText: {
      fontFamily: fonts.bodyMedium,
      fontSize: fontSizes.sm,
      color: colors.textBody,
    },
    pillTextActive: { fontFamily: fonts.bodyBold, color: colors.textOnDark },

    // Liste
    listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
    card: {},
    footer: { paddingTop: spacing.lg },

    // Squelettes
    skelList: { paddingHorizontal: spacing.lg, gap: spacing.sm },
    skelCard: {},

    // États vides
    empty: { alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
    emptyEmoji: { fontSize: 56, marginBottom: spacing.md },
    emptyTitle: {
      fontFamily: fonts.titleBold,
      fontSize: fontSizes.lg,
      color: colors.textDark,
      textAlign: 'center',
    },
    emptyBtn: { marginTop: spacing.xl, alignSelf: 'stretch' },
  });
