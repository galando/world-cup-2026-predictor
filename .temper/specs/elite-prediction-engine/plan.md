# Plan: Elite Prediction Engine (Phase 2)

## Overview

Transform the predictor from a solid amateur tool into a professional-grade system that rivals gambling services in accuracy while exceeding them in transparency and interactivity. The plan is organized into 4 workstreams with clear dependencies.

## Enhancement Assessment

Each proposed enhancement rated by impact, complexity, and data availability:

| # | Enhancement | Impact | Complexity | Data Source | Priority |
|---|------------|--------|------------|-------------|----------|
| 1 | Monte Carlo tournament sim | Very High | Medium | Internal (existing predictions) | Tier 1 |
| 2 | xG-based attack/defence | High | Medium | FBref scraping / manual CSV | Tier 1 |
| 3 | Qualifier form prior | High | Simple | Football-Data.org API (existing) | Tier 1 |
| 4 | Brier score + calibration | High | Simple | Internal (predictions + results) | Tier 1 |
| 5 | Scenario explorer (UI) | Very High | Medium | Internal (existing engine) | Tier 1 |
| 6 | Venue + travel fatigue | Medium | Medium | Static venue DB + distance calc | Tier 2 |
| 7 | Weather impact | Medium | Medium | Open-Meteo.com (free API) | Tier 2 |
| 8 | Head-to-head history | Medium | Simple | Manual CSV / scraping | Tier 2 |
| 9 | Squad valuation | Medium | Simple | Transfermarkt CSV snapshot | Tier 2 |
| 10 | Bayesian live updates | Low* | Complex | Pre-computed conditional tables | Tier 3 |
| 11 | Backtesting vs history | High | Medium | Historical World Cup data | Tier 3 |
| 12 | Referee statistics | Low | Simple | Manual CSV | Tier 3 |

*Low short-term impact; high differentiation value for user engagement.

## Architecture

### New Files

| File | Purpose |
|------|---------|
| `src/engine/monte-carlo.js` | Monte Carlo tournament simulation (10K runs). Shared engine module. |
| `scripts/lib/run-monte-carlo.js` | Build-time wrapper: runs MC sim, writes tournament-probs.json |
| `scripts/lib/fetch-qualifiers.js` | Fetch pre-tournament qualifying results from Football-Data.org |
| `scripts/lib/build-qualifier-form.js` | Compute attack/defence priors from qualifier data |
| `scripts/lib/fetch-xg.js` | Scrape or load xG data from FBref/Understat (cached) |
| `scripts/lib/build-venue-db.js` | Static venue database with coordinates, altitude, capacity |
| `scripts/lib/fetch-weather.js` | Fetch match-day weather from Open-Meteo.com (free, no key) |
| `scripts/lib/build-h2h.js` | Load and compute head-to-head historical records |
| `scripts/lib/fetch-squad-value.js` | Load Transfermarkt squad valuations (CSV snapshot) |
| `scripts/lib/build-calibration.js` | Compute Brier score, log-loss, calibration curve from finished matches |
| `scripts/__tests__/run-monte-carlo.test.js` | MC simulation tests |
| `scripts/__tests__/build-qualifier-form.test.js` | Qualifier prior tests |
| `scripts/__tests__/build-venue-db.test.js` | Venue distance/fatigue tests |
| `scripts/__tests__/build-calibration.test.js` | Brier score computation tests |
| `scripts/__tests__/build-h2h.test.js` | H2H adjustment tests |
| `scripts/data/venue-db.json` | Static venue data (48 World Cup venues) |
| `scripts/data/qualifier-results.json` | Cached qualifier match results |
| `scripts/data/h2h-historical.json` | Cached head-to-head records |
| `scripts/data/squad-values.json` | Squad market valuations snapshot |
| `src/components/ScenarioExplorer/index.jsx` | Interactive what-if scenario explorer UI |
| `src/components/CalibrationDashboard/index.jsx` | Brier score + calibration plot component |
| `src/components/TournamentProbs/index.jsx` | Per-team tournament win probability display |
| `src/screens/ScenarioScreen/index.jsx` | Full scenario explorer screen |

