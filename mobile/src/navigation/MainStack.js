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
import ChangePasswordScreen from '../screens/ChangePasswordScreen';

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
