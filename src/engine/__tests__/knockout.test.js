import { describe, it, expect } from 'vitest';
import { buildGrid, applyDixonColes } from '../poisson-dc.js';
import { predictKnockout } from '../knockout.js';

// Scenario 4: Knockout qualify probabilities include penalties
describe('predictKnockout', () => {
  it('qualify probabilities sum to 1.0', () => {
    const raw = buildGrid(1.8, 1.1);
    const grid = applyDixonColes(raw, 1.8, 1.1, -0.05);
    const result = predictKnockout('sf-1', 1.8, 1.1, grid, 2050, 1920);
    expect(result.qualify.home + result.qualify.away).toBeCloseTo(1, 6);
  });

  it('qualify.home exceeds probs90.home (draw contributes via penalties)', () => {
    const raw = buildGrid(1.8, 1.1);
    const grid = applyDixonColes(raw, 1.8, 1.1, -0.05);
    const result = predictKnockout('sf-1', 1.8, 1.1, grid, 2050, 1920);
    // The draw probability is redistributed to home and away via penalties
    // Since home Elo > away Elo, qualify.home > probs90.home
    expect(result.qualify.home).toBeGreaterThan(result.probs90.home);
  });

  it('equal Elo produces 50/50 penalty split', () => {
    const raw = buildGrid(1.5, 1.5);
    const grid = applyDixonColes(raw, 1.5, 1.5, -0.05);
    const result = predictKnockout('r32-1', 1.5, 1.5, grid, 2000, 2000);
    expect(result.qualify.home).toBeCloseTo(result.qualify.away, 6);
  });

  it('probs90 includes draw probability', () => {
    const raw = buildGrid(1.8, 1.1);
    const grid = applyDixonColes(raw, 1.8, 1.1, -0.05);
    const result = predictKnockout('r16-1', 1.8, 1.1, grid, 2050, 1920);
    expect(result.probs90.draw).toBeGreaterThan(0);
  });

  it('stronger team has higher qualify probability', () => {
    const raw = buildGrid(2.5, 0.5);
    const grid = applyDixonColes(raw, 2.5, 0.5, -0.05);
    const result = predictKnockout('qf-1', 2.5, 0.5, grid, 2200, 1700);
    expect(result.qualify.home).toBeGreaterThan(result.qualify.away);
    expect(result.qualify.home).toBeGreaterThan(0.5);
  });
});
