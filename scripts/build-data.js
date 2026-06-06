/**
 * Build data orchestrator — main entry point for the data pipeline.
 * Wires all modules in correct execution order:
 *   load -> fetch -> merge -> compute -> predict -> standings -> bracket -> write
 *
 * Usage: node scripts/build-data.js
 * Environment: FD_API_KEY (optional — Football-Data.org API key)
 *              ODDS_API_KEY (optional — The Odds API key for market data)
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
import { fetchOdds } from './lib/fetch-odds.js';
import { buildMarket } from './lib/build-market.js';
import { buildSuspensions } from './lib/build-suspensions.js';
import { fetchQualifiers } from './lib/fetch-qualifiers.js';
import { buildQualifierForm } from './lib/build-qualifier-form.js';
import { runMonteCarlo } from './lib/run-monte-carlo.js';
import { buildCalibration } from './lib/build-calibration.js';
import { loadXgData } from './lib/fetch-xg.js';

const startTime = Date.now();

async function main() {
  console.log('=== Mundial 2026 Build Data ===');
  console.log(`Started: ${new Date().toISOString()}\n`);

  try {
    // Step 1: Refresh Elo from eloratings.net if >23h stale
    console.log('[1/15] Refreshing Elo ratings...');
    await fetchAndUpdateElo();
    const eloMap = loadElo();
    console.log(`  Loaded ${eloMap.size} team Elo ratings`);

    // Step 2: Load teams metadata
    console.log('[2/15] Loading teams metadata...');
    const teamsMeta = JSON.parse(readFileSync(join(__dirname, 'data', 'teams-meta.json'), 'utf8'));
    console.log(`  Loaded ${Object.keys(teamsMeta).length} team entries`);

    // Step 3: Load R32 seeding table
    console.log('[3/15] Loading R32 seeding table...');
    const seedingData = JSON.parse(readFileSync(join(__dirname, 'data', 'r32-seeding-table.json'), 'utf8'));

    // Step 4: Fetch OpenFootball fixtures (with graceful fallback)
    console.log('[4/15] Fetching OpenFootball fixtures...');
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
    console.log('[5/15] Fetching match results...');
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

    // Step 5.5: Fetch odds from The Odds API (optional, with caching)
    console.log('[6/15] Fetching market odds...');
    const oddsApiKey = process.env.ODDS_API_KEY;
    let marketMap = new Map();
    try {
      const oddsData = await fetchOdds(oddsApiKey);
      if (oddsData) {
        marketMap = buildMarket(oddsData, teamsMeta);
        console.log(`  Built market map with ${marketMap.size} matches`);
      } else {
        console.log('  No odds data available, predictions will be model-only');
      }
    } catch (err) {
      console.warn(`  Odds processing failed (non-critical): ${err.message}`);
    }

    // Step 5.6: Build suspension map from red card events
    console.log('[7/15] Building suspension map...');
    const suspensionMap = buildSuspensions(matches);
    if (suspensionMap.size > 0) {
      console.log(`  Found ${suspensionMap.size} teams with suspensions`);
    } else {
      console.log('  No suspensions detected');
    }

    // Step 5.7: Fetch qualifier data (optional, graceful)
    console.log('[8/15] Fetching qualifier form data...');
    let qualifierPriors = new Map();
    try {
      if (apiKey) {
        const qualifierData = await fetchQualifiers(apiKey, teamsMeta);
        if (qualifierData) {
          qualifierPriors = buildQualifierForm(qualifierData, eloMap);
          console.log(`  Built qualifier priors for ${qualifierPriors.size} teams`);
        }
      } else {
        console.log('  No FD_API_KEY, skipping qualifier fetch');
      }
    } catch (err) {
      console.warn(`  Qualifier processing failed (non-critical): ${err.message}`);
    }

    // Step 5.8: Load xG data (optional, graceful)
    console.log('[9/15] Loading xG snapshot data...');
    let xgData = null;
    try {
      xgData = loadXgData();
      if (xgData) {
        console.log(`  Loaded xG data for ${Object.keys(xgData.teams).length} teams`);
      } else {
        console.log('  No xG snapshot available');
      }
    } catch (err) {
      console.warn(`  xG loading failed (non-critical): ${err.message}`);
    }

    // Step 6: Compute team strengths (with optional qualifier priors + xG)
    console.log('[10/15] Computing team strengths...');
    const { teams } = computeTeams(matches, eloMap, teamsMeta, qualifierPriors, xgData);
    console.log(`  Computed data for ${Object.keys(teams).length} teams`);

    // Step 7: Run predictions (with suspension + market blend)
    console.log('[11/15] Running Dixon-Coles predictions...');
    const predictions = runPredictions(matches, teams, suspensionMap, marketMap);
    console.log(`  Generated ${predictions.length} predictions`);
    const blendedCount = predictions.filter(p => p.market).length;
    if (blendedCount > 0) {
      console.log(`  ${blendedCount} predictions include market blend`);
    }

    // Step 8: Build standings + bracket
    console.log('[12/15] Building standings and bracket...');
    const standings = buildStandings(matches, teamsMeta);
    const bracket = buildBracket(standings, predictions, seedingData);
    console.log(`  Built standings for ${Object.keys(standings.groups).length} groups`);
    console.log(`  Advancing 3rd-place teams: ${standings.advancingThirdPlace.length}`);

    // Step 9: Run Monte Carlo simulation (optional, graceful)
    console.log('[13/15] Running Monte Carlo simulation...');
    let tournamentProbs = null;
    try {
      tournamentProbs = runMonteCarlo({
        matches, predictions, teams, teamsMeta,
        standings: standings.groups, bracket, seedingData,
        n: 10000,
      });
    } catch (err) {
      console.warn(`  Monte Carlo failed (non-critical): ${err.message}`);
    }

    // Step 10: Build enhanced calibration
    console.log('[14/16] Building calibration metrics...');
    let enhancedCalibration = null;
    try {
      enhancedCalibration = buildCalibration(matches, predictions);
      if (enhancedCalibration.played > 0) {
        console.log(`  Calibration: ${enhancedCalibration.played} matches, Brier=${enhancedCalibration.brier.overall}`);
      }
    } catch (err) {
      console.warn(`  Calibration failed (non-critical): ${err.message}`);
    }

    // Step 11: Write all artifacts
    console.log('[15/16] Writing artifacts...');
    writeArtifacts({
      matches,
      predictions,
      teams,
      teamsMeta,
      standings: standings.groups,
      bracket,
      marketMap,
      tournamentProbs,
      enhancedCalibration,
    });

    // Step 12: Summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n[16/16] === Build complete in ${elapsed}s ===`);
    if (suspensionMap.size > 0) {
      console.log(`  Suspensions: ${[...suspensionMap.entries()].map(([t, s]) => `${t} (${s.availabilityMult})`).join(', ')}`);
    }
    if (marketMap.size > 0) {
      console.log(`  Market blend: ${blendedCount}/${predictions.length} matches`);
    }
    if (tournamentProbs) {
      console.log(`  Monte Carlo: ${tournamentProbs.simulations} simulations`);
    }
    if (qualifierPriors.size > 0) {
      console.log(`  Qualifier priors: ${qualifierPriors.size} teams`);
    }
    if (xgData) {
      console.log(`  xG data: ${Object.keys(xgData.teams).length} teams`);
    }

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
        // Extract UTC kickoff time from the full ISO date (available for all matches)
        if (result.date) {
          const utc = new Date(result.date);
          match.date = utc.toISOString().split('T')[0];
          match.time = `${String(utc.getUTCHours()).padStart(2, '0')}:${String(utc.getUTCMinutes()).padStart(2, '0')}`;
        }
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
