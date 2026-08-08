// Point d'entrée de l'app Creveton.
// - Charge les polices (Outfit pour les titres / Inter pour le corps)
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
  Outfit_800ExtraBold,
  Outfit_900Black,
} from '@expo-google-fonts/outfit';
// Corps de texte : Inter (08-2026). La console admin a fait le même chemin en
// août (commit b6d6a77, « lisibilité — Inter en corps ») : une police à fort
// caractère fatigue en texte courant. Les TITRES restent en Outfit — c'est là
// que vit la personnalité de la marque.
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

import * as Sentry from '@sentry/react-native';

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
import OfflineBanner from './src/components/OfflineBanner';
import NetworkWatcher from './src/components/NetworkWatcher';
import { colors } from './src/constants/theme';

// Sentry (crash/erreur analytics) — le plus tôt possible dans le cycle de vie.
// INERTE tant qu'aucun DSN n'est fourni : sans EXPO_PUBLIC_SENTRY_DSN ou en dev
// (__DEV__), aucun événement n'est envoyé. DSN et environnement viennent de
// variables d'env (EXPO_PUBLIC_*), jamais en dur. Le compte Sentry n'existe pas
// encore ; il ne manque plus que la clé.
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
Sentry.init({
  dsn: SENTRY_DSN, // undefined ⇒ SDK no-op (rien n'est envoyé)
  enabled: !__DEV__ && !!SENTRY_DSN,
  environment: process.env.EXPO_PUBLIC_SENTRY_ENV || 'production',
  tracesSampleRate: 0, // tracing off au départ (capture d'erreurs uniquement)
});

// Garde le splash natif visible pendant l'initialisation.
SplashScreen.preventAutoHideAsync().catch(() => {});

function App() {
  const [ready, setReady] = useState(false);

  // Notifications push : enregistrement du token (après auth) + deep link sur tap.
  usePushNotifications();

  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    // Poids référencés par theme.js (titleExtraBold/titleBlack, weight extrabold/black
    // des variants Text.js) — étaient absents ici → rendu en police système (fallback).
    Outfit_800ExtraBold,
    Outfit_900Black,
    Inter_400Regular,
    Inter_500Medium,
    // bodySemiBold (weight="semibold" des variants) — doit être chargé, sinon fallback.
    Inter_600SemiBold,
    Inter_700Bold,
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
        <NetworkWatcher />
        <View
          style={{ flex: 1, backgroundColor: colors.cream }}
          onLayout={onLayoutRootView}
        >
          <AppNavigator />
          <OfflineBanner />
        </View>
      </ToastProvider>
    </SafeAreaProvider>
  );
}

// Sentry.wrap : capture les erreurs de rendu React + touch/nav (no-op sans DSN).
export default Sentry.wrap(App);
