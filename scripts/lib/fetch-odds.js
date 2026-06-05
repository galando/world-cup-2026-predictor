/**
 * Fetch h2h decimal odds from The Odds API for soccer_fifa_world_cup.
 *
 * Skips the network call if cache is <STALE_HOURS old to conserve free-tier
 * credits (500/month). Falls back to existing cache on any failure.
 *
 * Only derived implied probabilities (after vig removal) are ever written to
 * public/ — raw odds are kept in the private cache directory only.
 *
 * Source: https://the-odds-api.com  (h2h market, decimal format, EU region)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_FILE  = join(__dirname, '..', 'cache', 'odds.json');
const ODDS_URL    = 'https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds/';
const STALE_HOURS = 12;

/**
 * Check cache age in hours. Returns Infinity if no cache exists.
 */
function cacheAgeHours() {
  if (!existsSync(CACHE_FILE)) return Infinity;
  try {
    const cached = JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
    if (!cached.fetchedAt) return Infinity;
    return (Date.now() - new Date(cached.fetchedAt).getTime()) / 36e5;
  } catch {
    return Infinity;
  }
}

/**
 * Load odds from cache file. Returns null if unavailable.
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
 * Fetch h2h decimal odds from The Odds API.
 *
 * @param {string} apiKey - The Odds API key
 * @returns {Promise<Array|null>} Raw odds data or cached fallback
 */
export async function fetchOdds(apiKey) {
  if (!apiKey) {
    console.log('  No ODDS_API_KEY set, skipping odds fetch');
    return loadCache();
  }

  const ageH = cacheAgeHours();
  if (ageH < STALE_HOURS) {
    console.log(`  Odds cache is ${ageH.toFixed(1)}h old — skipping (threshold: ${STALE_HOURS}h)`);
    return loadCache();
  }

  const label = ageH === Infinity ? 'missing' : `${ageH.toFixed(1)}h old`;
  console.log(`  Odds cache ${label} — fetching from The Odds API...`);

  try {
    const url = `${ODDS_URL}?apiKey=${apiKey}&regions=eu&markets=h2h&oddsFormat=decimal`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => 'unknown')}`);
    }

    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Empty or invalid response from The Odds API');
    }

    // Write cache with timestamp
    writeFileSync(CACHE_FILE, JSON.stringify({ fetchedAt: new Date().toISOString(), data }, null, 2));
    console.log(`  Fetched odds for ${data.length} matches from The Odds API`);

    return data;
  } catch (err) {
    console.warn(`  [fetch-odds] Failed: ${err.message} — using cached fallback`);
    return loadCache();
  }
}

export default fetchOdds;
