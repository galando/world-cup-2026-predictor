import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useData } from '../../hooks/useData';
import { useTheme } from '../../hooks/useTheme';
import MatchCard from '../../components/MatchCard';
import FilterBar from '../../components/FilterBar';
import EmptyState from '../../components/EmptyState';
import Skeleton from '../../components/Skeleton';
import Ico from '../../components/Ico';
import styles from './styles.module.css';

export default function HomeScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { teamCode } = useTheme();

  const { data: matches, loading: matchesLoading } = useData('matches');
  const { data: predictions } = useData('predictions');
  const { data: teamsMeta } = useData('teams-meta');
  const { data: lastUpdated } = useData('lastUpdated');

  const [filter, setFilter] = useState('all');
  const [subFilter, setSubFilter] = useState(null);

  const firstUpcomingRef = useRef(null);

  const filteredMatches = useMemo(() => {
    if (!matches) return [];

    let list = [...matches];

    if (filter === 'myTeam' && teamCode) {
      list = list.filter(
        m => m.homeTeam === teamCode || m.awayTeam === teamCode,
      );
    }

    if (filter === 'group' && subFilter) {
      list = list.filter(m => m.group === subFilter);
    }

    if (filter === 'stage' && subFilter) {
      list = list.filter(m => m.stage === subFilter);
    }

    // Upcoming games first (sorted ascending), then finished (most recent first)
    list.sort((a, b) => {
      const aUpcoming = a.status !== 'FINISHED';
      const bUpcoming = b.status !== 'FINISHED';
      if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
      if (!a.date) return 1;
      if (!b.date) return -1;
      const cmp = a.date.localeCompare(b.date);
      return aUpcoming ? cmp : -cmp;
    });

    // Preferred upcoming matches float to top of upcoming section
    if (teamCode && filter !== 'myTeam') {
      list.sort((a, b) => {
        const aPref = (a.homeTeam === teamCode || a.awayTeam === teamCode) && a.status !== 'FINISHED';
        const bPref = (b.homeTeam === teamCode || b.awayTeam === teamCode) && b.status !== 'FINISHED';
        if (aPref === bPref) return 0;
        return aPref ? -1 : 1;
      });
    }

    return list;
  }, [matches, filter, subFilter, teamCode]);

  const firstUpcomingIndex = filteredMatches.findIndex(m => m.status !== 'FINISHED');

  useEffect(() => {
    if (firstUpcomingRef.current) {
      firstUpcomingRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [filter, subFilter]);

  if (matchesLoading) {
    return (
      <div className={styles.page}>
        <Skeleton width="60%" height="28px" radius="8px" />
        <Skeleton width="80%" height="16px" radius="6px" />
        <Skeleton width="100%" height="80px" radius="20px" />
        <Skeleton width="100%" height="80px" radius="20px" />
      </div>
    );
  }

  const isEmpty = filteredMatches.length === 0;
  const emptyMsg = filter === 'myTeam'
    ? t('home.teamEliminated')
    : t('home.emptyFilter');

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('home.title')}</h1>
          <p className={styles.subtitle}>{t('home.subtitle')}</p>
        </div>
        <button className={styles.settingsBtn} onClick={() => navigate('/settings')}>
          <Ico name="settings" size={24} />
        </button>
      </div>

      {/* Last updated */}
      {lastUpdated?.iso && (
        <div className={styles.updated}>
          {t('home.lastUpdated')}: {new Date(lastUpdated.iso).toLocaleString()}
        </div>
      )}

      {/* Filter */}
      <FilterBar
        active={filter}
        onChange={(f) => { setFilter(f); setSubFilter(null); }}
        subFilter={subFilter}
        onSubFilter={setSubFilter}
      />

      {/* Match list */}
      {isEmpty ? (
        <EmptyState message={emptyMsg} />
      ) : (
        <div className={styles.list}>
          {filteredMatches.map((m, i) => (
            <MatchCard
              key={m.matchId}
              ref={i === firstUpcomingIndex ? firstUpcomingRef : null}
              match={m}
              teamsMeta={teamsMeta}
              prediction={predictions?.find(p => p.matchId === m.matchId)}
              isPreferred={
                teamCode &&
                (m.homeTeam === teamCode || m.awayTeam === teamCode)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
