# Tasks: Elite Prediction Engine (Phase 2)

Tasks are ordered by dependency. Each task includes validation criteria and traces to Gherkin scenarios from intent.md.

---

## Tier 1 -- Must-Have (Before Tournament)

### Task 1 -- Create venue-db.json (static data) [SEQUENTIAL]
**File:** `scripts/data/venue-db.json`
**What:** Create a static JSON file with all 16 World Cup 2026 venues. Each entry has: name, city, country (ISO), latitude, longitude, altitude (meters), capacity.
**Data:** Use official FIFA venue list. Verify coordinates via Google Maps.
**Complexity:** Simple (data entry, no code)
**Validate:** File parses as valid JSON; all venues have lat/lon/altitude; spot-check 3 venues against known locations.
**Traced to:** Scenario: "Venue and travel fatigue applied"

### Task 2 -- Create build-venue-db.js [PARALLEL: with Task 1]
**File:** `scripts/lib/build-venue-db.js`
**What:** Load venue-db.json. Compute utility functions:
- `getVenue(name)` -> venue object
- `distanceBetween(venue1, venue2)` -> km (haversine formula)
- `computeFatigue(teamSchedule)` -> per-match fatigue multiplier based on rest days + travel distance from previous venue
- `altitudeFactor(venue, teamCountry)` -> adjustment for matches at altitude > 1500m (host nation teams get smaller penalty)
**Pattern:** Pure functions, no side effects. Similar to `compute-teams.js`.
**Complexity:** Medium
**Validate:** `npx vitest run scripts/__tests__/build-venue-db.test.js`
**Traced to:** Scenario: "Venue and travel fatigue applied"

### Task 3 -- Create build-venue-db.test.js [PARALLEL: with Task 2]
**File:** `scripts/__tests__/build-venue-db.test.js`
**What:** Test: haversine distance (Vancouver to Mexico City ~4000km); fatigue with 3 days rest + 3000km travel; altitude factor for Estadio Azteca (2240m); host nation altitude acclimation; no fatigue when 7+ days rest.
**Validate:** `npx vitest run scripts/__tests__/build-venue-db.test.js`
**Traced to:** Scenario: "Venue and travel fatigue applied"

### Task 4 -- Create monte-carlo.js (shared engine) [SEQUENTIAL: after Task 1]
**File:** `src/engine/monte-carlo.js`
**What:** Monte Carlo tournament simulation engine. Shared between build scripts and React client (scenario explorer).
- `simulateGroupStage(matchProbs, teamsMeta)` -> sample each match, compute standings, return advancing teams
- `simulateKnockout(bracket, matchProbs)` -> sample each knockout round, return champion
- `runTournamentSim(matchProbs, teamsMeta, bracket, seedingData, n=10000)` -> run N simulations, aggregate per-team round probabilities
- `sampleOutcome(probs)` -> sample from {home, draw, away} probabilities
- `samplePenaltyWinner(eloHome, eloAway)` -> weighted coin flip
**Performance:** Pre-compute match probabilities once. Per simulation: ~104 random samples + simple arithmetic. Target: 10K sims in < 30s in Node.js.
**Complexity:** Medium
**Validate:** `npx vitest run src/engine/__tests__/monte-carlo.test.js`
**Traced to:** Scenario: "Monte Carlo produces valid tournament probabilities", "Monte Carlo bracket handles third-place advancement"

### Task 5 -- Create monte-carlo.test.js [PARALLEL: with Task 4]
**File:** `src/engine/__tests__/monte-carlo.test.js`
**What:** Test: sampleOutcome returns valid result; sum of win probabilities across teams ~ 1.0; third-place advancement correctly selects 8 teams; deterministic with seeded RNG; knockout bracket resolves correctly; performance test (1K sims < 5s).
**Validate:** `npx vitest run src/engine/__tests__/monte-carlo.test.js`
**Traced to:** Scenario: "Monte Carlo produces valid tournament probabilities"

### Task 6 -- Create run-monte-carlo.js (build wrapper) [SEQUENTIAL: after Task 4]
**File:** `scripts/lib/run-monte-carlo.js`
**What:** Build-time wrapper that:
1. Loads existing predictions, teams, matches, standings, bracket, seeding
2. Calls `runTournamentSim()` with 10,000 simulations
3. Returns tournament-probs object for write-artifacts
**Complexity:** Simple
**Validate:** `node -e "import('./scripts/lib/run-monte-carlo.js').then(m => console.log('OK'))"` -- imports successfully
**Traced to:** Scenario: "Build time stays within budget"

