// Badge discret de statut de synchronisation des questions (delta sync).

import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Label } from './Text';
import { colors, radius, spacing } from '../constants/theme';
import { useQuestionsStore } from '../store/questionsStore';
import { timeAgo } from '../utils/format';

export default function SyncBadge() {
  const status = useQuestionsStore((s) => s.status);
  const lastSyncAt = useQuestionsStore((s) => s.lastSyncAt);
  const count = useQuestionsStore((s) => s.count);

  let text = `${count} questions`;
  if (status === 'syncing') text = 'Synchronisation…';
  else if (status === 'error') text = 'Hors ligne';
  else if (lastSyncAt) text = `À jour · ${timeAgo(lastSyncAt)}`;

  return (
    <View style={styles.container}>
      {status === 'syncing' ? (
        <ActivityIndicator size="small" color={colors.gold400} />
      ) : (
        <View
          style={[
            styles.dot,
            { backgroundColor: status === 'error' ? colors.red400 : colors.green300 },
          ]}
        />
      )}
      <Label color={colors.textOnDarkMuted}>{text}</Label>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