### Modified Files

| File | Change |
|------|--------|
| `src/engine/calibrate.js` | Add venue fatigue, altitude, H2H, squad value as optional lambda factors |
| `src/engine/poisson-dc.js` | No change (pure math) |
| `src/engine/knockout.js` | No change |
| `scripts/lib/run-predictions.js` | Accept venue/weather/h2h/squad maps; add new factors to chain |
| `scripts/lib/compute-teams.js` | Accept qualifier priors and xG data for enhanced attack/defence |
| `scripts/build-data.js` | Wire all new data fetchers and builders; add MC simulation step |
| `scripts/lib/write-artifacts.js` | Write tournament-probs.json, calibration.json (enhanced), venue-weather.json |
| `src/components/WhyPanel/index.jsx` | Render new factors (fatigue, altitude, H2H, squad value) |
| `src/screens/BracketScreen/index.jsx` | Add scenario explorer integration, tournament probability display |
| `src/screens/HomeScreen/index.jsx` | Add calibration dashboard link |
| `src/App.jsx` | Add /scenario route |
| `src/i18n/en.json` | New factor labels, scenario UI, calibration labels |
| `src/i18n/he.json` | Hebrew translations for new labels |
| `.github/workflows/update-data.yml` | Add weather fetch step, increase timeout for MC sim |

### Unchanged (safety check)

| File | Reason |
|------|--------|
| `src/engine/poisson-dc.js` | Pure math, no changes needed |
| `src/engine/knockout.js` | Uses lambda directly, no signature change |
| `scripts/lib/fetch-odds.js` | Already working, no changes needed |
| `scripts/lib/build-market.js` | Already working, no changes needed |
| `scripts/lib/build-suspensions.js` | Already working, no changes needed |
| `src/hooks/useData.js` | Generic fetcher, no changes needed |

## Data Flow

### Monte Carlo Pipeline (Tier 1, Highest Impact)

```
Existing predictions (per-match probs)
    |
    v
run-monte-carlo.js
    - Load group standings + bracket structure
    - For each simulation (N=10000):
        1. Sample each group match outcome from predicted probs
        2. Compute group standings -> advancing teams
        3. Resolve third-place teams per FIFA seeding table
        4. For each knockout round:
           a. Resolve bracket slots from previous round winners
           b. Sample match outcome from predicted probs
           c. If draw -> sample penalty winner (Elo-weighted)
        5. Record: which team reached which round
    - Aggregate: P(team reaches R16), P(QF), P(SF), P(Final), P(Win)
    |
    v
tournament-probs.json (public/data/)
    {
      "simulations": 10000,
      "teams": {
        "BRA": { "r16": 0.92, "qf": 0.71, "sf": 0.48, "final": 0.28, "win": 0.15 },
        ...
      },
      "confidence": {
        "mostLikelyFinal": { "teams": ["BRA","FRA"], "prob": 0.08 },
        "mostLikelyChampion": { "team": "FRA", "prob": 0.18 }
      }
    }
```

### Enhanced Attack/Defence Pipeline (Tier 1)

```
qualifier results (Football-Data.org)
    |
    v
fetch-qualifiers.js (cached, fetch once pre-tournament)
    |
    v
build-qualifier-form.js
    - Compute time-weighted attack/defence from qualifier matches
    - Same algorithm as computeAttackDefence but on qualifier data
    - Output: Map<team, { attack, defence, matches }>
    |
    v
compute-teams.js (MODIFIED)
    - When tournament matches < 3: use qualifier prior
    - When tournament matches >= 3: use tournament data (existing)
    - Blend qualifier + tournament when 1-2 tournament matches
    |
    v
xG data (FBref scraping or manual CSV)
    |
    v
fetch-xg.js (cached, fetch weekly pre-tournament)
    |
    v
compute-teams.js
    - Blend xG-based attack/defence with goal-based parameters
    - Weight: 30% xG, 70% actual goals (xG is more predictive per shot)
    - Only applies when xG data is available for the team
```

