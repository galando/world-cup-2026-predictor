/**
 * Knockout round prediction module.
 * Computes qualify probabilities for knockout matches, accounting for
 * penalties when the match is drawn after 90 minutes.
 * Shared between build script (Node.js) and React client.
 */

import { aggregateOutcome } from './poisson-dc.js';

/**
 * Predict knockout match outcome including penalty shootout.
 *
 * Produces two outputs:
 * 1. probs90 — 90-minute result (home/draw/away), draw is possible
 * 2. qualify — qualification probabilities (home/away), draw probability
 *    is distributed via a penalty model proportional to Elo ratio
 *
 * @param {string} matchId - Match identifier (e.g., "r32-1")
 * @param {number} lambdaH - Home expected goals
 * @param {number} lambdaA - Away expected goals
 * @param {number[][]} grid - Dixon-Coles corrected probability grid
 * @param {number} eloHome - Home team Elo rating
 * @param {number} eloAway - Away team Elo rating
 * @returns {{ probs90: { home: number, draw: number, away: number }, qualify: { home: number, away: number } }}
 */
export function predictKnockout(matchId, lambdaH, lambdaA, grid, eloHome, eloAway) {
  const probs90 = aggregateOutcome(grid);

  // Penalty probability using standard Elo expected score formula
  const pHomePens = 1 / (1 + Math.pow(10, (eloAway - eloHome) / 400));

  const qualify = {
    home: probs90.home + probs90.draw * pHomePens,
    away: probs90.away + probs90.draw * (1 - pHomePens),
  };

  return { probs90, qualify };
}
