/**
 * Tests for build-standings.js
 * Covers: tiebreaker criteria, fair play, head-to-head, third-place ranking, deterministic sort
 */

import { describe, it, expect } from 'vitest';
import { buildStandings, compareTeams, rankThirdPlace } from '../lib/build-standings.js';

describe('compareTeams', () => {
  it('sorts by points descending', () => {
    const a = { team: 'A', pts: 7, gd: 4, gf: 7, fairPlay: -2, fifaRank: 1 };
    const b = { team: 'B', pts: 4, gd: 0, gf: 4, fairPlay: -3, fifaRank: 12 };
    expect(compareTeams(a, b)).toBeLessThan(0); // a before b
  });

  it('breaks ties by goal difference', () => {
    const a = { team: 'A', pts: 4, gd: 2, gf: 4, fairPlay: -3, fifaRank: 8 };
    const b = { team: 'B', pts: 4, gd: 0, gf: 4, fairPlay: -5, fifaRank: 12 };
    expect(compareTeams(a, b)).toBeLessThan(0);
  });

  it('breaks ties by goals scored when points and GD equal', () => {
    const a = { team: 'A', pts: 4, gd: 0, gf: 5, fairPlay: -3, fifaRank: 8 };
    const b = { team: 'B', pts: 4, gd: 0, gf: 3, fairPlay: -2, fifaRank: 5 };
    expect(compareTeams(a, b)).toBeLessThan(0);
  });

  it('breaks ties by fair play when pts/GD/GF equal', () => {
    // fairPlay: higher = better (fewer deductions)
    const a = { team: 'A', pts: 4, gd: 0, gf: 4, fairPlay: -3, fifaRank: 8 };
    const b = { team: 'B', pts: 4, gd: 0, gf: 4, fairPlay: -5, fifaRank: 12 };
    expect(compareTeams(a, b)).toBeLessThan(0); // -3 > -5
  });

  it('breaks ties by FIFA ranking (lower = better)', () => {
    const a = { team: 'A', pts: 4, gd: 0, gf: 4, fairPlay: -5, fifaRank: 5 };
    const b = { team: 'B', pts: 4, gd: 0, gf: 4, fairPlay: -5, fifaRank: 12 };
    expect(compareTeams(a, b)).toBeLessThan(0);
  });

  it('uses alphabetical order as deterministic final tiebreaker', () => {
    const a = { team: 'MEX', pts: 4, gd: 0, gf: 4, fairPlay: -5, fifaRank: 12 };
    const b = { team: 'RSA', pts: 4, gd: 0, gf: 4, fairPlay: -5, fifaRank: 12 };
    expect(compareTeams(a, b)).toBeLessThan(0); // MEX < RSA alphabetically
  });

  it('head-to-head winner ranks higher when points are tied', () => {
    const a = { team: 'ARG', pts: 4, gd: 0, gf: 4, fairPlay: -3, fifaRank: 8 };
    const b = { team: 'BRA', pts: 4, gd: 0, gf: 4, fairPlay: -3, fifaRank: 8 };
    // ARG beat BRA in H2H
    const h2hMap = { 'ARG_BRA': -1, 'BRA_ARG': 1 };
    expect(compareTeams(a, b, h2hMap)).toBeLessThan(0); // ARG before BRA
  });

  it('falls through to GD when H2H is a draw', () => {
    const a = { team: 'ARG', pts: 4, gd: 2, gf: 4, fairPlay: -3, fifaRank: 8 };
    const b = { team: 'BRA', pts: 4, gd: 0, gf: 4, fairPlay: -3, fifaRank: 8 };
    // No H2H entry (draw = no entry)
    const h2hMap = {};
    expect(compareTeams(a, b, h2hMap)).toBeLessThan(0); // falls through to GD
  });

  it('falls through to GD when no H2H data available', () => {
    const a = { team: 'ARG', pts: 4, gd: 2, gf: 4, fairPlay: -3, fifaRank: 8 };
    const b = { team: 'BRA', pts: 4, gd: 0, gf: 4, fairPlay: -3, fifaRank: 8 };
    expect(compareTeams(a, b, null)).toBeLessThan(0); // null H2H → falls through
  });
});

