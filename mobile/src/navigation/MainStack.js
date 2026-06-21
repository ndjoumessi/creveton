// Pile principale (authentifié) : BottomTabs + écrans/modals empilés
// (jeu, résultats, challenge, détail tournoi).

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import BottomTabs from './BottomTabs';
import QuizScreen from '../screens/QuizScreen';
import ResultsScreen from '../screens/ResultsScreen';
import ChallengeScreen from '../screens/ChallengeScreen';

const Stack = createNativeStackNavigator();

export default function MainStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={BottomTabs} />
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
    </Stack.Navigator>
  );
}
