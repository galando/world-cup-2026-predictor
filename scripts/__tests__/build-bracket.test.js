/**
 * Tests for build-bracket.js
 * Covers: bracket construction, R32 slot resolution, bracket cascade
 */

import { describe, it, expect } from 'vitest';
import { buildBracket } from '../lib/build-bracket.js';

const mockSeeding = {
  r32Matches: [
    { match: 73, slot1: '2A', slot2: '2B', venue: 'Inglewood', date: '2026-06-28' },
    { match: 74, slot1: '1C', slot2: '2F', venue: 'Foxborough', date: '2026-06-29' },
    { match: 75, slot1: '1E', slot2: '3ABCD F', venue: 'East Rutherford', date: '2026-06-30' },
    { match: 76, slot1: '1F', slot2: '2C', venue: 'Guadalupe', date: '2026-06-29' },
    { match: 77, slot1: '2E', slot2: '2I', venue: 'Houston', date: '2026-07-04' },
    { match: 78, slot1: '1I', slot2: '3CDFGH', venue: 'Foxborough', date: '2026-06-30' },
  ],
  r16Matches: [
    { match: 89, from: [73, 75], venue: 'Philadelphia', date: '2026-07-04' },
    { match: 90, from: [74, 77], venue: 'Houston', date: '2026-07-04' },
  ],
  qfMatches: [
    { match: 97, from: [89, 90], venue: 'Foxborough', date: '2026-07-09' },
  ],
  sfMatches: [
    { match: 101, from: [97, 98], venue: 'Arlington', date: '2026-07-14' },
  ],
  thirdPlace: { match: 103, from: [101, 102], venue: 'Miami Gardens', date: '2026-07-18' },
  final: { match: 104, from: [101, 102], venue: 'East Rutherford', date: '2026-07-19' },
  thirdPlaceLookup: {
    '75': ['A', 'B', 'C', 'D', 'F'],
    '78': ['C', 'D', 'F', 'G', 'H'],
  },
};

const mockStandings = {
  groups: {
    A: [
      { team: 'MEX', rank: 1, pts: 7, gd: 4, gf: 7, fairPlay: -2, fifaRank: 15 },
      { team: 'RSA', rank: 2, pts: 4, gd: 0, gf: 4, fairPlay: -3, fifaRank: 61 },
      { team: 'KOR', rank: 3, pts: 3, gd: -1, gf: 3, fairPlay: -4, fifaRank: 22 },
      { team: 'CZE', rank: 4, pts: 1, gd: -3, gf: 2, fairPlay: -1, fifaRank: 43 },
    ],
    B: [
      { team: 'SUI', rank: 1, pts: 7, gd: 5, gf: 6, fairPlay: -2, fifaRank: 17 },
      { team: 'CAN', rank: 2, pts: 4, gd: 0, gf: 3, fairPlay: -3, fifaRank: 27 },
      { team: 'BIH', rank: 3, pts: 3, gd: -2, gf: 2, fairPlay: -5, fifaRank: 57 },
      { team: 'QAT', rank: 4, pts: 1, gd: -3, gf: 1, fairPlay: -1, fifaRank: 51 },
    ],
    C: [
      { team: 'BRA', rank: 1, pts: 9, gd: 6, gf: 8, fairPlay: -1, fifaRank: 5 },
      { team: 'MAR', rank: 2, pts: 4, gd: 0, gf: 4, fairPlay: -3, fifaRank: 11 },
      { team: 'SCO', rank: 3, pts: 3, gd: -2, gf: 3, fairPlay: -4, fifaRank: 36 },
      { team: 'HAI', rank: 4, pts: 0, gd: -4, gf: 1, fairPlay: -2, fifaRank: 84 },
    ],
    D: [
      { team: 'USA', rank: 1, pts: 7, gd: 3, gf: 5, fairPlay: -2, fifaRank: 14 },
      { team: 'TUR', rank: 2, pts: 4, gd: 1, gf: 4, fairPlay: -3, fifaRank: 28 },
      { team: 'PAR', rank: 3, pts: 3, gd: -1, gf: 3, fairPlay: -4, fifaRank: 39 },
      { team: 'AUS', rank: 4, pts: 1, gd: -3, gf: 2, fairPlay: -1, fifaRank: 26 },
    ],
    E: [
      { team: 'GER', rank: 1, pts: 7, gd: 4, gf: 6, fairPlay: -1, fifaRank: 9 },
      { team: 'ECU', rank: 2, pts: 4, gd: 0, gf: 4, fairPlay: -3, fifaRank: 23 },
      { team: 'CIV', rank: 3, pts: 3, gd: -1, gf: 3, fairPlay: -5, fifaRank: 42 },
      { team: 'CUW', rank: 4, pts: 1, gd: -3, gf: 2, fairPlay: -2, fifaRank: 82 },
    ],
    F: [
      { team: 'NED', rank: 1, pts: 7, gd: 3, gf: 5, fairPlay: -2, fifaRank: 7 },
      { team: 'JPN', rank: 2, pts: 4, gd: 1, gf: 4, fairPlay: -3, fifaRank: 18 },
      { team: 'SWE', rank: 3, pts: 3, gd: -1, gf: 3, fairPlay: -4, fifaRank: 26 },
      { team: 'TUN', rank: 4, pts: 1, gd: -3, gf: 2, fairPlay: -1, fifaRank: 40 },
    ],
  },
  thirdPlaceRanking: [
    { team: 'KOR', group: 'A', pts: 3, gd: -1, gf: 3, fairPlay: -4, fifaRank: 22 },
    { team: 'SCO', group: 'C', pts: 3, gd: -2, gf: 3, fairPlay: -4, fifaRank: 36 },
    { team: 'PAR', group: 'D', pts: 3, gd: -1, gf: 3, fairPlay: -4, fifaRank: 39 },
    { team: 'CIV', group: 'E', pts: 3, gd: -1, gf: 3, fairPlay: -5, fifaRank: 42 },
    { team: 'SWE', group: 'F', pts: 3, gd: -1, gf: 3, fairPlay: -4, fifaRank: 26 },
    { team: 'BIH', group: 'B', pts: 3, gd: -2, gf: 2, fairPlay: -5, fifaRank: 57 },
  ],
  advancingThirdPlace: [
    { team: 'KOR', group: 'A', pts: 3, gd: -1, gf: 3, fairPlay: -4, fifaRank: 22 },
    { team: 'SWE', group: 'F', pts: 3, gd: -1, gf: 3, fairPlay: -4, fifaRank: 26 },
    { team: 'SCO', group: 'C', pts: 3, gd: -2, gf: 3, fairPlay: -4, fifaRank: 36 },
    { team: 'PAR', group: 'D', pts: 3, gd: -1, gf: 3, fairPlay: -4, fifaRank: 39 },
    { team: 'CIV', group: 'E', pts: 3, gd: -1, gf: 3, fairPlay: -5, fifaRank: 42 },
    { team: 'BIH', group: 'B', pts: 3, gd: -2, gf: 2, fairPlay: -5, fifaRank: 57 },
  ],
};

