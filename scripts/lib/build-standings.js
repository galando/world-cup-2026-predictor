/**
 * Build group standings from match results.
 * Implements 5-criteria tiebreaker and best third-place ranking.
 */

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

    // Sort by 5-criteria tiebreaker
    teamList.sort(compareTeams);

    sortedGroups[groupLetter] = teamList.map((t, idx) => ({
      ...t,
      rank: idx + 1,
    }));

    // Collect third-place team
    if (teamList.length >= 3) {
      thirdPlaceTeams.push(sortedGroups[groupLetter][2]);
    }
  }

  // Rank third-place teams using the same 5 criteria
  const rankedThird = rankThirdPlace(thirdPlaceTeams);

  return {
    groups: sortedGroups,
    thirdPlaceRanking: rankedThird,
    advancingThirdPlace: rankedThird.slice(0, 8),
  };
}

/**
 * Compare two teams for group standings sorting.
 * Uses 5-criteria tiebreaker:
 * 1. Points (descending)
 * 2. Goal difference (descending)
 * 3. Goals scored (descending)
 * 4. Fair play score (descending — higher = fewer deductions, so sort desc)
 * 5. FIFA ranking (ascending — lower rank number = better)
 */
export function compareTeams(a, b) {
  // 1. Points
  if (b.pts !== a.pts) return b.pts - a.pts;
  // 2. Goal difference
  if (b.gd !== a.gd) return b.gd - a.gd;
  // 3. Goals scored
  if (b.gf !== a.gf) return b.gf - a.gf;
  // 4. Fair play (higher is better = fewer cards)
  if (b.fairPlay !== a.fairPlay) return b.fairPlay - a.fairPlay;
  // 5. FIFA ranking (lower number = better)
  return a.fifaRank - b.fifaRank;
}

/**
 * Rank third-place teams across all groups.
 * Top 8 advance to Round of 32.
 */
export function rankThirdPlace(teams) {
  return [...teams].sort(compareTeams);
}

export default buildStandings;
