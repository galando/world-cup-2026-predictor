import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './styles.module.css';

export default function ScorelineGrid({ matrix, maxGoals = 6, onSelect }) {
  const { t } = useTranslation();

  const grid = useMemo(() => {
    const rows = [];
    for (let h = 0; h <= maxGoals; h++) {
      for (let a = 0; a <= maxGoals; a++) {
        const val = matrix?.[h]?.[a] ?? 0;
        rows.push({ h, a, p: val });
      }
    }
    const maxP = Math.max(...rows.map(r => r.p), 0.001);
    return { rows, maxP };
  }, [matrix, maxGoals]);

  return (
    <div className={styles.wrap}>
      <div className={styles.legend}>{t('prediction.scoreMatrixLegend')}</div>
      <div className={styles.header}>
        <span className={styles.cornerLabel}>{t('prediction.homeAxis')}</span>
        {Array.from({ length: maxGoals + 1 }, (_, a) => (
          <span key={a} className={styles.headerCell}>{a}</span>
        ))}
      </div>
      {Array.from({ length: maxGoals + 1 }, (_, h) => (
        <div key={h} className={styles.row}>
          <span className={styles.rowLabel}>{h}</span>
          {Array.from({ length: maxGoals + 1 }, (_, a) => {
            const cell = grid.rows.find(r => r.h === h && r.a === a);
            const pct = cell ? Math.round(cell.p * 1000) / 10 : 0;
            const intensity = cell ? cell.p / grid.maxP : 0;
            return (
              <button
                key={a}
                className={styles.cell}
                style={{ opacity: 0.3 + intensity * 0.7 }}
                onClick={() => onSelect?.(h, a)}
                title={`${h}–${a}: ${pct}%`}
              >
                {pct > 0 ? `${pct}%` : ''}
              </button>
            );
          })}
        </div>
      ))}
      <div className={styles.awayLabel}>{t('prediction.awayAxis')}</div>
    </div>
  );
}
