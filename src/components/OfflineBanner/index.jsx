import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Ico from '../Ico';
import styles from './styles.module.css';

export default function OfflineBanner() {
  const { t } = useTranslation();
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className={styles.banner} role="alert">
      <Ico name="info" size={16} className={styles.icon} />
      <span className={styles.text}>{t('offline.banner')}</span>
    </div>
  );
}
