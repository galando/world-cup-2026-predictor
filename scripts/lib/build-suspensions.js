/**
 * Build suspension map from finished match data.
 *
 * Scans finished matches for red card events and produces a map of
 * team -> availabilityMult. A team that received a red card in their
 * most recent match gets availabilityMult = 0.92 (simplified model:
 * assumes the suspended player reduces team strength by ~8%).
 *
 * Pure function — no side effects.
 */

/** Suspension penalty multiplier for a team with a red card */
const RED_CARD_MULT = 0.92;

/**
 * Build suspension map from match data.
 *
 * @param {Array} matches - Array of match objects with optional cards field
 * @returns {Map<string, {availabilityMult: number, reason: string}>}
 */
export function buildSuspensions(matches) {
  if (!matches || !Array.isArray(matches)) return new Map();

  // Find each team's most recent finished match
  const teamLastMatch = new Map();
  for (const match of matches) {
    if (match.status !== 'FINISHED') continue;
    const date = match.date || '';
    for (const team of [match.homeTeam, match.awayTeam]) {
      if (!team) continue;
      const existing = teamLastMatch.get(team);
      if (!existing || date > existing.date) {
        teamLastMatch.set(team, { match, date });
      }
    }
  }

  // Check for red cards in each team's most recent match
  const suspensions = new Map();
  for (const [team, { match }] of teamLastMatch) {
    const cards = match.cards || [];
    const redCards = cards.filter(c => {
      if (c.team !== team) return false;
      return c.type === 'red' || c.type === 'second_yellow';
    });

    if (redCards.length > 0) {
      // Cumulative: each red card adds penalty
      // 0.92^reds, but at least 0.80 floor
      const mult = Math.max(0.80, Math.pow(RED_CARD_MULT, redCards.length));
      suspensions.set(team, {
        availabilityMult: parseFloat(mult.toFixed(4)),
        reason: `red_card_suspension (${redCards.length} red card${redCards.length > 1 ? 's' : ''})`,
      });
    }
  }

  return suspensions;
}

export default buildSuspensions;
