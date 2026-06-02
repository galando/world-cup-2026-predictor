import styles from './styles.module.css';

export default function MiniLean({ home, draw, away, size = 'sm' }) {
  const total = home + draw + away;
  if (total === 0) return null;
  const hp = (home / total) * 100;
  const dp = (draw / total) * 100;
  const ap = 100 - hp - dp;
  return (
    <div className={styles.wrap}>
      <div className={`${styles.bar} ${styles[size]}`}>
        <span className={styles.seg} style={{ width: `${hp}%`, backgroundColor: 'var(--win)' }} />
        <span className={styles.seg} style={{ width: `${dp}%`, backgroundColor: 'var(--drawc)' }} />
        <span className={styles.seg} style={{ width: `${ap}%`, backgroundColor: 'var(--loss)' }} />
      </div>
      <div className={styles.labels}>
        <span style={{ color: 'var(--win)' }}>{Math.round(hp)}%</span>
        <span style={{ color: 'var(--drawc)' }}>{Math.round(dp)}%</span>
        <span style={{ color: 'var(--loss)' }}>{Math.round(ap)}%</span>
      </div>
    </div>
  );
}
