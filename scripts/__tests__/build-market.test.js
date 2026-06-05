import { describe, it, expect } from 'vitest';
import { buildMarket, removeVig } from '../lib/build-market.js';

describe('removeVig', () => {
  it('removes overround and produces probabilities summing to 1', () => {
    // Decimal odds: home 1.80, draw 3.50, away 4.50
    // Raw: 0.5556 + 0.2857 + 0.2222 = 1.0635 (6.35% overround)
    const result = removeVig(1.80, 3.50, 4.50);
    expect(result.pHome + result.pDraw + result.pAway).toBeCloseTo(1.0, 6);
    expect(result.pHome).toBeCloseTo(0.5225, 2);
    expect(result.pDraw).toBeCloseTo(0.2687, 2);
    expect(result.pAway).toBeCloseTo(0.2089, 2);
  });

  it('each implied probability is between 0 and 1', () => {
    const result = removeVig(1.80, 3.50, 4.50);
    expect(result.pHome).toBeGreaterThan(0);
    expect(result.pHome).toBeLessThan(1);
    expect(result.pDraw).toBeGreaterThan(0);
    expect(result.pDraw).toBeLessThan(1);
    expect(result.pAway).toBeGreaterThan(0);
    expect(result.pAway).toBeLessThan(1);
  });

  it('handles equal odds (33/33/33)', () => {
    const result = removeVig(3.0, 3.0, 3.0);
    expect(result.pHome).toBeCloseTo(1 / 3, 6);
    expect(result.pDraw).toBeCloseTo(1 / 3, 6);
    expect(result.pAway).toBeCloseTo(1 / 3, 6);
  });

  it('handles heavy favorite', () => {
    // Home heavily favored
    const result = removeVig(1.10, 8.00, 21.00);
    expect(result.pHome).toBeGreaterThan(0.80);
    expect(result.pAway).toBeLessThan(0.06);
    expect(result.pHome + result.pDraw + result.pAway).toBeCloseTo(1.0, 6);
  });
});

describe('buildMarket', () => {
  const teamsMeta = {
    ARG: { nameEN: 'Argentina' },
    BRA: { nameEN: 'Brazil' },
    FRA: { nameEN: 'France' },
  };

  it('returns empty map for null/undefined input', () => {
    expect(buildMarket(null, teamsMeta).size).toBe(0);
    expect(buildMarket(undefined, teamsMeta).size).toBe(0);
    expect(buildMarket([], teamsMeta).size).toBe(0);
  });

  it('processes single bookmaker with h2h market', () => {
    const oddsData = [
      {
        id: 'arg-bra',
        home_team: 'Argentina',
        away_team: 'Brazil',
        bookmakers: [
          {
            key: 'unibet',
            markets: [
              {
                key: 'h2h',
                outcomes: [
                  { name: 'Argentina', price: 1.80 },
                  { name: 'Draw', price: 3.50 },
                  { name: 'Brazil', price: 4.50 },
                ],
              },
            ],
          },
        ],
      },
    ];

    const market = buildMarket(oddsData, teamsMeta);
    expect(market.size).toBe(1);

    const entry = market.get('ARG-BRA');
    expect(entry).toBeDefined();
    expect(entry.pHome + entry.pDraw + entry.pAway).toBeCloseTo(1.0, 4);
    expect(entry.bookmakers).toBe(1);
    expect(entry.homeCode).toBe('ARG');
    expect(entry.awayCode).toBe('BRA');
  });

  it('averages across multiple bookmakers', () => {
    const oddsData = [
      {
        id: 'arg-bra',
        home_team: 'Argentina',
        away_team: 'Brazil',
        bookmakers: [
          {
            key: 'unibet',
            markets: [
              {
                key: 'h2h',
                outcomes: [
                  { name: 'Argentina', price: 1.80 },
                  { name: 'Draw', price: 3.50 },
                  { name: 'Brazil', price: 4.50 },
                ],
              },
            ],
          },
          {
            key: 'bet365',
            markets: [
              {
                key: 'h2h',
                outcomes: [
                  { name: 'Argentina', price: 1.75 },
                  { name: 'Draw', price: 3.40 },
                  { name: 'Brazil', price: 4.75 },
                ],
              },
            ],
          },
        ],
      },
    ];

    const market = buildMarket(oddsData, teamsMeta);
    const entry = market.get('ARG-BRA');
    expect(entry.bookmakers).toBe(2);
    expect(entry.pHome + entry.pDraw + entry.pAway).toBeCloseTo(1.0, 4);
  });

  it('skips matches with unrecognized team names', () => {
    const oddsData = [
      {
        id: 'unknown-match',
        home_team: 'Unknown FC',
        away_team: 'Mystery United',
        bookmakers: [
          {
            key: 'unibet',
            markets: [
              {
                key: 'h2h',
                outcomes: [
                  { name: 'Unknown FC', price: 2.00 },
                  { name: 'Draw', price: 3.00 },
                  { name: 'Mystery United', price: 4.00 },
                ],
              },
            ],
          },
        ],
      },
    ];

    expect(buildMarket(oddsData, teamsMeta).size).toBe(0);
  });

  it('handles knockout matches without draw odds', () => {
    const oddsData = [
      {
        id: 'arg-fra',
        home_team: 'Argentina',
        away_team: 'France',
        bookmakers: [
          {
            key: 'unibet',
            markets: [
              {
                key: 'h2h',
                outcomes: [
                  { name: 'Argentina', price: 2.10 },
                  { name: 'France', price: 1.80 },
                ],
              },
            ],
          },
        ],
      },
    ];

    const market = buildMarket(oddsData, teamsMeta);
    const entry = market.get('ARG-FRA');
    expect(entry).toBeDefined();
    // Draw probability should be very small (oddsDraw = 99)
    expect(entry.pDraw).toBeLessThan(0.02);
    expect(entry.pHome + entry.pDraw + entry.pAway).toBeCloseTo(1.0, 4);
  });

  it('ignores non-h2h markets', () => {
    const oddsData = [
      {
        id: 'arg-bra',
        home_team: 'Argentina',
        away_team: 'Brazil',
        bookmakers: [
          {
            key: 'unibet',
            markets: [
              {
                key: 'totals',
                outcomes: [
                  { name: 'Over', price: 1.90 },
                  { name: 'Under', price: 1.90 },
                ],
              },
            ],
          },
        ],
      },
    ];

    expect(buildMarket(oddsData, teamsMeta).size).toBe(0);
  });
});
