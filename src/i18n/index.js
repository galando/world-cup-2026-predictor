import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import he from './he.json';
import en from './en.json';
import nl from './nl.json';

const savedLang = (() => {
  try {
    return localStorage.getItem('lang') ?? 'he';
  } catch {
    return 'he';
  }
})();

i18next
  .use(initReactI18next)
  .init({
    lng: savedLang,
    fallbackLng: 'he',
    resources: {
      he: { translation: he },
      en: { translation: en },
      nl: { translation: nl },
    },
    interpolation: { escapeValue: false },
  });

export default i18next;
