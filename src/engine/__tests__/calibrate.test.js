import { describe, it, expect } from 'vitest';
import {
  BASELINE_LAMBDA,
  eloToLambdaDiff,
  getTeamLambda,
  timeDecayWeight,
  computeAttackDefence,
} from '../calibrate.js';

// Scenario 19: Elo-to-lambda conversion produces reasonable expected goals
describe('eloToLambdaDiff', () => {
  it('Elo diff 340 produces lambda diff ~0.68', () => {
    // 340 / 400 * 0.8 = 0.68
    expect(eloToLambdaDiff(340)).toBeCloseTo(0.68, 4);
  });

  it('Elo diff 0 produces lambda diff 0', () => {
    expect(eloToLambdaDiff(0)).toBe(0);
  });

  it('Negative Elo diff produces negative lambda diff', () => {
    expect(eloToLambdaDiff(-200)).toBeLessThan(0);
  });
});

describe('getTeamLambda', () => {
  it('strong team lambda exceeds baseline', () => {
    const team = { elo: 2140 };
    const opponent = { elo: 1800 };
    const lambda = getTeamLambda(team, opponent);
    expect(lambda).toBeGreaterThan(BASELINE_LAMBDA);
  });

  it('weak team lambda is below baseline', () => {
    const team = { elo: 1800 };
    const opponent = { elo: 2140 };
    const lambda = getTeamLambda(team, opponent);
    expect(lambda).toBeLessThan(BASELINE_LAMBDA);
  });

  it('equal Elo teams produce baseline lambda', () => {
    const team = { elo: 2000 };
    const opponent = { elo: 2000 };
    const lambda = getTeamLambda(team, opponent);
    expect(lambda).toBeCloseTo(BASELINE_LAMBDA, 6);
  });

  it('home advantage increases lambda', () => {
    const team = { elo: 2000 };
    const opponent = { elo: 2000 };
    const lambdaNeutral = getTeamLambda(team, opponent);
    const lambdaHome = getTeamLambda(team, opponent, { homeAdvantage: Math.log(1.15) });
    expect(lambdaHome).toBeGreaterThan(lambdaNeutral);
  });
});

describe('timeDecayWeight', () => {
  it('recent match gets weight close to 1', () => {
    const recent = new Date();
    recent.setDate(recent.getDate() - 1);
    expect(timeDecayWeight(recent.toISOString())).toBeCloseTo(Math.exp(-0.0018), 4);
  });

  it('2-year-old match gets ~0.25 weight', () => {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const weight = timeDecayWeight(twoYearsAgo.toISOString());
    // 730 days * 0.0018 = 1.314, exp(-1.314) ≈ 0.269
    expect(weight).toBeCloseTo(Math.exp(-0.0018 * 730), 4);
    expect(weight).toBeGreaterThan(0.2);
    expect(weight).toBeLessThan(0.35);
  });

  it('future match date returns 1', () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    expect(timeDecayWeight(future.toISOString())).toBe(1);
  });
});

describe('computeAttackDefence', () => {
  it('returns attack and defence parameters for teams with enough data', () => {
    const results = [
      { team: 'ARG', goalsFor: 3, goalsAgainst: 1, date: '2026-06-01' },
      { team: 'ARG', goalsFor: 2, goalsAgainst: 0, date: '2026-06-05' },
      { team: 'ARG', goalsFor: 1, goalsAgainst: 1, date: '2026-06-09' },
      { team: 'BRA', goalsFor: 1, goalsAgainst: 2, date: '2026-06-01' },
      { team: 'BRA', goalsFor: 0, goalsAgainst: 1, date: '2026-06-05' },
      { team: 'BRA', goalsFor: 2, goalsAgainst: 2, date: '2026-06-09' },
    ];
    const eloMap = new Map([['ARG', 2140], ['BRA', 2010]]);
    const { attack, defence } = computeAttackDefence(results, eloMap, 3);

    // ARG scored 6 goals in 3 matches = 2.0 avg (above tournament avg)
    expect(attack.ARG).toBeGreaterThan(0);
    // BRA scored 3 goals in 3 matches = 1.0 avg (below tournament avg)
    expect(attack.BRA).toBeLessThan(0);
  });

  it('falls back to Elo prior for teams with insufficient data', () => {
    const results = [
      { team: 'ARG', goalsFor: 2, goalsAgainst: 1, date: '2026-06-01' },
    ];
    const eloMap = new Map([['ARG', 2140], ['BRA', 2010]]);
    const { attack, defence } = computeAttackDefence(results, eloMap, 3);

    // ARG has only 1 match, below minMatches=3, so Elo prior used
    expect(attack.ARG).toBeDefined();
    // ARG Elo above average → positive attack
    expect(attack.ARG).toBeGreaterThan(0);
  });
});
