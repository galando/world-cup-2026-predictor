/**
 * Fetch qualifying campaign results from Football-Data.org API.
 * Fetches recent finished matches for each qualified team.
 * Uses existing FD_API_KEY and follows the fetch-results.js pattern.
 *
 * Rate limited: 6.5s between requests (max 10 req/min on free tier).
 * Cache: scripts/data/qualifier-results.json with staleness guard.
 * Pre-tournament: fetch once, then never again (stale = 30 days).
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = join(__dirname, '..', 'data', 'qualifier-results.json');
const STALE_DAYS = 30;

const BASE_URL = 'https://api.football-data.org/v4/teams';
const RATE_LIMIT_MS = 6500;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check cache age in days. Returns Infinity if no cache exists.
 */
function cacheAgeDays() {
  if (!existsSync(CACHE_FILE)) return Infinity;
  try {
    const cached = JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
    if (!cached.fetchedAt) return Infinity;
    return (Date.now() - new Date(cached.fetchedAt).getTime()) / (1000 * 60 * 60 * 24);
  } catch {
    return Infinity;
  }
}

/**
 * Load qualifier data from cache. Returns null if unavailable.
 */
function loadCache() {
  if (!existsSync(CACHE_FILE)) return null;
  try {
    const cached = JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
    return cached.data || null;
  } catch {
    return null;
  }
}

/**
 * Fetch qualifying results for all teams.
 * Returns Map<teamCode, Array<{goalsFor, goalsAgainst, date, competition}>>
 *
 * @param {string} apiKey - Football-Data.org API key
 * @param {Object} teamsMeta - Team metadata with FD team IDs
 * @returns {Promise<Map|null>} Qualifier results map or cached fallback
 */
export async function fetchQualifiers(apiKey, teamsMeta) {
  if (!apiKey) {
    console.log('  No FD_API_KEY set, skipping qualifier fetch');
    return loadCache();
  }

  const ageD = cacheAgeDays();
  if (ageD < STALE_DAYS) {
    console.log(`  Qualifier cache is ${ageD.toFixed(1)}d old — skipping (threshold: ${STALE_DAYS}d)`);
    return loadCache();
  }

  const label = ageD === Infinity ? 'missing' : `${ageD.toFixed(1)}d old`;
  console.log(`  Qualifier cache ${label} — fetching from Football-Data.org...`);

  const results = new Map();
  const teamCodes = Object.keys(teamsMeta).filter(code => teamsMeta[code].group);
  let fetched = 0;

  for (const code of teamCodes) {
    const fdId = teamsMeta[code].fdTeamId;
    if (!fdId) continue;

    try {
      const url = `${BASE_URL}/${fdId}/matches?status=FINISHED&limit=15`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'X-Auth-Token': apiKey },
      });
      clearTimeout(timer);

      if (!res.ok) {
        console.warn(`  [fetch-qualifiers] HTTP ${res.status} for ${code} — skipping`);
        continue;
      }

      const data = await res.json();
      const teamResults = [];

      if (data.matches && Array.isArray(data.matches)) {
        for (const match of data.matches) {
          const isHome = match.homeTeam?.tla === code;
          const homeGoals = match.score?.fullTime?.home;
          const awayGoals = match.score?.fullTime?.away;
          if (homeGoals == null || awayGoals == null) continue;

          teamResults.push({
            goalsFor: isHome ? homeGoals : awayGoals,
            goalsAgainst: isHome ? awayGoals : homeGoals,
            date: match.utcDate,
            competition: match.competition?.name || 'Unknown',
          });
        }
      }

      results.set(code, teamResults);
      fetched++;

      // Rate limit
      if (fetched < teamCodes.length) {
        await sleep(RATE_LIMIT_MS);
      }
    } catch (err) {
      console.warn(`  [fetch-qualifiers] Failed for ${code}: ${err.message}`);
    }
  }

  if (fetched > 0) {
    // Convert Map to plain object for JSON serialization
    const serializable = {};
    for (const [code, matches] of results.entries()) {
      serializable[code] = matches;
    }
    writeFileSync(CACHE_FILE, JSON.stringify({ fetchedAt: new Date().toISOString(), data: serializable }, null, 2));
    console.log(`  Fetched qualifier data for ${fetched} teams`);
  } else {
    console.warn('  [fetch-qualifiers] No data fetched, using cached fallback');
  }

  return results;
}

export default fetchQualifiers;
