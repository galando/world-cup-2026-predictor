/**
 * Fetch OpenFootball fixtures from GitHub raw CDN.
 * Parses groups.json and rounds.json from openfootball/worldcup.json repo.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', 'cache');

const BASE_URL = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026';

/**
 * Fetch with timeout and cached fallback.
 */
async function safeFetch(url, cacheFile, timeoutMs = 10_000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const data = await res.json();
    // Write to cache for future fallback
    writeFileSync(cacheFile, JSON.stringify(data, null, 2));
    return data;
  } catch (err) {
    console.warn(`[fetch-openfootball] fetch failed for ${url}: ${err.message} — using cached fallback`);
    if (existsSync(cacheFile)) {
      return JSON.parse(readFileSync(cacheFile, 'utf8'));
    }
    throw new Error(`No cached fallback available for ${url}: ${err.message}`);
  }
}

/**
 * Fetch all OpenFootball fixtures (groups + rounds).
 * Returns { groups, rounds, matches }
 */
export async function fetchOpenFootball() {
  const groupsCache = join(CACHE_DIR, 'openfootball-groups.json');
  const roundsCache = join(CACHE_DIR, 'openfootball-rounds.json');

  const [groupsData, roundsData] = await Promise.all([
    safeFetch(`${BASE_URL}/groups.json`, groupsCache),
    safeFetch(`${BASE_URL}/rounds.json`, roundsCache),
  ]);

  // Parse groups into team->group mapping
  const teamGroupMap = {};
  const groups = {};
  if (groupsData.groups) {
    for (const group of groupsData.groups) {
      const groupLetter = group.name?.replace('Group ', '') || group.name;
      groups[groupLetter] = group.teams || [];
      for (const team of (group.teams || [])) {
        teamGroupMap[team.code || team.name] = groupLetter;
      }
    }
  }

  // Parse rounds into match list
  const matches = [];
  if (roundsData.rounds) {
    let matchIndex = 0;
    for (const round of roundsData.rounds) {
      for (const game of (round.games || [])) {
        matchIndex++;
        matches.push({
          matchId: `${round.name || 'group'}-${matchIndex}`,
          date: game.date,
          time: game.time,
          venue: game.venue,
          city: game.city,
          homeTeam: game.team1_code || game.team1,
          awayTeam: game.team2_code || game.team2,
          stage: round.name?.includes('Round of') ? 'r32'
            : round.name?.includes('Round of 16') ? 'r16'
            : round.name?.includes('Quarter') ? 'qf'
            : round.name?.includes('Semi') ? 'sf'
            : round.name?.includes('Final') ? 'final'
            : round.name?.includes('Third') ? 'third'
            : 'group',
          score: game.score != null ? {
            home: game.score1,
            away: game.score2,
          } : null,
          status: game.score != null ? 'FINISHED' : 'SCHEDULED',
          group: teamGroupMap[game.team1_code || game.team1] || null,
        });
      }
    }
  }

  return { groups, rounds: roundsData.rounds || [], matches, teamGroupMap };
}

export default fetchOpenFootball;
