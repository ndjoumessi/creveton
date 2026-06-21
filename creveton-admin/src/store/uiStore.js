import { create } from 'zustand';

const LANG_KEY = 'creveton_admin_lang';

export const useUiStore = create((set) => ({
  sidebarCollapsed: false,
  lang: localStorage.getItem(LANG_KEY) || 'fr',

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setLang: (lang) => {
    localStorage.setItem(LANG_KEY, lang);
    set({ lang });
  },
}));
