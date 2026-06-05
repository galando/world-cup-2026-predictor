/**
 * Run Dixon-Coles predictions for all matches.
 * Imports the shared engine from src/engine/.
 *
 * Optional: suspension map and market implied probability map.
 * - Suspension map: team -> availabilityMult (reduces lambda for suspended teams)
 * - Market map: matchKey -> implied P (blended with model at w_market=0.25)
 */

import { buildGrid, applyDixonColes, aggregateOutcome, topScorelines } from '../../src/engine/poisson-dc.js';
import { getTeamLambda, BASELINE_LAMBDA, eloToLambdaDiff } from '../../src/engine/calibrate.js';
import { predictKnockout } from '../../src/engine/knockout.js';

/** Home advantage for host nations (ln(1.15) ~ 0.14) */
const HOME_ADVANTAGE_HOST = Math.log(1.15);

/**
 * Host nations for the 2026 World Cup: Mexico, USA, Canada.
 * These are the only teams that receive a home advantage boost.
 */
const HOST_NATIONS = new Set(['MEX', 'USA', 'CAN']);

/** Market blend weight: 25% market, 75% model */
const W_MARKET = 0.25;

/**
 * Compute home advantage for a match.
 *
 * Design decision: Home advantage applies ONLY to host nations (MEX, USA, CAN)
 * when they are designated as the "home" team in the seeding table. The "home"
 * designation is structurally arbitrary for non-host teams (it simply determines
 * which side of the bracket they appear on), but for host nations it correlates
 * with playing at a venue in their country.
 *
 * For non-host teams, no home advantage is applied, which is correct for
 * neutral-site World Cup matches.
 *
 * Limitation: When venue-to-country mapping becomes available, this can be
 * refined to check whether the host nation is actually playing at a venue
 * in their own country, rather than relying on the arbitrary "home" designation.
 *
 * @param {string} teamCode - Team code (e.g., 'MEX')
 * @param {boolean} isHome - Whether the team is the "home" team in the seeding table
 * @param {string} matchVenue - Match venue (not currently used for location mapping)
 * @returns {number} ln multiplier (0 = no advantage, ~0.14 for host home matches)
 */
function getHomeAdvantage(teamCode, isHome, matchVenue) {
  if (isHome && HOST_NATIONS.has(teamCode)) {
    return HOME_ADVANTAGE_HOST;
  }
  return 0;
}

/**
 * Build factor chain for a team's lambda computation.
 * Used in the WhyPanel UI.
 */
function buildFactorChain(teamData, opponentData, isHome, match, suspensionMap, factorMaps) {
  const eloDiff = teamData.elo - opponentData.elo;
  const lambdaDiff = eloToLambdaDiff(eloDiff);
  const eloMult = Math.exp(lambdaDiff);

  const atkMult = teamData.attack ? Math.exp(teamData.attack) : 1;
  const defMult = opponentData.defence ? Math.exp(opponentData.defence) : 1;
  const homeAdv = getHomeAdvantage(teamData.code, isHome, match.venue);
  const venueMult = Math.exp(homeAdv);

  // Form multiplier: based on recent form (W=1.05, D=1.0, L=0.95)
  const formArr = teamData.form || [];
  const formWeight = formArr.length > 0
    ? formArr.reduce((acc, r) => acc + (r === 'W' ? 1.05 : r === 'D' ? 1.0 : 0.95), 0) / formArr.length
    : 1;

  const chain = [
    { key: 'base', label_he: 'בסיס', mult: BASELINE_LAMBDA },
    { key: 'atk', label_he: 'כוח התקפה', mult: parseFloat(atkMult.toFixed(2)) },
    { key: 'def', label_he: 'הגנת יריב', mult: parseFloat(defMult.toFixed(2)) },
    { key: 'form', label_he: 'כושר אחרון', mult: parseFloat(formWeight.toFixed(2)) },
    { key: 'venue', label_he: 'יתרון מגרש', mult: parseFloat(venueMult.toFixed(2)) },
  ];

  // Add suspension factor if applicable
  if (suspensionMap) {
    const suspension = suspensionMap.get(teamData.code);
    if (suspension && suspension.availabilityMult !== 1) {
      chain.push({
        key: 'suspension',
        label_he: 'השעיה / הרחקה',
        mult: parseFloat(suspension.availabilityMult.toFixed(2)),
      });
    }
  }

  // Add new Phase 2 factors if available
  if (factorMaps) {
    const { fatigueMap, altitudeMap, h2hMap, squadValueMap } = factorMaps;
    const matchKey = match.matchId;
    const teamCode = teamData.code;

    // Fatigue
    if (fatigueMap) {
      const fatigue = fatigueMap.get(`${matchKey}:${teamCode}`) || fatigueMap.get(teamCode);
      if (fatigue && fatigue !== 1) {
        chain.push({ key: 'fatigue', label_he: 'עייפות / נסיעות', mult: parseFloat(fatigue.toFixed(2)) });
      }
    }

    // Altitude
    if (altitudeMap) {
      const alt = altitudeMap.get(matchKey);
      if (alt && alt !== 1) {
        chain.push({ key: 'altitude', label_he: 'גובה מעל פני הים', mult: parseFloat(alt.toFixed(2)) });
      }
    }

    // H2H
    if (h2hMap) {
      const h2h = h2hMap.get(`${teamCode}:${opponentData.code}`);
      if (h2h && h2h !== 1) {
        chain.push({ key: 'h2h', label_he: 'מפגשים ישירים', mult: parseFloat(h2h.toFixed(2)) });
      }
    }

    // Squad value
    if (squadValueMap) {
      const sv = squadValueMap.get(`${matchKey}:${teamCode}`) || squadValueMap.get(teamCode);
      if (sv && sv !== 1) {
        chain.push({ key: 'squadValue', label_he: 'ערך סגל', mult: parseFloat(sv.toFixed(2)) });
      }
    }
  }

  return chain;
}