### Calibration Pipeline (Tier 1)

```
Finished matches + predictions
    |
    v
build-calibration.js
    - For each finished match:
        1. Get predicted P(home), P(draw), P(away)
        2. Get actual outcome (one-hot: [1,0,0] or [0,1,0] or [0,0,1])
        3. Compute Brier = mean((predicted - actual)^2)
        4. Compute log-loss = -sum(actual * log(predicted))
    - Calibration curve: bucket predictions into deciles, compare predicted vs actual
    - Output: calibration.json
    |
    v
public/data/calibration.json (ENHANCED)
    {
      "played": 15,
      "brier": { "overall": 0.582, "model": 0.601, "blended": 0.582 },
      "logLoss": 0.645,
      "winnerHit": 11,
      "exactHit": 3,
      "calibrationCurve": [
        { "bucket": "0.0-0.1", "predicted": 0.07, "actual": 0.05, "count": 12 },
        ...
      ],
      "perMatch": [
        { "matchId": "A-1", "predicted": [0.6, 0.2, 0.2], "actual": [1, 0, 0], "brier": 0.16 },
        ...
      ],
      "since": "2026-06-11"
    }
```

### Venue + Weather Pipeline (Tier 2)

```
scripts/data/venue-db.json (static, 48 venues)
    { "Estadio Azteca": { "lat": 19.3022, "lon": -99.1506, "altitude": 2240, "city": "Mexico City", "country": "MEX" } }
    |
    v
build-venue-db.js
    - Compute distance between consecutive venues per team
    - Compute rest days between matches
    - Apply fatigue model: fatigue = f(distance_km, rest_days)
    - Apply altitude model: altitude_factor = f(altitude_m, team_acclimation)
    |
    v
fetch-weather.js (Open-Meteo.com, free, no API key)
    - Fetch forecast for match date + venue coordinates
    - Temperature, humidity, wind speed
    - Cache with 6h staleness
    |
    v
run-predictions.js (MODIFIED)
    - Apply fatigue multiplier to lambda
    - Apply altitude adjustment for matches > 1500m
    - Apply weather adjustment for extreme heat (>35C) or cold (<5C)
    - Add factors to WhyPanel chain
```

### Scenario Explorer (Tier 1, Highest Differentiation)

```
React client-side only (no build-time dependency)
    |
    v
ScenarioExplorer component
    - Loads current predictions.json as base
    - User picks a match and overrides the result
    - Client re-runs:
        1. Group standings recomputation
        2. Third-place advancement re-selection
        3. Bracket re-resolution
    - Uses existing engine modules (imported in client)
    - Real-time update, no server round-trip
    |
    v
Display: updated standings + bracket + Monte Carlo percentages
```

### H2H + Squad Value Pipeline (Tier 2)

```
scripts/data/h2h-historical.json (static CSV -> JSON)
    { "BRA-ARG": { "matches": 15, "homeWins": 8, "draws": 3, "awayWins": 4 } }
    |
    v
build-h2h.js
    - Compute H2H adjustment: deviation from 33/33/33 baseline
    - Apply small weight (5%) to blend with model prediction
    - Only for teams with >= 3 historical meetings

scripts/data/squad-values.json (Transfermarkt snapshot)
    { "ENG": { "totalValueEur": 1200000000, "avgAge": 26.3, "squadSize": 26 } }
    |
    v
compute-teams.js (MODIFIED)
    - Squad value ratio -> supplementary lambda factor
    - Log-linear: ln(squadValueRatio) * weight
    - Small effect (teams with 5x value advantage get ~5% lambda boost)
```

## Diagram

### ASCII Art -- Full Architecture

