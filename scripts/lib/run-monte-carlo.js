/**
 * Build-time wrapper for Monte Carlo tournament simulation.
 * Loads existing predictions, teams, matches, standings, bracket, seeding
 * and runs N simulations via the shared monte-carlo.js engine.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTournamentSim } from '../../src/engine/monte-carlo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Run Monte Carlo tournament simulation.
 *
 * @param {Object} params
 * @param {Array} params.matches - All matches
 * @param {Array} params.predictions - All predictions (with probs)
 * @param {Object} params.teams - Team data map
 * @param {Object} params.teamsMeta - Team metadata
 * @param {Object} params.standings - Group standings
 * @param {Object} params.bracket - Knockout bracket
 * @param {Object} params.seedingData - R32 seeding table
 * @param {number} [params.n=10000] - Number of simulations
 * @returns {Object} Tournament probabilities
 */
export function runMonteCarlo({ matches, predictions, teams, teamsMeta, standings, bracket, seedingData, n = 10000 }) {
  // Build match probability map from predictions
  const matchProbs = new Map();
  for (const pred of predictions) {
    matchProbs.set(pred.matchId, {
      home: pred.probs.home,
      draw: pred.probs.draw,
      away: pred.probs.away,
    });
  }

  // Build team map for the engine
  const teamMap = {};
  for (const [code, data] of Object.entries(teams)) {
    teamMap[code] = { code, elo: data.elo, group: data.group };
  }

  const startTime = Date.now();
  const result = runTournamentSim(matches, matchProbs, teamMap, teamsMeta, bracket, seedingData, { n });
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`  Monte Carlo: ${n} simulations in ${elapsed}s`);
  if (result.confidence.mostLikelyChampion) {
    const champ = result.confidence.mostLikelyChampion;
    console.log(`  Most likely champion: ${champ.team} (${(champ.prob * 100).toFixed(1)}%)`);
  }

  return result;
}

export default runMonteCarlo;