### Task 7 -- Create fetch-qualifiers.js [PARALLEL: with Task 4]
**File:** `scripts/lib/fetch-qualifiers.js`
**What:** Fetch qualifying campaign results from Football-Data.org API for all qualified teams. Uses existing FD_API_KEY.
- Fetch `/v4/teams/{id}/matches?status=FINISHED&limit=15` for each qualified team
- Cache results in `scripts/data/qualifier-results.json`
- Staleness guard: fetch once pre-tournament, then never again
**Pattern:** Follow `fetch-results.js` pattern (cache + staleness + fallback).
**Complexity:** Medium (API rate limiting: 6.5s between requests, ~48 teams)
**Validate:** After fetch, `scripts/data/qualifier-results.json` contains data for qualified teams
**Traced to:** Scenario: "Qualifier form provides pre-tournament prior"

### Task 8 -- Create build-qualifier-form.js [SEQUENTIAL: after Task 7]
**File:** `scripts/lib/build-qualifier-form.js`
**What:** Compute attack/defence priors from qualifier data.
- Parse qualifier results into {team, goalsFor, goalsAgainst, date} format
- Reuse `computeAttackDefence()` from calibrate.js
- Output: Map<team, { attack, defence, matches }>
**Pattern:** Pure function, takes qualifier data + eloMap, returns prior map.
**Complexity:** Simple
**Validate:** `npx vitest run scripts/__tests__/build-qualifier-form.test.js`
**Traced to:** Scenario: "Qualifier form provides pre-tournament prior"

### Task 9 -- Create build-qualifier-form.test.js [PARALLEL: with Task 8]
**File:** `scripts/__tests__/build-qualifier-form.test.js`
**What:** Test: 0 qualifier matches -> Elo prior; 5 matches -> data-based prior; blend weight with tournament data; time decay applies.
**Validate:** `npx vitest run scripts/__tests__/build-qualifier-form.test.js`
**Traced to:** Scenario: "Qualifier form provides pre-tournament prior"

### Task 10 -- Modify compute-teams.js: accept qualifier priors [SEQUENTIAL: after Task 8]
**File:** `scripts/lib/compute-teams.js`
**What:**
1. Accept optional `qualifierPriors` map (from build-qualifier-form)
2. When team has 0 tournament matches: use qualifier prior (not Elo-only)
3. When team has 1-2 tournament matches: blend qualifier + tournament
4. When team has 3+ tournament matches: use tournament data only (existing behavior)
**Backward compatibility:** `qualifierPriors` parameter is optional. Default = empty map = no change.
**Complexity:** Simple
**Validate:** `npx vitest run scripts/__tests__/build-data.test.js` -- existing tests pass; new test with qualifier priors
**Traced to:** Scenario: "Qualifier form provides pre-tournament prior", "Existing predictions unchanged for default parameters"

### Task 11 -- Create build-calibration.js [PARALLEL: with Task 4]
**File:** `scripts/lib/build-calibration.js`
**What:** Enhanced calibration computation.
- Brier score: `mean((p_predicted - p_actual)^2)` across all finished matches
- Brier for model-only vs blended (to measure market blend value)
- Log-loss: `-mean(sum(actual * log(predicted)))`
- Calibration curve: bucket predictions into 10 bins, compare predicted rate vs actual rate
- Per-match breakdown
- Winner hit rate, exact scoreline hit rate
**Pattern:** Pure function, takes predictions + finished matches, returns calibration object.
**Complexity:** Simple
**Validate:** `npx vitest run scripts/__tests__/build-calibration.test.js`
**Traced to:** Scenario: "Brier score tracks accuracy on finished matches"

### Task 12 -- Create build-calibration.test.js [PARALLEL: with Task 11]
**File:** `scripts/__tests__/build-calibration.test.js`
**What:** Test: 0 matches -> empty calibration; 1 match home win -> Brier = (1-0.6)^2 + (0-0.2)^2 + (0-0.2)^2; calibration curve bins; log-loss computation.
**Validate:** `npx vitest run scripts/__tests__/build-calibration.test.js`
**Traced to:** Scenario: "Brier score tracks accuracy on finished matches"

