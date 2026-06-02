/**
 * Elo calibration module — converts Elo ratings to expected goals (lambda).
 * Shared between build script (Node.js) and React client.
 */

/** Historical World Cup average goals per team per game */
export const BASELINE_LAMBDA = 1.35;

/** Elo-to-lambda conversion factor: 400 Elo ≈ 0.8 goal advantage */
export const ELO_SCALE = 400;
export const ELO_GOAL_FACTOR = 0.8;

/** Time-decay half-life constant (days). ~385 days half-life. */
export const DECAY_RATE = 0.0018;

/**
 * Convert Elo difference to expected goals difference.
 * Formula: eloDiff / 400 * 0.8
 * @param {number} eloDiff - Home Elo minus Away Elo
 * @returns {number} Expected goals difference
 */
export function eloToLambdaDiff(eloDiff) {
  return (eloDiff / ELO_SCALE) * ELO_GOAL_FACTOR;
}

/**
 * Compute expected goals (lambda) for a team given their Elo vs opponent's Elo.
 * Formula: baseline * exp(eloToLambdaDiff)
 * @param {{ elo: number }} team - Team object with Elo rating
 * @param {{ elo: number }} opponent - Opponent object with Elo rating
 * @param {{ homeAdvantage?: number }} [options] - Optional home advantage (ln(1.15) for hosts)
 * @returns {number} Expected goals (lambda) for the team
 */
export function getTeamLambda(team, opponent, options = {}) {
  const eloDiff = team.elo - opponent.elo;
  const lambdaDiff = eloToLambdaDiff(eloDiff);
  const lambda = BASELINE_LAMBDA * Math.exp(lambdaDiff);
  return options.homeAdvantage ? lambda * Math.exp(options.homeAdvantage) : lambda;
}

/**
 * Compute time-decay weight for a historical match.
 * Matches older than 2 years get ~0.25 weight.
 * Formula: exp(-0.0018 * daysSince)
 * @param {string|Date} matchDate - Date of the match
 * @param {string|Date} [referenceDate] - Reference date (default: now)
 * @returns {number} Weight between 0 and 1
 */
export function timeDecayWeight(matchDate, referenceDate = new Date()) {
  const match = new Date(matchDate);
  const ref = new Date(referenceDate);
  const daysSince = (ref - match) / (1000 * 60 * 60 * 24);
  return Math.exp(-DECAY_RATE * Math.max(0, daysSince));
}

/**
 * Compute attack and defence parameters from match results.
 * Uses log-ratio method relative to tournament average.
 *
 * attack[team]  = log(avgGoalsScored[team] / avgGoalsScored[all])
 * defence[team] = log(avgGoalsConceded[team] / avgGoalsConceded[all])
 *
 * Starts from Elo-derived prior when insufficient data.
 *
 * @param {Array<{team: string, goalsFor: number, goalsAgainst: number, date: string}>} results
 * @param {Map<string, number>} eloMap - teamCode -> Elo rating
 * @param {number} [minMatches=3] - Minimum matches before using data over Elo prior
 * @returns {{ attack: Object<string, number>, defence: Object<string, number> }}
 */
export function computeAttackDefence(results, eloMap, minMatches = 3) {
  // Aggregate per-team stats
  const teamStats = {};
  let totalGoalsFor = 0;
  let totalGoalsAgainst = 0;
  let totalMatches = 0;

  for (const r of results) {
    if (!teamStats[r.team]) {
      teamStats[r.team] = { goalsFor: 0, goalsAgainst: 0, matches: 0 };
    }
    teamStats[r.team].goalsFor += r.goalsFor;
    teamStats[r.team].goalsAgainst += r.goalsAgainst;
    teamStats[r.team].matches += 1;
    totalGoalsFor += r.goalsFor;
    totalGoalsAgainst += r.goalsAgainst;
    totalMatches += 1;
  }

  const avgGoalsFor = totalMatches > 0 ? totalGoalsFor / totalMatches : BASELINE_LAMBDA;
  const avgGoalsAgainst = totalMatches > 0 ? totalGoalsAgainst / totalMatches : BASELINE_LAMBDA;

  const attack = {};
  const defence = {};

  for (const [team, stats] of Object.entries(teamStats)) {
    if (stats.matches >= minMatches && stats.goalsFor > 0 && stats.goalsAgainst > 0) {
      const teamAvgFor = stats.goalsFor / stats.matches;
      const teamAvgAgainst = stats.goalsAgainst / stats.matches;
      attack[team] = Math.log(teamAvgFor / avgGoalsFor);
      defence[team] = Math.log(teamAvgAgainst / avgGoalsAgainst);
    } else if (eloMap.has(team)) {
      // Fallback: derive from Elo relative to average
      const avgElo = [...eloMap.values()].reduce((a, b) => a + b, 0) / eloMap.size;
      const eloDiff = eloMap.get(team) - avgElo;
      attack[team] = eloToLambdaDiff(eloDiff) * 0.5;
      defence[team] = -eloToLambdaDiff(eloDiff) * 0.3;
    } else {
      attack[team] = 0;
      defence[team] = 0;
    }
  }

  return { attack, defence };
}
