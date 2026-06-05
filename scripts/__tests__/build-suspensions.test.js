import { describe, it, expect } from 'vitest';
import { buildSuspensions } from '../lib/build-suspensions.js';

describe('buildSuspensions', () => {
  it('returns empty map when no finished matches', () => {
    const matches = [
      { matchId: 'A-1', homeTeam: 'ARG', awayTeam: 'BRA', status: 'SCHEDULED', score: null, date: '2026-06-11' },
    ];
    expect(buildSuspensions(matches).size).toBe(0);
  });

  it('returns empty map when no cards in finished matches', () => {
    const matches = [
      {
        matchId: 'A-1', homeTeam: 'ARG', awayTeam: 'BRA',
        status: 'FINISHED', score: { home: 2, away: 1 }, date: '2026-06-11',
        cards: [{ team: 'ARG', type: 'yellow' }],
      },
    ];
    const suspensions = buildSuspensions(matches);
    expect(suspensions.size).toBe(0);
  });

  it('detects red card and applies 0.92 multiplier', () => {
    const matches = [
      {
        matchId: 'A-1', homeTeam: 'ARG', awayTeam: 'BRA',
        status: 'FINISHED', score: { home: 2, away: 1 }, date: '2026-06-11',
        cards: [{ team: 'ARG', type: 'red' }],
      },
    ];
    const suspensions = buildSuspensions(matches);
    expect(suspensions.has('ARG')).toBe(true);
    expect(suspensions.get('ARG').availabilityMult).toBeCloseTo(0.92, 4);
    expect(suspensions.get('ARG').reason).toContain('red_card_suspension');
  });

  it('detects second yellow as red card', () => {
    const matches = [
      {
        matchId: 'A-1', homeTeam: 'ARG', awayTeam: 'BRA',
        status: 'FINISHED', score: { home: 2, away: 1 }, date: '2026-06-11',
        cards: [{ team: 'ARG', type: 'second_yellow' }],
      },
    ];
    const suspensions = buildSuspensions(matches);
    expect(suspensions.has('ARG')).toBe(true);
    expect(suspensions.get('ARG').availabilityMult).toBeCloseTo(0.92, 4);
  });

  it('applies cumulative penalty for multiple red cards', () => {
    const matches = [
      {
        matchId: 'A-1', homeTeam: 'ARG', awayTeam: 'BRA',
        status: 'FINISHED', score: { home: 2, away: 1 }, date: '2026-06-11',
        cards: [
          { team: 'ARG', type: 'red' },
          { team: 'ARG', type: 'red' },
        ],
      },
    ];
    const suspensions = buildSuspensions(matches);
    // 0.92^2 = 0.8464
    expect(suspensions.get('ARG').availabilityMult).toBeCloseTo(0.8464, 3);
  });

  it('detects red card for away team', () => {
    const matches = [
      {
        matchId: 'A-1', homeTeam: 'ARG', awayTeam: 'BRA',
        status: 'FINISHED', score: { home: 2, away: 1 }, date: '2026-06-11',
        cards: [{ team: 'BRA', type: 'red' }],
      },
    ];
    const suspensions = buildSuspensions(matches);
    expect(suspensions.has('BRA')).toBe(true);
    expect(suspensions.has('ARG')).toBe(false);
    expect(suspensions.get('BRA').availabilityMult).toBeCloseTo(0.92, 4);
  });

  it('only checks most recent match per team', () => {
    const matches = [
      {
        matchId: 'A-1', homeTeam: 'ARG', awayTeam: 'BRA',
        status: 'FINISHED', score: { home: 2, away: 1 }, date: '2026-06-11',
        cards: [{ team: 'ARG', type: 'red' }],
      },
      {
        matchId: 'A-3', homeTeam: 'ARG', awayTeam: 'FRA',
        status: 'FINISHED', score: { home: 1, away: 0 }, date: '2026-06-15',
        cards: [],
      },
    ];
    // ARG's most recent match (A-3) has no red card, so no suspension
    const suspensions = buildSuspensions(matches);
    expect(suspensions.has('ARG')).toBe(false);
  });

  it('returns empty map for null/undefined input', () => {
    expect(buildSuspensions(null).size).toBe(0);
    expect(buildSuspensions(undefined).size).toBe(0);
  });

  it('handles matches without cards field', () => {
    const matches = [
      {
        matchId: 'A-1', homeTeam: 'ARG', awayTeam: 'BRA',
        status: 'FINISHED', score: { home: 2, away: 1 }, date: '2026-06-11',
      },
    ];
    const suspensions = buildSuspensions(matches);
    expect(suspensions.size).toBe(0);
  });
});