### Task 13 -- Modify calibrate.js: add venue/fatigue/altitude factors [SEQUENTIAL: after Task 2]
**File:** `src/engine/calibrate.js`
**What:** Add optional parameters to `getTeamLambda()`:
- `fatigueMult` (default 1.0) -- fatigue from travel/rest
- `altitudeMult` (default 1.0) -- altitude adjustment
- `h2hMult` (default 1.0) -- head-to-head adjustment
- `squadValueMult` (default 1.0) -- squad valuation adjustment
All applied multiplicatively: `lambda *= fatigueMult * altitudeMult * h2hMult * squadValueMult`
**Backward compatibility:** All new params optional with default 1.0.
**Complexity:** Simple
**Validate:** `npx vitest run src/engine/__tests__/calibrate.test.js` -- existing tests pass unchanged
**Traced to:** Scenario: "Venue and travel fatigue applied", "Existing predictions unchanged for default parameters"

### Task 14 -- Modify run-predictions.js: integrate all new factors [SEQUENTIAL: after Tasks 10, 13]
**File:** `scripts/lib/run-predictions.js`
**What:**
1. Accept new optional maps: `venueMap`, `fatigueMap`, `weatherMap`, `h2hMap`, `squadValueMap`
2. In `computeLambda()`: apply fatigue, altitude, H2H, squad value multipliers
3. In `buildFactorChain()`: add new factors to the chain for WhyPanel
4. If any map is empty/missing: factor defaults to 1.0 (no effect)
**Complexity:** Medium
**Validate:** `node scripts/build-data.js` completes; predictions unchanged when no new maps provided
**Traced to:** Scenario: "Venue and travel fatigue applied", "Existing predictions unchanged for default parameters"

### Task 15 -- Modify build-data.js: wire Tier 1 new steps [SEQUENTIAL: after Tasks 6, 10, 14]
**File:** `scripts/build-data.js`
**What:**
1. Add step: fetch-qualifiers (if FD_API_KEY available)
2. Add step: build-qualifier-form -> qualifier priors map
3. Pass qualifier priors to computeTeams()
4. Add step: run-monte-carlo -> tournament probabilities
5. Add step: build-calibration -> enhanced calibration
6. Pass tournament probs and enhanced calibration to writeArtifacts()
7. All new steps graceful -- failure = warning, not crash
**Complexity:** Medium
**Validate:** `node scripts/build-data.js` completes with and without new data sources
**Traced to:** Scenario: "Monte Carlo produces valid tournament probabilities", "Build time stays within budget"

### Task 16 -- Modify write-artifacts.js: write new outputs [SEQUENTIAL: after Task 15]
**File:** `scripts/lib/write-artifacts.js`
**What:**
1. Write `public/data/tournament-probs.json` from Monte Carlo results
2. Replace `public/data/calibration.json` with enhanced version (Brier, log-loss, per-match, curve)
**Complexity:** Simple
**Validate:** After build, both files exist and are valid JSON
**Traced to:** Scenario: "Monte Carlo produces valid tournament probabilities", "Brier score tracks accuracy on finished matches"

### Task 17 -- Create TournamentProbs component [SEQUENTIAL: after Task 16]
**File:** `src/components/TournamentProbs/index.jsx`
**What:** Display per-team tournament win probabilities from tournament-probs.json.
- Table with columns: Team, R16%, QF%, SF%, Final%, Win%
- Sortable by any column
- Color-coded probability bars
- "Most Likely Champion" highlight
**Complexity:** Medium (UI component)
**Validate:** `npm run build` succeeds; manual: component renders with tournament data
**Traced to:** Scenario: "Monte Carlo produces valid tournament probabilities"

### Task 18 -- Create CalibrationDashboard component [SEQUENTIAL: after Task 16]
**File:** `src/components/CalibrationDashboard/index.jsx`
**What:** Display prediction accuracy metrics from enhanced calibration.json.
- Brier score (overall, model-only, blended)
- Log-loss
- Winner hit rate
- Calibration curve (SVG or simple bar chart)
- Per-match breakdown (collapsible)
**Complexity:** Medium (UI + simple SVG chart)
**Validate:** `npm run build` succeeds; manual: component renders with calibration data
**Traced to:** Scenario: "Brier score tracks accuracy on finished matches"

### Task 19 -- Create ScenarioExplorer component [SEQUENTIAL: after Task 4]
**File:** `src/components/ScenarioExplorer/index.jsx`
**What:** Interactive what-if scenario explorer.
- Display all group matches as selectable cards
- User clicks a match -> picks a result override (home win, draw, away win, or specific score)
- Re-compute group standings client-side using existing engine
- Show updated standings alongside real standings
- Show bracket impact (which teams advance)
- Reset button to clear overrides
- "What-If" badge to clearly distinguish from real predictions
**Implementation:** Import `computeTeams`, group-standing logic from existing modules. Run lightweight MC (1K sims) in a web worker for tournament probabilities.
**Complexity:** Complex (interactive UI + client-side computation)
**Validate:** Manual: override a match result, verify standings update in real-time
**Traced to:** Scenario: "Scenario explorer updates standings in real-time"

