/**
 * Fetch OpenFootball fixtures from GitHub raw CDN.
 * Parses groups.json and rounds.json from openfootball/worldcup.json repo.
 *
 * NOTE: The 2026 repo files become available around tournament kickoff (June 11 2026).
 * Until then this fetch 404s and build-data.js falls back to the generated schedule.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', 'cache');
const BASE_URL = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026';

/** Specific patterns first — 'Round of 16' contains 'Round of', so test R16 before R32. */
function classifyStage(roundName = '') {
  const n = roundName.toLowerCase();
  if (n.includes('round of 16'))  return 'r16';
  if (n.includes('round of 32'))  return 'r32';
  if (n.includes('quarter'))      return 'qf';
  if (n.includes('semi'))         return 'sf';
  if (n.includes('third') || n.includes('3rd place')) return 'third';
  if (n.includes('final'))        return 'final';
  return 'group';
}

async function safeFetch(url, cacheFile, timeoutMs = 10_000) {
  mkdirSync(CACHE_DIR, { recursive: true });
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
    const data = await res.json();
    writeFileSync(cacheFile, JSON.stringify(data, null, 2));
    return data;
  } catch (err) {
    console.warn('[fetch-openfootball] fetch failed for ' + url + ': ' + err.message + ' — using cached fallback');
    if (existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, 'utf8'));
    throw new Error('No cached fallback available for ' + url + ': ' + err.message);
  }
}

/** Build name→code map from groups data so full names map to canonical codes. */
function buildNameToCodeMap(groupsData) {
  const map = {};
  if (!groupsData.groups) return map;
  for (const group of groupsData.groups) {
    for (const team of (group.teams || [])) {
      const code = (team.code || '').toUpperCase();
      const name = (team.name || '').toLowerCase();
      if (code) { map[code] = code; map[name] = code; }
    }
  }
  return map;
}

function normalizeTeam(raw, nameToCode) {
  if (!raw) return null;
  const upper = String(raw).toUpperCase();
  if (nameToCode[upper]) return nameToCode[upper];
  const lower = String(raw).toLowerCase();
  if (nameToCode[lower]) return nameToCode[lower];
  if (/^[A-Z]{2,3}$/.test(upper)) return upper;
  return raw;
}

/**
 * Canonical match IDs matching FIFA 2026 numbering (group 1-72, knockout 73-104).
 * Group: 'A-1' ... 'L-6'. Knockout: 'r32-73' ... 'final-104'.
 */
function makeMatchId(stage, groupLetter, roundMatchNum, globalMatchNum) {
  if (stage === 'group') return groupLetter + '-' + roundMatchNum;
  if (stage === 'r32')   return 'r32-'   + globalMatchNum;
  if (stage === 'r16')   return 'r16-'   + globalMatchNum;
  if (stage === 'qf')    return 'qf-'    + globalMatchNum;
  if (stage === 'sf')    return 'sf-'    + globalMatchNum;
  if (stage === 'third') return 'third-' + globalMatchNum;
  if (stage === 'final') return 'final-' + globalMatchNum;
  return 'match-' + globalMatchNum;
}

export async function fetchOpenFootball() {
  const groupsCache = join(CACHE_DIR, 'openfootball-groups.json');
  const roundsCache = join(CACHE_DIR, 'openfootball-rounds.json');

  const [groupsData, roundsData] = await Promise.all([
    safeFetch(BASE_URL + '/groups.json', groupsCache),
    safeFetch(BASE_URL + '/rounds.json', roundsCache),
  ]);

  const nameToCode = buildNameToCodeMap(groupsData);
  const teamGroupMap = {};
  const groups = {};

  if (groupsData.groups) {
    for (const group of groupsData.groups) {
      const groupLetter = (group.name || '').replace('Group ', '').trim() || group.key || '';
      groups[groupLetter] = group.teams || [];
      for (const team of (group.teams || [])) {
        const code = normalizeTeam(team.code || team.name, nameToCode);
        if (code && groupLetter) teamGroupMap[code] = groupLetter;
      }
    }
  }

  const matches = [];
  let globalMatchNum = 0;
  const groupMatchCounter = {};

  if (roundsData.rounds) {
    for (const round of roundsData.rounds) {
      const stage = classifyStage(round.name);
      for (const game of (round.games || [])) {
        globalMatchNum++;
        const homeCode = normalizeTeam(game.team1_code || game.team1, nameToCode);
        const awayCode = normalizeTeam(game.team2_code || game.team2, nameToCode);
        const groupLetter = teamGroupMap[homeCode] || teamGroupMap[awayCode] || null;

        let roundMatchNum = globalMatchNum;
        if (stage === 'group' && groupLetter) {
          groupMatchCounter[groupLetter] = (groupMatchCounter[groupLetter] || 0) + 1;
          roundMatchNum = groupMatchCounter[groupLetter];
        }

        matches.push({
          matchId: makeMatchId(stage, groupLetter, roundMatchNum, globalMatchNum),
          date: game.date,
          time: game.time,
          venue: game.venue,
          city: game.city,
          homeTeam: homeCode,
          awayTeam: awayCode,
          stage,
          score: game.score1 != null ? { home: game.score1, away: game.score2 } : null,
          status: game.score1 != null ? 'FINISHED' : 'SCHEDULED',
          group: groupLetter,
        });
      }
    }
  }

  return { groups, rounds: roundsData.rounds || [], matches, teamGroupMap };
}

export default fetchOpenFootball;
