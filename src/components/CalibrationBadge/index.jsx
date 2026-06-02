import { useTranslation } from 'react-i18next';
import { useData } from '../../hooks/useData';
import styles from './styles.module.css';

export default function CalibrationBadge({ className = '' }) {
  const { t } = useTranslation();
  const { data: cal } = useData('calibration');

  if (!cal || cal.played === 0) return null;

  return (
    <span className={`${styles.badge} ${className}`}>
      {cal.played} {t('calibration.played')}
      {' · '}
      {cal.winnerHit}/{cal.played} {t('calibration.winnerHit')}
    </span>
  );
}
