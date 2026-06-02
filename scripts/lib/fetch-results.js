/**
 * Fetch match results from Football-Data.org API.
 * Rate limited: 6.5s between requests (max 10 req/min on free tier).
 * Uses cached fallback on failure.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', 'cache');

const BASE_URL = 'https://api.football-data.org/v4/competitions/WC/matches';
const RATE_LIMIT_MS = 6500;

/**
 * Sleep for ms milliseconds.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch a single URL with timeout and cached fallback.
 */
async function safeFetch(url, cacheFile, apiKey, timeoutMs = 10_000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: apiKey ? { 'X-Auth-Token': apiKey } : {},
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const data = await res.json();
    writeFileSync(cacheFile, JSON.stringify(data, null, 2));
    return data;
  } catch (err) {
    console.warn(`[fetch-results] fetch failed for ${url}: ${err.message} — using cached fallback`);
    if (existsSync(cacheFile)) {
      return JSON.parse(readFileSync(cacheFile, 'utf8'));
    }
    // Return empty result rather than crash
    console.warn(`[fetch-results] No cache available. Returning empty results.`);
    return { matches: [] };
  }
}

/**
 * Fetch results from Football-Data.org with rate limiting.
 * Returns Map<matchId, { homeScore, awayScore, status }>
 */
export async function fetchResults(apiKey) {
  const cacheFile = join(CACHE_DIR, 'football-data-results.json');
  const data = await safeFetch(BASE_URL, cacheFile, apiKey);

  const results = new Map();
  if (data.matches && Array.isArray(data.matches)) {
    for (const match of data.matches) {
      const key = `${match.homeTeam?.tla}_${match.awayTeam?.tla}_${match.utcDate}`;
      results.set(match.id?.toString() || key, {
        homeTeam: match.homeTeam?.tla,
        awayTeam: match.awayTeam?.tla,
        homeScore: match.score?.fullTime?.home ?? null,
        awayScore: match.score?.fullTime?.away ?? null,
        status: match.status,
        date: match.utcDate,
      });
    }
  }

  return results;
}

/**
 * Rate-limited fetch for multiple URLs.
 * Waits RATE_LIMIT_MS between each request.
 */
export async function fetchWithRateLimit(urls, apiKey) {
  const results = [];
  for (let i = 0; i < urls.length; i++) {
    const cacheFile = join(CACHE_DIR, `football-data-page-${i}.json`);
    const data = await safeFetch(urls[i], cacheFile, apiKey);
    results.push(data);
    if (i < urls.length - 1) {
      await sleep(RATE_LIMIT_MS);
    }
  }
  return results;
}

export default fetchResults;
