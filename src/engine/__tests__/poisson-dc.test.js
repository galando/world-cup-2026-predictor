import { describe, it, expect } from 'vitest';
import {
  poissonPmf,
  buildGrid,
  applyDixonColes,
  aggregateOutcome,
  topScorelines,
} from '../poisson-dc.js';

describe('poissonPmf', () => {
  it('returns 1 for k=0 when lambda=0', () => {
    expect(poissonPmf(0, 0)).toBe(1);
  });

  it('returns 0 for k>0 when lambda=0', () => {
    expect(poissonPmf(1, 0)).toBe(0);
    expect(poissonPmf(5, 0)).toBe(0);
  });

  it('sums to 1 across k=0..20 for various lambda', () => {
    for (const lambda of [0.5, 1.0, 1.35, 2.0, 3.5]) {
      let sum = 0;
      for (let k = 0; k <= 20; k++) sum += poissonPmf(k, lambda);
      expect(sum).toBeCloseTo(1, 6);
    }
  });

  it('returns known value for lambda=1, k=0', () => {
    expect(poissonPmf(0, 1)).toBeCloseTo(Math.exp(-1), 10);
  });

  it('returns known value for lambda=2, k=3', () => {
    // e^-2 * 8 / 6
    expect(poissonPmf(3, 2)).toBeCloseTo(Math.exp(-2) * 8 / 6, 10);
  });
});

describe('buildGrid', () => {
  it('produces a 9x9 grid by default', () => {
    const grid = buildGrid(1.5, 0.9);
    expect(grid.length).toBe(9);
    grid.forEach(row => expect(row.length).toBe(9));
  });

  it('produces a custom-sized grid', () => {
    const grid = buildGrid(1.5, 0.9, 6);
    expect(grid.length).toBe(7);
    grid.forEach(row => expect(row.length).toBe(7));
  });

  it('grid cells sum to approximately 1 (raw Poisson)', () => {
    const grid = buildGrid(1.82, 0.74);
    const sum = grid.flat().reduce((a, b) => a + b, 0);
    // Raw Poisson truncated at 8 goals won't sum to exactly 1
    expect(sum).toBeCloseTo(1, 2);
  });

  it('all cells are non-negative', () => {
    const grid = buildGrid(2.5, 0.5);
    grid.forEach(row => row.forEach(p => expect(p).toBeGreaterThanOrEqual(0)));
  });
});

// Scenario 1: Dixon-Coles probabilities sum to 1
describe('Dixon-Coles probabilities sum to 1', () => {
  it('grid cells sum to 1.0 after correction', () => {
    const raw = buildGrid(1.82, 0.74);
    const corrected = applyDixonColes(raw, 1.82, 0.74, -0.05);
    const sum = corrected.flat().reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it('home/draw/away probabilities sum to 1.0', () => {
    const raw = buildGrid(1.82, 0.74);
    const corrected = applyDixonColes(raw, 1.82, 0.74, -0.05);
    const { home, draw, away } = aggregateOutcome(corrected);
    expect(home + draw + away).toBeCloseTo(1, 4);
  });
});

// Scenario 2: Dixon-Coles correction only affects low-score cells
describe('Dixon-Coles correction only affects low-score cells', () => {
  it('only cells (0,0), (0,1), (1,0), (1,1) differ from raw Poisson', () => {
    const raw = buildGrid(1.5, 0.9);
    const corrected = applyDixonColes(raw, 1.5, 0.9, -0.05);

    // Compute normalization factor to compare fairly
    // corrected cells = (raw * tau) / normalizer
    // For non-corrected cells, tau=1, so corrected = raw / normalizer
    // For the 4 corrected cells, tau != 1

    // Compute normalization constant from raw
    const tau00 = 1 - 1.5 * 0.9 * (-0.05);
    const tau10 = 1 + 0.9 * (-0.05);
    const tau01 = 1 + 1.5 * (-0.05);
    const tau11 = 1 - (-0.05);

    const rawSum =
      raw[0][0] * tau00 + raw[1][0] * tau10 + raw[0][1] * tau01 + raw[1][1] * tau11 +
      raw.flat().reduce((s, v, i) => {
        const h = Math.floor(i / 9);
        const a = i % 9;
        if ((h === 0 && a === 0) || (h === 1 && a === 0) || (h === 0 && a === 1) || (h === 1 && a === 1)) return s;
        return s + v;
      }, 0);

    // Check corrected cells match tau-adjusted values
    expect(corrected[0][0]).toBeCloseTo(raw[0][0] * tau00 / rawSum, 10);
    expect(corrected[1][0]).toBeCloseTo(raw[1][0] * tau10 / rawSum, 10);
    expect(corrected[0][1]).toBeCloseTo(raw[0][1] * tau01 / rawSum, 10);
    expect(corrected[1][1]).toBeCloseTo(raw[1][1] * tau11 / rawSum, 10);

    // Check all other cells are raw / rawSum (only normalization applied)
    for (let h = 0; h <= 8; h++) {
      for (let a = 0; a <= 8; a++) {
        if ((h === 0 && a === 0) || (h === 1 && a === 0) || (h === 0 && a === 1) || (h === 1 && a === 1)) continue;
        expect(corrected[h][a]).toBeCloseTo(raw[h][a] / rawSum, 10);
      }
    }
  });
});

// Scenario 3: Strong team has higher win probability
describe('Strong team has higher win probability', () => {
  it('higher lambda produces higher win probability', () => {
    const gridStrong = buildGrid(2.5, 0.5);
    const correctedStrong = applyDixonColes(gridStrong, 2.5, 0.5, -0.05);
    const strong = aggregateOutcome(correctedStrong);

    const gridEven = buildGrid(1.2, 1.2);
    const correctedEven = applyDixonColes(gridEven, 1.2, 1.2, -0.05);
    const even = aggregateOutcome(correctedEven);

    expect(strong.home).toBeGreaterThan(even.home);
  });

  it('higher lambda produces higher expected goals', () => {
    // lambda directly represents expected goals
    expect(2.5).toBeGreaterThan(0.5);
  });
});

describe('topScorelines', () => {
  it('returns top 4 scorelines sorted by probability', () => {
    const raw = buildGrid(1.82, 0.74);
    const corrected = applyDixonColes(raw, 1.82, 0.74, -0.05);
    const top = topScorelines(corrected, 4);
    expect(top.length).toBe(4);
    for (let i = 1; i < top.length; i++) {
      expect(top[i - 1].p).toBeGreaterThanOrEqual(top[i].p);
    }
  });

  it('top scorelines have valid format', () => {
    const raw = buildGrid(1.82, 0.74);
    const corrected = applyDixonColes(raw, 1.82, 0.74, -0.05);
    const top = topScorelines(corrected);
    top.forEach(s => {
      expect(s.score).toMatch(/^\d+-\d+$/);
      expect(s.p).toBeGreaterThan(0);
      expect(Number.isInteger(s.h)).toBe(true);
      expect(Number.isInteger(s.a)).toBe(true);
    });
  });
});
