import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Préférence système (utilisée seulement si aucun choix n'a été sauvegardé). */
function systemPrefersDark() {
  return typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Thème de la console (clair / sombre « Cockpit Émeraude Nuit »).
 * Persiste sous 'creveton_admin_theme' ; au premier lancement, suit la préférence
 * système. L'application effective du `data-theme` se fait dans App.jsx + un script
 * inline dans index.html (anti-flash au démarrage).
 */
const useThemeStore = create(
  persist(
    (set) => ({
      isDark: systemPrefersDark(),
      toggle: () => set((s) => ({ isDark: !s.isDark })),
      setDark: (v) => set({ isDark: !!v }),
    }),
    { name: 'creveton_admin_theme' },
  ),
);

export default useThemeStore;