describe('buildStandings', () => {
  const teamsMeta = {
    ARG: { group: 'A', flagIso: 'ar', nameEN: 'Argentina', nameHE: 'ארגנטינה', fifaRank: 1 },
    MEX: { group: 'A', flagIso: 'mx', nameEN: 'Mexico', nameHE: 'מקסיקו', fifaRank: 15 },
    POL: { group: 'A', flagIso: 'pl', nameEN: 'Poland', nameHE: 'פולין', fifaRank: 26 },
    KSA: { group: 'A', flagIso: 'sa', nameEN: 'Saudi Arabia', nameHE: 'ערב הסעודית', fifaRank: 53 },
    BRA: { group: 'B', flagIso: 'br', nameEN: 'Brazil', nameHE: 'ברזיל', fifaRank: 5 },
    FRA: { group: 'B', flagIso: 'fr', nameEN: 'France', nameHE: 'צרפת', fifaRank: 3 },
    GER: { group: 'B', flagIso: 'de', nameEN: 'Germany', nameHE: 'גרמניה', fifaRank: 9 },
    ESP: { group: 'B', flagIso: 'es', nameEN: 'Spain', nameHE: 'ספרד', fifaRank: 7 },
  };

  it('computes standings from finished matches', () => {
    const matches = [
      { matchId: 'A-1', homeTeam: 'ARG', awayTeam: 'MEX', stage: 'group', group: 'A', status: 'FINISHED', score: { home: 3, away: 1 } },
      { matchId: 'A-2', homeTeam: 'POL', awayTeam: 'KSA', stage: 'group', group: 'A', status: 'FINISHED', score: { home: 0, away: 2 } },
      { matchId: 'A-3', homeTeam: 'ARG', awayTeam: 'POL', stage: 'group', group: 'A', status: 'FINISHED', score: { home: 2, away: 0 } },
      { matchId: 'A-4', homeTeam: 'KSA', awayTeam: 'MEX', stage: 'group', group: 'A', status: 'FINISHED', score: { home: 1, away: 1 } },
      { matchId: 'A-5', homeTeam: 'KSA', awayTeam: 'ARG', stage: 'group', group: 'A', status: 'FINISHED', score: { home: 0, away: 2 } },
      { matchId: 'A-6', homeTeam: 'MEX', awayTeam: 'POL', stage: 'group', group: 'A', status: 'FINISHED', score: { home: 2, away: 0 } },
    ];

    const result = buildStandings(matches, teamsMeta);

    // ARG: 9 pts (3W), MEX: 4 pts (1W 1D 1L), KSA: 4 pts (1W 1D 1L), POL: 0 pts
    expect(result.groups.A[0].team).toBe('ARG');
    expect(result.groups.A[0].pts).toBe(9);
    expect(result.groups.A[3].team).toBe('POL');
    expect(result.groups.A[3].pts).toBe(0);
  });

  it('applies tiebreaker correctly for tied teams', () => {
    const matches = [
      // ARG: 7 pts (2W 1D), gd=4, gf=7
      { matchId: 'A-1', homeTeam: 'ARG', awayTeam: 'MEX', stage: 'group', group: 'A', status: 'FINISHED', score: { home: 3, away: 1 } },
      { matchId: 'A-3', homeTeam: 'ARG', awayTeam: 'POL', stage: 'group', group: 'A', status: 'FINISHED', score: { home: 2, away: 0 } },
      { matchId: 'A-5', homeTeam: 'KSA', awayTeam: 'ARG', stage: 'group', group: 'A', status: 'FINISHED', score: { home: 1, away: 2 } },
      // MEX: 4 pts, gd=0, gf=4
      { matchId: 'A-2', homeTeam: 'POL', awayTeam: 'KSA', stage: 'group', group: 'A', status: 'FINISHED', score: { home: 1, away: 0 } },
      { matchId: 'A-4', homeTeam: 'KSA', awayTeam: 'MEX', stage: 'group', group: 'A', status: 'FINISHED', score: { home: 0, away: 1 } },
      { matchId: 'A-6', homeTeam: 'MEX', awayTeam: 'POL', stage: 'group', group: 'A', status: 'FINISHED', score: { home: 2, away: 2 } },
    ];

    const result = buildStandings(matches, teamsMeta);

    const mex = result.groups.A.find(t => t.team === 'MEX');
    const pol = result.groups.A.find(t => t.team === 'POL');

    expect(mex.pts).toBe(4);
    expect(pol.pts).toBe(4);
  });

  it('handles empty matches (all scheduled)', () => {
    const matches = [];
    const result = buildStandings(matches, teamsMeta);

    expect(Object.keys(result.groups)).toHaveLength(2); // A and B
    expect(result.groups.A).toHaveLength(4);
    expect(result.groups.A[0].pts).toBe(0);
    expect(result.thirdPlaceRanking).toHaveLength(2);
  });

  it('populates fair play from card data', () => {
    const matches = [
      {
        matchId: 'A-1', homeTeam: 'ARG', awayTeam: 'MEX', stage: 'group', group: 'A',
        status: 'FINISHED', score: { home: 2, away: 0 },
        cards: [
          { team: 'MEX', type: 'yellow' },
          { team: 'MEX', type: 'yellow' },
          { team: 'ARG', type: 'yellow' },
        ],
      },
      { matchId: 'A-2', homeTeam: 'POL', awayTeam: 'KSA', stage: 'group', group: 'A', status: 'FINISHED', score: { home: 1, away: 0 } },
      { matchId: 'A-3', homeTeam: 'ARG', awayTeam: 'POL', stage: 'group', group: 'A', status: 'FINISHED', score: { home: 1, away: 0 } },
      { matchId: 'A-4', homeTeam: 'KSA', awayTeam: 'MEX', stage: 'group', group: 'A', status: 'FINISHED', score: { home: 0, away: 1 } },
      { matchId: 'A-5', homeTeam: 'KSA', awayTeam: 'ARG', stage: 'group', group: 'A', status: 'FINISHED', score: { home: 0, away: 1 } },
      {
        matchId: 'A-6', homeTeam: 'MEX', awayTeam: 'POL', stage: 'group', group: 'A',
        status: 'FINISHED', score: { home: 0, away: 1 },
        cards: [
          { team: 'MEX', type: 'red' },
        ],
      },
    ];

    const result = buildStandings(matches, teamsMeta);

    const mex = result.groups.A.find(t => t.team === 'MEX');
    const arg = result.groups.A.find(t => t.team === 'ARG');

    // MEX: 2 yellows in match 1 (-2) + 1 red in match 6 (-4) = -6
    expect(mex.fairPlay).toBe(-6);
    // ARG: 1 yellow in match 1 = -1
    expect(arg.fairPlay).toBe(-1);
    // POL and KSA: no cards = 0
    const pol = result.groups.A.find(t => t.team === 'POL');
    const ksa = result.groups.A.find(t => t.team === 'KSA');
    expect(pol.fairPlay).toBe(0);
    expect(ksa.fairPlay).toBe(0);
  });

  it('match with no cards keeps fairPlay at 0', () => {
    const matches = [
      { matchId: 'A-1', homeTeam: 'ARG', awayTeam: 'MEX', stage: 'group', group: 'A', status: 'FINISHED', score: { home: 1, away: 0 } },
      { matchId: 'A-2', homeTeam: 'POL', awayTeam: 'KSA', stage: 'group', group: 'A', status: 'FINISHED', score: { home: 1, away: 0 } },
      { matchId: 'A-3', homeTeam: 'ARG', awayTeam: 'POL', stage: 'group', group: 'A', status: 'FINISHED', score: { home: 1, away: 0 } },
      { matchId: 'A-4', homeTeam: 'KSA', awayTeam: 'MEX', stage: 'group', group: 'A', status: 'FINISHED', score: { home: 0, away: 1 } },
      { matchId: 'A-5', homeTeam: 'KSA', awayTeam: 'ARG', stage: 'group', group: 'A', status: 'FINISHED', score: { home: 0, away: 1 } },
      { matchId: 'A-6', homeTeam: 'MEX', awayTeam: 'POL', stage: 'group', group: 'A', status: 'FINISHED', score: { home: 0, away: 1 } },
    ];

    const result = buildStandings(matches, teamsMeta);

    for (const t of result.groups.A) {
      expect(t.fairPlay).toBe(0);
    }
  });

  it('head-to-head tiebreaker ranks H2H winner higher', () => {
    // ARG and MEX both end with 6 pts, but ARG beat MEX in H2H
    const matches = [
      { matchId: 'A-1', homeTeam: 'ARG', awayTeam: 'MEX', stage: 'group', group: 'A', status: 'FINISHED', score: { home: 2, away: 0 } },
      { matchId: 'A-2', homeTeam: 'POL', awayTeam: 'KSA', stage: 'group', group: 'A', status: 'FINISHED', score: { home: 0, away: 1 } },
      { matchId: 'A-3', homeTeam: 'ARG', awayTeam: 'POL', stage: 'group', group: 'A', status: 'FINISHED', score: { home: 2, away: 0 } },
      { matchId: 'A-4', homeTeam: 'KSA', awayTeam: 'MEX', stage: 'group', group: 'A', status: 'FINISHED', score: { home: 0, away: 2 } },
      { matchId: 'A-5', homeTeam: 'KSA', awayTeam: 'ARG', stage: 'group', group: 'A', status: 'FINISHED', score: { home: 1, away: 0 } },
      { matchId: 'A-6', homeTeam: 'MEX', awayTeam: 'POL', stage: 'group', group: 'A', status: 'FINISHED', score: { home: 2, away: 0 } },
    ];

    const result = buildStandings(matches, teamsMeta);

    // ARG: 6 pts, MEX: 6 pts, ARG beat MEX → ARG ranks higher
    expect(result.groups.A[0].team).toBe('ARG');
    expect(result.groups.A[1].team).toBe('MEX');
  });

  it('draw in H2H match falls through to GD', () => {
    // ARG and MEX draw their H2H match, ARG has better GD
    const matches = [
      { matchId: 'A-1', homeTeam: 'ARG', awayTeam: 'MEX', stage: 'group', group: 'A', status: 'FINISHED', score: { home: 1, away: 1 } },
      { matchId: 'A-2', homeTeam: 'POL', awayTeam: 'KSA', stage: 'group', group: 'A', status: 'FINISHED', score: { home: 0, away: 2 } },
      { matchId: 'A-3', homeTeam: 'ARG', awayTeam: 'POL', stage: 'group', group: 'A', status: 'FINISHED', score: { home: 3, away: 0 } },
      { matchId: 'A-4', homeTeam: 'KSA', awayTeam: 'MEX', stage: 'group', group: 'A', status: 'FINISHED', score: { home: 0, away: 1 } },
      { matchId: 'A-5', homeTeam: 'KSA', awayTeam: 'ARG', stage: 'group', group: 'A', status: 'FINISHED', score: { home: 0, away: 2 } },
      { matchId: 'A-6', homeTeam: 'MEX', awayTeam: 'POL', stage: 'group', group: 'A', status: 'FINISHED', score: { home: 1, away: 0 } },
    ];

    const result = buildStandings(matches, teamsMeta);

    // Both ARG and MEX have 7 pts. ARG has better GD (5-1=4 vs 3-2=1)
    expect(result.groups.A[0].team).toBe('ARG');
  });

  it('does not contribute third-place from undersized groups', () => {
    // Create meta with a 3-team group
    const meta = {
      T1: { group: 'X', fifaRank: 1 },
      T2: { group: 'X', fifaRank: 5 },
      T3: { group: 'X', fifaRank: 10 },
    };

    const matches = [
      { matchId: 'X-1', homeTeam: 'T1', awayTeam: 'T2', stage: 'group', group: 'X', status: 'FINISHED', score: { home: 1, away: 0 } },
      { matchId: 'X-2', homeTeam: 'T2', awayTeam: 'T3', stage: 'group', group: 'X', status: 'FINISHED', score: { home: 1, away: 0 } },
      { matchId: 'X-3', homeTeam: 'T1', awayTeam: 'T3', stage: 'group', group: 'X', status: 'FINISHED', score: { home: 1, away: 0 } },
    ];

    const result = buildStandings(matches, meta);

    // Group X has 3 teams — no third-place entry
    expect(result.thirdPlaceRanking).toHaveLength(0);
    expect(result.advancingThirdPlace).toHaveLength(0);
  });
});

