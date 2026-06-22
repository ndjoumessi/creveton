// Point d'entrée de l'app Creveton.
// - Charge les polices (Outfit / Space Grotesk)
// - Maintient le splash natif jusqu'à ce que tout soit prêt
// - Initialise SQLite + delta sync (non bloquant) + notifications push
// - Monte le SafeAreaProvider + AppNavigator

import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
} from '@expo-google-fonts/outfit';
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';

import './src/i18n';
import AppNavigator from './src/navigation/AppNavigator';
import { ToastProvider } from './src/components';
import { initDatabase } from './src/services/database';
import {
  runSync,
  startSyncLifecycle,
  stopSyncLifecycle,
} from './src/services/sync';
import { usePushNotifications } from './src/hooks/usePushNotifications';
import { colors } from './src/constants/theme';

// Garde le splash natif visible pendant l'initialisation.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [ready, setReady] = useState(false);

  // Notifications push : enregistrement du token (après auth) + deep link sur tap.
  usePushNotifications();

  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });

  // Init des services au démarrage (DB + premier sync), non bloquant. Les
  // notifications push sont gérées par usePushNotifications().
  useEffect(() => {
    (async () => {
      try {
        await initDatabase();
      } catch {
        /* la DB se réinitialisera au prochain sync */
      }
      // Sync en arrière-plan — ne bloque pas l'affichage.
      runSync();
      startSyncLifecycle();
      setReady(true);
    })();
    return () => {
      stopSyncLifecycle();
    };
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded && ready) {
      await SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, ready]);

  if (!fontsLoaded || !ready) {
    return null; // splash natif encore visible
  }

  return (
    <SafeAreaProvider>
      <ToastProvider>
        <View
          style={{ flex: 1, backgroundColor: colors.cream }}
          onLayout={onLayoutRootView}
        >
          <AppNavigator />
        </View>
      </ToastProvider>
    </SafeAreaProvider>
  );
}