```
+=====================================================================+
|                    DATA SOURCES (Build Time Only)                     |
+==================+==================+==================+=============+
| EXISTING         | TIER 1 NEW       | TIER 2 NEW       | TIER 3     |
|                  |                  |                   |            |
| eloratings.net   | Football-Data    | venue-db.json     | Open-Meteo |
| OpenFootball     | (qualifiers)     | (48 venues, lat/  | (weather)  |
| Football-Data    | FBref/Understat  |  lon, altitude)   |            |
| The Odds API     | (xG data)        | h2h-historical    |            |
|                  |                  | squad-values      |            |
+--------+---------+--------+---------+--------+----------+-----+-----+
         |                  |                  |               |
         v                  v                  v               v
+------------------+ +------------------+ +------------------+
| compute-teams.js | | build-qualifier- | | build-venue-db   |
| (MODIFIED)       | | form.js          | | (fatigue + dist) |
|                  | | (qualifier prior)| |                  |
| - Accept xG data | +--------+---------+ +--------+---------+
| - Accept qual.   |          |                    |          |
|   priors         |          v                    v          |
| - Accept squad $ | +------------------+ +------------------+ |
+--------+---------+ | run-predictions  | | fetch-weather.js | |
         |          | (MODIFIED)       | | (Open-Meteo)     | |
         |          |                  | +--------+---------+ |
         |          | - Fatigue factor |          |           |
         +--------->+ - Altitude factor|<---------+           |
                    | - H2H blend      |                       |
                    | - Weather adj.   |                       |
                    | - Squad value $  |                       |
                    +--------+---------+                       |
                             |                                 |
                    +--------v---------+                       |
                    | run-monte-carlo  |                       |
                    | (NEW)            |                       |
                    | 10,000 sims      |                       |
                    | P(champion), etc. |                       |
                    +--------+---------+                       |
                             |                                 |
                    +--------v---------+     +-----------------v---------+
                    | build-calibration|     | write-artifacts.js        |
                    | (NEW)            |     | (MODIFIED)                |
                    | Brier, log-loss  |     | + tournament-probs.json   |
                    | calibration curve|     | + calibration.json (enh.) |
                    +--------+---------+     | + venue-weather.json      |
                             |               +---------------------------+
                    +--------v---------+                 |
                    | public/data/     |                 v
                    | *.json (static)  |     +---------------------------+
                    +--------+---------+     | React PWA                 |
                             |               |                           |
                    +--------v---------+     | NEW: ScenarioExplorer     |
                    |                  |     | NEW: CalibrationDashboard |
                    | Client Engine    |     | NEW: TournamentProbs      |
                    | (imported from   |     | MOD: WhyPanel (new chains)|
                    |  src/engine/)    |     | MOD: BracketScreen        |
                    |                  |     +---------------------------+
                    +------------------+
```

## Key Design Decisions

### 1. Monte Carlo as build-time step, not client-side

Monte Carlo simulation is computationally expensive (10K runs with 104 matches each). Running it client-side would block the UI for seconds. Instead:
- Run at build time in CI
- Store results in `tournament-probs.json`
- Client only reads static results
- Scenario explorer re-runs a lightweight MC (1K sims) client-side only when user overrides a result

### 2. xG via manual CSV, not live scraping

FBref and Understat do not have official APIs. Scraping is fragile and may violate ToS. Instead:
- Use a manual CSV snapshot updated weekly before the tournament
- During the tournament, xG data is less needed (actual tournament data is available)
- CSV format: `team,xG_for_per_match,xG_against_per_match,matches,last_updated`

### 3. Qualifier data from existing Football-Data.org API

We already have a Football-Data.org API key. Their `/v4/teams/{id}/matches` endpoint provides historical match data including qualifiers. This avoids adding a new API dependency.

### 4. Venue data as static JSON

World Cup 2026 has 48 matches across ~16 venues in USA, Mexico, and Canada. These are known in advance. A static JSON file with coordinates, altitude, and capacity is simpler than any API.

### 5. Weather from Open-Meteo.com (free, no key)

Open-Meteo provides free weather forecasts with no API key required. Rate limit: 10K requests/day. With 48 matches and 6-hour caching, this uses ~8 requests per build -- well within limits.

### 6. All new lambda factors are optional with safe defaults

Following the established pattern from Phase 1 (suspensions, market blend), every new factor (fatigue, altitude, H2H, squad value, weather) is optional with neutral default (multiplier = 1.0). If data is missing, predictions are identical to the current model.

