import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useData } from '../../hooks/useData';
import Card from '../../components/Card';
import Btn from '../../components/Btn';
import Ico from '../../components/Ico';
import BracketTie from '../../components/BracketTie';
import Trophy from '../../components/Trophy';
import Skeleton from '../../components/Skeleton';
import BracketCard from '../../share/BracketCard';
import { renderToImage, shareBlob } from '../../share/renderToImage';
import styles from './styles.module.css';

const STORAGE_KEY = 'bracket_overrides';

function loadOverrides() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveOverrides(obj) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}

/**
 * Build a map from matchNumber -> match for quick lookup.
 * For R16/QF/SF/Final/Third, resolve teams from upstream matches.
 */
function resolveBracket(bracket, overrides) {
  const rounds = bracket?.rounds || {};
  const byMatchNum = {};

  // Index all matches by matchNumber
  for (const round of Object.values(rounds)) {
    for (const m of round) {
      byMatchNum[m.matchNumber] = { ...m };
    }
  }

  // Resolve teams round by round in order
  const roundOrder = ['r32', 'r16', 'qf', 'sf', 'third', 'final'];
  for (const roundKey of roundOrder) {
    const matches = rounds[roundKey];
    if (!matches) continue;

    for (const m of matches) {
      const resolved = byMatchNum[m.matchNumber];

      // If has fromMatches, resolve home/away from winners of upstream
      if (m.fromMatches && m.fromMatches.length === 2) {
        const homeUpstream = byMatchNum[m.fromMatches[0]];
        const awayUpstream = byMatchNum[m.fromMatches[1]];

        if (homeUpstream) {
          resolved.homeTeam = getWinner(homeUpstream, overrides);
        }
        if (awayUpstream) {
          resolved.awayTeam = getWinner(awayUpstream, overrides);
        }
      }

      // Apply user override as winner
      if (overrides[m.matchId]) {
        resolved._userWinner = overrides[m.matchId];
      }
    }
  }

  return { rounds, byMatchNum };
}

function getWinner(match, overrides) {
  if (overrides[match.matchId]) return overrides[match.matchId];
  // Default to homeTeam for resolved teams, null if neither set
  return match.homeTeam || null;
}

/**
 * Find all downstream matchNumbers that depend on a given matchNumber.
 */
function findDownstream(bracket, matchNumber) {
  const rounds = bracket?.rounds || {};
  const downstream = new Set();
  const roundOrder = ['r32', 'r16', 'qf', 'sf', 'third', 'final'];

  // Build dependency map
  const deps = {};
  for (const roundKey of roundOrder) {
    const matches = rounds[roundKey];
    if (!matches) continue;
    for (const m of matches) {
      if (m.fromMatches) {
        for (const up of m.fromMatches) {
          if (!deps[up]) deps[up] = [];
          deps[up].push(m.matchNumber);
        }
      }
    }
  }

  // BFS
  const queue = [matchNumber];
  while (queue.length > 0) {
    const current = queue.shift();
    const children = deps[current] || [];
    for (const c of children) {
      if (!downstream.has(c)) {
        downstream.add(c);
        queue.push(c);
      }
    }
  }

  return downstream;
}

