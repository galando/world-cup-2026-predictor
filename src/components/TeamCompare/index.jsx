import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import Flag from '../Flag';
import FormRow from '../FormRow';
import styles from './styles.module.css';

export default function TeamCompare({
  homeCode,
  awayCode,
  teamsMeta,
  teams,
  homeForm,
  awayForm,
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const homeMeta = teamsMeta?.[homeCode];
  const awayMeta = teamsMeta?.[awayCode];
  const homeTeam = teams?.[homeCode];
  const awayTeam = teams?.[awayCode];

  const nameOf = (meta) => {
    if (!meta) return homeCode;
    return i18n.language === 'he' ? meta.nameHE : meta.nameEN;
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.team} onClick={() => navigate(`/team/${homeCode}`)}>
        <Flag code={homeMeta?.flagIso} size={80} />
        <div className={styles.name}>{nameOf(homeMeta)}</div>
        {homeMeta && (
          <div className={styles.rank}>
            {t('team.fifaRank')} #{homeMeta.fifaRank}
          </div>
        )}
        <FormRow form={homeForm} />
        {homeTeam && homeTeam.matchesPlayed > 0 && (
          <div className={styles.avg}>
            {homeTeam.avgGoals?.toFixed(1)} {'⚽'} / {homeTeam.avgConceded?.toFixed(1)} {'☁'}
          </div>
        )}
      </div>

      <div className={styles.divider}>VS</div>

      <div className={styles.team} onClick={() => navigate(`/team/${awayCode}`)}>
        <Flag code={awayMeta?.flagIso} size={80} />
        <div className={styles.name}>{nameOf(awayMeta)}</div>
        {awayMeta && (
          <div className={styles.rank}>
            {t('team.fifaRank')} #{awayMeta.fifaRank}
          </div>
        )}
        <FormRow form={awayForm} />
        {awayTeam && awayTeam.matchesPlayed > 0 && (
          <div className={styles.avg}>
            {awayTeam.avgGoals?.toFixed(1)} {'⚽'} / {awayTeam.avgConceded?.toFixed(1)} {'☁'}
          </div>
        )}
      </div>
    </div>
  );
}
