# Tasks: Data Accuracy Upgrade (Phase 1)

## Task 1 -- Create fetch-odds.js [SEQUENTIAL]
**File:** `scripts/lib/fetch-odds.js`
**What:** Fetch h2h decimal odds from The Odds API for `soccer_fifa_world_cup`. Cache to `scripts/cache/odds.json` with 4-hour staleness guard. Graceful fallback to cached file on failure.
**Pattern:** Follow `fetch-elo.js` pattern (staleness check -> fetch -> parse -> write cache).
**API:** `GET https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds/?apiKey={KEY}&regions=eu&markets=h2h&oddsFormat=decimal`
**Validate:** `node -e "import('./scripts/lib/fetch-odds.js').then(m => m.fetchOdds('test_key').then(console.log))"` -- logs fetched data or cached fallback
**Traced to:** Scenario: "Odds fetched and blended into prediction", "Odds API failure -- cached fallback used", "Staleness guard skips unnecessary API calls"

## Task 2 -- Create build-market.js [SEQUENTIAL: after Task 1]
**File:** `scripts/lib/build-market.js`
**What:** Convert raw odds API response to implied probabilities per match. Vig removal (1/odds / sum(1/odds)). Match bookmaker team names to team codes via teams-meta.json. Average across bookmakers. Output: `Map<matchId, { pHome, pDraw, pAway, bookmakers: number }>`
**Pattern:** Pure function, no side effects, similar to `computeTeams()`.
**Validate:** `npx vitest run scripts/__tests__/build-market.test.js`
**Traced to:** Scenario: "Vig removal produces valid implied probabilities", "Odds fetched and blended into prediction"

## Task 3 -- Create build-market.test.js [PARALLEL: with Task 2]
**File:** `scripts/__tests__/build-market.test.js`
**What:** Test vig removal (probs sum to 1), edge cases (single bookmaker, no odds, odds with different team names), average across bookmakers.
**Validate:** `npx vitest run scripts/__tests__/build-market.test.js`
**Traced to:** Scenario: "Vig removal produces valid implied probabilities"

## Task 4 -- Create build-suspensions.js [PARALLEL: with Task 2]
**File:** `scripts/lib/build-suspensions.js`
**What:** Scan finished matches for red card events. Build suspension map: `Map<teamCode, { availabilityMult: number, reason: string }>`. Simplified model: team had red card in previous match -> 0.92, else 1.0.
**Pattern:** Pure function, takes matches array, returns map.
**Validate:** `npx vitest run scripts/__tests__/build-suspensions.test.js`
**Traced to:** Scenario: "Suspension reduces team lambda", "No suspensions -- availabilityMult is 1.0"

## Task 5 -- Create build-suspensions.test.js [PARALLEL: with Task 4]
**File:** `scripts/__tests__/build-suspensions.test.js`
**What:** Test: no finished matches -> empty map; match with red card -> 0.92; multiple reds same team -> cumulative; red card for away team.
**Validate:** `npx vitest run scripts/__tests__/build-suspensions.test.js`
**Traced to:** Scenario: "Suspension reduces team lambda"

## Task 6 -- Modify calibrate.js: add optional availabilityMult [SEQUENTIAL: after Task 4]
**File:** `src/engine/calibrate.js`
**What:** Add optional `availabilityMult` parameter to `getTeamLambda()`. Default value 1.0. Applied multiplicatively: `lambda *= availabilityMult`. No change to function signature for existing callers.
**Validate:** `npx vitest run src/engine/__tests__/calibrate.test.js` -- all existing tests pass unchanged
**Traced to:** Scenario: "Existing engine tests pass without modification", "Suspension reduces team lambda"

## Task 7 -- Modify run-predictions.js: integrate suspension + market blend [SEQUENTIAL: after Task 6]
**File:** `scripts/lib/run-predictions.js`
**What:**
  1. Accept suspension map and market map as new parameters
  2. Apply availabilityMult in computeLambda (lambda *= suspension map value)
  3. Add suspension factor to buildFactorChain
  4. Post-process: blend model probs with market implied probs (w_market = 0.25)
  5. Add `market` field to prediction object (blend weights, implied probs)
  6. If no market data for match: skip blend, no market field