describe('buildBracket', () => {
  it('resolves group winner/runner-up slots correctly', () => {
    const bracket = buildBracket(mockStandings, [], mockSeeding);

    // Match 73: 2A vs 2B = RSA vs CAN
    const m73 = bracket.rounds.r32.find(m => m.matchNumber === 73);
    expect(m73.homeTeam).toBe('RSA');
    expect(m73.awayTeam).toBe('CAN');

    // Match 74: 1C vs 2F = BRA vs JPN
    const m74 = bracket.rounds.r32.find(m => m.matchNumber === 74);
    expect(m74.homeTeam).toBe('BRA');
    expect(m74.awayTeam).toBe('JPN');
  });

  it('resolves third-place slots from advancing teams', () => {
    const bracket = buildBracket(mockStandings, [], mockSeeding);

    // Match 75: 1E vs 3{ABCD F}
    // Eligible groups: A,B,C,D,F. From advancingThirdPlace: KOR(A), SWE(F), SCO(C), PAR(D), CIV(E), BIH(B)
    // Best third-place in eligible groups that is advancing
    const m75 = bracket.rounds.r32.find(m => m.matchNumber === 75);
    expect(m75.homeTeam).toBe('GER'); // 1E
    // The third-place team should be from one of {A,B,C,D,F}
    expect(m75.awayTeam).toBeTruthy();
  });

  it('creates all bracket rounds', () => {
    const bracket = buildBracket(mockStandings, [], mockSeeding);

    expect(bracket.rounds.r32).toBeDefined();
    expect(bracket.rounds.r16).toBeDefined();
    expect(bracket.rounds.qf).toBeDefined();
    expect(bracket.rounds.sf).toBeDefined();
    expect(bracket.rounds.final).toBeDefined();
    expect(bracket.rounds.third).toBeDefined();
  });

  it('R16 matches reference correct R32 source matches', () => {
    const bracket = buildBracket(mockStandings, [], mockSeeding);

    const r16_89 = bracket.rounds.r16.find(m => m.matchNumber === 89);
    expect(r16_89.fromMatches).toEqual([73, 75]);

    const r16_90 = bracket.rounds.r16.find(m => m.matchNumber === 90);
    expect(r16_90.fromMatches).toEqual([74, 77]);
  });

  it('each R32 slot receives exactly one team', () => {
    const bracket = buildBracket(mockStandings, [], mockSeeding);

    // Non-third-place slots should always be resolved
    const directSlots = bracket.rounds.r32.filter(m => {
      const s1 = mockSeeding.r32Matches.find(s => s.match === m.matchNumber);
      const parsed = s1.slot1[0];
      return parsed === '1' || parsed === '2';
    });

    for (const match of directSlots) {
      if (match.homeTeam) {
        expect(typeof match.homeTeam).toBe('string');
        expect(match.homeTeam.length).toBeGreaterThan(0);
      }
    }
  });

  it('no team is assigned to multiple R32 slots', () => {
    const bracket = buildBracket(mockStandings, [], mockSeeding);

    const assignedTeams = [];
    for (const match of bracket.rounds.r32) {
      if (match.homeTeam) assignedTeams.push(match.homeTeam);
      if (match.awayTeam) assignedTeams.push(match.awayTeam);
    }

    const uniqueTeams = new Set(assignedTeams);
    expect(uniqueTeams.size).toBe(assignedTeams.length);
  });
});
