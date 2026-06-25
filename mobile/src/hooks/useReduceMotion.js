import { useState, useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';

// Respecte la préférence système « Réduire les animations » (iOS : Réglages →
// Accessibilité → Mouvement ; Android : Accessibilité → Supprimer les animations).
// Les écrans/composants lisent ce flag pour rendre l'état final directement
// (durée 0) au lieu d'animer. Met à jour à chaud si l'utilisateur bascule le réglage.
export const useReduceMotion = () => {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduceMotion(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  return reduceMotion;
};

export default useReduceMotion;
