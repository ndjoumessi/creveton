import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from './fr.json';
import en from './en.json';

const savedLang = localStorage.getItem('creveton_admin_lang') || 'fr';

i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr }, en: { translation: en } },
  lng: savedLang,
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
});

// `<html lang>` suit la langue de l'interface.
//
// Il était figé sur `en` dans index.html et personne ne le touchait, alors que
// la console démarre en français : un lecteur d'écran appliquait la phonétique
// anglaise à tout le contenu (WCAG 3.1.1 « Langue de la page »). C'est aussi ce
// que lisent la césure typographique du navigateur et les moteurs de traduction.
const syncHtmlLang = (lng) => {
  document.documentElement.setAttribute('lang', lng);
};
syncHtmlLang(i18n.language);
i18n.on('languageChanged', syncHtmlLang);

export default i18n;
