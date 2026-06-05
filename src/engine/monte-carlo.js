/**
 * Monte Carlo tournament simulation engine.
 * Shared between build script (Node.js) and React client (scenario explorer).
 *
 * Runs N tournament simulations by sampling match outcomes from predicted
 * probabilities, computing group standings, resolving third-place advancement,
 * and playing out the knockout bracket.
 */

/**
 * Sample a match outcome from predicted probabilities.
 * @param {{ home: number, draw: number, away: number }} probs - Match probabilities
 * @param {function} rng - Random number generator (0..1)
 * @returns {'home'|'draw'|'away'} Sampled outcome
 */
export function sampleOutcome(probs, rng) {
  const r = rng();
  if (r < probs.home) return 'home';
  if (r < probs.home + probs.draw) return 'draw';
  return 'away';
}

/**
 * Sample a penalty shootout winner using Elo-weighted probability.
 * @param {number} eloHome - Home team Elo
 * @param {number} eloAway - Away team Elo
 * @param {function} rng - Random number generator (0..1)
 * @returns {'home'|'away'} Winner
 */
export function samplePenaltyWinner(eloHome, eloAway, rng) {
  const pHome = 1 / (1 + Math.pow(10, (eloAway - eloHome) / 400));
  return rng() < pHome ? 'home' : 'away';
}

/**
 * Simulate the group stage: sample each match, compute standings, return advancing teams.
 *
 * @param {Array} matches - Group stage matches
 * @param {Map} matchProbs - matchId -> { home, draw, away }
 * @param {Object} teams - Team data map (code -> { code, group, elo, ... })
 * @param {Object} teamsMeta - Team metadata (code -> { group, fifaRank })
 * @param {function} rng - Random number generator
 * @returns {{ standings: Object, advancing: string[], thirdPlaceRanking: string[] }}
 */
export function simulateGroupStage(matches, matchProbs, teams, teamsMeta, rng) {
  const groupMatches = matches.filter(m => m.stage === 'group');
  const groups = {};

  // Initialize group entries
  for (const match of groupMatches) {
    if (!match.group) continue;
    if (!groups[match.group]) groups[match.group] = {};
    const ht = match.homeTeam;
    const at = match.awayTeam;
    if (!groups[match.group][ht]) {
      groups[match.group][ht] = { team: ht, group: match.group, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0,
        fifaRank: teamsMeta[ht]?.fifaRank || 99 };
    }
    if (!groups[match.group][at]) {
      groups[match.group][at] = { team: at, group: match.group, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0,
        fifaRank: teamsMeta[at]?.fifaRank || 99 };
    }
  }

  // Sample each group match
  for (const match of groupMatches) {
    if (!match.group) continue;
    const probs = matchProbs.get(match.matchId);
    if (!probs) continue;

    const outcome = sampleOutcome(probs, rng);
    const group = groups[match.group];
    const home = group[match.homeTeam];
    const away = group[match.awayTeam];
    if (!home || !away) continue;

    // Sample goals based on outcome
    // Simple model: winner gets 2 goals, loser 0, draw gets 1-1
    // For more realism: winner gets random 1-3 goals, loser 0-1
    let hGoals, aGoals;
    if (outcome === 'home') {
      hGoals = 1 + Math.floor(rng() * 2.5); // 1-3
      aGoals = Math.floor(rng() * 1.2);      // 0-1
      if (aGoals >= hGoals) aGoals = Math.max(0, hGoals - 1);
    } else if (outcome === 'away') {
      aGoals = 1 + Math.floor(rng() * 2.5);
      hGoals = Math.floor(rng() * 1.2);
      if (hGoals >= aGoals) hGoals = Math.max(0, aGoals - 1);
    } else {
      const g = 1 + Math.floor(rng() * 2); // 1-2
      hGoals = g;
      aGoals = g;
    }

    home.p++; away.p++;
    home.gf += hGoals; home.ga += aGoals;
    away.gf += aGoals; away.ga += hGoals;

    if (hGoals > aGoals) {
      home.w++; home.pts += 3; away.l++;
    } else if (hGoals < aGoals) {
      away.w++; away.pts += 3; home.l++;
    } else {
      home.d++; away.d++; home.pts++; away.pts++;
    }
  }

  // Sort each group by standard tiebreakers
  const sortedGroups = {};
  const thirdPlaceTeams = [];

  for (const [groupLetter, groupTeams] of Object.entries(groups)) {
    const teamList = Object.values(groupTeams);
    for (const t of teamList) { t.gd = t.gf - t.ga; }
    teamList.sort(compareGroupTeams);
    sortedGroups[groupLetter] = teamList;

    if (teamList.length === 4) {
      thirdPlaceTeams.push(teamList[2]);
    }
  }

  // Rank third-place teams, top 8 advance (for 12 groups) or top 0 (for fewer)
  thirdPlaceTeams.sort(compareGroupTeams);
  const numAdvancing = Math.min(8, thirdPlaceTeams.length);
  const advancingThird = thirdPlaceTeams.slice(0, numAdvancing).map(t => t.team);

  // Advancing teams: top 2 from each group + best 3rd
  const advancing = [];
  for (const [, teamList] of Object.entries(sortedGroups)) {
    advancing.push(teamList[0].team, teamList[1].team);
  }
  advancing.push(...advancingThird);

  return {
    standings: sortedGroups,
    advancing,
    thirdPlaceRanking: thirdPlaceTeams.map(t => t.team),
    advancingThirdPlace: advancingThird,
  };
}

