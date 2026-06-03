/**
 * Build group standings from match results.
 * Implements FIFA tiebreaker criteria and best third-place ranking.
 *
 * Tiebreaker order:
 * 1. Points (descending)
 * 2. Head-to-head result between tied teams (if available)
 * 3. Goal difference (descending)
 * 4. Goals scored (descending)
 * 5. Fair play score (descending — higher = fewer deductions)
 * 6. FIFA ranking (ascending — lower rank = better)
 * 7. Alphabetical team code (deterministic final tiebreaker)
 */

/** Fair play deduction constants (higher = fewer deductions) */
const FP_YELLOW = -1;
const FP_SECOND_YELLOW = -3;
const FP_STRAIGHT_RED = -4;

/**
 * Sum fair play deductions from card data.
 * @param {Array<{type: string}>} cards - Array of card objects
 * @returns {number} Fair play deduction total
 */
function sumFairPlay(cards) {
  return cards.reduce((sum, card) => {
    if (card.type === 'yellow') return sum + FP_YELLOW;
    if (card.type === 'second_yellow') return sum + FP_SECOND_YELLOW;
    if (card.type === 'red') return sum + FP_STRAIGHT_RED;
    return sum;
  }, 0);
}

/**
 * Build a head-to-head result map from group matches.
 * Returns { [teamA_teamB]: comparisonValue } where positive = A beat B, negative = B beat A.
 * @param {Array} matches - All matches
 * @param {string[]} groupTeams - Team codes in the group
 * @returns {Object}
 */
function buildH2HMap(matches, groupTeams) {
  const map = {};
  const teamSet = new Set(groupTeams);
  for (const match of matches) {
    if (match.stage !== 'group' || match.status !== 'FINISHED' || !match.score) continue;
    if (!teamSet.has(match.homeTeam) || !teamSet.has(match.awayTeam)) continue;
    const { home: h, away: a } = match.score;
    if (h > a) {
      map[`${match.homeTeam}_${match.awayTeam}`] = -1; // a before b in sort (home beat away → away is "b")
      map[`${match.awayTeam}_${match.homeTeam}`] = 1;  // b before a
    } else if (a > h) {
      map[`${match.homeTeam}_${match.awayTeam}`] = 1;
      map[`${match.awayTeam}_${match.homeTeam}`] = -1;
    }
    // Draw = 0, no entry needed (falls through to GD)
  }
  return map;
}

/**
 * Compute group standings for all groups.
 * Returns { groups: { A: [teamEntry, ...], ... }, thirdPlaceRanking: [teamEntry, ...] }
 */
export function buildStandings(matches, teamsMeta) {
  // Initialize group entries
  const groupEntries = {};
  for (const [code, meta] of Object.entries(teamsMeta)) {
    if (!meta.group) continue;
    if (!groupEntries[meta.group]) groupEntries[meta.group] = {};
    groupEntries[meta.group][code] = {
      team: code,
      group: meta.group,
      p: 0, w: 0, d: 0, l: 0,
      gf: 0, ga: 0, gd: 0,
      pts: 0,
      fairPlay: 0,
      fifaRank: meta.fifaRank || 99,
    };
  }

  // Process finished group matches
  for (const match of matches) {
    if (match.stage !== 'group' || match.status !== 'FINISHED' || !match.score) continue;
    if (!match.group) continue;

    const group = groupEntries[match.group];
    if (!group) continue;

    const home = group[match.homeTeam];
    const away = group[match.awayTeam];
    if (!home || !away) continue;

    const h = match.score.home;
    const a = match.score.away;

    home.p++; away.p++;
    home.gf += h; home.ga += a;
    away.gf += a; away.ga += h;

    if (h > a) {
      home.w++; home.pts += 3; away.l++;
    } else if (h < a) {
      away.w++; away.pts += 3; home.l++;
    } else {
      home.d++; away.d++; home.pts++; away.pts++;
    }

    // Fair play from card data
    if (match.cards) {
      const homeCards = match.cards.filter(c => c.team === match.homeTeam);
      const awayCards = match.cards.filter(c => c.team === match.awayTeam);
      home.fairPlay += sumFairPlay(homeCards);
      away.fairPlay += sumFairPlay(awayCards);
    }
  }

  // Recalculate GD and sort each group
  const sortedGroups = {};
  const thirdPlaceTeams = [];

  for (const [groupLetter, teams] of Object.entries(groupEntries)) {
    const teamList = Object.values(teams);

    // Calculate goal difference
    for (const t of teamList) {
      t.gd = t.gf - t.ga;
    }

    // Build H2H map for this group
    const h2hMap = buildH2HMap(matches, teamList.map(t => t.team));

    // Sort by tiebreaker criteria
    teamList.sort((a, b) => compareTeams(a, b, h2hMap));

    sortedGroups[groupLetter] = teamList.map((t, idx) => ({
      ...t,
      rank: idx + 1,
    }));

    // Collect third-place team only from full 4-team groups
    if (teamList.length === 4) {
      thirdPlaceTeams.push(sortedGroups[groupLetter][2]);
    } else if (teamList.length > 0) {
      console.warn(`[build-standings] Group ${groupLetter} has ${teamList.length} teams (expected 4)`);
    }
  }

  // Rank third-place teams using the same criteria (no H2H for cross-group)
  const rankedThird = rankThirdPlace(thirdPlaceTeams);

  return {
    groups: sortedGroups,
    thirdPlaceRanking: rankedThird,
    advancingThirdPlace: rankedThird.slice(0, 8),
  };
}

/**
 * Compare two teams for group standings sorting.
 * Uses 7-criteria tiebreaker:
 * 1. Points (descending)
 * 2. Head-to-head result (if available)
 * 3. Goal difference (descending)
 * 4. Goals scored (descending)
 * 5. Fair play score (descending — higher = fewer deductions)
 * 6. FIFA ranking (ascending — lower rank number = better)
 * 7. Alphabetical team code (deterministic final tiebreaker)
 *
 * @param {Object} a - Team A standings entry
 * @param {Object} b - Team B standings entry
 * @param {Object|null} [h2hMap] - Head-to-head results map (optional)
 * @returns {number} Negative if A ranks higher, positive if B ranks higher
 */
export function compareTeams(a, b, h2hMap) {
  // 1. Points
  if (b.pts !== a.pts) return b.pts - a.pts;
  // 2. Head-to-head (if available)
  if (h2hMap) {
    const h2h = h2hMap[`${a.team}_${b.team}`];
    if (h2h !== undefined && h2h !== 0) return h2h;
  }
  // 3. Goal difference
  if (b.gd !== a.gd) return b.gd - a.gd;
  // 4. Goals scored
  if (b.gf !== a.gf) return b.gf - a.gf;
  // 5. Fair play (higher is better = fewer cards)
  if (b.fairPlay !== a.fairPlay) return b.fairPlay - a.fairPlay;
  // 6. FIFA ranking (lower number = better)
  if (a.fifaRank !== b.fifaRank) return a.fifaRank - b.fifaRank;
  // 7. Alphabetical team code (deterministic)
  return a.team.localeCompare(b.team);
}

/**
 * Rank third-place teams across all groups.
 * Top 8 advance to Round of 32.
 * No H2H for cross-group comparison.
 */
export function rankThirdPlace(teams) {
  return [...teams].sort((a, b) => compareTeams(a, b, null));
}

export default buildStandings;
