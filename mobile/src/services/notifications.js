// Notifications push — expo-notifications.
// Types attendus (API §14) : force_sync (data-only), tournament_start,
// challenge_received, level_up, tournament_result.

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { handleForceSync } from './sync';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Demande la permission et renvoie le token push Expo (ou null).
export async function registerForPushNotifications() {
  if (!Device.isDevice) return null;
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Creveton',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const tokenData = await Notifications.getExpoPushTokenAsync();
    return tokenData.data;
  } catch {
    return null;
  }
}

// Route un message data-only selon son type.
function routeData(data) {
  if (!data) return;
  if (data.type === 'force_sync') {
    const ids = Array.isArray(data.question_ids)
      ? data.question_ids
      : typeof data.question_ids === 'string'
        ? JSON.parse(data.question_ids)
        : [];
    handleForceSync(ids);
  }
  // tournament_start / challenge_received / level_up / tournament_result :
  // gérés par la navigation (voir handlers ci-dessous).
}

// Branche les écouteurs ; renvoie une fonction de nettoyage.
export function attachNotificationListeners({ onTap } = {}) {
  const received = Notifications.addNotificationReceivedListener((notif) => {
    routeData(notif?.request?.content?.data);
  });
  const responded = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response?.notification?.request?.content?.data;
      routeData(data);
      if (onTap) onTap(data);
    }
  );
  return () => {
    received.remove();
    responded.remove();
  };
}

export default {
  registerForPushNotifications,
  attachNotificationListeners,
};