**Validate:** `node scripts/build-data.js` completes; spot-check prediction JSON for market field
**Traced to:** Scenario: "Odds fetched and blended into prediction", "No odds available -- fallback to model-only", "Suspension reduces team lambda"

## Task 8 -- Modify write-artifacts.js: add market.json [SEQUENTIAL: after Task 7]
**File:** `scripts/lib/write-artifacts.js`
**What:**
  1. Write `public/data/market.json` containing implied probabilities per match (no raw odds)
  2. Update calibration computation to use blended probabilities when available
  3. Log blend comparison stats (model-only Brier vs blended Brier)
**Validate:** After build, `ls public/data/market.json` exists; `cat public/data/market.json` has no raw odds
**Traced to:** Scenario: "Calibration stats computed on blended predictions", "Market data not shipped as raw odds"

## Task 9 -- Modify build-data.js: wire new steps [SEQUENTIAL: after Task 8]
**File:** `scripts/build-data.js`
**What:**
  1. Add Step 5.5: fetch-odds (with ODDS_API_KEY env var)
  2. Add Step 5.6: build-market (odds -> implied P)
  3. Add Step 6.5: build-suspensions (red cards -> suspension map)
  4. Pass suspension map and market map to runPredictions()
  5. Pass market data to writeArtifacts()
  6. All new steps are graceful -- missing key = skip, fetch failure = fallback
**Validate:** `node scripts/build-data.js` completes with and without ODDS_API_KEY
**Traced to:** Scenario: "No odds available -- fallback to model-only", "Staleness guard skips unnecessary API calls"

## Task 10 -- Update WhyPanel + PreMatchScreen for new factors [SEQUENTIAL: after Task 9]
**Files:** `src/components/WhyPanel/index.jsx`, `src/screens/PreMatchScreen/index.jsx`, `src/i18n/en.json`, `src/i18n/he.json`
**What:**
  1. Add i18n keys: `factor.suspension`, `factor.market`
  2. WhyPanel already renders chain items generically -- new keys auto-render
  3. Add "Market Signal" section below factor chain showing blend weight and implied P
  4. PreMatchScreen loads market.json via useData
**Validate:** `npm run build` succeeds; manual: open PreMatchScreen, verify WhyPanel shows new factors
**Traced to:** Scenario: "WhyPanel displays market blend factor"

## Task 11 -- Update GitHub Actions workflow [SEQUENTIAL: after Task 9]
**File:** `.github/workflows/update-data.yml`
**What:** Add `ODDS_API_KEY: ${{ secrets.ODDS_API_KEY }}` to the build step's env block. Add `scripts/cache/odds.json` to the git add for cache persistence.
**Validate:** Workflow YAML is valid; ODDS_API_KEY secret needs to be set in GitHub repo settings
**Traced to:** Infrastructure: required by fetch-odds.js

## Task 12 -- Create SOURCES.md [PARALLEL: with Task 10]
**File:** `scripts/data/SOURCES.md`
**What:** Document all data sources: Elo (eloratings.net), fixtures (OpenFootball), results (football-data.org), odds (The Odds API). Include license, derivation method, and what is stored publicly.
**Validate:** File exists with required sections
**Traced to:** Infrastructure: required for ToS compliance

## Task 13 -- End-to-end validation [SEQUENTIAL: after all]
**What:**
  1. Run `node scripts/build-data.js` without ODDS_API_KEY -> should succeed, no market data
  2. Run `npx vitest run` -> all tests pass (existing + new)
  3. Run `npm run build` -> Vite build succeeds
  4. Grep `public/data/` for raw odds patterns -> none found
  5. Grep `public/` and `dist/` for API key patterns -> none found
**Validate:** All checks pass
**Traced to:** Scenario: "No odds available -- fallback to model-only", "Existing engine tests pass without modification", "Market data not shipped as raw odds", "API key not present in output artifacts"
