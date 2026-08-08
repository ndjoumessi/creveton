// useNow — horloge qui avance, pour tout affichage relatif (décomptes, « il y a
// 3 min »). Sans elle, `Date.now()` est lu une fois au rendu et le texte se fige :
// un tournoi affichait « commence dans 2h 14min » indéfiniment, y compris après
// son démarrage.
//
// Cadence = granularité de l'affichage, pas plus fin. Le décompte des tournois
// s'exprime en minutes → un tic par minute suffit ; tiquer à la seconde
// réveillerait la liste 60 fois pour rien.
//
// `enabled` coupe le timer quand rien à l'écran ne dépend du temps (aucun
// tournoi imminent) : pas de réveil périodique inutile, pas de re-rendu de liste.

import { useEffect, useState } from 'react';

export function useNow(intervalMs = 60000, enabled = true) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return undefined;
    // Resynchronise à l'activation : le composant a pu rester monté (onglet en
    // arrière-plan) pendant que l'horloge dérivait.
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);

  return now;
}

export default useNow;
