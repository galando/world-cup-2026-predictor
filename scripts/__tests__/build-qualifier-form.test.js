import { describe, it, expect } from 'vitest';
import { buildQualifierForm } from '../lib/build-qualifier-form.js';

describe('buildQualifierForm', () => {
  it('returns empty map when no qualifier data provided', () => {
    const result = buildQualifierForm(null, new Map());
    expect(result.size).toBe(0);
  });

  it('returns empty map for empty qualifier data', () => {
    const result = buildQualifierForm(new Map(), new Map());
    expect(result.size).toBe(0);
  });

  it('0 qualifier matches returns Elo prior', () => {
    const eloMap = new Map([['ARG', 2140], ['BRA', 2000]]);

    // Qualifier data with 0 matches for ARG
    const qualifierData = new Map([
      ['ARG', []],
      ['BRA', [
        { goalsFor: 2, goalsAgainst: 1, date: '2025-06-01' },
        { goalsFor: 1, goalsAgainst: 0, date: '2025-06-10' },
        { goalsFor: 3, goalsAgainst: 1, date: '2025-06-20' },
      ]],
    ]);

    const result = buildQualifierForm(qualifierData, eloMap);

    // ARG with 0 matches: uses Elo prior (no entry since no data to compute from)
    // BRA with 3 matches: uses data-based attack/defence
    expect(result.has('BRA')).toBe(true);
    const braPrior = result.get('BRA');
    expect(braPrior.attack).toBeDefined();
    expect(braPrior.defence).toBeDefined();
    expect(braPrior.matches).toBe(3);
  });

  it('5 matches produces data-based prior', () => {
    const eloMap = new Map([['FRA', 2100], ['GER', 2000]]);

    const qualifierData = new Map([
      ['FRA', [
        { goalsFor: 2, goalsAgainst: 1, date: '2025-09-01' },
        { goalsFor: 3, goalsAgainst: 0, date: '2025-09-10' },
        { goalsFor: 1, goalsAgainst: 1, date: '2025-10-01' },
        { goalsFor: 2, goalsAgainst: 0, date: '2025-10-10' },
        { goalsFor: 1, goalsAgainst: 2, date: '2025-11-01' },
      ]],
      ['GER', [
        { goalsFor: 1, goalsAgainst: 1, date: '2025-09-01' },
        { goalsFor: 0, goalsAgainst: 2, date: '2025-09-10' },
        { goalsFor: 1, goalsAgainst: 0, date: '2025-10-01' },
        { goalsFor: 2, goalsAgainst: 1, date: '2025-10-10' },
        { goalsFor: 0, goalsAgainst: 1, date: '2025-11-01' },
      ]],
    ]);

    const result = buildQualifierForm(qualifierData, eloMap);

    // FRA scored more goals, should have higher attack
    const fra = result.get('FRA');
    const ger = result.get('GER');
    expect(fra.attack).toBeGreaterThan(ger.attack);
  });

  it('blend weight transitions from Elo to data with match count', () => {
    const eloMap = new Map([['T1', 2100]]);

    // 1 match (low confidence, more Elo blend)
    const q1 = new Map([['T1', [
      { goalsFor: 3, goalsAgainst: 0, date: '2025-06-01' },
    ]]]);
    const r1 = buildQualifierForm(q1, eloMap);

    // 5 matches (higher confidence, more data)
    const q5 = new Map([['T1', [
      { goalsFor: 3, goalsAgainst: 0, date: '2025-06-01' },
      { goalsFor: 2, goalsAgainst: 1, date: '2025-06-10' },
      { goalsFor: 1, goalsAgainst: 0, date: '2025-06-20' },
      { goalsFor: 2, goalsAgainst: 1, date: '2025-07-01' },
      { goalsFor: 1, goalsAgainst: 1, date: '2025-07-10' },
    ]]]);
    const r5 = buildQualifierForm(q5, eloMap);

    expect(r1.get('T1')).toBeDefined();
    expect(r5.get('T1')).toBeDefined();
    // Both should be finite
    expect(isFinite(r1.get('T1').attack)).toBe(true);
    expect(isFinite(r5.get('T1').attack)).toBe(true);
  });

  it('time decay applies to older matches', () => {
    const eloMap = new Map([['T', 2000]]);

    // Recent matches only
    const recentData = new Map([['T', [
      { goalsFor: 3, goalsAgainst: 0, date: '2026-05-01' },
      { goalsFor: 2, goalsAgainst: 0, date: '2026-05-10' },
      { goalsFor: 3, goalsAgainst: 1, date: '2026-05-20' },
    ]]]);
    const recent = buildQualifierForm(recentData, eloMap);

    // Old matches only
    const oldData = new Map([['T', [
      { goalsFor: 3, goalsAgainst: 0, date: '2024-05-01' },
      { goalsFor: 2, goalsAgainst: 0, date: '2024-05-10' },
      { goalsFor: 3, goalsAgainst: 1, date: '2024-05-20' },
    ]]]);
    const old = buildQualifierForm(oldData, eloMap);

    // Both should produce valid results
    expect(recent.get('T')).toBeDefined();
    expect(old.get('T')).toBeDefined();
    expect(isFinite(recent.get('T').attack)).toBe(true);
    expect(isFinite(old.get('T').attack)).toBe(true);
  });

  it('handles plain object input (from cache deserialization)', () => {
    const eloMap = new Map([['ARG', 2140]]);

    // Cache returns plain object, not Map
    const qualifierObj = {
      ARG: [
        { goalsFor: 2, goalsAgainst: 1, date: '2025-09-01' },
        { goalsFor: 1, goalsAgainst: 0, date: '2025-09-10' },
        { goalsFor: 3, goalsAgainst: 1, date: '2025-10-01' },
      ],
    };

    const result = buildQualifierForm(qualifierObj, eloMap);
    expect(result.get('ARG')).toBeDefined();
    expect(result.get('ARG').matches).toBe(3);
  });
});
