/**
 * Compute attack/defence priors from qualifying campaign data.
 * Reuses the time-decay weighted approach from calibrate.js.
 *
 * Pure function, takes qualifier data + Elo map, returns prior map.
 */

import { computeAttackDefence } from '../../src/engine/calibrate.js';

/**
 * Build qualifier form priors from qualifying campaign results.
 *
 * @param {Map|Object|null} qualifierData - Team code -> Array of match results
 *   Each result: { goalsFor, goalsAgainst, date }
 * @param {Map<string, number>} eloMap - Team code -> Elo rating
 * @returns {Map<string, { attack: number, defence: number, matches: number }>}
 */
export function buildQualifierForm(qualifierData, eloMap) {
  const result = new Map();

  if (!qualifierData) return result;

  // Support both Map and plain object (from cache deserialization)
  const entries = qualifierData instanceof Map
    ? qualifierData.entries()
    : Object.entries(qualifierData);

  // Collect all qualifier results in the format computeAttackDefence expects
  const allResults = [];
  const teamMatchCounts = {};

  for (const [code, matches] of entries) {
    if (!Array.isArray(matches)) continue;
    teamMatchCounts[code] = matches.length;

    for (const m of matches) {
      if (m.goalsFor == null || m.goalsAgainst == null) continue;
      allResults.push({
        team: code,
        goalsFor: m.goalsFor,
        goalsAgainst: m.goalsAgainst,
        date: m.date,
      });
    }
  }

  if (allResults.length === 0) return result;

  // Use computeAttackDefence with minMatches=1 (qualifier data is sparse)
  const { attack, defence } = computeAttackDefence(allResults, eloMap, 1);

  for (const [code, count] of Object.entries(teamMatchCounts)) {
    if (attack[code] !== undefined) {
      result.set(code, {
        attack: attack[code],
        defence: defence[code],
        matches: count,
      });
    }
  }

  return result;
}

export default buildQualifierForm;
