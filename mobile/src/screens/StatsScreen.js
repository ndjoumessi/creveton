// StatsScreen — classement global (scopes) + historique des parties (API §7/§10).

import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, Pressable, FlatList } from 'react-native';
import {
  Screen,
  Title,
  Heading,
  Body,
  Label,
  Card,
  Badge,
  EmptyState,
} from '../components';
import { useLeaderboardStore } from '../store/leaderboardStore';
import { users as usersApi } from '../services/endpoints';
import { colors, fonts, fontSizes, spacing } from '../constants/theme';
import { formatDateTime, themeEmoji, themeLabel, levelLabel } from '../utils/format';

const SCOPES = [
  { key: 'global', label: 'Global' },
  { key: 'weekly', label: 'Semaine' },
  { key: 'monthly', label: 'Mois' },
];

const TABS = [
  { key: 'leaderboard', label: 'Classement' },
  { key: 'history', label: 'Historique' },
];

export default function StatsScreen() {
  const [tab, setTab] = useState('leaderboard');
  const scope = useLeaderboardStore((s) => s.scope);
  const data = useLeaderboardStore((s) => s.data);
  const me = useLeaderboardStore((s) => s.me);
  const loading = useLeaderboardStore((s) => s.loading);
  const load = useLeaderboardStore((s) => s.load);
  const loadMore = useLeaderboardStore((s) => s.loadMore);

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    load({ scope: 'global' });
  }, [load]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const resp = await usersApi.history({ limit: 20 });
      setHistory(resp.data || []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'history') loadHistory();
  }, [tab, loadHistory]);

  return (
    <Screen dark padded={false}>
      <View style={styles.header}>
        <Title color={colors.cream}>📊 Statistiques</Title>
      </View>

      {/* Onglets Classement / Historique */}
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tab, tab === t.key && styles.tabActive]}
          >
            <Body
              style={styles.tabText}
              color={tab === t.key ? colors.gold400 : colors.textOnDarkMuted}
            >
              {t.label}
            </Body>
          </Pressable>
        ))}
      </View>

      {tab === 'leaderboard' ? (
        <>
          {/* Scopes */}
          <View style={styles.scopes}>
            {SCOPES.map((s) => (
              <Pressable
                key={s.key}
                onPress={() => load({ scope: s.key })}
                style={[styles.scope, scope === s.key && styles.scopeActive]}
              >
                <Label
                  color={scope === s.key ? colors.green900 : colors.textOnDarkMuted}
                  style={styles.scopeText}
                >
                  {s.label}
                </Label>
              </Pressable>
            ))}
          </View>

          <FlatList
            data={data}
            keyExtractor={(row, i) => row.user_id || String(i)}
            contentContainerStyle={styles.list}
            onEndReached={loadMore}
            onEndReachedThreshold={0.4}
            refreshing={loading}
            onRefresh={() => load({ scope })}
            ListHeaderComponent={
              me ? (
                <Card style={styles.meCard}>
                  <View style={styles.row}>
                    <Body style={styles.rank} color={colors.gold500}>
                      #{me.rank}
                    </Body>
                    <Body style={styles.flex}>Ton rang · Niv. {me.level}</Body>
                    <Body style={styles.scoreVal}>{me.score}</Body>
                  </View>
                </Card>
              ) : null
            }
            ListEmptyComponent={
              !loading ? (
                <EmptyState dark emoji="📉" title="Classement vide" message="Joue une partie pour apparaître ici." />
              ) : null
            }
            renderItem={({ item: row, index }) => (
              <Card style={styles.rowCard}>
                <View style={styles.row}>
                  <Body style={styles.rank}>{medal(row.rank ?? index + 1)}</Body>
                  <View style={styles.flex}>
                    <Body numberOfLines={1}>{row.name}</Body>
                    <Label>{row.ville || '—'} · Niv. {row.level}</Label>
                  </View>
                  <Body style={styles.scoreVal}>{row.score}</Body>
                </View>
              </Card>
            )}
          />
        </>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(h, i) => h.session_id || String(i)}
          contentContainerStyle={styles.list}
          refreshing={historyLoading}
          onRefresh={loadHistory}
          ListEmptyComponent={
            !historyLoading ? (
              <EmptyState dark emoji="🕹️" title="Aucune partie" message="Ton historique apparaîtra ici après ta première partie." />
            ) : null
          }
          renderItem={({ item: h }) => {
            const pct = h.total_questions
              ? Math.round((h.correct_count / h.total_questions) * 100)
              : 0;
            return (
              <Card style={styles.rowCard}>
                <View style={styles.row}>
                  <Body style={styles.histEmoji}>{themeEmoji(h.theme)}</Body>
                  <View style={styles.flex}>
                    <Body>{themeLabel(h.theme)} · {levelLabel(h.level)}</Body>
                    <Label>
                      {h.correct_count}/{h.total_questions} ({pct}%) ·{' '}
                      {formatDateTime(h.played_at)}
                    </Label>
                  </View>
                  <View style={styles.histRight}>
                    <Body style={styles.scoreVal}>{h.score}</Body>
                    <Label color={colors.green300}>+{h.xp_earned} XP</Label>
                  </View>
                </View>
              </Card>
            );
          }}
        />
      )}
    </Screen>
  );
}

function medal(rank) {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  tabs: { flexDirection: 'row', paddingHorizontal: spacing.lg, gap: spacing.lg },
  tab: { paddingVertical: spacing.sm, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.gold400 },
  tabText: { fontFamily: fonts.titleSemiBold },
  scopes: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  scope: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    backgroundColor: colors.cardOnDark,
  },
  scopeActive: { backgroundColor: colors.gold400 },
  scopeText: { fontFamily: fonts.bodyMedium },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm },
  meCard: { backgroundColor: 'rgba(212,160,23,0.15)', marginBottom: spacing.sm },
  rowCard: {},
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rank: { width: 36, fontFamily: fonts.titleBold, fontSize: fontSizes.md },
  scoreVal: { fontFamily: fonts.titleSemiBold, fontSize: fontSizes.md },
  histEmoji: { fontSize: fontSizes.xxl },
  histRight: { alignItems: 'flex-end' },
});
