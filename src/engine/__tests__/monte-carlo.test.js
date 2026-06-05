import { describe, it, expect } from 'vitest';
import {
  sampleOutcome,
  samplePenaltyWinner,
  simulateGroupStage,
  simulateKnockout,
  runTournamentSim,
} from '../monte-carlo.js';

describe('sampleOutcome', () => {
  it('returns one of home, draw, away', () => {
    const probs = { home: 0.6, draw: 0.2, away: 0.2 };
    for (let i = 0; i < 50; i++) {
      const result = sampleOutcome(probs, Math.random);
      expect(['home', 'draw', 'away']).toContain(result);
    }
  });

  it('always returns home when home prob is 1', () => {
    const probs = { home: 1.0, draw: 0.0, away: 0.0 };
    for (let i = 0; i < 20; i++) {
      expect(sampleOutcome(probs, Math.random)).toBe('home');
    }
  });

  it('always returns away when away prob is 1', () => {
    const probs = { home: 0.0, draw: 0.0, away: 1.0 };
    for (let i = 0; i < 20; i++) {
      expect(sampleOutcome(probs, Math.random)).toBe('away');
    }
  });

  it('is deterministic with seeded RNG', () => {
    const probs = { home: 0.5, draw: 0.25, away: 0.25 };
    // Simple seeded RNG (LCG)
    let seed = 42;
    const seeded = () => {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      return (seed >>> 0) / 0xffffffff;
    };
    const results = [];
    for (let i = 0; i < 10; i++) {
      results.push(sampleOutcome(probs, seeded));
    }
    // Run again with same seed — should produce identical results
    seed = 42;
    const results2 = [];
    for (let i = 0; i < 10; i++) {
      results2.push(sampleOutcome(probs, seeded));
    }
    expect(results).toEqual(results2);
  });
});

describe('samplePenaltyWinner', () => {
  it('returns home or away', () => {
    for (let i = 0; i < 50; i++) {
      const winner = samplePenaltyWinner(2000, 1800, Math.random);
      expect(['home', 'away']).toContain(winner);
    }
  });

  it('favors higher Elo team over many trials', () => {
    let homeWins = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) {
      if (samplePenaltyWinner(2200, 1600, Math.random) === 'home') homeWins++;
    }
    // Strong team should win > 55% of penalty shootouts
    expect(homeWins / N).toBeGreaterThan(0.55);
  });
});

describe('simulateGroupStage', () => {
  // Minimal 2-group, 4-team-per-group setup
  function makeGroupProbs() {
    const teams = {
      A1: { code: 'A1', group: 'A', elo: 2000 },
      A2: { code: 'A2', group: 'A', elo: 1900 },
      A3: { code: 'A3', group: 'A', elo: 1800 },
      A4: { code: 'A4', group: 'A', elo: 1700 },
      B1: { code: 'B1', group: 'B', elo: 2100 },
      B2: { code: 'B2', group: 'B', elo: 1950 },
      B3: { code: 'B3', group: 'B', elo: 1850 },
      B4: { code: 'B4', group: 'B', elo: 1750 },
    };

    // Group matches: each group has 6 matches (round-robin of 4 teams)
    const matches = [
      // Group A
      { matchId: 'A-1', homeTeam: 'A1', awayTeam: 'A2', group: 'A', stage: 'group' },
      { matchId: 'A-2', homeTeam: 'A3', awayTeam: 'A4', group: 'A', stage: 'group' },
      { matchId: 'A-3', homeTeam: 'A1', awayTeam: 'A3', group: 'A', stage: 'group' },
      { matchId: 'A-4', homeTeam: 'A4', awayTeam: 'A2', group: 'A', stage: 'group' },
      { matchId: 'A-5', homeTeam: 'A4', awayTeam: 'A1', group: 'A', stage: 'group' },
      { matchId: 'A-6', homeTeam: 'A2', awayTeam: 'A3', group: 'A', stage: 'group' },
      // Group B
      { matchId: 'B-1', homeTeam: 'B1', awayTeam: 'B2', group: 'B', stage: 'group' },
      { matchId: 'B-2', homeTeam: 'B3', awayTeam: 'B4', group: 'B', stage: 'group' },
      { matchId: 'B-3', homeTeam: 'B1', awayTeam: 'B3', group: 'B', stage: 'group' },
      { matchId: 'B-4', homeTeam: 'B4', awayTeam: 'B2', group: 'B', stage: 'group' },
      { matchId: 'B-5', homeTeam: 'B4', awayTeam: 'B1', group: 'B', stage: 'group' },
      { matchId: 'B-6', homeTeam: 'B2', awayTeam: 'B3', group: 'B', stage: 'group' },
    ];

    // Simple match probabilities: higher Elo favored
    const matchProbs = new Map();
    for (const m of matches) {
      const homeElo = teams[m.homeTeam].elo;
      const awayElo = teams[m.awayTeam].elo;
      const diff = homeElo - awayElo;
      const pHome = 0.4 + diff / 1000;
      const pDraw = 0.25;
      const pAway = 1 - pHome - pDraw;
      matchProbs.set(m.matchId, {
        home: Math.max(0.05, Math.min(0.9, pHome)),
        draw: pDraw,
        away: Math.max(0.05, Math.min(0.9, pAway)),
      });
    }

    return { teams, matches, matchProbs };
  }

  it('returns advancing teams (top 2 from each group + best 3rd)', () => {
    const { teams, matches, matchProbs } = makeGroupProbs();
    const teamsMeta = {};
    for (const [code, t] of Object.entries(teams)) {
      teamsMeta[code] = { group: t.group, fifaRank: 10 };
    }

    const result = simulateGroupStage(matches, matchProbs, teams, teamsMeta, Math.random);

    // Should have standings per group
    expect(result.standings.A).toBeDefined();
    expect(result.standings.B).toBeDefined();
    // Each group should have 4 teams
    expect(result.standings.A).toHaveLength(4);
    expect(result.standings.B).toHaveLength(4);
    // Advancing: top 2 from each group
    expect(result.advancing.length).toBeGreaterThanOrEqual(4);
  });
});