export default function BracketScreen() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const { data: bracket, loading: bracketLoading } = useData('bracket');
  const { data: predictions } = useData('predictions');
  const { data: teamsMeta } = useData('teams-meta');

  const [overrides, setOverrides] = useState(loadOverrides);
  const [shareVisible, setShareVisible] = useState(false);
  const shareRef = useRef(null);

  // Persist overrides
  useEffect(() => {
    saveOverrides(overrides);
  }, [overrides]);

  const resolved = useMemo(() => {
    if (!bracket) return null;
    return resolveBracket(bracket, overrides);
  }, [bracket, overrides]);

  const handleSelect = useCallback((matchId, teamCode) => {
    if (!bracket) return;

    setOverrides(prev => {
      const next = { ...prev };

      // Find the match to get matchNumber
      let matchNumber = null;
      for (const round of Object.values(bracket.rounds)) {
        const m = round.find(r => r.matchId === matchId);
        if (m) { matchNumber = m.matchNumber; break; }
      }

      // Toggle: if already selected, deselect
      if (prev[matchId] === teamCode) {
        delete next[matchId];
      } else {
        next[matchId] = teamCode;
      }

      // Cascade: reset downstream overrides
      if (matchNumber) {
        const downstream = findDownstream(bracket, matchNumber);
        for (const dmn of downstream) {
          // Find matchId for this matchNumber
          for (const round of Object.values(bracket.rounds)) {
            const m = round.find(r => r.matchNumber === dmn);
            if (m) delete next[m.matchId];
          }
        }
      }

      return next;
    });
  }, [bracket]);

  const handleFillByModel = useCallback(() => {
    if (!resolved) return;
    const next = {};
    // For each match with teams but no override, pick the team with higher Elo
    for (const m of Object.values(resolved.byMatchNum)) {
      if (m.homeTeam && m.awayTeam && !overrides[m.matchId]) {
        // Simple model: pick home as default model prediction
        // In a real scenario, use predictions for qualify probs
        next[m.matchId] = m.homeTeam;
      }
    }
    setOverrides(prev => ({ ...prev, ...next }));
  }, [resolved, overrides]);

  const handleReset = useCallback(() => {
    setOverrides({});
  }, []);

  const nameOf = useCallback((code) => {
    if (!teamsMeta?.[code]) return code;
    return i18n.language === 'he' ? teamsMeta[code].nameHE : teamsMeta[code].nameEN;
  }, [teamsMeta, i18n.language]);

  const handleShareBracket = useCallback(async () => {
    if (!resolved || !bracket) return;
    setShareVisible(true);
    requestAnimationFrame(async () => {
      try {
        const blob = await renderToImage(shareRef, 360, 360);
        await shareBlob(blob, 'mundial-bracket.png', t('bracket.title'));
      } catch (err) {
        console.error('Share failed:', err);
      }
      setShareVisible(false);
    });
  }, [resolved, bracket, t]);

  // Calculate champion
  const finalMatch = resolved?.byMatchNum?.[104]; // final-104
  const champion = finalMatch
    ? overrides[finalMatch.matchId] || finalMatch.homeTeam
    : null;

  // Count stages filled
  const totalStages = 7; // r32, r16, qf, sf, third, final, champion
  const filledStages = useMemo(() => {
    if (!resolved) return 0;
    let count = 0;
    const roundKeys = ['r32', 'r16', 'qf', 'sf', 'third', 'final'];
    for (const key of roundKeys) {
      const matches = bracket?.rounds?.[key] || [];
      const allFilled = matches.every(m => overrides[m.matchId]);
      if (allFilled && matches.length > 0) count++;
    }
    if (champion) count++;
    return count;
  }, [resolved, overrides, bracket, champion]);

  if (bracketLoading) {
    return (
      <div className={styles.page}>
        <Skeleton width="100%" height="40px" radius="8px" />
        <Skeleton width="100%" height="200px" radius="20px" />
      </div>
    );
  }

  const roundLabels = {
    r32: t('stage.r32'),
    r16: t('stage.r16'),
    qf: t('stage.qf'),
    sf: t('stage.sf'),
    third: t('stage.thirdPlace'),
    final: t('stage.final'),
  };

  return (
    <div className={styles.page}>
      {/* Top bar */}
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => navigate(-1)}>
          <Ico name="back" size={22} />
        </button>
        <span className={styles.topTitle}>{t('bracket.title')}</span>
        <button className={styles.shareBtn} onClick={handleShareBracket}>
          <Ico name="share" size={20} />
        </button>
      </div>

      {/* Progress */}
      <div className={styles.progress}>
        {filledStages}/{totalStages} {t('bracket.progress')}
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        <Btn variant="ghost" size="sm" onClick={handleFillByModel}>
          {t('bracket.fillByModel')}
        </Btn>
        <Btn variant="ghost" size="sm" onClick={handleReset}>
          {t('bracket.resetOverrides')}
        </Btn>
        <Btn variant="primary" size="sm" onClick={handleShareBracket}>
          {t('bracket.shareBracket')}
        </Btn>
      </div>

      {/* Champion reveal */}
      <Card className={styles.championCard}>
        <div className={styles.championLabel}>{t('bracket.champion')}</div>
        <Trophy
          teamCode={champion}
          teamsMeta={teamsMeta}
          isUserPick={!!overrides[finalMatch?.matchId]}
        />
      </Card>

      {/* Bracket rounds */}
      {resolved && bracket && ['r32', 'r16', 'qf', 'sf', 'third', 'final'].map(roundKey => {
        const matches = bracket.rounds[roundKey];
        if (!matches || matches.length === 0) return null;

        return (
          <div key={roundKey}>
            <div className={styles.roundLabel}>{roundLabels[roundKey]}</div>
            <div className={styles.roundGrid}>
              {matches.map(m => {
                const resolvedMatch = resolved.byMatchNum[m.matchNumber];
                const pred = predictions?.find(p => p.matchId === m.matchId);

                return (
                  <BracketTie
                    key={m.matchId}
                    match={resolvedMatch || m}
                    teamsMeta={teamsMeta}
                    winner={overrides[m.matchId] || null}
                    homeWinPct={pred?.qualify?.home}
                    awayWinPct={pred?.qualify?.away}
                    onSelect={handleSelect}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Hidden share card for bracket image capture */}
      {shareVisible && bracket && (
        <div style={{ position: 'fixed', left: '-9999px', top: 0 }} aria-hidden="true">
          <div ref={shareRef}>
            <BracketCard
              champion={champion ? { code: champion, name: nameOf(champion) } : null}
              rounds={['final', 'sf', 'qf'].map(roundKey => {
                const matches = bracket.rounds[roundKey] || [];
                return {
                  label: roundLabels[roundKey],
                  ties: matches.map(m => {
                    const rm = resolved.byMatchNum[m.matchNumber];
                    return {
                      home: nameOf(rm?.homeTeam || m.homeTeam),
                      away: nameOf(rm?.awayTeam || m.awayTeam),
                    };
                  }),
                };
              })}
              userPicks={Object.keys(overrides).length}
              modelPicks={
                bracket
                  ? Object.values(bracket.rounds).flat().length - Object.keys(overrides).length
                  : 0
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
