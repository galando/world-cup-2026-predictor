/**
 * Dixon-Coles Poisson prediction engine.
 * Shared between build script (Node.js) and React client.
 */

// Pre-computed factorials for k = 0..15
const FACTORIALS = [1, 1, 2, 6, 24, 120, 720, 5040, 40320,
  362880, 3628800, 39916800, 479001600, 6227020800, 87178291200, 1307674368000];

/**
 * Poisson probability mass function: P(X=k) = e^(-lambda) * lambda^k / k!
 * @param {number} k - Number of goals (non-negative integer)
 * @param {number} lambda - Expected goals (lambda > 0)
 * @returns {number} Probability
 */
export function poissonPmf(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  if (k < 0 || !Number.isInteger(k)) return 0;
  if (k < FACTORIALS.length) {
    return Math.exp(-lambda + k * Math.log(lambda) - Math.log(FACTORIALS[k]));
  }
  // Fallback for k >= 16 using log-gamma
  let logFact = 0;
  for (let i = 2; i <= k; i++) logFact += Math.log(i);
  return Math.exp(-lambda + k * Math.log(lambda) - logFact);
}

/**
 * Build a (maxGoals+1) x (maxGoals+1) grid of Poisson probabilities.
 * Cell [h][a] = P(home scores h) * P(away scores a)
 * @param {number} lambdaH - Home expected goals
 * @param {number} lambdaA - Away expected goals
 * @param {number} maxGoals - Maximum goals to compute (default 8)
 * @returns {number[][]} Probability grid
 */
export function buildGrid(lambdaH, lambdaA, maxGoals = 8) {
  const grid = [];
  for (let h = 0; h <= maxGoals; h++) {
    grid[h] = [];
    for (let a = 0; a <= maxGoals; a++) {
      grid[h][a] = poissonPmf(h, lambdaH) * poissonPmf(a, lambdaA);
    }
  }
  return grid;
}

/**
 * Apply Dixon-Coles correction to the Poisson grid.
 * Adjusts low-score cells (0,0), (0,1), (1,0), (1,1) using tau correction,
 * then normalizes so all cells sum to 1.
 *
 * tau(h,a) formula:
 *   (0,0): 1 - lambdaH*lambdaA*rho
 *   (1,0): 1 + lambdaA*rho
 *   (0,1): 1 + lambdaH*rho
 *   (1,1): 1 - rho
 *   all others: 1 (unchanged)
 *
 * @param {number[][]} grid - Raw Poisson grid from buildGrid
 * @param {number} lambdaH - Home expected goals
 * @param {number} lambdaA - Away expected goals
 * @param {number} rho - Correction parameter (default -0.05)
 * @returns {number[][]} Corrected and normalized grid
 */
export function applyDixonColes(grid, lambdaH, lambdaA, rho = -0.05) {
  const g = grid.map(row => [...row]);

  // Apply tau corrections to the four low-score cells
  g[0][0] *= (1 - lambdaH * lambdaA * rho);
  g[1][0] *= (1 + lambdaA * rho);
  g[0][1] *= (1 + lambdaH * rho);
  g[1][1] *= (1 - rho);

  // Normalize so all cells sum to 1
  const sum = g.flat().reduce((a, b) => a + b, 0);
  return g.map(row => row.map(v => v / sum));
}

/**
 * Aggregate grid into home win / draw / away win probabilities.
 * @param {number[][]} grid - Probability grid (corrected or raw)
 * @returns {{ home: number, draw: number, away: number }}
 */
export function aggregateOutcome(grid) {
  let home = 0, draw = 0, away = 0;
  grid.forEach((row, h) =>
    row.forEach((p, a) => {
      if (h > a) home += p;
      else if (h === a) draw += p;
      else away += p;
    })
  );
  return { home, draw, away };
}

/**
 * Get top N most likely scorelines from the grid.
 * @param {number[][]} grid - Probability grid
 * @param {number} n - Number of top scores to return (default 4)
 * @returns {Array<{score: string, h: number, a: number, p: number}>}
 */
export function topScorelines(grid, n = 4) {
  const entries = [];
  grid.forEach((row, h) =>
    row.forEach((p, a) => {
      entries.push({ score: `${h}-${a}`, h, a, p });
    })
  );
  entries.sort((a, b) => b.p - a.p);
  return entries.slice(0, n);
}
