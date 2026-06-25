// Glue réseau (rendu null) — monté DANS le ToastProvider :
//  1. abonne l'UNIQUE listener NetInfo → networkStore
//  2. au retour en ligne, rejoue les parties en file (offlineQueue) et notifie
//
// Source unique de l'état réseau : tout le reste lit networkStore / useNetworkStatus.

import { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useTranslation } from 'react-i18next';
import { useNetworkStore } from '../store/networkStore';
import { useOfflineQueue } from '../store/offlineQueue';
import { useToast } from './Toast';

export default function NetworkWatcher() {
  const { t } = useTranslation();
  const toast = useToast();
  const isOnline = useNetworkStore((s) => s.isOnline);
  const wasOnline = useRef(isOnline);

  // Abonnement NetInfo unique (+ lecture initiale).
  useEffect(() => {
    const apply = (state) => useNetworkStore.getState().setNetworkState(state);
    NetInfo.fetch().then(apply).catch(() => {});
    const unsubscribe = NetInfo.addEventListener(apply);
    return unsubscribe;
  }, []);

  // Auto-sync des parties en attente au retour en ligne (ou au montage si déjà
  // en ligne avec des parties en file).
  useEffect(() => {
    const cameOnline = isOnline && !wasOnline.current;
    const onlineWithPending = isOnline && useOfflineQueue.getState().pendingSessions.length > 0;
    wasOnline.current = isOnline;
    if (!isOnline || (!cameOnline && !onlineWithPending)) return;
    const { pendingSessions, syncPending } = useOfflineQueue.getState();
    if (pendingSessions.length === 0) return;
    syncPending().then(({ synced }) => {
      if (synced > 0) {
        toast.show({ type: 'success', message: t('offline.syncedSessions', { count: synced }) });
      }
    });
  }, [isOnline, toast, t]);

  return null;
}
