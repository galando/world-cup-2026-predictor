import { describe, it, expect } from 'vitest';
import {
  getVenue,
  distanceBetween,
  computeFatigue,
  altitudeFactor,
  loadVenueDb,
} from '../lib/build-venue-db.js';

describe('getVenue', () => {
  it('returns venue by name from loaded data', () => {
    const venue = getVenue('Estadio Azteca');
    expect(venue).toBeDefined();
    expect(venue.city).toBe('Mexico City');
    expect(venue.country).toBe('MEX');
    expect(venue.altitude).toBe(2240);
  });

  it('returns null for unknown venue', () => {
    expect(getVenue('Nonexistent Stadium')).toBeNull();
  });
});

describe('distanceBetween (haversine)', () => {
  it('Vancouver to Mexico City ~4000km', () => {
    const vancouver = { latitude: 49.2768, longitude: -123.1120 };
    const mexicoCity = { latitude: 19.3022, longitude: -99.1506 };
    const dist = distanceBetween(vancouver, mexicoCity);
    // Approx 3900-4200 km
    expect(dist).toBeGreaterThan(3800);
    expect(dist).toBeLessThan(4300);
  });

  it('same point returns 0', () => {
    const venue = { latitude: 40.0, longitude: -74.0 };
    expect(distanceBetween(venue, venue)).toBeCloseTo(0, 0);
  });

  it('East Rutherford to Philadelphia ~130km', () => {
    const eRutherford = { latitude: 40.8131, longitude: -74.0742 };
    const philly = { latitude: 39.9008, longitude: -75.1674 };
    const dist = distanceBetween(eRutherford, philly);
    expect(dist).toBeGreaterThan(100);
    expect(dist).toBeLessThan(160);
  });
});

describe('computeFatigue', () => {
  it('no fatigue when 7+ days rest', () => {
    const fatigue = computeFatigue({ restDays: 7, travelKm: 3000 });
    expect(fatigue).toBe(1.0);
  });

  it('fatigue with 3 days rest and 3000km travel', () => {
    const fatigue = computeFatigue({ restDays: 3, travelKm: 3000 });
    // Should be < 1.0 (penalty)
    expect(fatigue).toBeLessThan(1.0);
    expect(fatigue).toBeGreaterThan(0.85);
  });

  it('no fatigue when no travel', () => {
    const fatigue = computeFatigue({ restDays: 3, travelKm: 0 });
    expect(fatigue).toBe(1.0);
  });

  it('mild fatigue for 4 days rest + 4000km', () => {
    const fatigue = computeFatigue({ restDays: 4, travelKm: 4000 });
    expect(fatigue).toBeLessThan(1.0);
    expect(fatigue).toBeGreaterThan(0.9);
  });

  it('heavy fatigue for 2 days rest + 4000km', () => {
    const fatigue = computeFatigue({ restDays: 2, travelKm: 4000 });
    expect(fatigue).toBeLessThan(0.95);
    expect(fatigue).toBeGreaterThan(0.8);
  });

  it('returns 1.0 for default/missing params', () => {
    expect(computeFatigue({})).toBe(1.0);
    expect(computeFatigue({ restDays: 10, travelKm: 100 })).toBe(1.0);
  });
});

describe('altitudeFactor', () => {
  it('no adjustment for sea-level venue', () => {
    const factor = altitudeFactor({ altitude: 30 }, 'ARG');
    expect(factor).toBe(1.0);
  });

  it('adjustment for Estadio Azteca (2240m) - non-host team', () => {
    const venue = { altitude: 2240 };
    const factor = altitudeFactor(venue, 'ARG');
    // Non-host at high altitude gets penalty (< 1.0 for away, or adjustment)
    expect(factor).not.toBe(1.0);
  });

  it('host nation gets smaller altitude penalty', () => {
    const venue = { altitude: 2240, country: 'MEX' };
    const hostFactor = altitudeFactor(venue, 'MEX');
    const nonHostFactor = altitudeFactor(venue, 'ARG');
    // Host acclimated, so penalty should be less
    expect(hostFactor).toBeGreaterThan(nonHostFactor);
  });

  it('no adjustment below 1500m', () => {
    const factor = altitudeFactor({ altitude: 1400 }, 'ARG');
    expect(factor).toBe(1.0);
  });

  it('returns 1.0 for missing venue', () => {
    expect(altitudeFactor(null, 'ARG')).toBe(1.0);
    expect(altitudeFactor(undefined, 'ARG')).toBe(1.0);
  });
});

describe('loadVenueDb', () => {
  it('loads venue database and returns array of venues', () => {
    const venues = loadVenueDb();
    expect(Array.isArray(venues)).toBe(true);
    expect(venues.length).toBe(16);
  });

  it('each venue has required fields', () => {
    const venues = loadVenueDb();
    for (const v of venues) {
      expect(v.name).toBeDefined();
      expect(v.city).toBeDefined();
      expect(v.country).toBeDefined();
      expect(typeof v.latitude).toBe('number');
      expect(typeof v.longitude).toBe('number');
      expect(typeof v.altitude).toBe('number');
      expect(typeof v.capacity).toBe('number');
    }
  });
});