describe('simulateKnockout', () => {
  it('returns a champion from the bracket', () => {
    const teams = {
      T1: { code: 'T1', elo: 2100 },
      T2: { code: 'T2', elo: 2000 },
      T3: { code: 'T3', elo: 1900 },
      T4: { code: 'T4', elo: 1800 },
    };

    // Simple bracket: SF1 (T1 vs T2), SF2 (T3 vs T4), Final
    const bracket = {
      rounds: {
        sf: [
          { matchId: 'sf-1', homeTeam: 'T1', awayTeam: 'T2' },
          { matchId: 'sf-2', homeTeam: 'T3', awayTeam: 'T4' },
        ],
        final: [
          { matchId: 'final-1', homeTeam: null, awayTeam: null, fromSf: ['sf-1', 'sf-2'] },
        ],
      },
    };

    const matchProbs = new Map();
    for (const m of [...bracket.rounds.sf, ...bracket.rounds.final]) {
      const h = m.homeTeam ? teams[m.homeTeam].elo : 2000;
      const a = m.awayTeam ? teams[m.awayTeam].elo : 2000;
      const diff = h - a;
      const pHome = 0.4 + diff / 1000;
      matchProbs.set(m.matchId, {
        home: Math.max(0.1, Math.min(0.9, pHome)),
        draw: 0.25,
        away: Math.max(0.1, Math.min(0.9, 0.6 - diff / 1000)),
      });
    }

    const result = simulateKnockout(bracket, matchProbs, teams, Math.random);
    expect(['T1', 'T2', 'T3', 'T4']).toContain(result.champion);
    expect(result.path).toBeDefined();
    expect(result.path.length).toBeGreaterThan(0);
  });
});

