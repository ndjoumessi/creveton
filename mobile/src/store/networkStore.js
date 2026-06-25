// État réseau global (zustand) — alimenté par un UNIQUE listener NetInfo monté
// au démarrage (cf. NetworkWatcher dans App.js). Les écrans/composants lisent
// `isOnline` pour la dégradation gracieuse (bannière, boutons désactivés…).
//
// Par défaut on suppose EN LIGNE : tant que NetInfo n'a pas répondu, on ne
// bloque pas l'UI (évite un faux « hors-ligne » au lancement).

import { create } from 'zustand';

export const useNetworkStore = create((set) => ({
  isOnline: true,
  isInternetReachable: true,
  // Reçoit un NetInfoState. `isInternetReachable` peut être null (inconnu) →
  // on le traite comme joignable pour ne pas bloquer l'app par excès de prudence.
  setNetworkState: (state) => set({
    isOnline: state?.isConnected ?? true,
    isInternetReachable: state?.isInternetReachable ?? true,
  }),
}));

export default useNetworkStore;
