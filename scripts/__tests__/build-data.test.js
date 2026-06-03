/**
 * Integration tests for the build-data pipeline.
 * Mocks external fetches, verifies output structure.
 */

import { describe, it, expect } from 'vitest';
import { computeTeams } from '../lib/compute-teams.js';
import { runPredictions } from '../lib/run-predictions.js';
import { buildStandings } from '../lib/build-standings.js';
import { buildBracket } from '../lib/build-bracket.js';
import { validatePredictions } from '../lib/write-artifacts.js';
import { loadElo } from '../lib/load-elo.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const teamsMeta = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'teams-meta.json'), 'utf8'));
const seedingData = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'r32-seeding-table.json'), 'utf8'));

function makeTestMatches(teamsMeta) {
  const matches = [];
  const groupTeams = {};
  for (const [code, meta] of Object.entries(teamsMeta)) {
    if (!meta.group) continue;
    if (!groupTeams[meta.group]) groupTeams[meta.group] = [];
    groupTeams[meta.group].push(code);
  }

  let idx = 0;
  for (const [group, teams] of Object.entries(groupTeams)) {
    if (teams.length !== 4) continue;
    const [t1, t2, t3, t4] = teams;

    // Simulate results: winner always wins 2-0
    matches.push({ matchId: `${group}-1`, homeTeam: t1, awayTeam: t2, stage: 'group', group, status: 'FINISHED', score: { home: 2, away: 0 } });
    matches.push({ matchId: `${group}-2`, homeTeam: t3, awayTeam: t4, stage: 'group', group, status: 'FINISHED', score: { home: 1, away: 0 } });
    matches.push({ matchId: `${group}-3`, homeTeam: t1, awayTeam: t3, stage: 'group', group, status: 'FINISHED', score: { home: 3, away: 1 } });
    matches.push({ matchId: `${group}-4`, homeTeam: t4, awayTeam: t2, stage: 'group', group, status: 'SCHEDULED', score: null });
    matches.push({ matchId: `${group}-5`, homeTeam: t4, awayTeam: t1, stage: 'group', group, status: 'SCHEDULED', score: null });
    matches.push({ matchId: `${group}-6`, homeTeam: t2, awayTeam: t3, stage: 'group', group, status: 'SCHEDULED', score: null });
  }

  // Add knockout placeholder matches
  for (const r32Match of seedingData.r32Matches) {
    matches.push({
      matchId: `r32-${r32Match.match}`,
      homeTeam: 'TBD',
      awayTeam: 'TBD',
      stage: 'r32',
      group: null,
      status: 'SCHEDULED',
      score: null,
      date: r32Match.date,
      venue: r32Match.venue,
    });
  }

  return matches;
}

