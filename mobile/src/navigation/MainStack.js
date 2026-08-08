// Pile principale (authentifié) : BottomTabs + écrans/modals empilés
// (jeu, résultats, challenge, détail tournoi).

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import BottomTabs from './BottomTabs';
import QuizScreen from '../screens/QuizScreen';
import ResultsScreen from '../screens/ResultsScreen';
import ChallengeScreen from '../screens/ChallengeScreen';
import TournamentLiveScreen from '../screens/TournamentLiveScreen';
import SessionsHistoryScreen from '../screens/SessionsHistoryScreen';
import SessionDetailScreen from '../screens/SessionDetailScreen';
import ChangePasswordScreen from '../screens/ChangePasswordScreen';
import ChallengesScreen from '../screens/ChallengesScreen';
import StatsScreen from '../screens/StatsScreen';

const Stack = createNativeStackNavigator();

export default function MainStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={BottomTabs} />
      {/* Historique complet des parties — atteignable depuis l'accueil
          (« Dernières parties → Voir tout »). */}
      <Stack.Screen
        name="SessionsHistory"
        component={SessionsHistoryScreen}
        options={{ animation: 'slide_from_right' }}
      />
      {/* Détail d'une partie — atteignable en tapant une SessionCard
          (Accueil, Stats, Historique). */}
      <Stack.Screen
        name="SessionDetail"
        component={SessionDetailScreen}
        options={{ animation: 'slide_from_right' }}
      />
      {/* Défis 1v1 — ANCIEN onglet, passé en pile (08-2026, 6 onglets → 4).
          Atteignable : « Défier un ami » (Jouer), fin de duel (Résultats),
          notification push, et le stub `Challenge`. */}
      <Stack.Screen
        name="Challenges"
        component={ChallengesScreen}
        options={{ animation: 'slide_from_right' }}
      />
      {/* Statistiques & classement — ANCIEN onglet, passé en pile. Atteignable :
          en-tête « Mes stats » de l'Accueil, et Profil › Mes statistiques. */}
      <Stack.Screen
        name="Stats"
        component={StatsScreen}
        options={{ animation: 'slide_from_right' }}
      />
      {/* Changement de mot de passe — atteignable depuis Profil › Sécurité. */}
      <Stack.Screen
        name="ChangePassword"
        component={ChangePasswordScreen}
        options={{ animation: 'slide_from_right' }}
      />
      {/* Le quiz prend tout l'écran, pas de retour gestuel pour ne pas
          quitter une partie par accident. */}
      <Stack.Screen
        name="Quiz"
        component={QuizScreen}
        options={{ gestureEnabled: false, animation: 'fade' }}
      />
      <Stack.Screen
        name="Results"
        component={ResultsScreen}
        options={{ gestureEnabled: false, animation: 'fade' }}
      />
      <Stack.Screen
        name="Challenge"
        component={ChallengeScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      {/* Manche de tournoi temps réel — plein écran, pas de retour gestuel pour
          ne pas quitter une manche en cours par accident. */}
      <Stack.Screen
        name="TournamentLive"
        component={TournamentLiveScreen}
        options={{ gestureEnabled: false, animation: 'fade' }}
      />
    </Stack.Navigator>
  );
}
