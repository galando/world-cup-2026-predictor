import { useTranslation } from 'react-i18next';
import Card from '../Card';
import MiniLean from '../MiniLean';
import styles from './styles.module.css';

function getScoreProb(homeGuess, awayGuess, topScores, scoreMatrix) {
  // Try topScores first (pre-computed)
  const fromTop = topScores?.find(s => s.h === homeGuess && s.a === awayGuess);
  if (fromTop) return fromTop.p;

  // Fall back to scoreMatrix
  if (scoreMatrix?.[homeGuess]?.[awayGuess] != null) {
    return scoreMatrix[homeGuess][awayGuess];
  }

  return 0;
}

export default function FeedbackCard({ homeGuess, awayGuess, probs, topScores, scoreMatrix }) {
  const { t } = useTranslation();

  const pct = Math.round(getScoreProb(homeGuess, awayGuess, topScores, scoreMatrix) * 100);

  return (
    <Card className={styles.card}>
      <div className={styles.title}>
        {t('guess.feedback', { pct })}
      </div>
      <div className={styles.subtitle}>
        {homeGuess} - {awayGuess}: {t('guess.myGuess')}
      </div>
      <div className={styles.bars}>
        <MiniLean home={probs.home} draw={probs.draw} away={probs.away} size="md" />
      </div>
      <div className={styles.labels}>
        <span>{Math.round(probs.home * 100)}% {t('prediction.home')}</span>
        <span>{Math.round(probs.draw * 100)}% {t('prediction.draw')}</span>
        <span>{Math.round(probs.away * 100)}% {t('prediction.away')}</span>
      </div>
    </Card>
  );
}
