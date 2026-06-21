import { create } from 'zustand';
import i18n from '../i18n';

const LANG_KEY = 'creveton_admin_lang';
const MAINT_KEY = 'creveton_admin_maintenance';

export const useUiStore = create((set) => ({
  lang: localStorage.getItem(LANG_KEY) || 'fr',
  setLang: (lang) => {
    localStorage.setItem(LANG_KEY, lang);
    i18n.changeLanguage(lang);
    set({ lang });
  },
  // Mode maintenance : bannière rouge globale + flag persisté (paramètres).
  maintenance: localStorage.getItem(MAINT_KEY) === 'true',
  setMaintenance: (on) => {
    localStorage.setItem(MAINT_KEY, String(on));
    set({ maintenance: on });
  },
}));
