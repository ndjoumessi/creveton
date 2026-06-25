// Hook d'état réseau. Adossé au networkStore (source unique alimentée par le
// listener NetInfo de App.js) pour éviter plusieurs abonnements concurrents et
// des états divergents. Renvoie { isOnline, isInternetReachable }.

import { useNetworkStore } from '../store/networkStore';

export const useNetworkStatus = () => {
  const isOnline = useNetworkStore((s) => s.isOnline);
  const isInternetReachable = useNetworkStore((s) => s.isInternetReachable);
  return { isOnline, isInternetReachable };
};

export default useNetworkStatus;
