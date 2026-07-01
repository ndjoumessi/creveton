// ChallengeScreen — redirection (filet de sécurité).
//
// L'ancien écran « Challenge » (singulier) était un doublon figé du hub de défis :
// formulaire de création, chips thème/niveau et sélection d'adversaire existent tous
// — en mieux — dans ChallengesScreen (pluriel, onglet des Tabs). Ses seules parties
// propres (sections « en cours »/« récents » vides + saisie d'ID brute) étaient mortes.
//
// On garde donc la route enregistrée mais on redirige au montage vers le vrai hub, en
// ouvrant directement son bottom sheet « Nouveau challenge » (param openCreate).
// `replace` (et non push) pour que le bouton retour ne revienne pas sur cet écran mort.

import React, { useEffect } from 'react';
import { LoadingScreen } from '../components';

export default function ChallengeScreen({ navigation }) {
  useEffect(() => {
    // « Challenges » est un onglet imbriqué sous le navigateur « Tabs » ; on passe donc
    // les params via la forme imbriquée (comme ResultsScreen/usePushNotifications).
    navigation.replace('Tabs', {
      screen: 'Challenges',
      params: { openCreate: true },
    });
  }, [navigation]);

  // Pas de flash de contenu pendant la redirection.
  return <LoadingScreen />;
}
