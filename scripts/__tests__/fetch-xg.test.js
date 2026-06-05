/**
 * Tests for xG (expected goals) data integration.
 * Validates Scenario 2 from intent.md: "xG data supplements sparse tournament data"
 */

import { describe, it, expect } from 'vitest';
import { computeXgParams, blendXgParams } from '../lib/fetch-xg.js';

const BASELINE = 1.35;

describe('fetch-xg: computeXgParams', () => {
  it('computes attack/defence from xG data', () => {
    const xgData = {
      teams: {
        ARG: { xG_for: 2.1, xG_against: 0.8, matches: 10 },
        BRA: { xG_for: 1.5, xG_against: 1.2, matches: 8 },
      },
    };
    const { xgAttack, xgDefence } = computeXgParams(xgData, BASELINE);

    // ARG has high xG_for (2.1 > 1.35) → positive attack
    expect(xgAttack.ARG).toBeGreaterThan(0);
    // ARG has low xG_against (0.8 < 1.35) → negative defence (good)
    expect(xgDefence.ARG).toBeLessThan(0);

    // BRA has moderate xG (1.5 > 1.35) → slightly positive attack
    expect(xgAttack.BRA).toBeGreaterThan(0);
    // BRA concedes more (1.2 < 1.35 but close) → slightly negative defence
    expect(xgDefence.BRA).toBeLessThan(0);
  });

  it('returns empty objects for null data', () => {
    const { xgAttack, xgDefence } = computeXgParams(null);
    expect(Object.keys(xgAttack)).toHaveLength(0);
    expect(Object.keys(xgDefence)).toHaveLength(0);
  });

  it('skips teams with missing xG fields', () => {
    const xgData = {
      teams: {
        ARG: { xG_for: 2.1, xG_against: 0.8, matches: 10 },
        BAD: { matches: 5 }, // missing xG_for/xG_against
      },
    };
    const { xgAttack } = computeXgParams(xgData, BASELINE);
    expect(xgAttack.ARG).toBeDefined();
    expect(xgAttack.BAD).toBeUndefined();
  });
});

describe('fetch-xg: blendXgParams', () => {
  it('blends xG for teams with 0 tournament matches', () => {
    const attack = { ARG: 0.1, BRA: -0.05 };
    const defence = { ARG: -0.08, BRA: 0.02 };
    const xgAttack = { ARG: Math.log(2.1 / BASELINE), BRA: Math.log(1.5 / BASELINE) };
    const xgDefence = { ARG: Math.log(0.8 / BASELINE), BRA: Math.log(1.2 / BASELINE) };
    const teamInfo = {}; // no matches played for any team

    const { attack: blended, defence: blendedD } = blendXgParams(
      attack, defence, xgAttack, xgDefence, teamInfo, 0.3, 3,
    );

    // ARG with 0 matches: should be blended with xG at 30% weight
    const expectedAttack = 0.7 * 0.1 + 0.3 * xgAttack.ARG;
    expect(blended.ARG).toBeCloseTo(expectedAttack, 6);
    // Defence should also be blended
    const expectedDefence = 0.7 * (-0.08) + 0.3 * xgDefence.ARG;
    expect(blendedD.ARG).toBeCloseTo(expectedDefence, 6);
  });

  it('does NOT blend xG for teams with 3+ tournament matches', () => {
    const attack = { ARG: 0.2 };
    const xgAttack = { ARG: Math.log(2.1 / BASELINE) };
    const teamInfo = { ARG: { matchesPlayed: 5 } };

    const { attack: blended } = blendXgParams(
      attack, {}, xgAttack, {}, teamInfo, 0.3, 3,
    );

    // 5 matches >= 3: xG should NOT modify the attack value
    expect(blended.ARG).toBe(0.2);
  });

  it('scales xG weight down for partial tournament data (1-2 matches)', () => {
    const attack = { ARG: 0.1 };
    const xgAttack = { ARG: 0.5 };
    const teamInfo = { ARG: { matchesPlayed: 1 } };

    const { attack: blended } = blendXgParams(
      attack, {}, xgAttack, {}, teamInfo, 0.3, 3,
    );

    // 1 match: effectiveWeight = 0.3 * (1 - 1/3) = 0.3 * 0.667 = 0.2
    const expected = 0.8 * 0.1 + 0.2 * 0.5;
    expect(blended.ARG).toBeCloseTo(expected, 6);
  });

  it('does not modify teams not present in xG data', () => {
    const attack = { USA: 0.05, ARG: 0.1 };
    const xgAttack = { ARG: 0.5 }; // USA not in xG
    const teamInfo = {};

    const { attack: blended } = blendXgParams(
      attack, {}, xgAttack, {}, teamInfo, 0.3, 3,
    );

    expect(blended.USA).toBe(0.05); // unchanged
    expect(blended.ARG).not.toBe(0.1); // blended
  });

  it('preserves all original attack/defence keys', () => {
    const attack = { A: 0.1, B: 0.2, C: 0.3 };
    const xgAttack = { A: 0.5 };

    const { attack: blended } = blendXgParams(
      attack, {}, xgAttack, {}, {}, 0.3, 3,
    );

    expect(Object.keys(blended).sort()).toEqual(['A', 'B', 'C']);
  });
});

describe('fetch-xg: Scenario 2 — xG supplements sparse data', () => {
  it('team with 0 tournament matches uses xG-enhanced attack/defence', () => {
    // Team with only Elo prior (attack ~0) gets xG boost
    const eloBasedAttack = { TEAM: 0 };
    const xgAttack = { TEAM: Math.log(2.1 / BASELINE) };
    const xgDefence = { TEAM: Math.log(0.8 / BASELINE) };

    const { attack: blended, defence: blendedD } = blendXgParams(
      eloBasedAttack, {}, xgAttack, xgDefence, {}, 0.3, 3,
    );

    // xG-based attack should be positive (team creates chances)
    expect(blended.TEAM).toBeGreaterThan(0);
    // xG-based defence should be negative (team concedes less than average)
    expect(blendedD.TEAM).toBeLessThan(0);
  });
});
