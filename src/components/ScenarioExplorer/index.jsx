import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useData } from '../../hooks/useData';
import { applyOverridesToStandings, toggleOverride as toggleOverrideLogic } from '../../lib/scenario-logic.js';

export default function ScenarioExplorer() {
  const { t } = useTranslation();
  const { data: matches } = useData('/data/matches.json');
  const { data: standings } = useData('/data/standings.json');
  const { data: teamsMeta } = useData('/data/teams-meta.json');
  const [overrides, setOverrides] = useState({});

  const groupMatches = useMemo(() => {
    if (!matches) return [];
    return matches.filter(m => m.stage === 'group' && m.group);
  }, [matches]);

  // Recompute standings based on overrides
  const updatedStandings = useMemo(() => {
    if (!standings || !teamsMeta) return {};
    return applyOverridesToStandings(standings, groupMatches, overrides);
  }, [standings, teamsMeta, groupMatches, overrides]);

  const toggleOverride = (matchId, outcome) => {
    setOverrides(prev => toggleOverrideLogic(prev, matchId, outcome));
  };

  const resetOverrides = () => setOverrides({});

  if (!matches || !standings) {
    return <div className="text-center p-4 text-sm opacity-60">{t('loading.text')}</div>;
  }

  // Group matches by group
  const matchesByGroup = {};
  for (const m of groupMatches) {
    if (!matchesByGroup[m.group]) matchesByGroup[m.group] = [];
    matchesByGroup[m.group].push(m);
  }

  const hasOverrides = Object.keys(overrides).length > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2">
          {t('scenario.title')}
          {hasOverrides && (
            <span className="text-xs bg-[var(--accent)] text-[var(--accent-ink)] px-2 py-0.5 rounded-full font-medium">
              {t('scenario.whatIf')}
            </span>
          )}
        </h2>
        {hasOverrides && (
          <button
            onClick={resetOverrides}
            className="text-xs opacity-60 hover:opacity-100 transition-opacity"
          >
            {t('scenario.reset')}
          </button>
        )}
      </div>

      {/* Standings per group */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Object.entries(matchesByGroup).map(([group, groupMatchesList]) => {
          const originalGroup = standings[group] || [];
          const updatedGroup = updatedStandings[group] || [];

          return (
            <div key={group} className="bg-[var(--card)] rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm">{t('match.groupLabel')} {group}</h3>
                {hasOverrides && <span className="text-xs opacity-40">{t('scenario.updated')}</span>}
              </div>

              {/* Standings */}
              <table className="w-full text-xs">
                <thead>
                  <tr className="opacity-40">
                    <th className="text-left">#</th>
                    <th className="text-left">Team</th>
                    <th className="text-center">P</th>
                    <th className="text-center">GD</th>
                    <th className="text-center">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {updatedGroup.map((team, idx) => {
                    const orig = originalGroup.find(o => o.team === team.team);
                    const changed = orig && (team.pts !== orig.pts || team.rank !== orig.rank);
                    return (
                      <tr key={team.team} className={changed ? 'text-[var(--accent)]' : ''}>
                        <td>{team.rank}</td>
                        <td className="font-medium">{team.team}</td>
                        <td className="text-center">{team.p}</td>
                        <td className="text-center">{team.gd > 0 ? '+' : ''}{team.gd}</td>
                        <td className="text-center font-bold">{team.pts}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Match overrides */}
              <div className="space-y-1 pt-1 border-t border-[var(--line)]">
                {groupMatchesList.map(match => (
                  <div key={match.matchId} className="flex items-center gap-1 text-xs">
                    <span className="flex-1 opacity-60">
                      {match.homeTeam} v {match.awayTeam}
                    </span>
                    <div className="flex gap-0.5">
                      {['home', 'draw', 'away'].map(outcome => (
                        <button
                          key={outcome}
                          onClick={() => toggleOverride(match.matchId, outcome)}
                          className={`px-1.5 py-0.5 rounded text-xs transition-colors ${
                            overrides[match.matchId] === outcome
                              ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                              : 'bg-[var(--line)] opacity-40 hover:opacity-80'
                          }`}
                        >
                          {outcome === 'home' ? t('scenario.homeWin') : outcome === 'draw' ? t('scenario.draw') : t('scenario.awayWin')}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
