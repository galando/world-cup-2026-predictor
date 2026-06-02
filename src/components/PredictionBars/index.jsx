import { useTranslation } from 'react-i18next';
import styles from './styles.module.css';

export default function PredictionBars({ probs, homeName, awayName }) {
  const { t } = useTranslation();

  const rows = [
    { key: 'home', pct: probs.home, label: homeName, color: 'var(--win)' },
    { key: 'draw', pct: probs.draw, label: t('prediction.draw'), color: 'var(--drawc)' },
    { key: 'away', pct: probs.away, label: awayName, color: 'var(--loss)' },
  ];

  return (
    <div className={styles.block}>
      {rows.map(r => (
        <div key={r.key} className={styles.row}>
          <div className={styles.track}>
            <div
              className={styles.fill}
              style={{ width: `${Math.round(r.pct * 100)}%`, backgroundColor: r.color }}
            />
          </div>
          <span className={styles.pct}>{Math.round(r.pct * 100)}%</span>
          <span className={styles.label}>{r.label}</span>
        </div>
      ))}
    </div>
  );
}
