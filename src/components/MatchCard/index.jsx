import { forwardRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Flag from '../Flag';
import StageChip from '../StageChip';
import MiniLean from '../MiniLean';
import Ico from '../Ico';
import styles from './styles.module.css';

const MatchCard = forwardRef(function MatchCard({ match, teamsMeta, prediction, isPreferred }, ref) {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const homeMeta = teamsMeta?.[match.homeTeam];
  const awayMeta = teamsMeta?.[match.awayTeam];

  const nameOf = (meta, code) => {
    if (!meta) return code;
    return i18n.language === 'he' ? meta.nameHE : meta.nameEN;
  };

  const isFinished = match.status === 'FINISHED';

  const formatDateTime = (dateStr, timeStr) => {
    if (!dateStr) return '';
    try {
      const locale = i18n.language === 'he' ? 'he-IL' : i18n.language === 'nl' ? 'nl-NL' : 'en-US';
      if (timeStr) {
        const d = new Date(`${dateStr}T${timeStr}:00Z`);
        return d.toLocaleString(locale, {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });
      }
      const d = new Date(dateStr + 'T12:00:00Z');
      return d.toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div
      ref={ref}
      className={`${styles.card} ${isPreferred ? styles.preferred : ''}`}
      onClick={() => navigate(`/match/${match.matchId}`)}
    >
      {isPreferred && (
        <Ico name="star" size={14} className={styles.star} />
      )}
      <div className={styles.top}>
        <StageChip stage={match.stage} />
        {match.group && <span className={styles.group}>{t('match.groupLabel')} {match.group}</span>}
        <span className={styles.date}>{formatDateTime(match.date, match.time)}</span>
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
});

export default MatchCard;