describe('runTournamentSim', () => {
  it('sum of win probabilities across teams ~ 1.0', () => {
    // Minimal setup: 2 groups of 4 teams
    const teams = {};
    const groups = ['A', 'B'];
    const teamsPerGroup = ['1', '2', '3', '4'];
    const eloBase = { A: { '1': 2000, '2': 1900, '3': 1800, '4': 1700 },
                      B: { '1': 2100, '2': 1950, '3': 1850, '4': 1750 } };

    const teamsMeta = {};
    const matches = [];
    const matchProbs = new Map();

    for (const g of groups) {
      for (const n of teamsPerGroup) {
        const code = `${g}${n}`;
        teams[code] = { code, group: g, elo: eloBase[g][n] };
        teamsMeta[code] = { group: g, fifaRank: 10 };
      }
      // Generate group matches
      const [t1, t2, t3, t4] = teamsPerGroup.map(n => `${g}${n}`);
      const groupMatches = [
        { matchId: `${g}-1`, homeTeam: t1, awayTeam: t2, group: g, stage: 'group' },
        { matchId: `${g}-2`, homeTeam: t3, awayTeam: t4, group: g, stage: 'group' },
        { matchId: `${g}-3`, homeTeam: t1, awayTeam: t3, group: g, stage: 'group' },
        { matchId: `${g}-4`, homeTeam: t4, awayTeam: t2, group: g, stage: 'group' },
        { matchId: `${g}-5`, homeTeam: t4, awayTeam: t1, group: g, stage: 'group' },
        { matchId: `${g}-6`, homeTeam: t2, awayTeam: t3, group: g, stage: 'group' },
      ];
      matches.push(...groupMatches);

      for (const m of groupMatches) {
        const hElo = teams[m.homeTeam].elo;
        const aElo = teams[m.awayTeam].elo;
        const diff = hElo - aElo;
        matchProbs.set(m.matchId, {
          home: Math.max(0.1, Math.min(0.9, 0.4 + diff / 1000)),
          draw: 0.25,
          away: Math.max(0.1, Math.min(0.9, 0.35 - diff / 1000)),
        });
      }
    }

    // Simplified bracket for 4 advancing teams (top 2 from each group)
    const bracket = {
      rounds: {
        final: [
          { matchId: 'final-1', homeTeam: null, awayTeam: null },
        ],
      },
    };

    const seedingData = {
      // Minimal seeding for 2 groups: top 2 advance to final
      r32Matches: [],
      r16Matches: [],
      qfMatches: [],
      sfMatches: [
        { match: 1, slot1: '1A', slot2: '2B', venue: 'Test', date: '2026-07-01' },
        { match: 2, slot1: '1B', slot2: '2A', venue: 'Test', date: '2026-07-01' },
      ],
      final: { match: 3, from: [1, 2], venue: 'Test', date: '2026-07-05' },
    };

    const result = runTournamentSim(
      matches, matchProbs, teams, teamsMeta, bracket, seedingData,
      { n: 1000, rng: Math.random },
    );

    // Check probabilities exist for all teams
    expect(Object.keys(result.teams)).toHaveLength(8);

    // Sum of win probs should be ~1.0
    const winSum = Object.values(result.teams).reduce((s, t) => s + t.win, 0);
    expect(winSum).toBeCloseTo(1.0, 1);

    // Each team has valid probabilities
    for (const [code, probs] of Object.entries(result.teams)) {
      expect(probs.win).toBeGreaterThanOrEqual(0);
      expect(probs.win).toBeLessThanOrEqual(1);
      expect(probs.r16).toBeGreaterThanOrEqual(probs.win);
    }
  });

  it('performance: 1000 sims complete in under 5 seconds', () => {
    // Same setup as above but simplified
    const teams = {};
    const teamsMeta = {};
    const matches = [];
    const matchProbs = new Map();
    const groups = ['A', 'B'];

    for (const g of groups) {
      for (let n = 1; n <= 4; n++) {
        const code = `${g}${n}`;
        teams[code] = { code, group: g, elo: 1900 + n * 50 };
        teamsMeta[code] = { group: g, fifaRank: 10 };
      }
      const codes = [1, 2, 3, 4].map(n => `${g}${n}`);
      const gm = [
        { matchId: `${g}-1`, homeTeam: codes[0], awayTeam: codes[1], group: g, stage: 'group' },
        { matchId: `${g}-2`, homeTeam: codes[2], awayTeam: codes[3], group: g, stage: 'group' },
        { matchId: `${g}-3`, homeTeam: codes[0], awayTeam: codes[2], group: g, stage: 'group' },
        { matchId: `${g}-4`, homeTeam: codes[3], awayTeam: codes[1], group: g, stage: 'group' },
        { matchId: `${g}-5`, homeTeam: codes[3], awayTeam: codes[0], group: g, stage: 'group' },
        { matchId: `${g}-6`, homeTeam: codes[1], awayTeam: codes[2], group: g, stage: 'group' },
      ];
      matches.push(...gm);
      for (const m of gm) {
        matchProbs.set(m.matchId, { home: 0.45, draw: 0.25, away: 0.30 });
      }
    }

    const bracket = { rounds: { final: [{ matchId: 'final-1' }] } };
    const seedingData = {
      r32Matches: [], r16Matches: [], qfMatches: [],
      sfMatches: [
        { match: 1, slot1: '1A', slot2: '2B' },
        { match: 2, slot1: '1B', slot2: '2A' },
      ],
      final: { match: 3, from: [1, 2] },
    };

    const start = Date.now();
    runTournamentSim(matches, matchProbs, teams, teamsMeta, bracket, seedingData, { n: 1000, rng: Math.random });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);
  });
});
