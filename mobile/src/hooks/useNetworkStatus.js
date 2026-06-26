// Hook d'état réseau. Adossé au networkStore (source unique alimentée par le
// listener NetInfo de App.js) pour éviter plusieurs abonnements concurrents et
// des états divergents. Renvoie { isOnline, isInternetReachable }.

import { useNetworkStore } from '../store/networkStore';

export const useNetworkStatus = () => {
  const isOnline = useNetworkStore((s) => s.isOnline);
  const isInternetReachable = useNetworkStore((s) => s.isInternetReachable);
  // Hors-ligne « effectif » : pas de connexion OU connecté mais Internet
  // explicitement injoignable (portail captif / Wi-Fi sans Internet). `null` =
  // inconnu → on le traite comme joignable (pas de faux hors-ligne).
  const isOffline = !isOnline || isInternetReachable === false;
  return { isOnline, isInternetReachable, isOffline };
};

export default useNetworkStatus;
