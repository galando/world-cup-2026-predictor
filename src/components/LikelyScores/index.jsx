import styles from './styles.module.css';

export default function LikelyScores({ topScores }) {
  if (!topScores || topScores.length === 0) return null;
  return (
    <div className={styles.wrap}>
      {topScores.map((s, i) => (
        <div key={i} className={styles.item}>
          <span className={styles.score}>{s.score}</span>
          <span className={styles.pct}>{Math.round(s.p * 100)}%</span>
        </div>
      ))}
    </div>
  );
}