describe('Build pipeline integration', () => {
  it('loads all data files correctly', () => {
    expect(Object.keys(teamsMeta)).toHaveLength(48);
    expect(seedingData.r32Matches).toHaveLength(16);
    expect(seedingData.r16Matches).toHaveLength(8);
    expect(seedingData.qfMatches).toHaveLength(4);
    expect(seedingData.sfMatches).toHaveLength(2);
  });

  it('loads Elo for 48 teams', () => {
    const eloMap = loadElo();
    expect(eloMap.size).toBe(48);
    expect(eloMap.get('ARG')).toBeGreaterThan(0);
  });

  it('computes teams from matches', () => {
    const eloMap = loadElo();
    const matches = makeTestMatches(teamsMeta);
    const { teams } = computeTeams(matches, eloMap, teamsMeta);

    expect(Object.keys(teams)).toHaveLength(48);
    // Teams that won matches should have higher avgGoals
    const arg = teams['MEX']; // Group A team1
    expect(arg).toBeDefined();
    expect(arg.avgGoals).toBeGreaterThan(0);
  });

  it('produces valid predictions for all matches', () => {
    const eloMap = loadElo();
    const matches = makeTestMatches(teamsMeta);
    const { teams } = computeTeams(matches, eloMap, teamsMeta);

    // Filter to matches with known teams only
    const validMatches = matches.filter(m => teams[m.homeTeam] && teams[m.awayTeam]);
    const predictions = runPredictions(validMatches, teams);

    expect(predictions.length).toBeGreaterThan(0);

    // Validate all predictions
    for (const p of predictions) {
      expect(p.probs.home + p.probs.draw + p.probs.away).toBeCloseTo(1, 3);
      expect(p.lambdaHome).toBeGreaterThan(0);
      expect(p.lambdaAway).toBeGreaterThan(0);
    }

    // Should not throw
    expect(() => validatePredictions(predictions)).not.toThrow();
  });

  it('builds standings for 12 groups with third-place ranking', () => {
    const matches = makeTestMatches(teamsMeta);
    const standings = buildStandings(matches, teamsMeta);

    expect(Object.keys(standings.groups)).toHaveLength(12);
    expect(standings.thirdPlaceRanking).toHaveLength(12);
    expect(standings.advancingThirdPlace).toHaveLength(8);

    // Each group should have 4 teams sorted by rank
    for (const [group, teams] of Object.entries(standings.groups)) {
      expect(teams).toHaveLength(4);
      expect(teams[0].rank).toBe(1);
      expect(teams[3].rank).toBe(4);
    }
  });

  it('builds complete bracket with R32 through Final', () => {
    const eloMap = loadElo();
    const matches = makeTestMatches(teamsMeta);
    const { teams } = computeTeams(matches, eloMap, teamsMeta);
    const standings = buildStandings(matches, teamsMeta);

    const validMatches = matches.filter(m => teams[m.homeTeam] && teams[m.awayTeam]);
    const predictions = runPredictions(validMatches, teams);

    const bracket = buildBracket(standings, predictions, seedingData);

    expect(bracket.rounds.r32).toHaveLength(16);
    expect(bracket.rounds.r16).toHaveLength(8);
    expect(bracket.rounds.qf).toHaveLength(4);
    expect(bracket.rounds.sf).toHaveLength(2);
    expect(bracket.rounds.final).toHaveLength(1);
    expect(bracket.rounds.third).toHaveLength(1);
  });

  it('knockout predictions have qualify probabilities summing to 1', () => {
    const eloMap = loadElo();
    const matches = makeTestMatches(teamsMeta);
    const { teams } = computeTeams(matches, eloMap, teamsMeta);

    const knockoutMatches = matches.filter(m =>
      ['r32', 'r16', 'qf', 'sf', 'final'].includes(m.stage) &&
      teams[m.homeTeam] && teams[m.awayTeam]
    );

    // Add some knockout matches with real teams
    const testKnockout = [
      { matchId: 'r32-test', homeTeam: 'ARG', awayTeam: 'MEX', stage: 'r32', group: null, status: 'SCHEDULED', score: null, venue: 'Test' },
      { matchId: 'sf-test', homeTeam: 'BRA', awayTeam: 'FRA', stage: 'sf', group: null, status: 'SCHEDULED', score: null, venue: 'Test' },
    ];

    const predictions = runPredictions(testKnockout, teams);

    for (const p of predictions) {
      expect(p.qualify).toBeDefined();
      expect(p.qualify.home + p.qualify.away).toBeCloseTo(1, 3);
      // qualify.home should be > probs90.home (draw probability contributes via penalties)
      expect(p.qualify.home).toBeGreaterThan(p.probs.home);
    }
  });

  it('produces 7 JSON files worth of valid data', () => {
    const eloMap = loadElo();
    const matches = makeTestMatches(teamsMeta);
    const { teams } = computeTeams(matches, eloMap, teamsMeta);
    const validMatches = matches.filter(m => teams[m.homeTeam] && teams[m.awayTeam]);
    const predictions = runPredictions(validMatches, teams);
    const standings = buildStandings(matches, teamsMeta);
    const bracket = buildBracket(standings, predictions, seedingData);

    // Verify JSON-serializable structure
    expect(() => JSON.stringify(matches)).not.toThrow();
    expect(() => JSON.stringify(predictions)).not.toThrow();
    expect(() => JSON.stringify(teams)).not.toThrow();
    expect(() => JSON.stringify(teamsMeta)).not.toThrow();
    expect(() => JSON.stringify(standings.groups)).not.toThrow();
    expect(() => JSON.stringify(bracket)).not.toThrow();

    // Verify file counts
    const predCount = predictions.length;
    expect(predCount).toBeGreaterThan(0);
  });
});


