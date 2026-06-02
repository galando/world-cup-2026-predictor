/**
 * Compute team strength parameters from match results + Elo prior.
 * Produces attack/defence parameters and per-team stats.
 */

import { BASELINE_LAMBDA, computeAttackDefence, eloToLambdaDiff } from '../../src/engine/calibrate.js';

/**
 * Compute team data from finished matches and Elo ratings.
 * Returns { teams: Object<code, teamData>, attack, defence }
 */
export function computeTeams(matches, eloMap, teamsMeta) {
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

  // Compute attack/defence params
  const { attack, defence } = computeAttackDefence(results, eloMap);

  // Build per-team data
  const teams = {};
  for (const [code, elo] of eloMap.entries()) {
    const meta = teamsMeta[code] || {};
    const teamResults = results.filter(r => r.team === code);
    const matchesPlayed = teamResults.length;
    const goalsFor = teamResults.reduce((sum, r) => sum + r.goalsFor, 0);
    const goalsAgainst = teamResults.reduce((sum, r) => sum + r.goalsAgainst, 0);

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
      attack: attack[code] || 0,
      defence: defence[code] || 0,
      form: buildForm(teamResults),
      matchesPlayed,
    };
  }

  return { teams, attack, defence };
}

/**
 * Build form array (last 5 results: W/D/L).
 */
function buildForm(results) {
  // Sort by date descending, take last 5
  const sorted = [...results].sort((a, b) => new Date(b.date) - new Date(a.date));
  const last5 = sorted.slice(0, 5);
  return last5.map(r => r.goalsFor > r.goalsAgainst ? 'W' : r.goalsFor === r.goalsAgainst ? 'D' : 'L');
}

export default computeTeams;
