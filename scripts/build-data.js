/**
 * Build data orchestrator — main entry point for the data pipeline.
 * Wires all modules in correct execution order:
 *   load → fetch → merge → compute → predict → standings → bracket → write
 *
 * Usage: node scripts/build-data.js
 * Environment: FD_API_KEY (optional — Football-Data.org API key)
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Import modules
import { fetchOpenFootball } from './lib/fetch-openfootball.js';
import { fetchResults } from './lib/fetch-results.js';
import { loadElo } from './lib/load-elo.js';
import { computeTeams } from './lib/compute-teams.js';
import { runPredictions } from './lib/run-predictions.js';
import { buildStandings } from './lib/build-standings.js';
import { buildBracket } from './lib/build-bracket.js';
import { writeArtifacts } from './lib/write-artifacts.js';
import { fetchAndUpdateElo } from './lib/fetch-elo.js';

const startTime = Date.now();

async function main() {
  console.log('=== Mundial 2026 Build Data ===');
  console.log(`Started: ${new Date().toISOString()}\n`);

  try {
    // Step 1: Refresh Elo from eloratings.net if >23h stale
    console.log('[1/9] Refreshing Elo ratings...');
    await fetchAndUpdateElo();
    const eloMap = loadElo();
    console.log(`  Loaded ${eloMap.size} team Elo ratings`);

    // Step 2: Load teams metadata
    console.log('[2/9] Loading teams metadata...');
    const teamsMeta = JSON.parse(readFileSync(join(__dirname, 'data', 'teams-meta.json'), 'utf8'));
    console.log(`  Loaded ${Object.keys(teamsMeta).length} team entries`);

    // Step 3: Load R32 seeding table
    console.log('[3/9] Loading R32 seeding table...');
    const seedingData = JSON.parse(readFileSync(join(__dirname, 'data', 'r32-seeding-table.json'), 'utf8'));

    // Step 4: Fetch OpenFootball fixtures (with graceful fallback)
    console.log('[4/9] Fetching OpenFootball fixtures...');
    let rawMatches = [];
    try {
      const ofData = await fetchOpenFootball();
      rawMatches = ofData.matches || [];
      console.log(`  Fetched ${rawMatches.length} matches from OpenFootball`);
    } catch (err) {
      console.warn(`  OpenFootball fetch failed (non-critical): ${err.message}`);
      console.log('  Falling back to generated match schedule');
    }

    // If no matches from OpenFootball, generate from teams-meta + seeding
    const matches = rawMatches.length > 0 ? rawMatches : generateMatchesFromData(teamsMeta, seedingData);
    console.log(`  Total matches: ${matches.length}`);

    // Step 5: Fetch results from Football-Data.org (optional)
    console.log('[5/9] Fetching match results...');
    const apiKey = process.env.FD_API_KEY;
    if (apiKey) {
      try {
        const results = await fetchResults(apiKey);
        console.log(`  Fetched ${results.size} results`);
        // Merge results into matches
        mergeResults(matches, results);
      } catch (err) {
        console.warn(`  Results fetch failed (non-critical): ${err.message}`);
      }
    } else {
      console.log('  No FD_API_KEY set, skipping live results');
    }

    // Step 6: Compute team strengths
    console.log('[6/9] Computing team strengths...');
    const { teams } = computeTeams(matches, eloMap, teamsMeta);
    console.log(`  Computed data for ${Object.keys(teams).length} teams`);

    // Step 7: Run predictions
    console.log('[7/9] Running Dixon-Coles predictions...');
    const predictions = runPredictions(matches, teams);
    console.log(`  Generated ${predictions.length} predictions`);

    // Step 8: Build standings + bracket
    console.log('[8/9] Building standings and bracket...');
    const standings = buildStandings(matches, teamsMeta);
    const bracket = buildBracket(standings, predictions, seedingData);
    console.log(`  Built standings for ${Object.keys(standings.groups).length} groups`);
    console.log(`  Advancing 3rd-place teams: ${standings.advancingThirdPlace.length}`);

    // Step 9: Write all artifacts
    console.log('[9/9] Writing artifacts...');
    writeArtifacts({
      matches,
      predictions,
      teams,
      teamsMeta,
      standings: standings.groups,
      bracket,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n=== Build complete in ${elapsed}s ===`);

  } catch (err) {
    console.error('\n!!! BUILD FAILED !!!');
    console.error(err);
    process.exit(1);
  }
}

/**
 * Merge Football-Data.org results into the match list.
 */