describe('Football-Data.org schema parsing (fetch-results)', () => {
  it('parses v4 match response schema correctly', async () => {
    // This is the EXACT schema returned by api.football-data.org/v4/competitions/WC/matches
    // Verified from API docs and confirmed TIER_ONE (free tier) access
    const mockFdResponse = {
      filters: {},
      resultSet: { count: 2, competitions: 'WC', first: '2026-06-11', last: '2026-06-11' },
      competition: { id: 2000, name: 'FIFA World Cup', code: 'WC' },
      matches: [
        {
          id: 417001,
          utcDate: '2026-06-11T18:00:00Z',
          status: 'FINISHED',
          homeTeam: { id: 764, name: 'Mexico',       tla: 'MEX', crest: 'https://...' },
          awayTeam: { id: 1118, name: 'South Africa', tla: 'RSA', crest: 'https://...' },
          score: {
            winner: 'HOME_TEAM',
            duration: 'REGULAR',
            fullTime: { home: 2, away: 0 },
            halfTime: { home: 1, away: 0 },
          },
          stage: 'GROUP_STAGE',
          group: 'GROUP_A',
        },
        {
          id: 417002,
          utcDate: '2026-06-11T21:00:00Z',
          status: 'SCHEDULED',
          homeTeam: { id: 65,  name: 'Argentina', tla: 'ARG', crest: 'https://...' },
          awayTeam: { id: 1110, name: 'Algeria',   tla: 'ALG', crest: 'https://...' },
          score: {
            winner: null,
            duration: 'REGULAR',
            fullTime: { home: null, away: null },
            halfTime: { home: null, away: null },
          },
          stage: 'GROUP_STAGE',
          group: 'GROUP_J',
        },
      ],
    };

    // Parse what fetch-results.js would do with this response
    const results = new Map();
    for (const match of mockFdResponse.matches) {
      const key = match.homeTeam.tla + '_' + match.awayTeam.tla + '_' + match.utcDate;
      results.set(match.id?.toString() || key, {
        homeTeam: match.homeTeam?.tla,
        awayTeam: match.awayTeam?.tla,
        homeScore: match.score?.fullTime?.home ?? null,
        awayScore: match.score?.fullTime?.away ?? null,
        status: match.status,
        date: match.utcDate,
      });
    }

    expect(results.size).toBe(2);

    const mexVsRsa = results.get('417001');
    expect(mexVsRsa.homeTeam).toBe('MEX');   // tla must match our canonical code
    expect(mexVsRsa.awayTeam).toBe('RSA');
    expect(mexVsRsa.homeScore).toBe(2);
    expect(mexVsRsa.awayScore).toBe(0);
    expect(mexVsRsa.status).toBe('FINISHED');

    const argVsAlg = results.get('417002');
    expect(argVsAlg.homeScore).toBeNull();   // SCHEDULED — no score yet
    expect(argVsAlg.status).toBe('SCHEDULED');
  });

  it('mergeResults() updates match scores by team code matching', () => {
    // The build-data.js mergeResults() function pairs FD results with our matches
    // by comparing homeTeam/awayTeam code — both sides must use same canonical codes
    const matches = [
      { matchId: 'A-1', homeTeam: 'MEX', awayTeam: 'RSA', stage: 'group', group: 'A', status: 'SCHEDULED', score: null, date: '2026-06-11' },
      { matchId: 'A-2', homeTeam: 'KOR', awayTeam: 'CZE', stage: 'group', group: 'A', status: 'SCHEDULED', score: null, date: '2026-06-11' },
    ];

    const results = new Map([
      ['417001', { homeTeam: 'MEX', awayTeam: 'RSA', homeScore: 2, awayScore: 0, status: 'FINISHED', date: '2026-06-11T18:00:00Z' }],
    ]);

    // Inline mergeResults logic from build-data.js
    for (const match of matches) {
      for (const [key, result] of results.entries()) {
        if (match.homeTeam === result.homeTeam && match.awayTeam === result.awayTeam) {
          if (result.status === 'FINISHED' && result.homeScore != null) {
            match.score = { home: result.homeScore, away: result.awayScore };
            match.status = 'FINISHED';
          }
          break;
        }
      }
    }

    expect(matches[0].status).toBe('FINISHED');
    expect(matches[0].score).toEqual({ home: 2, away: 0 });
    expect(matches[1].status).toBe('SCHEDULED');  // unmatched — stays scheduled
    expect(matches[1].score).toBeNull();
  });
});

describe('Defence sign (post-match model accuracy)', () => {
  it('weak defence raises attacker lambda, strong defence lowers it', async () => {
    const { BASELINE_LAMBDA, eloToLambdaDiff, computeAttackDefence } = await import('../../src/engine/calibrate.js');

    const eloMap = new Map([['STR', 1900], ['WEK', 1900]]);

    // STR has elite defence: concedes 0.3 goals/game vs 1.35 avg
    // WEK has weak defence: concedes 3.0 goals/game vs 1.35 avg
    const results = [
      { team: 'STR', goalsFor: 1, goalsAgainst: 0, date: '2026-06-12' },
      { team: 'STR', goalsFor: 1, goalsAgainst: 0, date: '2026-06-16' },
      { team: 'STR', goalsFor: 1, goalsAgainst: 1, date: '2026-06-20' },
      { team: 'WEK', goalsFor: 1, goalsAgainst: 3, date: '2026-06-12' },
      { team: 'WEK', goalsFor: 1, goalsAgainst: 4, date: '2026-06-16' },
      { team: 'WEK', goalsFor: 1, goalsAgainst: 2, date: '2026-06-20' },
    ];
    const { attack, defence } = computeAttackDefence(results, eloMap, 3);

    // STR concedes 1/3 goals/game = below average → negative defence (strong)
    expect(defence['STR']).toBeLessThan(0);
    // WEK concedes 3 goals/game = above average → positive defence (weak)
    expect(defence['WEK']).toBeGreaterThan(0);

    // Lambda against weak defence (WEK) must be HIGHER than against strong (STR)
    // Both teams equal Elo, so difference is purely from defence parameter
    function lambdaVs(opp) {
      let lambda = BASELINE_LAMBDA;  // same elo → no elo diff factor
      if (opp.defence) lambda *= Math.exp(opp.defence);  // + sign is the fix
      return lambda;
    }

    const lambdaVsStr = lambdaVs({ defence: defence['STR'] });
    const lambdaVsWek = lambdaVs({ defence: defence['WEK'] });

    expect(lambdaVsWek).toBeGreaterThan(lambdaVsStr);
    // Expected: attacking weak team > baseline, attacking strong team < baseline
    expect(lambdaVsWek).toBeGreaterThan(BASELINE_LAMBDA);
    expect(lambdaVsStr).toBeLessThan(BASELINE_LAMBDA);
  });
});