/**
 * Compute lambda for a team given all available data.
 */
function computeLambda(teamData, opponentData, isHome, match, suspensionMap, factorMaps) {
  const eloDiff = teamData.elo - opponentData.elo;
  const lambdaDiff = eloToLambdaDiff(eloDiff);
  let lambda = BASELINE_LAMBDA * Math.exp(lambdaDiff);

  // Apply attack/defence if available (from tournament results)
  if (teamData.attack) {
    lambda *= Math.exp(teamData.attack);
  }
  if (opponentData.defence) {
    lambda *= Math.exp(opponentData.defence);
  }

  // Home advantage for host nations
  const homeAdv = getHomeAdvantage(teamData.code, isHome, match.venue);
  if (homeAdv > 0) {
    lambda *= Math.exp(homeAdv);
  }

  // Form adjustment (mild)
  const formArr = teamData.form || [];
  if (formArr.length > 0) {
    const formWeight = formArr.reduce((acc, r) => acc + (r === 'W' ? 1.05 : r === 'D' ? 1.0 : 0.95), 0) / formArr.length;
    lambda *= formWeight;
  }

  // Suspension multiplier
  if (suspensionMap) {
    const suspension = suspensionMap.get(teamData.code);
    if (suspension && suspension.availabilityMult !== 1) {
      lambda *= suspension.availabilityMult;
    }
  }

  // Phase 2 factors: fatigue, altitude, H2H, squad value
  if (factorMaps) {
    const { fatigueMap, altitudeMap, h2hMap, squadValueMap } = factorMaps;
    const matchKey = match.matchId;
    const teamCode = teamData.code;

    if (fatigueMap) {
      const fatigue = fatigueMap.get(`${matchKey}:${teamCode}`) || fatigueMap.get(teamCode);
      if (fatigue && fatigue !== 1) lambda *= fatigue;
    }

    if (altitudeMap) {
      const alt = altitudeMap.get(matchKey);
      if (alt && alt !== 1) lambda *= alt;
    }

    if (h2hMap) {
      const h2h = h2hMap.get(`${teamCode}:${opponentData.code}`);
      if (h2h && h2h !== 1) lambda *= h2h;
    }

    if (squadValueMap) {
      const sv = squadValueMap.get(`${matchKey}:${teamCode}`) || squadValueMap.get(teamCode);
      if (sv && sv !== 1) lambda *= sv;
    }
  }

  return Math.max(0.1, lambda); // Floor at 0.1 to prevent degenerate predictions
}

/**
 * Build market key matching the format used by build-market.js.
 */
function marketKey(homeCode, awayCode) {
  return `${homeCode}-${awayCode}`;
}

