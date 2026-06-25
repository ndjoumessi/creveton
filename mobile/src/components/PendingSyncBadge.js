// Indicateur « parties en attente de synchronisation ». Visible uniquement s'il
// reste des parties en file (jouées hors ligne). Hors ligne → 📶 (sauvegardées),
// en ligne → ⏳ (sur le point d'être synchronisées). Disparaît une fois la file vide.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Clock, WifiOff } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import Icon from './Icon';
import { useOfflineQueue } from '../store/offlineQueue';
import { useNetworkStore } from '../store/networkStore';
import { colors, fonts } from '../constants/theme';

export default function PendingSyncBadge({ style }) {
  const { t } = useTranslation();
  const count = useOfflineQueue((s) => s.pendingSessions.length);
  const isOnline = useNetworkStore((s) => s.isOnline);
  if (count === 0) return null;
  return (
    <View style={[styles.row, style]}>
      <Icon icon={isOnline ? Clock : WifiOff} size={12} color={colors.gold500} />
      <Text style={styles.text} numberOfLines={1}>
        {t('offline.pendingSessions', { count })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  text: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.gold500 },
});
