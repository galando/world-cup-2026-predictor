/**
 * Tests for Scenario Explorer logic.
 * Validates Scenario 5 from intent.md: "Scenario explorer updates standings in real-time"
 */

import { describe, it, expect } from 'vitest';
import { applyOverridesToStandings, toggleOverride } from '../scenario-logic.js';

function makeTeam(code, pts = 0, gf = 0, ga = 0, fifaRank = 50) {
  return { team: code, pts, gf, ga, gd: gf - ga, p: 0, w: 0, d: 0, l: 0, rank: 0, fifaRank };
}

function makeMatch(matchId, home, away, group) {
  return { matchId, homeTeam: home, awayTeam: away, group, stage: 'group' };
}

describe('scenario-logic: applyOverridesToStandings', () => {
  it('does not mutate original standings', () => {
    const standings = { A: [makeTeam('MEX', 0)] };
    applyOverridesToStandings(standings, [], {});
    expect(standings.A[0].pts).toBe(0);
  });

  it('home win adds 3 points to home team', () => {
    const standings = {
      A: [makeTeam('MEX', 0), makeTeam('CAN', 0), makeTeam('FRA', 0), makeTeam('AUS', 0)],
    };
    const matches = [makeMatch('A-1', 'MEX', 'CAN', 'A')];
    const overrides = { 'A-1': 'home' };

    const result = applyOverridesToStandings(standings, matches, overrides);
    const mex = result.A.find(t => t.team === 'MEX');
    const can = result.A.find(t => t.team === 'CAN');

    expect(mex.pts).toBe(3);
    expect(mex.gf).toBe(2);
    expect(mex.ga).toBe(0);
    expect(mex.gd).toBe(2);
    expect(mex.p).toBe(1);
    expect(mex.w).toBe(1);
    expect(mex.rank).toBe(1);

    expect(can.pts).toBe(0);
    expect(can.ga).toBe(2);
    expect(can.l).toBe(1);
  });

  it('away win adds 3 points to away team', () => {
    const standings = {
      A: [makeTeam('MEX', 0), makeTeam('CAN', 0), makeTeam('FRA', 0), makeTeam('AUS', 0)],
    };
    const matches = [makeMatch('A-1', 'MEX', 'CAN', 'A')];
    const overrides = { 'A-1': 'away' };

    const result = applyOverridesToStandings(standings, matches, overrides);
    const can = result.A.find(t => t.team === 'CAN');

    expect(can.pts).toBe(3);
    expect(can.gf).toBe(2);
    expect(can.w).toBe(1);
    expect(can.rank).toBe(1);
  });

  it('draw adds 1 point to each team', () => {
    const standings = {
      A: [makeTeam('MEX', 0), makeTeam('CAN', 0), makeTeam('FRA', 0), makeTeam('AUS', 0)],
    };
    const matches = [makeMatch('A-1', 'MEX', 'CAN', 'A')];
    const overrides = { 'A-1': 'draw' };

    const result = applyOverridesToStandings(standings, matches, overrides);
    const mex = result.A.find(t => t.team === 'MEX');
    const can = result.A.find(t => t.team === 'CAN');

    expect(mex.pts).toBe(1);
    expect(can.pts).toBe(1);
    expect(mex.d).toBe(1);
    expect(can.d).toBe(1);
    expect(mex.gf).toBe(1);
    expect(mex.ga).toBe(1);
    expect(mex.gd).toBe(0);
  });

  it('multiple overrides in same group accumulate correctly', () => {
    const standings = {
      A: [makeTeam('MEX', 0), makeTeam('CAN', 0), makeTeam('FRA', 0), makeTeam('AUS', 0)],
    };
    const matches = [
      makeMatch('A-1', 'MEX', 'CAN', 'A'),
      makeMatch('A-2', 'FRA', 'AUS', 'A'),
    ];
    const overrides = { 'A-1': 'home', 'A-2': 'away' };

    const result = applyOverridesToStandings(standings, matches, overrides);
    const mex = result.A.find(t => t.team === 'MEX');
    const aus = result.A.find(t => t.team === 'AUS');

    // MEX won 2-0 → 3pts, AUS won 2-0 away → 3pts
    expect(mex.pts).toBe(3);
    expect(aus.pts).toBe(3);
    expect(mex.p).toBe(1);
    expect(aus.p).toBe(1);
  });

  it('re-sorts by points then GD then GF', () => {
    const standings = {
      A: [makeTeam('MEX', 0), makeTeam('CAN', 0), makeTeam('FRA', 0), makeTeam('AUS', 0)],
    };
    const matches = [
      makeMatch('A-1', 'MEX', 'CAN', 'A'),
      makeMatch('A-2', 'FRA', 'AUS', 'A'),
    ];
    // CAN wins big, MEX draws → CAN top, FRA/AUS behind
    const overrides = { 'A-1': 'away', 'A-2': 'draw' };

    const result = applyOverridesToStandings(standings, matches, overrides);
    expect(result.A[0].team).toBe('CAN'); // 3pts, rank 1
    expect(result.A[0].rank).toBe(1);
  });

  it('does not crash on empty standings or overrides', () => {
    expect(applyOverridesToStandings({}, [], {})).toEqual({});
    expect(applyOverridesToStandings({ A: [makeTeam('X')] }, [], {})).toEqual({
      A: [{ ...makeTeam('X'), rank: 1 }],
    });
  });

  it('ignores overrides for unknown match IDs', () => {
    const standings = { A: [makeTeam('MEX', 5)] };
    const overrides = { 'Z-99': 'home' };

    const result = applyOverridesToStandings(standings, [], overrides);
    expect(result.A[0].pts).toBe(5);
  });
});

describe('scenario-logic: toggleOverride', () => {
  it('sets an override', () => {
    const result = toggleOverride({}, 'A-1', 'home');
    expect(result).toEqual({ 'A-1': 'home' });
  });

  it('toggles off when same outcome clicked again', () => {
    const result = toggleOverride({ 'A-1': 'home' }, 'A-1', 'home');
    expect(result).toEqual({});
  });

  it('changes outcome when different one selected', () => {
    const result = toggleOverride({ 'A-1': 'home' }, 'A-1', 'away');
    expect(result).toEqual({ 'A-1': 'away' });
  });

  it('does not mutate original', () => {
    const original = { 'A-1': 'home' };
    toggleOverride(original, 'A-2', 'draw');
    expect(original).toEqual({ 'A-1': 'home' });
  });
});