### Task 20 -- Create ScenarioScreen and wire routing [SEQUENTIAL: after Task 19]
**Files:** `src/screens/ScenarioScreen/index.jsx`, `src/App.jsx`
**What:** Create dedicated screen for scenario explorer. Add route to App.jsx. Add navigation link from BracketScreen.
**Complexity:** Simple
**Validate:** `npm run build` succeeds; navigation to /scenario works
**Traced to:** Scenario: "Scenario explorer updates standings in real-time"

### Task 21 -- Update WhyPanel for new factor chains [SEQUENTIAL: after Task 14]
**File:** `src/components/WhyPanel/index.jsx`
**What:** Add i18n labels and rendering for new factors: fatigue, altitude, h2h, squadValue. WhyPanel already renders chain items generically -- just needs i18n keys added.
**Complexity:** Simple
**Validate:** `npm run build` succeeds
**Traced to:** Scenario: "Venue and travel fatigue applied"

### Task 22 -- Update i18n files [PARALLEL: with Task 21]
**Files:** `src/i18n/en.json`, `src/i18n/he.json`
**What:** Add translation keys for:
- `factor.fatigue`, `factor.altitude`, `factor.h2h`, `factor.squadValue`
- `scenario.title`, `scenario.reset`, `scenario.override`, `scenario.whatIf`
- `calibration.title`, `calibration.brier`, `calibration.logLoss`, `calibration.hitRate`
- `tournament.title`, `tournament.probR16`, etc.
**Complexity:** Simple
**Validate:** `npm run build` succeeds; no missing key warnings
**Traced to:** Infrastructure

### Task 23 -- End-to-end validation (Tier 1) [SEQUENTIAL: after all Tier 1 tasks]
**What:**
1. `npx vitest run` -- all tests pass (existing + new)
2. `node scripts/build-data.js` -- completes with Monte Carlo output
3. `npm run build` -- Vite build succeeds
4. Verify `public/data/tournament-probs.json` -- sum of win probs = 1.0 (+/- 0.02)
5. Verify `public/data/calibration.json` -- enhanced format
6. Run manual scenario explorer test
**Validate:** All checks pass
**Traced to:** All Tier 1 scenarios

---

## Tier 2 -- Should-Have (During Tournament)

### Task 24 -- Create fetch-weather.js [PARALLEL: with any Tier 2 task]
**File:** `scripts/lib/fetch-weather.js`
**What:** Fetch match-day weather from Open-Meteo.com (free, no API key).
- For each upcoming match (within 7 days), fetch temperature, humidity, wind speed
- Cache with 6-hour staleness
- API: `https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&daily=temperature_2m_max,relative_humidity_2m_mean&timezone=auto`
**Complexity:** Simple
**Validate:** Returns weather data for venue coordinates
**Traced to:** Scenario: "Weather/altitude adjustment applied"

### Task 25 -- Create build-h2h.js + h2h data [PARALLEL: with any Tier 2 task]
**File:** `scripts/lib/build-h2h.js`, `scripts/data/h2h-historical.json`
**What:** Load head-to-head historical records (static CSV snapshot). Compute H2H adjustment per team pair.
- Load `h2h-historical.json` (manually compiled from FIFA/UEFA databases)
- For each pair: compute deviation from balanced (33/33/33)
- Apply 5% weight to blend with model prediction
- Only for pairs with >= 3 historical meetings
**Complexity:** Simple
**Validate:** `npx vitest run scripts/__tests__/build-h2h.test.js`
**Traced to:** Scenario: "Head-to-head history blended"

### Task 26 -- Create fetch-squad-value.js + squad data [PARALLEL: with any Tier 2 task]
**File:** `scripts/lib/fetch-squad-value.js`, `scripts/data/squad-values.json`
**What:** Load Transfermarkt squad valuations (static CSV snapshot updated before tournament).
- Compute log-ratio of squad values between teams
- Apply small lambda multiplier (teams with 5x value get ~5% boost)
- Squad value is a supplementary signal, not primary
**Complexity:** Simple
**Validate:** Squad value ratio produces reasonable lambda adjustments
**Traced to:** Scenario: "Squad valuation supplements strength"

