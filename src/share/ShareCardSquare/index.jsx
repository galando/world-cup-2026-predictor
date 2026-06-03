import { useTranslation } from 'react-i18next';
import Flag from '../../components/Flag';
import styles from './styles.module.css';

/**
 * 320x320 share image for match predictions.
 * Rendered off-screen, captured via renderToImage.
 *
 * Props:
 *   homeCode, awayCode - team codes (ISO 3166-1 alpha-2)
 *   homeName, awayName - display names
 *   homeScore, awayScore - guessed scores (numbers)
 *   feedbackText - e.g. "The model gives this 11%"
 *   probs - { home, draw, away }
 */
export default function ShareCardSquare({
  homeCode,
  awayCode,
  homeName,
  awayName,
  homeScore,
  awayScore,
  feedbackText,
  probs,
}) {
  const { t } = useTranslation();
  const homePct = probs ? Math.round(probs.home * 100) : 0;
  const awayPct = probs ? Math.round(probs.away * 100) : 0;
  const drawPct = probs ? Math.round(probs.draw * 100) : 0;

  return (
    <div className={styles.card}>
      {/* Pitch texture background */}
      <div className={styles.pitchBg} aria-hidden="true">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={styles.pitchSvg}>
          <line x1="50" y1="0" x2="50" y2="100" />
          <circle cx="50" cy="50" r="12" />
          <rect x="0" y="18" width="18" height="64" />
          <rect x="82" y="18" width="18" height="64" />
        </svg>
      </div>

      {/* Content */}
      <div className={styles.content}>
        {/* Brand row */}
        <div className={styles.brand} data-share-text>
          {t('share.brand')}
        </div>

        {/* Flags + Score */}
        <div className={styles.scoreRow}>
          <div className={styles.teamCol}>
            <Flag code={homeCode} size={80} alt={homeName} />
            <div className={styles.teamName} data-share-text>{homeName}</div>
          </div>
          <div className={styles.scoreCenter}>
            <span className={styles.scoreNum} data-share-text>{homeScore}</span>
            <span className={styles.scoreDash}>–</span>
            <span className={styles.scoreNum} data-share-text>{awayScore}</span>
          </div>
          <div className={styles.teamCol}>
            <Flag code={awayCode} size={80} alt={awayName} />
            <div className={styles.teamName} data-share-text>{awayName}</div>
          </div>
        </div>

        {/* Feedback */}
        {feedbackText && (
          <div className={styles.feedback}>
            <div className={styles.feedbackText} data-share-text>{feedbackText}</div>
            {probs && (
              <div className={styles.miniBar}>
                <span className={styles.seg} style={{ width: `${homePct}%`, backgroundColor: '#46c98a' }} />
                <span className={styles.seg} style={{ width: `${drawPct}%`, backgroundColor: '#d8b24a' }} />
                <span className={styles.seg} style={{ width: `${awayPct}%`, backgroundColor: '#e0726a' }} />
              </div>
            )}
          </div>
        )}

        {/* URL */}
        <div className={styles.url} data-share-text>{t('share.url')}</div>
      </div>
    </div>
  );
}
