import i18next from 'i18next';
import he from './he.json';
import en from './en.json';

const savedLang = localStorage.getItem('lang') ?? 'he';

i18next.init({
  lng: savedLang,
  fallbackLng: 'he',
  resources: {
    he: { translation: he },
    en: { translation: en },
  },
  interpolation: { escapeValue: false },
});

export default i18next;
