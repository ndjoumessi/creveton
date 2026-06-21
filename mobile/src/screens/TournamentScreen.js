// TournamentScreen — liste des tournois (gratuits au lancement, le payant est
// derrière le flag tournaments.paid.enabled — API §8).

import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import {
  Screen,
  Title,
  Heading,
  Body,
  Label,
  Card,
  Badge,
  Button,
  EmptyState,
  Loader,
} from '../components';
import { tournaments as tournamentsApi } from '../services/endpoints';
import { parseApiError } from '../services/api';
import { colors, fonts, fontSizes, spacing } from '../constants/theme';
import { formatDateTime, formatFcfa, themeLabel } from '../utils/format';

const STATUS_TONE = {
  open: 'green',
  running: 'gold',
  scheduled: 'light',
  closed: 'light',
  paid: 'light',
  cancelled: 'red',
};
const STATUS_LABEL = {
  open: 'Ouvert',
  running: 'En cours',
  scheduled: 'À venir',
  closed: 'Terminé',
  paid: 'Payé',
  cancelled: 'Annulé',
};

export default function TournamentScreen() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const resp = await tournamentsApi.list({ status: 'open' });
      setItems(resp.data || []);
      setError(null);
    } catch (e) {
      setError(parseApiError(e).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  if (loading) return <Loader dark message="Chargement des tournois…" />;

  return (
    <Screen dark padded={false}>
      <View style={styles.header}>
        <Title color={colors.cream}>🏆 Tournois</Title>
        <Body color={colors.textOnDarkMuted}>
          Gratuits au lancement — les tournois payants arrivent bientôt.
        </Body>
      </View>
      <FlatList
        data={items}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={
          <EmptyState
            dark
            emoji="🏟️"
            title="Aucun tournoi ouvert"
            message={error || 'Reviens bientôt : de nouveaux tournois arrivent.'}
          />
        }
        renderItem={({ item: t }) => {
          const free = t.entry_fee === 0;
          const full = t.registered_players >= t.max_players;
          const fillPct = t.max_players
            ? Math.round((t.registered_players / t.max_players) * 100)
            : 0;
          return (
            <Card style={styles.card}>
              <View style={styles.cardTop}>
                <Heading style={styles.flex} numberOfLines={1}>
                  {t.name}
                </Heading>
                <Badge
                  label={STATUS_LABEL[t.status] || t.status}
                  tone={STATUS_TONE[t.status] || 'light'}
                />
              </View>

              <View style={styles.metaRow}>
                <Label>{themeLabel(t.theme)}</Label>
                <Label>· {t.format?.questions ?? '—'} questions</Label>
                <Label>· {formatDateTime(t.starts_at)}</Label>
              </View>

              <View style={styles.fillTrack}>
                <View style={[styles.fillBar, { width: `${fillPct}%` }]} />
              </View>
              <Label style={styles.fillLabel}>
                {t.registered_players}/{t.max_players} inscrits
              </Label>

              <View style={styles.cardBottom}>
                <View>
                  <Label>Frais d'entrée</Label>
                  <Body style={styles.fee}>
                    {free ? 'Gratuit' : formatFcfa(t.entry_fee)}
                  </Body>
                </View>
                {!free ? (
                  <View style={styles.prize}>
                    <Label>Cagnotte</Label>
                    <Body style={styles.fee}>{formatFcfa(t.prize_pool)}</Body>
                  </View>
                ) : null}
              </View>

              <Button
                title={full ? 'Complet' : free ? 'Rejoindre' : 'Bientôt disponible'}
                variant={free && !full ? 'primary' : 'ghost'}
                disabled={full || !free}
                onPress={() => {}}
                style={styles.join}
              />
            </Card>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { padding: spacing.lg, gap: spacing.xs },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  card: { gap: spacing.sm },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  fillTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  fillBar: { height: '100%', backgroundColor: colors.green500, borderRadius: 3 },
  fillLabel: { marginTop: 2 },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  prize: { alignItems: 'flex-end' },
  fee: { fontFamily: fonts.titleSemiBold, fontSize: fontSizes.md },
  join: { marginTop: spacing.sm },
});
