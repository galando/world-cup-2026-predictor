/**
 * Scenario explorer logic — pure functions for overriding match results
 * and recomputing group standings. Extracted from ScenarioExplorer component
 * for testability.
 */

/**
 * Apply match result overrides to group standings.
 *
 * @param {Object} standings - { groupLetter: [{team, pts, gf, ga, gd, p, w, d, l, rank, fifaRank}] }
 * @param {Array} groupMatches - All group-stage matches [{matchId, homeTeam, awayTeam, group}]
 * @param {Object} overrides - { matchId: 'home'|'draw'|'away' }
 * @returns {Object} Updated standings (deep-cloned, not mutated)
 */
export function applyOverridesToStandings(standings, groupMatches, overrides) {
  // Deep clone standings
  const result = {};
  for (const [group, teams] of Object.entries(standings)) {
    result[group] = teams.map(team => ({ ...team }));
  }

  // Apply overrides as additional results
  for (const [matchId, outcome] of Object.entries(overrides)) {
    const match = groupMatches.find(m => m.matchId === matchId);
    if (!match || !match.group) continue;
    const group = result[match.group];
    if (!group) continue;

    const home = group.find(t => t.team === match.homeTeam);
    const away = group.find(t => t.team === match.awayTeam);
    if (!home || !away) continue;

    let hGoals, aGoals;
    if (outcome === 'home') { hGoals = 2; aGoals = 0; }
    else if (outcome === 'away') { hGoals = 0; aGoals = 2; }
    else { hGoals = 1; aGoals = 1; }

    home.gf += hGoals; home.ga += aGoals; home.p++;
    away.gf += aGoals; away.ga += hGoals; away.p++;

    if (hGoals > aGoals) { home.w++; home.pts += 3; away.l++; }
    else if (hGoals < aGoals) { away.w++; away.pts += 3; home.l++; }
    else { home.d++; away.d++; home.pts++; away.pts++; }

    home.gd = home.gf - home.ga;
    away.gd = away.gf - away.ga;
  }

  // Re-sort each group: pts → GD → GF → FIFA rank
  for (const teams of Object.values(result)) {
    teams.sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.fifaRank - b.fifaRank;
    });
    teams.forEach((t, i) => { t.rank = i + 1; });
  }

  return result;
}

/**
 * Toggle an override for a match.
 * If the same outcome is already set, remove it (toggle off).
 * Otherwise, set the new outcome.
 *
 * @param {Object} overrides - Current overrides
 * @param {string} matchId - Match to override
 * @param {string} outcome - 'home', 'draw', or 'away'
 * @returns {Object} New overrides object
 */
export function toggleOverride(overrides, matchId, outcome) {
  if (overrides[matchId] === outcome) {
    const next = { ...overrides };
    delete next[matchId];
    return next;
  }
  return { ...overrides, [matchId]: outcome };
}

export default { applyOverridesToStandings, toggleOverride };
