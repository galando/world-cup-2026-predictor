import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Flag from '../Flag';
import StageChip from '../StageChip';
import MiniLean from '../MiniLean';
import Ico from '../Ico';
import styles from './styles.module.css';

export default function MatchCard({ match, teamsMeta, prediction, isPreferred }) {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const homeMeta = teamsMeta?.[match.homeTeam];
  const awayMeta = teamsMeta?.[match.awayTeam];

  const nameOf = (meta, code) => {
    if (!meta) return code;
    return i18n.language === 'he' ? meta.nameHE : meta.nameEN;
  };

  const isFinished = match.status === 'FINISHED';

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString(i18n.language === 'he' ? 'he-IL' : 'en-US', {
        day: 'numeric',
        month: 'short',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div
      className={`${styles.card} ${isPreferred ? styles.preferred : ''}`}
      onClick={() => navigate(`/match/${match.matchId}`)}
    >
      {isPreferred && (
        <Ico name="star" size={14} className={styles.star} />
      )}
      <div className={styles.top}>
        <StageChip stage={match.stage} />
        {match.group && <span className={styles.group}>{t('match.groupLabel')} {match.group}</span>}
        <span className={styles.date}>{formatDate(match.date)}</span>
      </div>

      <div className={styles.body}>
        <div className={styles.team}>
          <Flag code={homeMeta?.flagIso} size={40} />
          <span className={styles.teamName}>{nameOf(homeMeta, match.homeTeam)}</span>
        </div>

        <div className={styles.center}>
          {isFinished && match.score ? (
            <span className={styles.score}>
              {match.score.home} – {match.score.away}
            </span>
          ) : (
            <span className={styles.vs}>{t('match.vs')}</span>
          )}
        </div>

        <div className={styles.team}>
          <Flag code={awayMeta?.flagIso} size={40} />
          <span className={styles.teamName}>{nameOf(awayMeta, match.awayTeam)}</span>
        </div>
      </div>

      {prediction && !isFinished && (
        <div className={styles.bars}>
          <MiniLean
            home={prediction.probs.home}
            draw={prediction.probs.draw}
            away={prediction.probs.away}
            size="sm"
          />
        </div>
      )}

      {match.venue && (
        <div className={styles.venue}>{match.venue}</div>
      )}
    </div>
  );
}
