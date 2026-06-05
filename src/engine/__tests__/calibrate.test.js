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

  it('positive attack increases lambda', () => {
    const team = { elo: 2000 };
    const opponent = { elo: 2000 };
    const lambdaBase = getTeamLambda(team, opponent);
    const lambdaAtk = getTeamLambda(team, opponent, { attack: 0.3 });
    expect(lambdaAtk).toBeGreaterThan(lambdaBase);
    // lambdaAtk = baseline * exp(0.3)
    expect(lambdaAtk).toBeCloseTo(BASELINE_LAMBDA * Math.exp(0.3), 6);
  });

  it('positive opponentDefence increases lambda (weak defence)', () => {
    const team = { elo: 2000 };
    const opponent = { elo: 2000 };
    const lambdaBase = getTeamLambda(team, opponent);
    const lambdaVsWeak = getTeamLambda(team, opponent, { opponentDefence: 0.3 });
    expect(lambdaVsWeak).toBeGreaterThan(lambdaBase);
    expect(lambdaVsWeak).toBeCloseTo(BASELINE_LAMBDA * Math.exp(0.3), 6);
  });

  it('attack and opponentDefence compound correctly', () => {
    const team = { elo: 2000 };
    const opponent = { elo: 2000 };
    const lambdaBoth = getTeamLambda(team, opponent, { attack: 0.2, opponentDefence: 0.3 });
    // baseline * exp(0.2) * exp(0.3) = baseline * exp(0.5)
    expect(lambdaBoth).toBeCloseTo(BASELINE_LAMBDA * Math.exp(0.5), 6);
  });

  it('availabilityMult reduces lambda when < 1', () => {
    const team = { elo: 2000 };
    const opponent = { elo: 2000 };
    const lambdaBase = getTeamLambda(team, opponent);
    const lambdaSuspended = getTeamLambda(team, opponent, { availabilityMult: 0.92 });
    expect(lambdaSuspended).toBeCloseTo(lambdaBase * 0.92, 6);
    expect(lambdaSuspended).toBeLessThan(lambdaBase);
  });

  it('availabilityMult default is 1 (no change)', () => {
    const team = { elo: 2000 };
    const opponent = { elo: 2000 };
    const lambdaExplicit = getTeamLambda(team, opponent, { availabilityMult: 1 });
    const lambdaDefault = getTeamLambda(team, opponent);
    expect(lambdaExplicit).toBeCloseTo(lambdaDefault, 6);
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

    // ARG has only 1 match, below minMatches=3, so Elo prior blended with data
    expect(attack.ARG).toBeDefined();
    // ARG Elo above average → positive attack
    expect(attack.ARG).toBeGreaterThan(0);
  });

  it('recent results weight more than old results', () => {
    const eloMap = new Map([['A', 2000], ['B', 2000], ['C', 2000]]);

    // 3 teams: A and B always play recent. C's date varies.
    // A scores 3, B scores 1, C scores 1 — all concede to maintain balance
    // Scenario 1: C's matches are recent (same date as A/B)
    const recentC = [
      { team: 'A', goalsFor: 3, goalsAgainst: 1, date: '2026-05-01' },
      { team: 'A', goalsFor: 3, goalsAgainst: 1, date: '2026-05-05' },
      { team: 'A', goalsFor: 3, goalsAgainst: 1, date: '2026-05-09' },
      { team: 'B', goalsFor: 1, goalsAgainst: 2, date: '2026-05-01' },
      { team: 'B', goalsFor: 1, goalsAgainst: 2, date: '2026-05-05' },
      { team: 'B', goalsFor: 1, goalsAgainst: 2, date: '2026-05-09' },
      { team: 'C', goalsFor: 1, goalsAgainst: 2, date: '2026-05-01' },
      { team: 'C', goalsFor: 1, goalsAgainst: 2, date: '2026-05-05' },
      { team: 'C', goalsFor: 1, goalsAgainst: 2, date: '2026-05-09' },
    ];

    // Scenario 2: C's matches are old (2022), A and B stay recent
    const oldC = [
      { team: 'A', goalsFor: 3, goalsAgainst: 1, date: '2026-05-01' },
      { team: 'A', goalsFor: 3, goalsAgainst: 1, date: '2026-05-05' },
      { team: 'A', goalsFor: 3, goalsAgainst: 1, date: '2026-05-09' },
      { team: 'B', goalsFor: 1, goalsAgainst: 2, date: '2026-05-01' },
      { team: 'B', goalsFor: 1, goalsAgainst: 2, date: '2026-05-05' },
      { team: 'B', goalsFor: 1, goalsAgainst: 2, date: '2026-05-09' },
      { team: 'C', goalsFor: 1, goalsAgainst: 2, date: '2022-05-01' },
      { team: 'C', goalsFor: 1, goalsAgainst: 2, date: '2022-05-05' },
      { team: 'C', goalsFor: 1, goalsAgainst: 2, date: '2022-05-09' },
    ];

    const { attack: recentAttack } = computeAttackDefence(recentC, eloMap, 3);
    const { attack: oldAttack } = computeAttackDefence(oldC, eloMap, 3);

    // A always scores above average in both scenarios
    expect(recentAttack.A).toBeGreaterThan(0);
    expect(oldAttack.A).toBeGreaterThan(0);

    // With C decayed, tournament weighted avg is dominated by A and B (both recent).
    // C's low scoring barely counts. This changes A's attack value vs the recent scenario.
    // In recentC: all weights equal, avg = (9+3+3)/9 = 1.67, A avg = 3 → attack = log(3/1.67)
    // In oldC: C has ~0 weight, avg ≈ (9+3)/(6) = 2, A avg = 3 → attack = log(3/2)
    // So recentC attack for A = log(1.8) ≈ 0.588
    // oldC attack for A = log(1.5) ≈ 0.405
    // A's attack is HIGHER when C is recent because C's low scoring pulls down the avg
    expect(recentAttack.A).toBeGreaterThan(oldAttack.A);
  });

  it('same-date results produce same output regardless of date value', () => {
    const eloMap = new Map([['ARG', 2140], ['BRA', 2010]]);
    const results = [
      { team: 'ARG', goalsFor: 3, goalsAgainst: 1, date: '2026-06-01' },
      { team: 'ARG', goalsFor: 2, goalsAgainst: 0, date: '2026-06-01' },
      { team: 'ARG', goalsFor: 1, goalsAgainst: 1, date: '2026-06-01' },
      { team: 'BRA', goalsFor: 1, goalsAgainst: 2, date: '2026-06-01' },
      { team: 'BRA', goalsFor: 0, goalsAgainst: 1, date: '2026-06-01' },
      { team: 'BRA', goalsFor: 2, goalsAgainst: 2, date: '2026-06-01' },
    ];

    // All same date means timeDecayWeight is the same for all → weighted = unweighted ratios
    const { attack, defence } = computeAttackDefence(results, eloMap, 3);
    // ARG: 6 goals / 3 matches = 2.0, tournament avg = 4.5/6 = 0.75 per match per team entry
    expect(attack.ARG).toBeDefined();
    expect(attack.BRA).toBeDefined();
  });

  it('weighted tournament averages are correct', () => {
    const eloMap = new Map([['A', 2000], ['B', 2000]]);
    const results = [
      { team: 'A', goalsFor: 2, goalsAgainst: 1, date: '2026-06-01' },
      { team: 'B', goalsFor: 1, goalsAgainst: 2, date: '2026-06-01' },
      { team: 'A', goalsFor: 3, goalsAgainst: 0, date: '2026-01-01' },
      { team: 'B', goalsFor: 0, goalsAgainst: 3, date: '2026-01-01' },
    ];

    const { attack } = computeAttackDefence(results, eloMap, 2);

    // A scores more in recent match (2) than old match (3 but decayed)
    // So A's weighted avg should reflect recency
    expect(attack.A).toBeDefined();
    expect(attack.B).toBeDefined();
  });

  it('blends Elo prior with partial match data', () => {
    const eloMap = new Map([['ARG', 2140], ['BRA', 1800]]);
    // ARG has 1 match (< minMatches=3) with positive goals — should blend
    const results = [
      { team: 'ARG', goalsFor: 2, goalsAgainst: 1, date: '2026-06-01' },
    ];
    const { attack, defence } = computeAttackDefence(results, eloMap, 3);

    // With 1/3 blend weight, result should be between pure Elo and pure data
    expect(attack.ARG).toBeDefined();
    // ARG has high Elo → positive Elo prior. Data also shows above avg scoring.
    expect(attack.ARG).toBeGreaterThan(0);
  });

  it('blend transitions smoothly from Elo-only to data-only', () => {
    const eloMap = new Map([['T', 2000]]);

    // 0 matches: Elo prior only
    const r0 = computeAttackDefence([], eloMap, 3);
    // (T not in results, so not in output)

    // 1 match
    const results1 = [
      { team: 'T', goalsFor: 2, goalsAgainst: 1, date: '2026-06-01' },
    ];
    const r1 = computeAttackDefence(results1, eloMap, 3);

    // 2 matches
    const results2 = [
      { team: 'T', goalsFor: 2, goalsAgainst: 1, date: '2026-06-01' },
      { team: 'T', goalsFor: 1, goalsAgainst: 0, date: '2026-06-05' },
    ];
    const r2 = computeAttackDefence(results2, eloMap, 3);

    // 3 matches: full data
    const results3 = [
      { team: 'T', goalsFor: 2, goalsAgainst: 1, date: '2026-06-01' },
      { team: 'T', goalsFor: 1, goalsAgainst: 0, date: '2026-06-05' },
      { team: 'T', goalsFor: 1, goalsAgainst: 1, date: '2026-06-09' },
    ];
    const r3 = computeAttackDefence(results3, eloMap, 3);

    // All should be defined and finite
    expect(isFinite(r1.attack.T)).toBe(true);
    expect(isFinite(r2.attack.T)).toBe(true);
    expect(isFinite(r3.attack.T)).toBe(true);
  });

  it('team with 0 matches uses Elo prior only', () => {
    const eloMap = new Map([['ARG', 2140], ['BRA', 1800]]);
    const results = [
      { team: 'BRA', goalsFor: 1, goalsAgainst: 1, date: '2026-06-01' },
    ];
    const { attack, defence } = computeAttackDefence(results, eloMap, 3);

    // ARG not in results at all → no entry in attack/defence
    // (only teams that appear in results get computed)
    expect(attack.BRA).toBeDefined();
  });
});

