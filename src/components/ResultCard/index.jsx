import { useTranslation } from 'react-i18next';
import Card from '../Card';
import styles from './styles.module.css';

export default function ResultCard({ score, guess }) {
  const { t } = useTranslation();

  if (!score) return null;

  const winnerCorrect = guess && (
    (score.home > score.away && guess.home > guess.away) ||
    (score.home < score.away && guess.home < guess.away) ||
    (score.home === score.away && guess.home === guess.away)
  );
  const exactMatch = guess && guess.home === score.home && guess.away === score.away;

  let msg = t('result.missed');
  if (exactMatch) msg = t('result.correctScore');
  else if (winnerCorrect) msg = t('result.correctWinner');

  return (
    <Card className={styles.card}>
      <div className={styles.title}>{t('result.title')}</div>
      <div className={styles.score}>
        {score.home} - {score.away}
      </div>
      {guess && <div className={styles.msg}>{msg}</div>}
    </Card>
  );
}
