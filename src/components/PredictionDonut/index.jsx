import styles from './styles.module.css';

export default function PredictionDonut({ probs }) {
  const homePct = Math.round(probs.home * 100);
  const drawPct = Math.round(probs.draw * 100);
  const awayPct = 100 - homePct - drawPct;

  const homeDeg = homePct * 3.6;
  const drawDeg = drawPct * 3.6;
  const awayDeg = awayPct * 3.6;

  const homeEnd = homeDeg;
  const drawEnd = homeEnd + drawDeg;

  return (
    <div className={styles.wrap}>
      <svg viewBox="0 0 36 36" className={styles.donut}>
        <circle
          className={styles.seg}
          strokeDasharray={`${homeDeg} ${360 - homeDeg}`}
          strokeDashoffset="0"
          stroke="var(--win)"
        />
        <circle
          className={styles.seg}
          strokeDasharray={`${drawDeg} ${360 - drawDeg}`}
          strokeDashoffset={`${-homeEnd}`}
          stroke="var(--drawc)"
        />
        <circle
          className={styles.seg}
          strokeDasharray={`${awayDeg} ${360 - awayDeg}`}
          strokeDashoffset={`${-drawEnd}`}
          stroke="var(--loss)"
        />
      </svg>
      <div className={styles.center}>
        <span className={styles.pct}>{homePct}%</span>
      </div>
    </div>
  );
}