/**
 * Run predictions for all matches.
 * Returns predictions array matching the TECHNICAL_PLAN schema.
 *
 * @param {Array} matches - Match objects
 * @param {Object} teams - Team data map
 * @param {Map} [suspensionMap] - Optional: team -> {availabilityMult, reason}
 * @param {Map} [marketMap] - Optional: matchKey -> {pHome, pDraw, pAway, bookmakers}
 * @param {Object} [factorMaps] - Optional: { fatigueMap, altitudeMap, h2hMap, squadValueMap }
 */
export function runPredictions(matches, teams, suspensionMap, marketMap, factorMaps) {
  const predictions = [];
  const isKnockout = (stage) => ['r32', 'r16', 'qf', 'sf', 'final', 'third'].includes(stage);

  for (const match of matches) {
    const homeData = teams[match.homeTeam];
    const awayData = teams[match.awayTeam];

    if (!homeData || !awayData) {
      console.warn(`[run-predictions] Missing team data for ${match.homeTeam} or ${match.awayTeam}`);
      continue;
    }

    const lambdaH = computeLambda(homeData, awayData, true, match, suspensionMap, factorMaps);
    const lambdaA = computeLambda(awayData, homeData, false, match, suspensionMap, factorMaps);

    const rawGrid = buildGrid(lambdaH, lambdaA);
    const grid = applyDixonColes(rawGrid, lambdaH, lambdaA, -0.05);
    const probs = aggregateOutcome(grid);
    const topScores = topScorelines(grid, 4);

    const prediction = {
      matchId: match.matchId,
      stage: match.stage,
      lambdaHome: parseFloat(lambdaH.toFixed(4)),
      lambdaAway: parseFloat(lambdaA.toFixed(4)),
      rho: -0.05,
      factors: {
        home: {
          lambda: parseFloat(lambdaH.toFixed(4)),
          chain: buildFactorChain(homeData, awayData, true, match, suspensionMap, factorMaps),
        },
        away: {
          lambda: parseFloat(lambdaA.toFixed(4)),
          chain: buildFactorChain(awayData, homeData, false, match, suspensionMap, factorMaps),
        },
      },
      probs: {
        home: parseFloat(probs.home.toFixed(4)),
        draw: parseFloat(probs.draw.toFixed(4)),
        away: parseFloat(probs.away.toFixed(4)),
      },
      qualify: null,
      topScores: topScores.map(s => ({
        score: s.score,
        h: s.h,
        a: s.a,
        p: parseFloat(s.p.toFixed(4)),
      })),
      scoreMatrix: grid.map(row => row.map(v => parseFloat(v.toFixed(6)))),
      modelVersion: 'dc-1.1',
    };

    // Market blend: if market data available for this match, blend model + market
    const mktKey = marketKey(match.homeTeam, match.awayTeam);
    const mktData = marketMap ? marketMap.get(mktKey) : null;

    if (mktData) {
      // Store model-only probs before blend for Brier comparison
      const modelHome = probs.home;
      const modelDraw = probs.draw;
      const modelAway = probs.away;

      const blendedHome = (1 - W_MARKET) * probs.home + W_MARKET * mktData.pHome;
      const blendedDraw = (1 - W_MARKET) * probs.draw + W_MARKET * mktData.pDraw;
      const blendedAway = (1 - W_MARKET) * probs.away + W_MARKET * mktData.pAway;

      prediction.market = {
        wMarket: W_MARKET,
        impliedHome: parseFloat(mktData.pHome.toFixed(4)),
        impliedDraw: parseFloat(mktData.pDraw.toFixed(4)),
        impliedAway: parseFloat(mktData.pAway.toFixed(4)),
        bookmakers: mktData.bookmakers,
        modelHome: parseFloat(modelHome.toFixed(4)),
        modelDraw: parseFloat(modelDraw.toFixed(4)),
        modelAway: parseFloat(modelAway.toFixed(4)),
      };

      // Override probs with blended values
      prediction.probs.home = parseFloat(blendedHome.toFixed(4));
      prediction.probs.draw = parseFloat(blendedDraw.toFixed(4));
      prediction.probs.away = parseFloat(blendedAway.toFixed(4));
    }

    // Add qualify probabilities for knockout matches
    if (isKnockout(match.stage)) {
      const knockout = predictKnockout(
        match.matchId,
        lambdaH,
        lambdaA,
        grid,
        homeData.elo,
        awayData.elo,
      );
      prediction.qualify = {
        home: parseFloat(knockout.qualify.home.toFixed(4)),
        away: parseFloat(knockout.qualify.away.toFixed(4)),
      };
    }

    predictions.push(prediction);
  }

  return predictions;
}

export default runPredictions;
