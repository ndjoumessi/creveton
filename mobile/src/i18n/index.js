/* eslint-disable import/no-named-as-default-member -- i18next's default export intentionally exposes use()/changeLanguage() */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import fr from './fr.json';
import en from './en.json';

export const LANG_KEY = 'creveton_lang';

const deviceLang = () => {
  const locale = Localization.getLocales?.()[0]?.languageCode || 'fr';
  return String(locale).startsWith('en') ? 'en' : 'fr';
};

// Initialise synchroniquement (langue système par défaut) pour que `t()` soit
// utilisable dès le premier rendu, puis aligne sur la langue persistée.
i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr }, en: { translation: en } },
  lng: deviceLang(),
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
  compatibilityJSON: 'v4',
});

// Applique la langue sauvegardée (AsyncStorage) si elle existe.
export const hydrateLanguage = async () => {
  try {
    const saved = await AsyncStorage.getItem(LANG_KEY);
    const lng = saved || deviceLang();
    if (lng !== i18n.language) await i18n.changeLanguage(lng);
  } catch {
    /* garde la langue système */
  }
};

// Change de langue + persiste. Priorité : appel explicite > storage > système.
export const setLanguage = async (lang) => {
  await i18n.changeLanguage(lang);
  try {
    await AsyncStorage.setItem(LANG_KEY, lang);
  } catch {
    /* persistance best-effort */
  }
};

hydrateLanguage();

export default i18n;
