/**
 * Load xG (expected goals) data from a manual CSV/JSON snapshot.
 * xG data supplements attack/defence parameters — it's more predictive
 * than actual goals because it strips out finishing variance (luck).
 *
 * Data source: FBref/Understat manual snapshot (updated weekly pre-tournament).
 * During the tournament, actual match data supersedes xG.
 *
 * Pure function, no side effects.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load xG snapshot data from scripts/data/xg-snapshot.json.
 *
 * @param {string} [filepath] - Override path (for testing)
 * @returns {Object|null} Map of team code -> { xG_for, xG_against, matches } or null
 */
export function loadXgData(filepath) {
  const path = filepath || join(__dirname, '..', 'data', 'xg-snapshot.json');
  try {
    const raw = readFileSync(path, 'utf8');
    const data = JSON.parse(raw);
    if (!data.teams || typeof data.teams !== 'object') return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Compute xG-based attack/defence adjustment for a team.
 *
 * xG blend: log(team_xG_for / baseline) for attack, log(team_xG_against / baseline) for defence.
 * The result is blended with goal-based attack/defence using the specified weight.
 *
 * @param {Object} xgData - Output from loadXgData()
 * @param {number} baseline - Baseline goals per team per match (default: 1.35)
 * @returns {{ xgAttack: Object<string,number>, xgDefence: Object<string,number> }}
 */
export function computeXgParams(xgData, baseline = 1.35) {
  if (!xgData || !xgData.teams) return { xgAttack: {}, xgDefence: {} };

  const xgAttack = {};
  const xgDefence = {};

  for (const [team, entry] of Object.entries(xgData.teams)) {
    if (entry.xG_for == null || entry.xG_against == null) continue;
    xgAttack[team] = Math.log(entry.xG_for / baseline);
    xgDefence[team] = Math.log(Math.max(entry.xG_against, 0.01) / baseline);
  }

  return { xgAttack, xgDefence };
}

/**
 * Blend xG-based params with existing attack/defence params.
 *
 * Weight: xgWeight for xG, (1 - xgWeight) for actual goals.
 * Only applies when the team has xG data AND fewer than minTournamentMatches played.
 * For teams with 3+ tournament matches, actual data is sufficient — xG adds no value.
 *
 * @param {Object} attack - Existing attack params (team -> number)
 * @param {Object} defence - Existing defence params (team -> number)
 * @param {Object} xgAttack - xG-based attack params (team -> number)
 * @param {Object} xgDefence - xG-based defence params (team -> number)
 * @param {Object<string,{matchesPlayed: number}>} teamInfo - Team match counts
 * @param {number} [xgWeight=0.3] - Weight for xG data (default 30%)
 * @param {number} [minTournamentMatches=3] - Min matches before xG is excluded
 * @returns {{ attack: Object, defence: Object }}
 */
export function blendXgParams(attack, defence, xgAttack, xgDefence, teamInfo, xgWeight = 0.3, minTournamentMatches = 3) {
  const blendedAttack = { ...attack };
  const blendedDefence = { ...defence };

  for (const team of Object.keys(xgAttack)) {
    const info = teamInfo[team];
    const played = info?.matchesPlayed ?? 0;

    // Only blend xG for teams with sparse tournament data
    if (played >= minTournamentMatches) continue;

    const goalAttack = attack[team] ?? 0;
    const goalDefence = defence[team] ?? 0;
    const xgA = xgAttack[team] ?? 0;
    const xgD = xgDefence[team] ?? 0;

    // For 0 tournament matches: use xG weight fully
    // For 1-2 matches: scale xG weight down proportionally
    const effectiveWeight = played === 0 ? xgWeight : xgWeight * (1 - played / minTournamentMatches);

    blendedAttack[team] = (1 - effectiveWeight) * goalAttack + effectiveWeight * xgA;
    blendedDefence[team] = (1 - effectiveWeight) * goalDefence + effectiveWeight * xgD;
  }

  return { attack: blendedAttack, defence: blendedDefence };
}

export default { loadXgData, computeXgParams, blendXgParams };
