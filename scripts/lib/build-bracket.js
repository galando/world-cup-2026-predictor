/**
 * Build knockout bracket from group standings and R32 seeding table.
 * Resolves bracket slots using standings + third-place team assignments.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEEDING_FILE = join(__dirname, '..', 'data', 'r32-seeding-table.json');

/**
 * Parse a slot string like "1A" or "2B" or "3ABCD F" into a structured reference.
 * Returns { position: 1|2|3, groups: ['A'] } or { position: 3, groups: ['A','B','C','D','F'] }
 */
function parseSlot(slotStr) {
  if (!slotStr) return null;
  const str = slotStr.replace(/\s/g, '');
  const position = parseInt(str[0]);
  const groupsStr = str.slice(1);

  // Handle "3ABCD F" style — extract just the group letters
  const groups = groupsStr.split('').filter(c => c >= 'A' && c <= 'L');

  return { position, groups };
}

/**
 * Resolve a slot reference to a team code using standings.
 */
function resolveSlot(slotStr, standings) {
  const parsed = parseSlot(slotStr);
  if (!parsed) return null;

  if (parsed.position === 1 || parsed.position === 2) {
    // Direct: 1A = winner of group A, 2B = runner-up of group B
    const group = parsed.groups[0];
    const groupTeams = standings.groups[group];
    if (!groupTeams || groupTeams.length < parsed.position) return null;
    return groupTeams[parsed.position - 1].team;
  }

  if (parsed.position === 3) {
    // Third-place team — need to determine which group's 3rd-place team goes here
    // This is resolved by the seeding table lookup
    return resolveThirdPlaceSlot(parsed.groups, standings);
  }

  return null;
}

/**
 * Resolve which third-place team is assigned to a slot.
 * Uses the seeding table's thirdPlaceLookup to match groups.
 */
function resolveThirdPlaceSlot(eligibleGroups, standings) {
  const advancingThird = standings.advancingThirdPlace || [];
  const advancingGroups = new Set(advancingThird.map(t => t.group));

  // Find which eligible group's third-place team is in the advancing list
  for (const group of eligibleGroups) {
    if (advancingGroups.has(group)) {
      const team = advancingThird.find(t => t.group === group);
      if (team) return team.team;
    }
  }

  return null;
}

/**
 * Build the complete knockout bracket.
 * Returns bracket object with all rounds populated.
 */
/**
 * Shape a prediction into the bracket's compact tiePredict form, or null.
 */
function tiePredictFrom(pred) {
  if (!pred) return null;
  return {
    home: pred.probs.home,
    draw: pred.probs.draw,
    away: pred.probs.away,
    qualify: pred.qualify,
  };
}

export function buildBracket(standings, predictions, seedingData) {
  const seeding = seedingData || JSON.parse(readFileSync(SEEDING_FILE, 'utf8'));
  const predMap = new Map(predictions.map(p => [p.matchId, p]));

  // Build R32 matches
  const r32Matches = seeding.r32Matches.map(match => {
    const homeTeam = resolveSlot(match.slot1, standings);
    const awayTeam = resolveSlot(match.slot2, standings);

    const matchId = `r32-${match.match}`;

    return {
      matchId,
      matchNumber: match.match,
      round: 'r32',
      homeTeam,
      awayTeam,
      venue: match.venue,
      date: match.date,
      tiePredict: tiePredictFrom(predMap.get(matchId)),
    };
  });

  // Build R16 matches (teams resolve via the live feed as R32 completes;
  // tiePredict attaches as soon as a prediction exists for the matchId).
  const r16Matches = seeding.r16Matches.map(match => ({
    matchId: `r16-${match.match}`,
    matchNumber: match.match,
    round: 'r16',
    homeTeam: null, // Resolved when R32 completes
    awayTeam: null,
    fromMatches: match.from,
    venue: match.venue,
    date: match.date,
    tiePredict: tiePredictFrom(predMap.get(`r16-${match.match}`)),
  }));

  // Build QF matches
  const qfMatches = seeding.qfMatches.map(match => ({
    matchId: `qf-${match.match}`,
    matchNumber: match.match,
    round: 'qf',
    homeTeam: null,
    awayTeam: null,
    fromMatches: match.from,
    venue: match.venue,
    date: match.date,
    tiePredict: tiePredictFrom(predMap.get(`qf-${match.match}`)),
  }));

  // Build SF matches
  const sfMatches = seeding.sfMatches.map(match => ({
    matchId: `sf-${match.match}`,
    matchNumber: match.match,
    round: 'sf',
    homeTeam: null,
    awayTeam: null,
    fromMatches: match.from,
    venue: match.venue,
    date: match.date,
    tiePredict: tiePredictFrom(predMap.get(`sf-${match.match}`)),
  }));

  // Third place match
  const thirdPlace = {
    matchId: 'third-103',
    matchNumber: seeding.thirdPlace.match,
    round: 'third',
    homeTeam: null,
    awayTeam: null,
    fromMatches: seeding.thirdPlace.from,
    venue: seeding.thirdPlace.venue,
    date: seeding.thirdPlace.date,
    tiePredict: tiePredictFrom(predMap.get('third-103')),
  };

  // Final
  const finalMatch = {
    matchId: 'final-104',
    matchNumber: seeding.final.match,
    round: 'final',
    homeTeam: null,
    awayTeam: null,
    fromMatches: seeding.final.from,
    venue: seeding.final.venue,
    date: seeding.final.date,
    tiePredict: tiePredictFrom(predMap.get('final-104')),
  };

  return {
    rounds: {
      r32: r32Matches,
      r16: r16Matches,
      qf: qfMatches,
      sf: sfMatches,
      third: [thirdPlace],
      final: [finalMatch],
    },
    champion: null,
  };
}

export default buildBracket;
