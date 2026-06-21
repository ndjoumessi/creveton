import { create } from 'zustand';

const LANG_KEY = 'creveton_admin_lang';

export const useUiStore = create((set) => ({
  lang: localStorage.getItem(LANG_KEY) || 'fr',
  setLang: (lang) => {
    localStorage.setItem(LANG_KEY, lang);
    set({ lang });
  },
}));