### Task 27 -- Wire Tier 2 factors into build pipeline [SEQUENTIAL: after Tasks 24, 25, 26, 14]
**File:** `scripts/build-data.js`, `scripts/lib/run-predictions.js`
**What:** Add steps for weather fetch, H2H loading, squad value loading. Pass new maps to runPredictions(). Apply factors in lambda computation.
**Complexity:** Medium
**Validate:** `node scripts/build-data.js` -- completes with all Tier 2 factors applied
**Traced to:** All Tier 2 scenarios

### Task 28 -- End-to-end validation (Tier 2) [SEQUENTIAL: after Task 27]
**What:** Full build + verify all Tier 2 factors visible in prediction output and WhyPanel.
**Validate:** All checks pass
**Traced to:** All Tier 2 scenarios

---

## Tier 3 -- Nice-to-Have (Post-Tournament / v2)

### Task 29 -- xG integration [DEPENDS ON: stable xG data source]
**File:** `scripts/lib/fetch-xg.js`
**What:** Load xG data from FBref/Understat. Blend xG-based attack/defence with goal-based parameters.
**Complexity:** Medium (data acquisition is the hard part)
**Traced to:** Scenario: "xG data supplements sparse tournament data"

### Task 30 -- Bayesian live updates [DEPENDS ON: Task 4]
**File:** `src/engine/bayesian-live.js`
**What:** Pre-compute conditional probability tables. Given current score and minute, update win/draw/away probabilities in real-time.
**Complexity:** Complex
**Traced to:** Scenario: "Bayesian updating during matches"

### Task 31 -- Historical backtesting [DEPENDS ON: historical data]
**File:** `scripts/lib/backtest.js`
**What:** Run the model retroactively on 2018 and 2022 World Cup data. Compare Brier score to bookmaker accuracy.
**Complexity:** Medium
**Traced to:** Scenario: "Backtesting against historical World Cups"

### Task 32 -- Referee statistics [DEPENDS ON: referee data]
**File:** `scripts/data/referee-stats.json`
**What:** Load referee assignment data and tendency statistics. Adjust card/suspension risk.
**Complexity:** Simple (data entry)
**Traced to:** Scenario: "Referee statistics"

---

## Dependency Graph

```
Tier 1:
  Task 1 (venue DB) ─────────┐
  Task 2 (venue calc) ───────┤
  Task 3 (venue tests) ──────┤
                              ├─> Task 13 (calibrate factors) ─┐
  Task 4 (MC engine) ────────┤                                  │
  Task 5 (MC tests) ─────────┤                                  │
  Task 6 (MC build wrapper) ─┤                                  ├─> Task 14 (run-pred mods) ─> Task 15 (build-data) ─> Task 16 (write-art)
  Task 7 (fetch qualifiers) ─┤                                  │                                                         │
  Task 8 (qualifier form) ───┤─> Task 10 (compute-teams mod) ──┘                                                         │
  Task 9 (qualifier tests) ──┤                                                                                           │
  Task 11 (calibration) ─────┤                                                                                           │
  Task 12 (calibration test) ┘                                                                                           │
                                                                                                                         │
  Task 17 (TournamentProbs UI) <── Task 16 ──────────────────────────────────────────────────────────────────────────────┘
  Task 18 (CalibrationDash UI) <── Task 16
  Task 19 (ScenarioExplorer)  <── Task 4
  Task 20 (ScenarioScreen)    <── Task 19
  Task 21 (WhyPanel update)   <── Task 14
  Task 22 (i18n)              -- parallel
  Task 23 (E2E validation)    <── ALL Tier 1

Tier 2:
  Task 24 (weather)   ──┐
  Task 25 (H2H)       ──┼──> Task 27 (wire Tier 2) ──> Task 28 (E2E Tier 2)
  Task 26 (squad val) ──┘

Tier 3:
  Task 29 (xG)          -- standalone
  Task 30 (Bayesian)    -- depends on Task 4
  Task 31 (backtest)    -- standalone
  Task 32 (referee)     -- standalone
```

## Estimated Effort

| Phase | Tasks | Estimated Hours |
|-------|-------|----------------|
| Tier 1 | Tasks 1-23 | 40-60 hours |
| Tier 2 | Tasks 24-28 | 12-16 hours |
| Tier 3 | Tasks 29-32 | 16-24 hours |
| **Total** | **32 tasks** | **68-100 hours** |
