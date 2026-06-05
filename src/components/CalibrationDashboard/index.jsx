import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useData } from '../../hooks/useData';

export default function CalibrationDashboard() {
  const { t } = useTranslation();
  const { data } = useData('/data/calibration.json');
  const [expanded, setExpanded] = useState(false);

  if (!data) {
    return <div className="text-center p-4 text-sm opacity-60">{t('loading.text')}</div>;
  }

  const brier = typeof data.brier === 'object' ? data.brier : { overall: data.brier, model: null, blended: null };

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold">{t('calibration.title')}</h2>

      {data.played === 0 ? (
        <p className="text-sm opacity-60">{t('calibration.played')}: 0</p>
      ) : (
        <>
          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-[var(--card)] rounded-lg p-3">
              <div className="opacity-60 text-xs">{t('calibration.played')}</div>
              <div className="font-bold text-lg">{data.played}</div>
            </div>
            <div className="bg-[var(--card)] rounded-lg p-3">
              <div className="opacity-60 text-xs">{t('calibration.brier')}</div>
              <div className="font-bold text-lg">{brier.overall?.toFixed(4) ?? '-'}</div>
            </div>
            <div className="bg-[var(--card)] rounded-lg p-3">
              <div className="opacity-60 text-xs">{t('calibration.winnerHit')}</div>
              <div className="font-bold text-lg">
                {data.winnerHit} <span className="text-xs opacity-60">({((data.winnerHit / data.played) * 100).toFixed(0)}%)</span>
              </div>
            </div>
            <div className="bg-[var(--card)] rounded-lg p-3">
              <div className="opacity-60 text-xs">{t('calibration.exactHit')}</div>
              <div className="font-bold text-lg">{data.exactHit}</div>
            </div>
          </div>

          {/* Brier comparison */}
          {brier.model !== null && (
            <div className="bg-[var(--card)] rounded-lg p-3 text-sm">
              <div className="flex justify-between mb-1">
                <span>{t('calibration.blended')}</span>
                <span className="font-mono">{brier.blended?.toFixed(4) ?? brier.overall?.toFixed(4)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('calibration.modelOnly')}</span>
                <span className="font-mono">{brier.model?.toFixed(4)}</span>
              </div>
            </div>
          )}

          {/* Log-loss */}
          {data.logLoss > 0 && (
            <div className="bg-[var(--card)] rounded-lg p-3 text-sm flex justify-between">
              <span>{t('calibration.logLoss')}</span>
              <span className="font-mono">{data.logLoss.toFixed(4)}</span>
            </div>
          )}

          {/* Calibration curve */}
          {data.calibrationCurve && data.calibrationCurve.length > 0 && (
            <div className="bg-[var(--card)] rounded-lg p-3">
              <div className="text-xs opacity-60 mb-2">{t('calibration.calibrationCurve')}</div>
              <div className="flex items-end gap-px h-16">
                {data.calibrationCurve.map((bucket, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                    <div className="w-full flex flex-col items-center">
                      <div
                        className="w-full bg-[var(--accent)] rounded-t"
                        style={{ height: `${bucket.actual * 60}px`, opacity: 0.8 }}
                      />
                      <div
                        className="w-full bg-[var(--ink-dim)] rounded-t"
                        style={{ height: `${bucket.predicted * 60}px`, opacity: 0.3 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-xs opacity-40 mt-1">
                <span>0%</span>
                <span>100%</span>
              </div>
            </div>
          )}

          {/* Per-match breakdown toggle */}
          {data.perMatch && data.perMatch.length > 0 && (
            <div>
              <button
                className="text-xs opacity-60 hover:opacity-100 transition-opacity"
                onClick={() => setExpanded(!expanded)}
              >
                {t('calibration.perMatch')} {expanded ? '▲' : '▼'}
              </button>
              {expanded && (
                <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                  {data.perMatch.map((m, i) => (
                    <div key={i} className="flex justify-between text-xs bg-[var(--line)] rounded px-2 py-1">
                      <span>{m.matchId}</span>
                      <span className={m.correct ? 'text-[var(--win)]' : 'text-[var(--loss)]'}>
                        {m.correct ? '✓' : '✗'} Brier: {m.brier.toFixed(4)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