function mergeResults(matches, results) {
  for (const match of matches) {
    // Try to find matching result by team codes
    for (const [key, result] of results.entries()) {
      const homeMatch = match.homeTeam === result.homeTeam;
      const awayMatch = match.awayTeam === result.awayTeam;
      if (homeMatch && awayMatch) {
        if (result.status === 'FINISHED' && result.homeScore != null) {
          match.score = { home: result.homeScore, away: result.awayScore };
          match.status = 'FINISHED';
        }
        break;
      }
    }
  }
}

/**
 * Generate matches from teams-meta group assignments and seeding data.
 * Fallback when OpenFootball data is not available.
 */
function generateMatchesFromData(teamsMeta, seedingData) {
  const matches = [];
  const groupTeams = {};

  // Organize teams by group
  for (const [code, meta] of Object.entries(teamsMeta)) {
    if (!meta.group) continue;
    if (!groupTeams[meta.group]) groupTeams[meta.group] = [];
    groupTeams[meta.group].push(code);
  }

  // Generate 6 group matches per group (round-robin of 4 teams)
  for (const [group, teams] of Object.entries(groupTeams)) {
    if (teams.length !== 4) continue;
    const [t1, t2, t3, t4] = teams;
    const matchDay = 1;

    // Matchday 1: 1v2, 3v4
    matches.push(makeGroupMatch(group, 1, t1, t2, 1));
    matches.push(makeGroupMatch(group, 2, t3, t4, 1));

    // Matchday 2: 1v3, 4v2
    matches.push(makeGroupMatch(group, 3, t1, t3, 2));
    matches.push(makeGroupMatch(group, 4, t4, t2, 2));

    // Matchday 3: 4v1, 2v3
    matches.push(makeGroupMatch(group, 5, t4, t1, 3));
    matches.push(makeGroupMatch(group, 6, t2, t3, 3));
  }

  // Generate knockout matches from seeding data
  for (const match of seedingData.r32Matches) {
    matches.push({
      matchId: `r32-${match.match}`,
      date: match.date,
      venue: match.venue,
      city: '',
      homeTeam: parseTeamSlot(match.slot1),
      awayTeam: parseTeamSlot(match.slot2),
      stage: 'r32',
      score: null,
      status: 'SCHEDULED',
      group: null,
    });
  }

  return matches;
}

function makeGroupMatch(group, num, home, away, matchday) {
  const groupStart = new Date('2026-06-11');
  const offset = 'ABCDEFGHIJKL'.indexOf(group);
  const date = new Date(groupStart.getTime() + (offset * 1 + (matchday - 1) * 6) * 86400000);
  return {
    matchId: `${group}-${num}`,
    date: date.toISOString().split('T')[0],
    venue: '',
    city: '',
    homeTeam: home,
    awayTeam: away,
    stage: 'group',
    score: null,
    status: 'SCHEDULED',
    group,
  };
}

function parseTeamSlot(slot) {
  // For placeholder slots like "3ABCD F", return null (resolved later by bracket)
  if (!slot) return null;
  const pos = parseInt(slot[0]);
  if (pos === 3) return null; // Third-place slots resolved dynamically
  const group = slot.slice(1).trim();
  return `${pos}${group}`; // Returns "1A", "2B" etc as placeholder
}

main();
