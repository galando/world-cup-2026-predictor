/**
 * Enhanced calibration computation.
 * Computes Brier score, log-loss, calibration curve, and per-match breakdown
 * from finished matches and their predictions.
 *
 * Pure function, no side effects.
 */

/**
 * Build calibration metrics from finished matches and predictions.
 *
 * @param {Array} matches - All matches (including unfinished)
 * @param {Array} predictions - All predictions with probs
 * @returns {Object} Calibration object with brier, logLoss, calibrationCurve, perMatch
 */
export function buildCalibration(matches, predictions) {
  const predMap = new Map(predictions.map(p => [p.matchId, p]));

  let played = 0;
  let winnerHit = 0;
  let exactHit = 0;
  let brierSum = 0;
  let brierModelOnlySum = 0;
  let blendedCount = 0;
  let logLossSum = 0;
  let since = null;
  const perMatch = [];

  // Collect all predicted/actual pairs for calibration curve
  const allProbs = [];

  for (const match of matches) {
    if (match.status !== 'FINISHED' || !match.score) continue;
    const pred = predMap.get(match.matchId);
    if (!pred) continue;

    played++;
    if (!since || match.date < since) since = match.date;

    const { home: hScore, away: aScore } = match.score;
    const actual = hScore > aScore ? 'home' : hScore < aScore ? 'away' : 'draw';
    const actualVec = {
      home: actual === 'home' ? 1 : 0,
      draw: actual === 'draw' ? 1 : 0,
      away: actual === 'away' ? 1 : 0,
    };

    // Winner hit
    const predicted = pred.probs.home > pred.probs.away && pred.probs.home > pred.probs.draw ? 'home'
      : pred.probs.away > pred.probs.home && pred.probs.away > pred.probs.draw ? 'away' : 'draw';
    if (predicted === actual) winnerHit++;

    // Exact scoreline hit
    const exactMatch = pred.topScores?.find(s => s.h === hScore && s.a === aScore);
    if (exactMatch) exactHit++;

    // Brier score: sum of (predicted - actual)^2 for home/draw/away
    const brier = (pred.probs.home - actualVec.home) ** 2
      + (pred.probs.draw - actualVec.draw) ** 2
      + (pred.probs.away - actualVec.away) ** 2;
    brierSum += brier;

    // Log-loss: -sum(actual * log(predicted))
    const eps = 1e-15;
    const logLoss = -(actualVec.home * Math.log(pred.probs.home + eps)
      + actualVec.draw * Math.log(pred.probs.draw + eps)
      + actualVec.away * Math.log(pred.probs.away + eps));
    logLossSum += logLoss;

    // Collect for calibration curve (use home prob as the main prediction)
    allProbs.push({
      predicted: pred.probs.home,
      actual: actualVec.home,
    });

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

    perMatch.push({
      matchId: match.matchId,
      predicted: [pred.probs.home, pred.probs.draw, pred.probs.away],
      actual: [actualVec.home, actualVec.draw, actualVec.away],
      brier: parseFloat(brier.toFixed(6)),
      correct: predicted === actual,
    });
  }

  // Build calibration curve: bucket predictions into deciles
  const calibrationCurve = buildCalibrationCurve(allProbs);

  return {
    played,
    winnerHit,
    exactHit,
    brier: {
      overall: played > 0 ? parseFloat((brierSum / played).toFixed(4)) : 0,
      // model: Brier using model-only probs (no market blend), only for matches with market data
      model: blendedCount > 0 ? parseFloat((brierModelOnlySum / blendedCount).toFixed(4)) : null,
      // blended: Brier using blended (market + model) probs — equals overall when all matches are blended
      blended: played > 0 ? parseFloat((brierSum / played).toFixed(4)) : null,
    },
    logLoss: played > 0 ? parseFloat((logLossSum / played).toFixed(4)) : 0,
    calibrationCurve,
    perMatch,
    since: since || null,
  };
}

/**
 * Build calibration curve by bucketing predictions.
 * @param {Array<{predicted: number, actual: number}>} probs
 * @returns {Array<{bucket: string, predicted: number, actual: number, count: number}>}
 */
function buildCalibrationCurve(probs) {
  if (probs.length === 0) return [];

  const numBuckets = Math.min(10, probs.length);
  const bucketSize = 1.0 / numBuckets;
  const buckets = [];

  for (let i = 0; i < numBuckets; i++) {
    const low = i * bucketSize;
    const high = (i + 1) * bucketSize;
    const label = `${low.toFixed(1)}-${high.toFixed(1)}`;

    // Last bucket includes the upper bound; others use half-open [low, high)
    const inBucket = i === numBuckets - 1
      ? probs.filter(p => p.predicted >= low && p.predicted <= high)
      : probs.filter(p => p.predicted >= low && p.predicted < high);

    if (inBucket.length === 0) continue;

    const avgPredicted = inBucket.reduce((s, p) => s + p.predicted, 0) / inBucket.length;
    const avgActual = inBucket.reduce((s, p) => s + p.actual, 0) / inBucket.length;

    buckets.push({
      bucket: label,
      predicted: parseFloat(avgPredicted.toFixed(4)),
      actual: parseFloat(avgActual.toFixed(4)),
      count: inBucket.length,
    });
  }

  return buckets;
}

export default buildCalibration;
