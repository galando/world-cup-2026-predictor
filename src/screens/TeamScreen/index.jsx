import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useData } from '../../hooks/useData';
import Flag from '../../components/Flag';
import Card from '../../components/Card';
import MatchCard from '../../components/MatchCard';
import FormRow from '../../components/FormRow';
import Skeleton from '../../components/Skeleton';
import Ico from '../../components/Ico';
import styles from './styles.module.css';

export default function TeamScreen() {
  const { teamCode } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const { data: teams, loading: teamsLoading } = useData('teams');
  const { data: teamsMeta } = useData('teams-meta');
  const { data: matches } = useData('matches');
  const { data: predictions } = useData('predictions');

  const team = teams?.[teamCode];
  const meta = teamsMeta?.[teamCode];

  const teamMatches = useMemo(() => {
    if (!matches) return [];
    return matches.filter(
      m => m.homeTeam === teamCode || m.awayTeam === teamCode,
    );
  }, [matches, teamCode]);

  if (teamsLoading) {
    return (
      <div className={styles.page}>
        <Skeleton width="100%" height="180px" radius="20px" />
        <Skeleton width="100%" height="60px" radius="12px" />
      </div>
    );
  }

  if (!team && !meta) {
    return (
      <div className={styles.page}>
        <div className={styles.notFound}>{t('error.teamNotFound')}</div>
      </div>
    );
  }

  const name = meta
    ? i18n.language === 'he' ? meta.nameHE : meta.nameEN
    : teamCode;

  return (
    <div className={styles.page}>
      {/* Back nav */}
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => navigate(-1)}>
          <Ico name="back" size={22} />
        </button>
      </div>

      {/* Hero */}
      <Card className={styles.hero}>
        <Flag code={meta?.flagIso} size={160} />
        <div className={styles.heroName}>{name}</div>
        <div className={styles.heroStats}>
          {meta && (
            <span>{t('team.fifaRank')} #{meta.fifaRank}</span>
          )}
          {team?.elo && (
            <span>{t('team.elo')} {team.elo}</span>
          )}
        </div>
      </Card>

      {/* Stat strip */}
      {team && (
        <Card>
          <div className={styles.statGrid}>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>{t('team.form')}</span>
              <FormRow form={team.form} />
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>{t('team.avgGoals')}</span>
              <span className={styles.statVal}>{team.avgGoals?.toFixed(2)}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>{t('team.avgConceded')}</span>
              <span className={styles.statVal}>{team.avgConceded?.toFixed(2)}</span>
            </div>
          </div>
        </Card>
      )}

      {/* Tournament matches */}
      {teamMatches.length > 0 && (
        <>
          <div className={styles.sectionTitle}>{t('team.tournamentMatches')}</div>
          <div className={styles.matchList}>
            {teamMatches.map(m => (
              <MatchCard
                key={m.matchId}
                match={m}
                teamsMeta={teamsMeta}
                prediction={predictions?.find(p => p.matchId === m.matchId)}
                isPreferred={false}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