/**
 * Simulate the knockout bracket. Returns champion and path.
 *
 * @param {Object} bracket - Bracket structure with rounds
 * @param {Map} matchProbs - matchId -> { home, draw, away }
 * @param {Object} teams - Team data map
 * @param {function} rng - Random number generator
 * @returns {{ champion: string, path: Array<{ round: string, matchId: string, winner: string }> }}
 */
export function simulateKnockout(bracket, matchProbs, teams, rng) {
  const path = [];
  const winners = new Map(); // matchId -> winner team code

  // Process rounds in order: r32, r16, qf, sf, final
  const roundOrder = ['r32', 'r16', 'qf', 'sf', 'third', 'final'];

  for (const roundName of roundOrder) {
    const roundMatches = bracket.rounds?.[roundName];
    if (!roundMatches) continue;

    for (const match of roundMatches) {
      let homeTeam = match.homeTeam;
      let awayTeam = match.awayTeam;

      // Resolve teams from previous round winners if needed
      // Try fromMatches first (standard pattern), then fromSf (legacy)
      if (!homeTeam) {
        if (match.fromMatches) {
          homeTeam = winners.get(match.fromMatches[0]);
        } else if (match.fromSf) {
          homeTeam = winners.get(match.fromSf[0]);
        }
      }
      if (!awayTeam) {
        if (match.fromMatches && match.fromMatches.length > 1) {
          awayTeam = winners.get(match.fromMatches[1]);
        } else if (match.fromSf) {
          awayTeam = winners.get(match.fromSf[1]);
        }
      }

      if (!homeTeam || !awayTeam) continue;

      let probs = matchProbs.get(match.matchId);
      if (!probs) {
        // Generate probs from Elo if not pre-computed (e.g., resolved knockout matches)
        const hElo = teams[homeTeam]?.elo || 2000;
        const aElo = teams[awayTeam]?.elo || 2000;
        const diff = hElo - aElo;
        const pHome = Math.max(0.1, Math.min(0.9, 0.4 + diff / 1000));
        const pDraw = 0.25;
        const pAway = Math.max(0.1, 1 - pHome - pDraw);
        probs = { home: pHome, draw: pDraw, away: pAway };
      }

      const outcome = sampleOutcome(probs, rng);
      let winner;

      if (outcome === 'home') {
        winner = homeTeam;
      } else if (outcome === 'away') {
        winner = awayTeam;
      } else {
        // Draw in knockout -> penalties
        const homeElo = teams[homeTeam]?.elo || 2000;
        const awayElo = teams[awayTeam]?.elo || 2000;
        winner = samplePenaltyWinner(homeElo, awayElo, rng) === 'home' ? homeTeam : awayTeam;
      }

      winners.set(match.matchId, winner);
      path.push({ round: roundName, matchId: match.matchId, winner });
    }
  }

  // Champion is the winner of the final
  const finalMatches = bracket.rounds?.final || [];
  const champion = finalMatches.length > 0 ? winners.get(finalMatches[0].matchId) : null;

  return { champion, path };
}

/**
 * Run N full tournament simulations and aggregate per-team round probabilities.
 *
 * @param {Array} matches - All matches (group + knockout)
 * @param {Map} matchProbs - matchId -> { home, draw, away }
 * @param {Object} teams - Team data map (code -> { code, group, elo, ... })
 * @param {Object} teamsMeta - Team metadata
 * @param {Object} bracket - Bracket structure
 * @param {Object} seedingData - R32 seeding table
 * @param {{ n?: number, rng?: function }} options - Simulation options
 * @returns {{ simulations: number, teams: Object<{ r16: number, qf: number, sf: number, final: number, win: number }> }}
 */