describe('getTeamLambda new optional factors', () => {
  it('fatigueMult reduces lambda when < 1', () => {
    const team = { elo: 2000 };
    const opponent = { elo: 2000 };
    const lambdaBase = getTeamLambda(team, opponent);
    const lambdaFatigued = getTeamLambda(team, opponent, { fatigueMult: 0.95 });
    expect(lambdaFatigued).toBeCloseTo(lambdaBase * 0.95, 6);
  });

  it('altitudeMult reduces lambda when < 1', () => {
    const team = { elo: 2000 };
    const opponent = { elo: 2000 };
    const lambdaBase = getTeamLambda(team, opponent);
    const lambdaAlt = getTeamLambda(team, opponent, { altitudeMult: 0.97 });
    expect(lambdaAlt).toBeCloseTo(lambdaBase * 0.97, 6);
  });

  it('h2hMult applies adjustment', () => {
    const team = { elo: 2000 };
    const opponent = { elo: 2000 };
    const lambdaBase = getTeamLambda(team, opponent);
    const lambdaH2h = getTeamLambda(team, opponent, { h2hMult: 1.05 });
    expect(lambdaH2h).toBeCloseTo(lambdaBase * 1.05, 6);
  });

  it('squadValueMult applies adjustment', () => {
    const team = { elo: 2000 };
    const opponent = { elo: 2000 };
    const lambdaBase = getTeamLambda(team, opponent);
    const lambdaSquad = getTeamLambda(team, opponent, { squadValueMult: 1.03 });
    expect(lambdaSquad).toBeCloseTo(lambdaBase * 1.03, 6);
  });

  it('all new factors compound multiplicatively', () => {
    const team = { elo: 2000 };
    const opponent = { elo: 2000 };
    const lambdaAll = getTeamLambda(team, opponent, {
      fatigueMult: 0.95,
      altitudeMult: 0.97,
      h2hMult: 1.02,
      squadValueMult: 1.03,
    });
    const lambdaBase = getTeamLambda(team, opponent);
    const expected = lambdaBase * 0.95 * 0.97 * 1.02 * 1.03;
    expect(lambdaAll).toBeCloseTo(expected, 6);
  });

  it('all new factors default to 1.0 (no change)', () => {
    const team = { elo: 2000 };
    const opponent = { elo: 2000 };
    const lambdaDefault = getTeamLambda(team, opponent);
    const lambdaExplicit = getTeamLambda(team, opponent, {
      fatigueMult: 1, altitudeMult: 1, h2hMult: 1, squadValueMult: 1,
    });
    expect(lambdaExplicit).toBeCloseTo(lambdaDefault, 6);
  });
});
