/**
 * Venue database utilities for World Cup 2026.
 * Provides distance, fatigue, and altitude computations.
 * Pure functions, no side effects.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VENUE_FILE = join(__dirname, '..', 'data', 'venue-db.json');

/** Earth radius in km for haversine formula */
const EARTH_RADIUS_KM = 6371;

/** Host nations get altitude acclimation benefit */
const HOST_NATIONS = new Set(['MEX', 'USA', 'CAN']);

/**
 * Load venue database from static JSON file.
 * Returns array of venue objects.
 */
export function loadVenueDb() {
  const data = JSON.parse(readFileSync(VENUE_FILE, 'utf8'));
  return data.venues;
}

// Lazy-loaded venue lookup map
let _venueMap = null;

function getVenueMap() {
  if (!_venueMap) {
    const venues = loadVenueDb();
    _venueMap = new Map(venues.map(v => [v.name, v]));
  }
  return _venueMap;
}

/**
 * Get venue by name.
 * @param {string} name - Venue name
 * @returns {Object|null} Venue object or null if not found
 */
export function getVenue(name) {
  if (!name) return null;
  return getVenueMap().get(name) || null;
}

/**
 * Compute distance between two points using haversine formula.
 * @param {{ latitude: number, longitude: number }} a - Point A
 * @param {{ latitude: number, longitude: number }} b - Point B
 * @returns {number} Distance in km
 */
export function distanceBetween(a, b) {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinDLon * sinDLon;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Compute fatigue multiplier based on rest days and travel distance.
 * Returns 1.0 (no effect) when well-rested or no travel.
 *
 * Model: fatigue penalty increases with travel distance and decreases with rest.
 * - No penalty when restDays >= 7 or travelKm < 500
 * - Penalty scale: max 8% for extreme cases (2 days rest, 5000km+)
 *
 * @param {{ restDays?: number, travelKm?: number }} schedule
 * @returns {number} Fatigue multiplier (1.0 = no penalty, < 1.0 = penalty)
 */
export function computeFatigue({ restDays = 7, travelKm = 0 } = {}) {
  if (restDays >= 7 || travelKm < 500) return 1.0;

  // Penalty increases with distance and decreases with rest
  // Normalize: max distance ~5000km, min rest ~2 days
  const distFactor = Math.min(travelKm / 5000, 1.0);
  const restFactor = (7 - restDays) / 5; // 0 at 7 days, 1.0 at 2 days

  // Max penalty: ~8% for extreme cases
  const penalty = 0.08 * distFactor * restFactor;
  return 1.0 - penalty;
}

/**
 * Compute altitude adjustment factor for a match.
 * High altitude (>1500m) penalizes non-acclimated teams.
 * Host nation teams from the same country get smaller penalty.
 *
 * @param {{ altitude?: number }|null} venue - Venue object with altitude in meters
 * @param {string} teamCountry - Team country ISO code
 * @returns {number} Altitude multiplier (1.0 = no adjustment)
 */
export function altitudeFactor(venue, teamCountry) {
  if (!venue || !venue.altitude || venue.altitude <= 1500) return 1.0;

  // Altitude effect: starts at 1500m, scales to max at 2500m+
  const altAboveThreshold = venue.altitude - 1500;
  const maxEffect = 1000; // 2500m - 1500m
  const normalizedEffect = Math.min(altAboveThreshold / maxEffect, 1.0);

  // Max penalty: ~5% lambda reduction at extreme altitude for non-acclimated teams
  const basePenalty = 0.05 * normalizedEffect;

  // Host nations from same country get 70% reduction in penalty
  const isHostFromCountry = HOST_NATIONS.has(teamCountry) && venue.country === teamCountry;
  const penalty = isHostFromCountry ? basePenalty * 0.3 : basePenalty;

  return 1.0 - penalty;
}

/**
 * Convert degrees to radians.
 */
function toRad(deg) {
  return deg * (Math.PI / 180);
}
