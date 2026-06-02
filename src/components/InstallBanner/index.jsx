import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Btn from '../Btn';
import Ico from '../Ico';
import styles from './styles.module.css';

const VISIT_KEY = 'app_visits';
const DISMISS_KEY = 'install_dismissed';

function getVisitCount() {
  try {
    return parseInt(localStorage.getItem(VISIT_KEY) || '0', 10);
  } catch {
    return 0;
  }
}

function incrementVisit() {
  try {
    const count = getVisitCount() + 1;
    localStorage.setItem(VISIT_KEY, String(count));
    return count;
  } catch {
    return 1;
  }
}

function isDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === 'true';
  } catch {
    return false;
  }
}

export default function InstallBanner() {
  const { t } = useTranslation();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const count = incrementVisit();
    const dismissed = isDismissed();

    // Show after 2 visits if not dismissed
    if (count >= 2 && !dismissed) {
      setVisible(true);
    }

    // Listen for beforeinstallprompt
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (count >= 2 && !dismissed) {
        setVisible(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      // No native prompt available; just hide the banner
      setVisible(false);
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setVisible(false);
  };

  const handleDismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, 'true');
    } catch { /* ignore */ }
  };

  if (!visible) return null;

  return (
    <div className={styles.banner} role="complementary">
      <span className={styles.text}>{t('install.banner')}</span>
      <div className={styles.actions}>
        <Btn variant="primary" size="sm" onClick={handleInstall}>
          {t('install.banner')}
        </Btn>
        <button className={styles.dismiss} onClick={handleDismiss} aria-label={t('install.dismiss')}>
          <Ico name="close" size={16} />
        </button>
      </div>
    </div>
  );
}
