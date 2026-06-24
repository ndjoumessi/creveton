// themeStore — préférence de thème (clair/sombre), persistée via AsyncStorage.
// isDark pilote la palette retournée par useTheme(). toggleTheme bascule.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const useThemeStore = create(
  persist(
    (set, get) => ({
      isDark: false,
      toggleTheme: () => set({ isDark: !get().isDark }),
      setTheme: (isDark) => set({ isDark }),
    }),
    {
      name: 'creveton-theme',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
