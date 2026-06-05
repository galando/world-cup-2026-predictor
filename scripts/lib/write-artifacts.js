/**
 * Write all output JSON artifacts to public/data/.
 * Includes validation before writing to prevent corrupt output.
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', '..', 'public', 'data');

/**
 * Validate predictions array: probs sum to 1, lambdas positive.
 * Throws on invalid data to prevent writing corrupt output.
 */
export function validatePredictions(predictions) {
  const errors = [];
  for (const p of predictions) {
    const sum = p.probs.home + p.probs.draw + p.probs.away;
    if (Math.abs(sum - 1) > 0.001) {
      errors.push(`${p.matchId}: probs sum = ${sum.toFixed(6)} (expected 1.0)`);
    }
    if (p.lambdaHome <= 0 || p.lambdaAway <= 0) {
      errors.push(`${p.matchId}: invalid lambda home=${p.lambdaHome} away=${p.lambdaAway}`);
    }
    if (p.qualify) {
      const qSum = p.qualify.home + p.qualify.away;
      if (Math.abs(qSum - 1) > 0.001) {
        errors.push(`${p.matchId}: qualify sum = ${qSum.toFixed(6)} (expected 1.0)`);
      }
    }
  }
  if (errors.length > 0) {
    throw new Error(`Prediction validation failed:\n${errors.join('\n')}`);
  }
}

/**
 * Write a JSON file to the output directory.
 */
function writeJson(filename, data) {
  const path = join(OUTPUT_DIR, filename);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
  console.log(`[write-artifacts] wrote ${filename}`);
}

/**
 * Compute calibration stats from finished matches and their predictions.
 * Supports both model-only and blended Brier scores for comparison.
 */
export function computeCalibration(matches, predictions) {
  const predMap = new Map(predictions.map(p => [p.matchId, p]));
  let played = 0;
  let winnerHit = 0;
  let exactHit = 0;
  let brierSum = 0;
  let brierModelOnlySum = 0;
  let blendedCount = 0;
  let since = null;

  for (const match of matches) {
    if (match.status !== 'FINISHED' || !match.score) continue;
    const pred = predMap.get(match.matchId);
    if (!pred) continue;

    played++;
    if (!since || match.date < since) since = match.date;

    const { home: hScore, away: aScore } = match.score;
    const actual = hScore > aScore ? 'home' : hScore < aScore ? 'away' : 'draw';

    // Winner hit
    const predicted = pred.probs.home > pred.probs.away && pred.probs.home > pred.probs.draw ? 'home'
      : pred.probs.away > pred.probs.home && pred.probs.away > pred.probs.draw ? 'away' : 'draw';
    if (predicted === actual) winnerHit++;

    // Exact score hit
    const exactMatch = pred.topScores.find(s => s.h === hScore && s.a === aScore);
    if (exactMatch) exactHit++;

    // Brier score: sum of (predicted - actual)^2 for home/draw/away
    const actualVec = { home: actual === 'home' ? 1 : 0, draw: actual === 'draw' ? 1 : 0, away: actual === 'away' ? 1 : 0 };
    brierSum += (pred.probs.home - actualVec.home) ** 2
      + (pred.probs.draw - actualVec.draw) ** 2
      + (pred.probs.away - actualVec.away) ** 2;

    // Track model-only Brier for matches that have market blend
    if (pred.market) {
      blendedCount++;
      const modelProbs = {
        home: pred.market.modelHome,
        draw: pred.market.modelDraw,
        away: pred.market.modelAway,
      };
      brierModelOnlySum += (modelProbs.home - actualVec.home) ** 2
        + (modelProbs.draw - actualVec.draw) ** 2
        + (modelProbs.away - actualVec.away) ** 2;
    }
  }

  return {
    played,
    winnerHit,
    exactHit,
    brier: played > 0 ? parseFloat((brierSum / played).toFixed(4)) : 0,
    brierModelOnly: blendedCount > 0 ? parseFloat((brierModelOnlySum / blendedCount).toFixed(4)) : null,
    blendedMatches: blendedCount,
    since: since || null,
  };
}

/**
 * Build market.json with implied probabilities only (no raw odds).
 * This satisfies The Odds API ToS requirement.
 */
function buildMarketJson(predictions) {
  const entries = [];
  for (const pred of predictions) {
    if (!pred.market) continue;
    entries.push({
      matchId: pred.matchId,
      stage: pred.stage,
      impliedHome: pred.market.impliedHome,
      impliedDraw: pred.market.impliedDraw,
      impliedAway: pred.market.impliedAway,
      bookmakers: pred.market.bookmakers,
      blendWeight: pred.market.wMarket,
    });
  }
  return entries;
}

/**
 * Write all JSON files to public/data/.
 * @param {Object} params
 * @param {Array} params.matches
 * @param {Array} params.predictions
 * @param {Object} params.teams
 * @param {Object} params.teamsMeta
 * @param {Object} params.standings
 * @param {Object} params.bracket
 * @param {Map} [params.marketMap] - Optional market implied probability map
 */
export function writeArtifacts({ matches, predictions, teams, teamsMeta, standings, bracket, marketMap }) {
  // Validate before writing
  validatePredictions(predictions);

  // 1. matches.json
  writeJson('matches.json', matches);

  // 2. predictions.json
  writeJson('predictions.json', predictions);

  // 3. teams.json
  writeJson('teams.json', teams);

  // 4. teams-meta.json (pass through from source)
  writeJson('teams-meta.json', teamsMeta);

  // 5. standings.json
  writeJson('standings.json', standings);

  // 6. bracket.json
  writeJson('bracket.json', bracket);

  // 7. calibration.json
  const calibration = computeCalibration(matches, predictions);
  writeJson('calibration.json', calibration);

  // 8. market.json (implied probabilities only, no raw odds)
  const marketEntries = buildMarketJson(predictions);
  writeJson('market.json', marketEntries);

  // 9. lastUpdated.json
  writeJson('lastUpdated.json', {
    iso: new Date().toISOString(),
    source: 'build-data.js',
  });

  // Log calibration stats
  if (calibration.played > 0) {
    console.log(`[write-artifacts] Calibration: ${calibration.played} matches, Brier=${calibration.brier}, winner hit=${calibration.winnerHit}, exact hit=${calibration.exactHit}`);
    if (calibration.blendedMatches > 0 && calibration.brierModelOnly !== null) {
      console.log(`[write-artifacts] Market blend applied to ${calibration.blendedMatches} matches — blended Brier=${calibration.brier}, model-only Brier=${calibration.brierModelOnly}`);
    }
  }

  const fileCount = 9;
  console.log(`[write-artifacts] wrote ${fileCount} files to ${OUTPUT_DIR}`);
}

export default writeArtifacts;
