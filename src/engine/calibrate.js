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
 * Formula: baseline * exp(eloToLambdaDiff) * exp(attack) * exp(opponentDefence) * exp(homeAdvantage)
 * @param {{ elo: number }} team - Team object with Elo rating
 * @param {{ elo: number }} opponent - Opponent object with Elo rating
 * @param {{ homeAdvantage?: number, attack?: number, opponentDefence?: number, availabilityMult?: number }} [options] - Optional factors
 * @returns {number} Expected goals (lambda) for the team
 */
export function getTeamLambda(team, opponent, options = {}) {
  const eloDiff = team.elo - opponent.elo;
  const lambdaDiff = eloToLambdaDiff(eloDiff);
  let lambda = BASELINE_LAMBDA * Math.exp(lambdaDiff);
  if (options.attack) lambda *= Math.exp(options.attack);
  if (options.opponentDefence) lambda *= Math.exp(options.opponentDefence);
  if (options.homeAdvantage) lambda *= Math.exp(options.homeAdvantage);
  if (options.availabilityMult && options.availabilityMult !== 1) lambda *= options.availabilityMult;
  return lambda;
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
 * Uses time-weighted log-ratio method relative to tournament average.
 * Recent matches receive higher weight via exponential time decay.
 *
 * attack[team]  = log(weightedAvgGoalsScored[team] / weightedAvgGoalsScored[all])
 * defence[team] = log(weightedAvgGoalsConceded[team] / weightedAvgGoalsConceded[all])
 *
 * Starts from Elo-derived prior when insufficient data.
 * Blends data with Elo prior for partial data (0 < matches < minMatches).
 *
 * @param {Array<{team: string, goalsFor: number, goalsAgainst: number, date: string}>} results
 * @param {Map<string, number>} eloMap - teamCode -> Elo rating
 * @param {number} [minMatches=3] - Minimum matches before using data over Elo prior
 * @returns {{ attack: Object<string, number>, defence: Object<string, number> }}
 */
export function computeAttackDefence(results, eloMap, minMatches = 3) {
  // Aggregate per-team stats with time-weighted goals
  const teamStats = {};
  let totalWeightedGoalsFor = 0;
  let totalWeightedGoalsAgainst = 0;
  let totalWeightedMatches = 0;

  for (const r of results) {
    const w = timeDecayWeight(r.date);

    if (!teamStats[r.team]) {
      teamStats[r.team] = { weightedGoalsFor: 0, weightedGoalsAgainst: 0, weightedMatches: 0, matches: 0, goalsFor: 0, goalsAgainst: 0 };
    }
    teamStats[r.team].weightedGoalsFor += r.goalsFor * w;
    teamStats[r.team].weightedGoalsAgainst += r.goalsAgainst * w;
    teamStats[r.team].weightedMatches += w;
    teamStats[r.team].matches += 1;
    teamStats[r.team].goalsFor += r.goalsFor;
    teamStats[r.team].goalsAgainst += r.goalsAgainst;
    totalWeightedGoalsFor += r.goalsFor * w;
    totalWeightedGoalsAgainst += r.goalsAgainst * w;
    totalWeightedMatches += w;
  }

  const avgGoalsFor = totalWeightedMatches > 0 ? totalWeightedGoalsFor / totalWeightedMatches : BASELINE_LAMBDA;
  const avgGoalsAgainst = totalWeightedMatches > 0 ? totalWeightedGoalsAgainst / totalWeightedMatches : BASELINE_LAMBDA;

  // Pre-compute average Elo once for all Elo-prior derivations
  const avgElo = eloMap.size > 0 ? [...eloMap.values()].reduce((a, b) => a + b, 0) / eloMap.size : 0;

  const attack = {};
  const defence = {};

  for (const [team, stats] of Object.entries(teamStats)) {
    const eloPrior = eloMap.has(team) ? computeEloPrior(eloMap, team, avgElo) : { attack: 0, defence: 0 };

    if (stats.matches >= minMatches && stats.goalsFor > 0) {
      // Full data: use weighted averages
      const teamAvgFor = stats.weightedGoalsFor / stats.weightedMatches;
      const teamAvgAgainst = stats.weightedGoalsAgainst / stats.weightedMatches;
      attack[team] = Math.log(teamAvgFor / avgGoalsFor);
      // Floor teamAvgAgainst to avoid log(0) for teams with all clean sheets
      defence[team] = Math.log(Math.max(teamAvgAgainst, 0.01) / avgGoalsAgainst);
    } else if (stats.matches > 0 && stats.goalsFor > 0) {
      // Partial data: blend data-based with Elo prior
      const teamAvgFor = stats.weightedGoalsFor / stats.weightedMatches;
      const teamAvgAgainst = stats.weightedGoalsAgainst / stats.weightedMatches;
      const dataAttack = Math.log(teamAvgFor / avgGoalsFor);
      const dataDefence = Math.log(Math.max(teamAvgAgainst, 0.01) / avgGoalsAgainst);
      const blendWeight = stats.matches / minMatches;
      attack[team] = blendWeight * dataAttack + (1 - blendWeight) * eloPrior.attack;
      defence[team] = blendWeight * dataDefence + (1 - blendWeight) * eloPrior.defence;
    } else if (eloMap.has(team)) {
      attack[team] = eloPrior.attack;
      defence[team] = eloPrior.defence;
    } else {
      attack[team] = 0;
      defence[team] = 0;
    }
  }

  return { attack, defence };
}

/**
 * Compute Elo-based prior for attack/defence parameters.
 * @param {Map<string, number>} eloMap
 * @param {string} team
 * @returns {{ attack: number, defence: number }}
 */
function computeEloPrior(eloMap, team, avgElo) {
  const eloDiff = eloMap.get(team) - avgElo;
  return {
    attack: eloToLambdaDiff(eloDiff) * 0.5,
    defence: -eloToLambdaDiff(eloDiff) * 0.3,
  };
}
