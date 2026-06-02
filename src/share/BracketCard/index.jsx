import { useTranslation } from 'react-i18next';
import Flag from '../../components/Flag';
import styles from './styles.module.css';

/**
 * 360x360 share image for bracket predictions.
 *
 * Props:
 *   champion - { code, name }
 *   rounds - [{ label, ties: [{ home, away }] }]
 *   userPicks - number of user overrides
 *   modelPicks - number of model-filled slots
 */
export default function BracketCard({
  champion,
  rounds = [],
  userPicks = 0,
  modelPicks = 0,
}) {
  const { t } = useTranslation();

  return (
    <div className={styles.card}>
      <div className={styles.pitchBg} aria-hidden="true">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={styles.pitchSvg}>
          <line x1="50" y1="0" x2="50" y2="100" />
          <circle cx="50" cy="50" r="12" />
          <rect x="0" y="18" width="18" height="64" />
          <rect x="82" y="18" width="18" height="64" />
        </svg>
      </div>

      <div className={styles.content}>
        {/* Champion + Trophy */}
        <div className={styles.championRow}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="#d8b24a" className={styles.trophyIcon}>
            <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z" />
          </svg>
          {champion && (
            <>
              <Flag code={champion.code} size={48} alt={champion.name} />
              <span className={styles.championName} data-share-text>{champion.name}</span>
            </>
          )}
        </div>

        {/* Brand */}
        <div className={styles.brand} data-share-text>{t('share.brand')}</div>

        {/* Bracket summary */}
        <div className={styles.summary}>
          {rounds.map((round, i) => (
            <div key={i} className={styles.roundRow}>
              <span className={styles.roundLabel} data-share-text>{round.label}</span>
              <div className={styles.ties}>
                {round.ties.map((tie, j) => (
                  <span key={j} className={styles.tie} data-share-text>
                    {tie.home} v {tie.away}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Picks count */}
        <div className={styles.picksRow} data-share-text>
          {userPicks} {t('bracket.myPicks')} · {modelPicks} {t('bracket.modelPicks')}
        </div>

        {/* URL */}
        <div className={styles.url} data-share-text>{t('share.url')}</div>
      </div>
    </div>
  );
}
