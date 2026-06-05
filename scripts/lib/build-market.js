/**
 * Convert raw Odds API response to implied probabilities per match.
 *
 * For each match:
 *   1. Extract h2h decimal odds from each bookmaker
 *   2. Remove vig (overround) via standard method:
 *      impliedP = (1/odds) / sum(1/odds)
 *   3. Match bookmaker team names to canonical team codes via teams-meta
 *   4. Average implied probabilities across bookmakers
 *
 * Output: Map<matchId, { pHome, pDraw, pAway, bookmakers: number }>
 *
 * Pure function — no side effects.
 */

/**
 * Build a name-to-code lookup from teams-meta.
 * Maps various name forms to canonical 3-letter codes.
 */
function buildNameLookup(teamsMeta) {
  const lookup = {};
  for (const [code, meta] of Object.entries(teamsMeta)) {
    if (meta.nameEN) lookup[meta.nameEN.toLowerCase()] = code;
    if (meta.nameHE) lookup[meta.nameHE] = code;
    // Common bookmaker name variants
    lookup[code.toLowerCase()] = code;
  }
  // Add common bookmaker name aliases
  const aliases = {
    'south korea': 'KOR', 'korea republic': 'KOR', 'korea': 'KOR',
    'iran': 'IRN', 'iran islamic republic': 'IRN',
    'ivory coast': 'CIV', "cote d'ivoire": 'CIV',
    'russia': 'RUS', 'usa': 'USA', 'united states': 'USA',
    'bosnia': 'BIH', 'bosnia and herzegovina': 'BIH',
    'saudi arabia': 'KSA',
    'czech republic': 'CZE', 'czechia': 'CZE',
    'republic of ireland': 'IRL', 'ireland': 'IRL',
    'democratic republic of congo': 'COD',
    'congo dr': 'COD',
    'curacao': 'CUW', 'curaçao': 'CUW',
    'cape verde': 'CPV', 'cape verde islands': 'CPV',
    'south africa': 'RSA',
    'new zealand': 'NZL',
    'northern ireland': 'NIR',
    'north macedonia': 'MKD',
    'trinidad and tobago': 'TRI',
    'burkina faso': 'BFA',
  };
  for (const [name, code] of Object.entries(aliases)) {
    lookup[name] = code;
  }
  return lookup;
}

/**
 * Resolve a bookmaker team name to a canonical team code.
 */
function resolveTeamCode(teamName, lookup) {
  if (!teamName) return null;
  const normalized = teamName.toLowerCase().trim();
  return lookup[normalized] || null;
}

/**
 * Remove vig from a set of h2h decimal odds.
 * Returns { pHome, pDraw, pAway } summing to 1.0.
 */
export function removeVig(oddsHome, oddsDraw, oddsAway) {
  const rawHome = 1 / oddsHome;
  const rawDraw = 1 / oddsDraw;
  const rawAway = 1 / oddsAway;
  const total = rawHome + rawDraw + rawAway;

  return {
    pHome: rawHome / total,
    pDraw: rawDraw / total,
    pAway: rawAway / total,
  };
}

/**
 * Convert raw odds API response to implied probability map.
 *
 * @param {Array} oddsData - Raw response from The Odds API (array of match objects)
 * @param {Object} teamsMeta - teams-meta.json mapping
 * @returns {Map<string, {pHome: number, pDraw: number, pAway: number, bookmakers: number}>}
 */
export function buildMarket(oddsData, teamsMeta) {
  if (!oddsData || !Array.isArray(oddsData)) return new Map();

  const lookup = buildNameLookup(teamsMeta);
  const market = new Map();

  for (const match of oddsData) {
    if (!match.home_team || !match.away_team || !match.bookmakers) continue;

    const homeCode = resolveTeamCode(match.home_team, lookup);
    const awayCode = resolveTeamCode(match.away_team, lookup);
    if (!homeCode || !awayCode) continue;

    // Generate matchId consistent with our scheme: "homeCode-awayCode" or use id
    const matchId = match.id || `${homeCode}-${awayCode}`;

    let totalHome = 0;
    let totalDraw = 0;
    let totalAway = 0;
    let bookmakerCount = 0;

    for (const bookmaker of match.bookmakers) {
      if (!bookmaker.markets) continue;
      for (const marketData of bookmaker.markets) {
        if (marketData.key !== 'h2h') continue;
        if (!marketData.outcomes || marketData.outcomes.length < 2) continue;

        // Find home/draw/away odds from outcomes
        let oddsHome = null;
        let oddsDraw = null;
        let oddsAway = null;

        for (const outcome of marketData.outcomes) {
          const resolvedCode = resolveTeamCode(outcome.name, lookup);
          if (resolvedCode === homeCode) oddsHome = outcome.price;
          else if (resolvedCode === awayCode) oddsAway = outcome.price;
          else if (outcome.name.toLowerCase() === 'draw') oddsDraw = outcome.price;
        }

        // Some h2h markets don't include draw (moneyline for knockout)
        if (oddsHome && oddsAway) {
          if (!oddsDraw) oddsDraw = 99; // very high odds = very low probability for draw
          const vigRemoved = removeVig(oddsHome, oddsDraw, oddsAway);
          totalHome += vigRemoved.pHome;
          totalDraw += vigRemoved.pDraw;
          totalAway += vigRemoved.pAway;
          bookmakerCount++;
        }
      }
    }

    if (bookmakerCount > 0) {
      // Store per-team pair, keyed by team codes
      const key = `${homeCode}-${awayCode}`;
      market.set(key, {
        homeCode,
        awayCode,
        pHome: totalHome / bookmakerCount,
        pDraw: totalDraw / bookmakerCount,
        pAway: totalAway / bookmakerCount,
        bookmakers: bookmakerCount,
      });
    }
  }

  return market;
}

export default buildMarket;
