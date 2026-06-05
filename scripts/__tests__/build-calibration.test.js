import { describe, it, expect } from 'vitest';
import { buildCalibration } from '../lib/build-calibration.js';

describe('buildCalibration', () => {
  it('returns empty calibration when no matches are finished', () => {
    const matches = [
      { matchId: 'A-1', status: 'SCHEDULED', score: null, date: '2026-06-11', homeTeam: 'MEX', awayTeam: 'RSA' },
    ];
    const predictions = [
      { matchId: 'A-1', probs: { home: 0.6, draw: 0.2, away: 0.2 }, topScores: [] },
    ];

    const cal = buildCalibration(matches, predictions);
    expect(cal.played).toBe(0);
    expect(cal.brier.overall).toBe(0);
    expect(cal.brier.model).toBeNull();
    expect(cal.brier.blended).toBeNull();
    expect(cal.perMatch).toHaveLength(0);
  });

  it('computes correct Brier score for single home win', () => {
    const matches = [
      { matchId: 'A-1', status: 'FINISHED', score: { home: 2, away: 0 }, date: '2026-06-11', homeTeam: 'MEX', awayTeam: 'RSA' },
    ];
    const predictions = [
      {
        matchId: 'A-1',
        probs: { home: 0.6, draw: 0.2, away: 0.2 },
        topScores: [{ h: 2, a: 0, p: 0.1, score: '2-0' }],
      },
    ];

    const cal = buildCalibration(matches, predictions);
    expect(cal.played).toBe(1);

    // Brier = (0.6-1)^2 + (0.2-0)^2 + (0.2-0)^2 = 0.16 + 0.04 + 0.04 = 0.24
    expect(cal.brier.overall).toBeCloseTo(0.24, 4);

    // Winner was correctly predicted (home had highest prob)
    expect(cal.winnerHit).toBe(1);

    // Exact scoreline was in topScores
    expect(cal.exactHit).toBe(1);

    expect(cal.perMatch).toHaveLength(1);
    expect(cal.perMatch[0].matchId).toBe('A-1');
    expect(cal.perMatch[0].brier).toBeCloseTo(0.24, 4);
  });

  it('computes Brier for model-only and blended when market data present', () => {
    const matches = [
      { matchId: 'A-1', status: 'FINISHED', score: { home: 1, away: 0 }, date: '2026-06-11', homeTeam: 'MEX', awayTeam: 'RSA' },
    ];
    const predictions = [
      {
        matchId: 'A-1',
        probs: { home: 0.55, draw: 0.25, away: 0.20 },
        market: {
          modelHome: 0.53, modelDraw: 0.25, modelAway: 0.22,
          impliedHome: 0.60, impliedDraw: 0.25, impliedAway: 0.15,
        },
        topScores: [],
      },
    ];

    const cal = buildCalibration(matches, predictions);
    expect(cal.brier.blended).toBeCloseTo(0.305, 3); // (0.55-1)^2 + 0.0625 + 0.04
    // Model-only: (0.53-1)^2 + 0.0625 + (0.22)^2
    expect(cal.brier.model).toBeCloseTo(0.3318, 3);
  });

  it('computes log-loss correctly', () => {
    const matches = [
      { matchId: 'A-1', status: 'FINISHED', score: { home: 2, away: 0 }, date: '2026-06-11', homeTeam: 'MEX', awayTeam: 'RSA' },
    ];
    const predictions = [
      {
        matchId: 'A-1',
        probs: { home: 0.6, draw: 0.2, away: 0.2 },
        topScores: [],
      },
    ];

    const cal = buildCalibration(matches, predictions);
    // Log-loss = -(1*log(0.6) + 0*log(0.2) + 0*log(0.2)) = -log(0.6)
    const expectedLogLoss = -Math.log(0.6);
    expect(cal.logLoss).toBeCloseTo(expectedLogLoss, 4);
  });

  it('builds calibration curve with buckets', () => {
    const matches = [];
    const predictions = [];

    // Create 10 matches with varying home probabilities
    for (let i = 0; i < 10; i++) {
      const homeProb = 0.1 + i * 0.08;
      matches.push({
        matchId: `m-${i}`,
        status: 'FINISHED',
        score: { home: i < 5 ? 1 : 0, away: i < 5 ? 0 : 1 },
        date: '2026-06-11',
        homeTeam: 'T1',
        awayTeam: 'T2',
      });
      predictions.push({
        matchId: `m-${i}`,
        probs: { home: homeProb, draw: 0.25, away: 1 - homeProb - 0.25 },
        topScores: [],
      });
    }

    const cal = buildCalibration(matches, predictions);
    expect(cal.calibrationCurve).toBeDefined();
    expect(cal.calibrationCurve.length).toBeGreaterThan(0);

    // Each bucket should have predicted, actual, count
    for (const bucket of cal.calibrationCurve) {
      expect(bucket.bucket).toBeDefined();
      expect(typeof bucket.predicted).toBe('number');
      expect(typeof bucket.actual).toBe('number');
      expect(typeof bucket.count).toBe('number');
    }
  });

  it('handles multiple matches correctly', () => {
    const matches = [
      { matchId: 'm-1', status: 'FINISHED', score: { home: 2, away: 1 }, date: '2026-06-11', homeTeam: 'A', awayTeam: 'B' },
      { matchId: 'm-2', status: 'FINISHED', score: { home: 0, away: 1 }, date: '2026-06-11', homeTeam: 'C', awayTeam: 'D' },
      { matchId: 'm-3', status: 'SCHEDULED', score: null, date: '2026-06-12', homeTeam: 'E', awayTeam: 'F' },
    ];
    const predictions = [
      { matchId: 'm-1', probs: { home: 0.5, draw: 0.25, away: 0.25 }, topScores: [{ h: 2, a: 1, p: 0.08, score: '2-1' }] },
      { matchId: 'm-2', probs: { home: 0.4, draw: 0.3, away: 0.3 }, topScores: [] },
      { matchId: 'm-3', probs: { home: 0.5, draw: 0.25, away: 0.25 }, topScores: [] },
    ];

    const cal = buildCalibration(matches, predictions);
    expect(cal.played).toBe(2);
    expect(cal.perMatch).toHaveLength(2);
    expect(cal.since).toBe('2026-06-11');
  });
});
