import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useData } from '../../hooks/useData';

export default function TournamentProbs() {
  const { t } = useTranslation();
  const { data } = useData('/data/tournament-probs.json');
  const { data: teamsMeta } = useData('/data/teams-meta.json');
  const [sortBy, setSortBy] = useState('win');

  if (!data || !data.teams) {
    return <div className="text-center p-4 text-sm opacity-60">{t('loading.text')}</div>;
  }

  const teams = Object.entries(data.teams)
    .map(([code, probs]) => ({
      code,
      name: teamsMeta?.[code]?.nameEN || code,
      ...probs,
    }))
    .sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));

  const columns = [
    { key: 'r16', label: t('tournament.probR16') },
    { key: 'qf', label: t('tournament.probQF') },
    { key: 'sf', label: t('tournament.probSF') },
    { key: 'final', label: t('tournament.probFinal') },
    { key: 'win', label: t('tournament.probWin') },
  ];

  const maxWin = Math.max(...teams.map(t => t.win), 0.01);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{t('tournament.title')}</h2>
        <span className="text-xs opacity-50">
          {data.simulations?.toLocaleString()} {t('tournament.simulations')}
        </span>
      </div>

      {data.confidence?.mostLikelyChampion && (
        <div className="bg-[var(--card)] rounded-lg p-3 text-sm">
          {t('tournament.mostLikely')}:{' '}
          <strong>{teamsMeta?.[data.confidence.mostLikelyChampion.team]?.nameEN || data.confidence.mostLikelyChampion.team}</strong>
          {' '}({(data.confidence.mostLikelyChampion.prob * 100).toFixed(1)}%)
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--line)]">
              <th className="text-left py-2 px-1">{t('tournament.team')}</th>
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`text-right py-2 px-1 cursor-pointer select-none ${sortBy === col.key ? 'text-[var(--accent)]' : ''}`}
                  onClick={() => setSortBy(col.key)}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map(team => (
              <tr key={team.code} className="border-b border-[var(--line)] hover:bg-[var(--line)]">
                <td className="py-1.5 px-1 font-medium">
                  <span className="mr-1">{team.code}</span>
                  <span className="text-xs opacity-60">{team.name}</span>
                </td>
                {columns.map(col => (
                  <td key={col.key} className="text-right py-1.5 px-1">
                    <div className="flex items-center justify-end gap-1">
                      <div
                        className="h-2 rounded-full bg-[var(--accent)]"
                        style={{ width: `${(team[col.key] / maxWin) * 40}px`, opacity: 0.6 }}
                      />
                      <span className="text-xs">{(team[col.key] * 100).toFixed(1)}</span>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
