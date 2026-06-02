import styles from './styles.module.css';

export default function MiniLean({ home, draw, away, size = 'sm' }) {
  const total = home + draw + away;
  if (total === 0) return null;
  const hp = (home / total) * 100;
  const dp = (draw / total) * 100;
  return (
    <div className={`${styles.bar} ${styles[size]}`}>
      <span className={styles.seg} style={{ width: `${hp}%`, backgroundColor: 'var(--win)' }} />
      <span className={styles.seg} style={{ width: `${dp}%`, backgroundColor: 'var(--drawc)' }} />
      <span
        className={styles.seg}
        style={{ width: `${100 - hp - dp}%`, backgroundColor: 'var(--loss)' }}
      />
    </div>
  );
}
