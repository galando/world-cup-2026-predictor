/**
 * Fetch OpenFootball fixtures + live results from the GitHub raw CDN.
 *
 * The openfootball/worldcup.json repo publishes the 2026 tournament as a single
 * file at 2026/worldcup.json (a flat { name, matches[] } document that is
 * updated with scores as games are played). The older per-section
 * groups.json / rounds.json layout used for previous tournaments does NOT
 * exist for 2026, which is why the previous fetch 404'd and the app fell back
 * to a synthetic schedule with no live results.
 *
 * This module parses the worldcup.json schema, maps full team names to the
 * canonical codes used across the pipeline, and emits match objects in the
 * shape the rest of build-data.js expects (including final scores + FINISHED
 * status for games already played).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', 'cache');
const DATA_DIR = join(__dirname, '..', 'data');
const BASE_URL = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026';

/** Specific patterns first — 'Round of 16' contains 'Round of', so test R16 before R32. */
function classifyStage(roundName = '') {
  const n = roundName.toLowerCase();
  if (n.includes('round of 16')) return 'r16';
  if (n.includes('round of 32')) return 'r32';
  if (n.includes('quarter'))     return 'qf';
  if (n.includes('semi'))        return 'sf';
  if (n.includes('third') || n.includes('3rd place')) return 'third';
  if (n.includes('final'))       return 'final';
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

/**
 * Build a full-name → canonical-code map from teams-meta.json.
 * Names are normalized (lowercased, accents stripped, '&'→'and') so that
 * openfootball spellings like "Bosnia & Herzegovina" or "Curaçao" resolve.
 * The code itself is also registered as an alias so "USA" maps to USA.
 */
function buildNameToCodeMap() {
  const map = {};
  let teamsMeta = {};
  try {
    teamsMeta = JSON.parse(readFileSync(join(DATA_DIR, 'teams-meta.json'), 'utf8'));
  } catch {
    return map;
  }
  for (const [code, meta] of Object.entries(teamsMeta)) {
    map[normalizeName(code)] = code;
    if (meta.nameEN) map[normalizeName(meta.nameEN)] = code;
  }
  return map;
}

function normalizeName(raw = '') {
  return String(raw)
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/&/g, 'and')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Resolve an openfootball team label to a canonical code.
 *  - Real country name        → its code (e.g. "Mexico" → "MEX")
 *  - Group-position placeholder ("1A","2B") → kept as-is so it pairs with the
 *    seeding/bracket placeholders the rest of the pipeline understands
 *  - Anything else (third-place "3A/B/C/D/F", progression "W73"/"L101") → null,
 *    resolved later by build-bracket from standings
 */
function resolveTeam(raw, nameToCode) {
  if (raw == null) return null;
  const key = normalizeName(raw);
  if (nameToCode[key]) return nameToCode[key];
  const compact = String(raw).replace(/\s+/g, '').toUpperCase();
  if (/^[12][A-L]$/.test(compact)) return compact;
  return null;
}

/** Normalize "13:00 UTC-6" → "13:00"; pass through clean "HH:MM"; else null. */
function parseTime(raw) {
  if (!raw) return null;
  const m = String(raw).match(/\b(\d{1,2}:\d{2})\b/);
  return m ? m[1].padStart(5, '0') : null;
}

export async function fetchOpenFootball() {
  const cacheFile = join(CACHE_DIR, 'openfootball-2026.json');
  const doc = await safeFetch(BASE_URL + '/worldcup.json', cacheFile);

  const nameToCode = buildNameToCodeMap();
  const rawMatches = Array.isArray(doc.matches) ? doc.matches : [];

  const matches = [];
  const groups = {};
  const teamGroupMap = {};
  const groupMatchCounter = {};
  let globalMatchNum = 0;

  for (const game of rawMatches) {
    globalMatchNum++;
    const stage = classifyStage(game.round);
    const groupLetter = game.group ? String(game.group).replace(/group\s*/i, '').trim() : null;

    const homeTeam = resolveTeam(game.team1_code || game.team1, nameToCode);
    const awayTeam = resolveTeam(game.team2_code || game.team2, nameToCode);

    // Track group membership for real teams (used by downstream consumers).
    if (groupLetter) {
      if (!groups[groupLetter]) groups[groupLetter] = [];
      for (const code of [homeTeam, awayTeam]) {
        if (code && /^[A-Z]{3}$/.test(code) && !teamGroupMap[code]) {
          teamGroupMap[code] = groupLetter;
          groups[groupLetter].push({ code });
        }
      }
    }

    // Match id: groups use per-group sequence (A-1..L-6); knockout uses the
    // official FIFA match number (73..104).
    let matchId;
    if (stage === 'group' && groupLetter) {
      groupMatchCounter[groupLetter] = (groupMatchCounter[groupLetter] || 0) + 1;
      matchId = `${groupLetter}-${groupMatchCounter[groupLetter]}`;
    } else {
      matchId = `${stage}-${game.num || globalMatchNum}`;
    }

    const ft = game.score && Array.isArray(game.score.ft) ? game.score.ft : null;
    const hasScore = ft && ft[0] != null && ft[1] != null;

    matches.push({
      matchId,
      date: game.date || null,
      time: parseTime(game.time),
      venue: game.ground || game.city || '',
      city: game.city || '',
      homeTeam,
      awayTeam,
      stage,
      score: hasScore ? { home: ft[0], away: ft[1] } : null,
      status: hasScore ? 'FINISHED' : 'SCHEDULED',
      group: groupLetter,
    });
  }

  return { groups, matches, teamGroupMap };
}

export default fetchOpenFootball;
