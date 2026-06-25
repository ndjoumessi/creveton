// Indicateur « parties en attente de synchronisation ». Visible uniquement s'il
// reste des parties en file (jouées hors ligne). Hors ligne → 📶 (sauvegardées),
// en ligne → ⏳ (sur le point d'être synchronisées). Disparaît une fois la file vide.

import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useOfflineQueue } from '../store/offlineQueue';
import { useNetworkStore } from '../store/networkStore';
import { colors, fonts } from '../constants/theme';

export default function PendingSyncBadge({ style }) {
  const { t } = useTranslation();
  const count = useOfflineQueue((s) => s.pendingSessions.length);
  const isOnline = useNetworkStore((s) => s.isOnline);
  if (count === 0) return null;
  const icon = isOnline ? '⏳' : '📶';
  return (
    <Text style={[styles.text, style]} numberOfLines={1}>
      {icon} {t('offline.pendingSessions', { count })}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.gold500 },
});