export function runTournamentSim(matches, matchProbs, teams, teamsMeta, bracket, seedingData, options = {}) {
  const n = options.n || 10000;
  const rng = options.rng || Math.random;

  const allTeams = Object.keys(teams);
  const teamRoundCounts = {};
  for (const code of allTeams) {
    teamRoundCounts[code] = { r16: 0, qf: 0, sf: 0, final: 0, win: 0 };
  }

  for (let sim = 0; sim < n; sim++) {
    // Simulate group stage
    const groupResult = simulateGroupStage(matches, matchProbs, teams, teamsMeta, rng);

    // Teams advancing from groups count as "reaching R16" in output
    for (const code of groupResult.advancing) {
      if (teamRoundCounts[code]) {
        teamRoundCounts[code].r16++;
      }
    }

    // Build knockout bracket for this simulation
    const simBracket = buildSimBracket(groupResult, seedingData);
    const simMatchProbs = buildSimMatchProbs(simBracket, matchProbs, teams, rng);

    // Simulate knockout
    const koResult = simulateKnockout(simBracket, simMatchProbs, teams, rng);

    // Track which rounds each team WON in (meaning they reached the NEXT round)
    // Map bracket round -> output probability category it unlocks
    // Winning in R32 means you reach R16 (already counted above for group advancers)
    // Winning in R16 means you reach QF, etc.
    const roundToOutput = {
      r32: null,    // already counted as r16 (advancing from groups)
      r16: 'qf',    // winning R16 = reached QF
      qf: 'sf',     // winning QF = reached SF
      sf: 'final',  // winning SF = reached Final
      third: null,  // third-place match doesn't advance
    };

    for (const step of koResult.path) {
      if (!teamRoundCounts[step.winner]) continue;
      const outputKey = roundToOutput[step.round];
      if (outputKey) {
        teamRoundCounts[step.winner][outputKey]++;
      }
    }

    if (koResult.champion && teamRoundCounts[koResult.champion]) {
      teamRoundCounts[koResult.champion].win++;
    }
  }

  // Convert counts to probabilities
  const teamProbs = {};
  for (const [code, counts] of Object.entries(teamRoundCounts)) {
    teamProbs[code] = {
      r16: parseFloat((counts.r16 / n).toFixed(4)),
      qf: parseFloat((counts.qf / n).toFixed(4)),
      sf: parseFloat((counts.sf / n).toFixed(4)),
      final: parseFloat((counts.final / n).toFixed(4)),
      win: parseFloat((counts.win / n).toFixed(4)),
    };
  }

  // Find most likely champion
  let mostLikelyChampion = null;
  let maxWinProb = 0;
  for (const [code, probs] of Object.entries(teamProbs)) {
    if (probs.win > maxWinProb) {
      maxWinProb = probs.win;
      mostLikelyChampion = code;
    }
  }

  return {
    simulations: n,
    teams: teamProbs,
    confidence: {
      mostLikelyChampion: mostLikelyChampion ? { team: mostLikelyChampion, prob: maxWinProb } : null,
    },
  };
}

/**
 * Build a simulated bracket from group stage results and seeding data.
 */
