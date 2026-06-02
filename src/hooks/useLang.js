import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

const STORAGE_KEY = 'lang';

export function useLang() {
  const { i18n } = useTranslation();

  const setLang = useCallback((lng) => {
    i18n.changeLanguage(lng);
    localStorage.setItem(STORAGE_KEY, lng);
    document.documentElement.dir = lng === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = lng;
  }, [i18n]);

  return { lang: i18n.language, setLang };
}
