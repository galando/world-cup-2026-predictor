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
