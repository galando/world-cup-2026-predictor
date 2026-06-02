import { useTranslation } from 'react-i18next';
import Card from '../Card';
import MiniLean from '../MiniLean';
import styles from './styles.module.css';

export default function FeedbackCard({ homeGuess, awayGuess, probs, topScores }) {
  const { t } = useTranslation();

  const matchScore = topScores?.find(
    s => s.h === homeGuess && s.a === awayGuess
  );
  const pct = matchScore ? Math.round(matchScore.p * 100) : 0;

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
