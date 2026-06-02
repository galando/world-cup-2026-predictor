import { useTranslation } from 'react-i18next';
import Flag from '../Flag';
import styles from './styles.module.css';

export default function BracketTie({
  match,
  teamsMeta,
  winner,
  homeWinPct,
  awayWinPct,
  onSelect,
}) {
  const { i18n } = useTranslation();

  const homeMeta = teamsMeta?.[match.homeTeam];
  const awayMeta = teamsMeta?.[match.awayTeam];

  const nameOf = (code, meta) => {
    if (!meta) return code ?? '???';
    return i18n.language === 'he' ? meta.nameHE : meta.nameEN;
  };

  const hasTeams = match.homeTeam && match.awayTeam;

  return (
    <div className={styles.tie}>
      <button
        className={`${styles.teamRow} ${winner === match.homeTeam ? styles.winner : ''}`}
        onClick={() => hasTeams && onSelect?.(match.matchId, match.homeTeam)}
        disabled={!hasTeams}
      >
        <Flag code={homeMeta?.flagIso} size={24} />
        <span className={styles.teamName}>{nameOf(match.homeTeam, homeMeta)}</span>
        {homeWinPct != null && (
          <span className={styles.pct}>{Math.round(homeWinPct * 100)}%</span>
        )}
      </button>
      <button
        className={`${styles.teamRow} ${winner === match.awayTeam ? styles.winner : ''}`}
        onClick={() => hasTeams && onSelect?.(match.matchId, match.awayTeam)}
        disabled={!hasTeams}
      >
        <Flag code={awayMeta?.flagIso} size={24} />
        <span className={styles.teamName}>{nameOf(match.awayTeam, awayMeta)}</span>
        {awayWinPct != null && (
          <span className={styles.pct}>{Math.round(awayWinPct * 100)}%</span>
        )}
      </button>
    </div>
  );
}