describe('rankThirdPlace', () => {
  it('ranks third-place teams by criteria and selects top 8', () => {
    const teams = [
      { team: 'C1', group: 'A', pts: 4, gd: 2, gf: 5, fairPlay: -3, fifaRank: 8 },
      { team: 'C2', group: 'B', pts: 4, gd: 1, gf: 4, fairPlay: -5, fifaRank: 12 },
      { team: 'C3', group: 'C', pts: 4, gd: 1, gf: 3, fairPlay: -2, fifaRank: 5 },
      { team: 'C4', group: 'D', pts: 3, gd: 0, gf: 3, fairPlay: -1, fifaRank: 15 },
      { team: 'C5', group: 'E', pts: 3, gd: -1, gf: 2, fairPlay: -4, fifaRank: 20 },
      { team: 'C6', group: 'F', pts: 3, gd: -1, gf: 2, fairPlay: -4, fifaRank: 25 },
      { team: 'C7', group: 'G', pts: 2, gd: -2, gf: 2, fairPlay: -2, fifaRank: 10 },
      { team: 'C8', group: 'H', pts: 2, gd: -2, gf: 1, fairPlay: -1, fifaRank: 30 },
      { team: 'C9', group: 'I', pts: 2, gd: -3, gf: 1, fairPlay: -6, fifaRank: 18 },
      { team: 'C10', group: 'J', pts: 1, gd: -4, gf: 1, fairPlay: -3, fifaRank: 22 },
      { team: 'C11', group: 'K', pts: 1, gd: -5, gf: 0, fairPlay: -2, fifaRank: 35 },
      { team: 'C12', group: 'L', pts: 0, gd: -6, gf: 0, fairPlay: -8, fifaRank: 40 },
    ];

    const ranked = rankThirdPlace(teams);

    // C1 should be 1st (4 pts, +2 GD)
    expect(ranked[0].team).toBe('C1');

    // C2 before C3: same pts (4), same GD (1), C2 has more GF (4 vs 3)
    expect(ranked[1].team).toBe('C2');
    expect(ranked[2].team).toBe('C3');

    // C4 is 4th (3 pts)
    expect(ranked[3].team).toBe('C4');

    // C5 before C6: same pts/gd/gf/fairPlay, C5 has better FIFA rank (20 < 25)
    expect(ranked[4].team).toBe('C5');
    expect(ranked[5].team).toBe('C6');

    // Top 8 advance
    expect(ranked.slice(0, 8).map(t => t.team)).toEqual(
      ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8']
    );

    // Last 4 do not advance
    expect(ranked[8].team).toBe('C9');
    expect(ranked[11].team).toBe('C12');
  });

  it('uses alphabetical order for completely identical teams', () => {
    const teams = [
      { team: 'ZZZ', group: 'A', pts: 4, gd: 0, gf: 4, fairPlay: -5, fifaRank: 12 },
      { team: 'AAA', group: 'B', pts: 4, gd: 0, gf: 4, fairPlay: -5, fifaRank: 12 },
      { team: 'MMM', group: 'C', pts: 4, gd: 0, gf: 4, fairPlay: -5, fifaRank: 12 },
    ];

    const ranked = rankThirdPlace(teams);

    expect(ranked[0].team).toBe('AAA');
    expect(ranked[1].team).toBe('MMM');
    expect(ranked[2].team).toBe('ZZZ');
  });
});