function buildSimBracket(groupResult, seedingData) {
  const rounds = {
    r32: [],
    r16: [],
    qf: [],
    sf: [],
    third: [],
    final: [],
  };

  // Resolve R32 matches from seeding
  if (seedingData.r32Matches) {
    for (const match of seedingData.r32Matches) {
      const homeTeam = resolveSlotSim(match.slot1, groupResult);
      const awayTeam = resolveSlotSim(match.slot2, groupResult);
      rounds.r32.push({
        matchId: `r32-${match.match}`,
        homeTeam,
        awayTeam,
        round: 'r32',
      });
    }
  }

  // R16 from seeding (teams resolved from R32 winners)
  if (seedingData.r16Matches) {
    for (const match of seedingData.r16Matches) {
      rounds.r16.push({
        matchId: `r16-${match.match}`,
        homeTeam: null,
        awayTeam: null,
        fromMatches: match.from ? match.from.map(f => `r32-${f}`) : null,
        round: 'r16',
      });
    }
  }

  // QF
  if (seedingData.qfMatches) {
    for (const match of seedingData.qfMatches) {
      rounds.qf.push({
        matchId: `qf-${match.match}`,
        homeTeam: null,
        awayTeam: null,
        fromMatches: match.from ? match.from.map(f => `r16-${f}`) : null,
        round: 'qf',
      });
    }
  }

  // SF — can be resolved from group standings (if no intermediate rounds) or from QF winners
  if (seedingData.sfMatches) {
    for (const match of seedingData.sfMatches) {
      // If slot-based (no QF in between), resolve directly from groups
      const hasSlots = match.slot1 || match.slot2;
      const hasQf = rounds.qf.length > 0;

      if (hasSlots && !hasQf) {
        const homeTeam = resolveSlotSim(match.slot1, groupResult);
        const awayTeam = resolveSlotSim(match.slot2, groupResult);
        rounds.sf.push({
          matchId: `sf-${match.match}`,
          homeTeam,
          awayTeam,
          round: 'sf',
        });
      } else {
        rounds.sf.push({
          matchId: `sf-${match.match}`,
          homeTeam: null,
          awayTeam: null,
          fromMatches: match.from ? match.from.map(f => `qf-${f}`) : null,
          round: 'sf',
        });
      }
    }
  }

  // Third place
  if (seedingData.thirdPlace) {
    rounds.third.push({
      matchId: `third-${seedingData.thirdPlace.match}`,
      homeTeam: null,
      awayTeam: null,
      fromMatches: seedingData.thirdPlace.from ? seedingData.thirdPlace.from.map(f => `sf-${f}`) : null,
      round: 'third',
    });
  }

  // Final
  if (seedingData.final) {
    rounds.final.push({
      matchId: `final-${seedingData.final.match}`,
      homeTeam: null,
      awayTeam: null,
      fromMatches: seedingData.final.from ? seedingData.final.from.map(f => `sf-${f}`) : null,
      round: 'final',
    });
  }

  return { rounds };
}

/**
 * Resolve a seeding slot to a team code using group results.
 */
function resolveSlotSim(slotStr, groupResult) {
  if (!slotStr) return null;
  const str = slotStr.replace(/\s/g, '');
  const position = parseInt(str[0]);
  const groupsStr = str.slice(1);
  const groupLetters = groupsStr.split('').filter(c => c >= 'A' && c <= 'L');

  if (position === 1 || position === 2) {
    const group = groupLetters[0];
    const groupTeams = groupResult.standings[group];
    if (!groupTeams || groupTeams.length < position) return null;
    return groupTeams[position - 1].team;
  }

  if (position === 3) {
    // Find which third-place team is assigned to this slot
    const advancingThird = new Set(groupResult.advancingThirdPlace || []);
    for (const g of groupLetters) {
      if (advancingThird.has(groupResult.standings[g]?.[2]?.team)) {
        // Check if this group's 3rd place is in the eligible groups
        const team = groupResult.standings[g]?.[2]?.team;
        if (team) return team;
      }
    }
    // Fallback: return first eligible third-place team
    const thirdRanked = groupResult.thirdPlaceRanking || [];
    const eligible = new Set(groupLetters.map(g =>
      groupResult.standings[g]?.[2]?.team
    ).filter(Boolean));
    for (const t of thirdRanked) {
      if (eligible.has(t)) return t;
    }
    return null;
  }

  return null;
}

/**
 * Build match probabilities for simulated bracket.
 * Uses base probabilities from existing predictions or generates from Elo.
 */
function buildSimMatchProbs(bracket, existingProbs, teams, rng) {
  const probs = new Map();

  for (const roundMatches of Object.values(bracket.rounds)) {
    for (const match of roundMatches) {
      // Use existing probability if available
      if (existingProbs.has(match.matchId)) {
        probs.set(match.matchId, existingProbs.get(match.matchId));
      } else if (match.homeTeam && match.awayTeam) {
        // Generate from Elo difference
        const hElo = teams[match.homeTeam]?.elo || 2000;
        const aElo = teams[match.awayTeam]?.elo || 2000;
        const diff = hElo - aElo;
        const pHome = Math.max(0.1, Math.min(0.9, 0.4 + diff / 1000));
        const pDraw = 0.25;
        const pAway = Math.max(0.1, 1 - pHome - pDraw);
        probs.set(match.matchId, { home: pHome, draw: pDraw, away: pAway });
      }
    }
  }

  return probs;
}

/**
 * Compare group teams for standings sorting.
 * Tiebreakers: points, goal diff, goals scored, FIFA rank.
 */
function compareGroupTeams(a, b) {
  if (b.pts !== a.pts) return b.pts - a.pts;
  const gdA = a.gf - a.ga;
  const gdB = b.gf - b.ga;
  if (gdB !== gdA) return gdB - gdA;
  if (b.gf !== a.gf) return b.gf - a.gf;
  if (a.fifaRank !== b.fifaRank) return a.fifaRank - b.fifaRank;
  return a.team.localeCompare(b.team);
}
