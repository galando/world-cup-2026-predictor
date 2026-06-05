/**
 * Compute team strength parameters from match results + Elo prior.
 * Produces attack/defence parameters and per-team stats.
 */

import { BASELINE_LAMBDA, computeAttackDefence, eloToLambdaDiff } from '../../src/engine/calibrate.js';
import { loadXgData, computeXgParams, blendXgParams } from './fetch-xg.js';

/**
 * Compute team data from finished matches and Elo ratings.
 * Returns { teams: Object<code, teamData>, attack, defence }
 *
 * @param {Array} matches - Match objects
 * @param {Map} eloMap - Team code -> Elo rating
 * @param {Object} teamsMeta - Team metadata
 * @param {Map} [qualifierPriors] - Optional: team -> { attack, defence, matches } from qualifiers
 * @param {Object} [xgData] - Optional: xG snapshot data from loadXgData()
 */
export function computeTeams(matches, eloMap, teamsMeta, qualifierPriors = new Map(), xgData = null) {
  // Build results array for attack/defence computation
  const results = [];
  for (const match of matches) {
    if (match.status !== 'FINISHED' || !match.score) continue;
    results.push({
      team: match.homeTeam,
      goalsFor: match.score.home,
      goalsAgainst: match.score.away,
      date: match.date,
    });
    results.push({
      team: match.awayTeam,
      goalsFor: match.score.away,
      goalsAgainst: match.score.home,
      date: match.date,
    });
  }

  // Compute attack/defence params from tournament data
  const { attack, defence } = computeAttackDefence(results, eloMap);

  // Compute xG-based params if xG data is available
  let finalAttack = attack;
  let finalDefence = defence;
  if (xgData) {
    const { xgAttack, xgDefence } = computeXgParams(xgData);
    // Build team match counts for blend decision
    const teamInfo = {};
    for (const r of results) {
      if (!teamInfo[r.team]) teamInfo[r.team] = { matchesPlayed: 0 };
      teamInfo[r.team].matchesPlayed++;
    }
    const blended = blendXgParams(attack, defence, xgAttack, xgDefence, teamInfo);
    finalAttack = blended.attack;
    finalDefence = blended.defence;
  }

  // Build per-team data
  const teams = {};
  for (const [code, elo] of eloMap.entries()) {
    const meta = teamsMeta[code] || {};
    const teamResults = results.filter(r => r.team === code);
    const matchesPlayed = teamResults.length;
    const goalsFor = teamResults.reduce((sum, r) => sum + r.goalsFor, 0);
    const goalsAgainst = teamResults.reduce((sum, r) => sum + r.goalsAgainst, 0);

    // Determine attack/defence: blend qualifier prior with tournament data + xG
    let teamAttack = finalAttack[code] || 0;
    let teamDefence = finalDefence[code] || 0;

    const prior = qualifierPriors.get ? qualifierPriors.get(code) : qualifierPriors[code];

    if (matchesPlayed === 0 && prior) {
      // No tournament data: use qualifier prior
      teamAttack = prior.attack;
      teamDefence = prior.defence;
    } else if (matchesPlayed > 0 && matchesPlayed < 3 && prior) {
      // Partial tournament data: blend qualifier + tournament (already xG-blended)
      const blendWeight = matchesPlayed / 3;
      teamAttack = blendWeight * (finalAttack[code] || 0) + (1 - blendWeight) * prior.attack;
      teamDefence = blendWeight * (finalDefence[code] || 0) + (1 - blendWeight) * prior.defence;
    }
    // else: 3+ tournament matches or no prior — use tournament data (existing behavior)

    teams[code] = {
      code,
      name: meta.nameEN || code,
      nameHE: meta.nameHE || code,
      elo,
      fifaRank: meta.fifaRank || 99,
      flagIso: meta.flagIso || '',
      group: meta.group || '',
      avgGoals: matchesPlayed > 0 ? goalsFor / matchesPlayed : BASELINE_LAMBDA,
      avgConceded: matchesPlayed > 0 ? goalsAgainst / matchesPlayed : BASELINE_LAMBDA,
      attack: teamAttack,
      defence: teamDefence,
      form: buildForm(teamResults),
      matchesPlayed,
    };
  }

  return { teams, attack, defence };
}

/**
 * Build form array (last 5 results: W/D/L).
 *
 * Design decision: Form is intentionally binary (W/D/L) rather than weighted
 * by scoreline magnitude. This is capped at the last 5 matches, sorted by date
 * descending, so recency is implicitly handled — only the most recent matches
 * are considered. No explicit time-decay weights are needed because the window
 * is already limited to recent results, and the binary W/D/L classification
 * doesn't benefit from continuous weighting.
 */
function buildForm(results) {
  // Sort by date descending, take last 5
  const sorted = [...results].sort((a, b) => new Date(b.date) - new Date(a.date));
  const last5 = sorted.slice(0, 5);
  return last5.map(r => r.goalsFor > r.goalsAgainst ? 'W' : r.goalsFor === r.goalsAgainst ? 'D' : 'L');
}

export default computeTeams;