### 7. Scenario explorer uses client-side engine import

The prediction engine (`src/engine/`) is already shared between build scripts and React client. The scenario explorer imports `computeTeams`, `buildGrid`, `applyDixonColes` directly in the browser. No new server dependency.

## Implementation Phases

### Phase 2A: Core Infrastructure (Tier 1 -- before tournament)

1. Monte Carlo simulation engine
2. Qualifier form prior
3. Enhanced calibration (Brier score, per-match breakdown)
4. Scenario explorer UI

### Phase 2B: Enhanced Signals (Tier 2 -- during tournament)

5. Venue + travel fatigue model
6. Weather impact
7. Head-to-head history
8. Squad valuation

### Phase 2C: Advanced Features (Tier 3 -- post-tournament / v2)

9. xG integration (requires stable data source)
10. Bayesian live updates
11. Historical backtesting
12. Referee statistics

## Blast Radius

```
BLAST RADIUS -- elite-prediction-engine (Phase 2)

  Direct impact (Tier 1):
    src/engine/calibrate.js (MODIFY) -> used by 3 consumers
    scripts/lib/run-predictions.js (MODIFY) -> used by 1 consumer (build-data.js)
    scripts/lib/compute-teams.js (MODIFY) -> used by 1 consumer (build-data.js)
    scripts/build-data.js (MODIFY) -> used by 1 consumer (update-data.yml)
    scripts/lib/write-artifacts.js (MODIFY) -> used by 1 consumer (build-data.js)
    src/components/WhyPanel/index.jsx (MODIFY) -> used by PreMatchScreen
    src/screens/BracketScreen/index.jsx (MODIFY) -> 1 consumer
    src/App.jsx (MODIFY) -> router

  New files (Tier 1):
    src/engine/monte-carlo.js -> shared engine, used by build + scenario explorer
    scripts/lib/run-monte-carlo.js -> build-time only
    scripts/lib/build-calibration.js -> build-time only
    src/components/ScenarioExplorer/index.jsx -> client only
    src/components/CalibrationDashboard/index.jsx -> client only
    src/components/TournamentProbs/index.jsx -> client only

  Transitive impact:
    src/engine/poisson-dc.js -> no change (safe)
    src/engine/knockout.js -> no change (safe)
    src/engine/__tests__/*.test.js -> must pass unchanged
    src/hooks/useData.js -> no change (generic)

  Risk areas:
    Monte Carlo performance: 10K sims * 104 matches = ~1M Poisson grid computations
      Mitigation: Pre-compute lambda once per match pair, only sample outcomes
    Scenario explorer bundle size: Importing engine in client adds ~5KB gzipped
      Mitigation: Code-split with React.lazy
    Qualifier API rate limit: Football-Data.org = 48 calls/day
      Mitigation: Fetch all qualifiers in 1-2 calls, cache aggressively

  Architectural compliance:
    [OK] Fetcher pattern matches existing modules (cache + staleness guard)
    [OK] Build-module pattern (pure function, no side effects)
    [OK] WhyPanel factor chain pattern (key + label + mult) followed
    [OK] Shared engine pattern (works in Node + browser)
    [OK] All new parameters optional with safe defaults
```

## Risk Assessment

**Overall Risk: Medium**

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Monte Carlo too slow in CI | Low | High | Pre-compute lambda, only sample outcomes. Target: 30s for 10K sims |
| FBref/Understat ToS issues | Medium | Low | Use manual CSV snapshot, not automated scraping |
| Football-Data.org rate limit for qualifiers | Low | Medium | Fetch all qualifiers in 2 calls, cache for tournament duration |
| Weather API downtime | Low | Low | Cache + fallback (no weather adjustment) |
| Bundle size increase | Low | Medium | Code-split scenario explorer, lazy-load heavy components |
| Wrong venue data | Low | Medium | Use official FIFA venue list, validate coordinates |
| Scenario explorer UX confusion | Medium | Medium | Clear "What-If" badge, reset button, visual diff from real predictions |
