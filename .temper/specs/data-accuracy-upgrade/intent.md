# Intent: Data Accuracy Upgrade (Phase 1)

## Problem

The prediction model uses only Elo ratings, form, and home advantage. Two of the strongest real-world prediction signals are missing:

1. **Market signal** -- Betting odds aggregate expert + quantitative analysis from dozens of bookmakers. Implied probabilities are historically among the best calibrated forecasts for match outcomes.
2. **Suspension signal** -- Red-card suspensions during the tournament remove key players, directly reducing team strength. The model currently ignores this entirely.

Without these signals, predictions for matches where key players are suspended or where market consensus differs significantly from the model will be systematically miscalibrated.

## Success Criteria

1. **Odds blend improves calibration**: Blended predictions (model + market) have Brier score >= model-only on matches with available odds.
   - Validate: scenario -- "Blended Brier score is not worse than model-only"

2. **Graceful fallback**: When no odds are available (free-tier credit exhaustion, pre-tournament, API failure), predictions are identical to current model output.
   - Validate: scenario -- "Predictions unchanged when odds unavailable"

3. **Suspension multiplier applied**: Matches where a team has a red-card suspension produce visibly different lambda values in the WhyPanel.
   - Validate: scenario -- "Suspension reduces team lambda"

4. **No key leakage**: API keys never appear in committed JSON artifacts or client bundles.
   - Validate: code -- grep for key patterns in public/

5. **Backward compatible**: Existing shared engine (calibrate.js, knockout.js) signatures unchanged for existing callers. New parameters are optional.
   - Validate: scenario -- "Existing tests pass without modification"

## Constraints

- **Static site architecture**: All data fetching happens at build time (GitHub Actions). No runtime API calls from the client.
- **Free tier limits**: The Odds API free tier = 500 credits/month. With 30-min cron, that's ~1,440 builds/month. Must cache aggressively and skip fetch when cache is fresh.
- **ToS compliance**: The Odds API terms prohibit redistributing raw odds. Only derived implied probabilities (after vig removal) are stored in public JSON.
- **Shared engine safety**: calibrate.js and knockout.js are imported by both build scripts AND the React client. New parameters MUST be optional with safe defaults.
- **Tournament timing**: World Cup 2026 runs June 11 - July 19. Suspensions only accumulate once matches begin. Odds availability depends on bookmaker coverage.

## Target Users

- End users viewing match predictions on the PWA (PreMatchScreen, TeamScreen)
- Developers running the build pipeline locally or via CI

## Gherkin Scenarios

### Scenario 1: Odds fetched and blended into prediction
```gherkin
Given The Odds API returns h2h odds for a match
And the implied probabilities are [home: 0.55, draw: 0.25, away: 0.20]
When build-data.js runs
Then the prediction for that match includes a market blend
And pFinal = w_model * pModel + w_market * pImplied
And the prediction JSON includes market data in the factors chain
```
Note: unit

### Scenario 2: No odds available -- fallback to model-only
```gherkin
Given The Odds API returns no odds for a match
Or the ODDS_API_KEY environment variable is not set
When build-data.js runs
Then the prediction for that match is identical to the current model output
And no market blend factor appears in the factors chain
And the prediction JSON has no market field
```
Note: unit

### Scenario 3: Vig removal produces valid implied probabilities
```gherkin
Given a bookmaker offers decimal odds [home: 1.80, draw: 3.50, away: 4.50]
When build-market.js computes implied probabilities
Then the overround is removed via the standard method
And the implied probabilities sum to 1.0 (within 0.001)
And each implied probability is between 0 and 1
```
Note: unit

### Scenario 4: Odds API failure -- cached fallback used
```gherkin
Given The Odds API request fails (network error, timeout, rate limit)
And a cached odds file exists from a previous successful fetch
When build-data.js runs
Then the cached odds are used for the market blend
And the build completes successfully
And a warning is logged about the fallback
```
Note: mock

### Scenario 5: Suspension reduces team lambda
```gherkin
Given a team received a red card in their previous match
And the next match is in a stage where suspensions carry over
When run-predictions.js computes lambda for that team
Then the team's availabilityMult is applied to lambda
And lambda is reduced by the suspension factor
And the WhyPanel shows the suspension factor in the chain
```
Note: unit

### Scenario 6: No suspensions -- availabilityMult is 1.0 (neutral)
```gherkin
Given no team has any red-card suspensions
When run-predictions.js computes predictions
Then availabilityMult is 1.0 for all teams
And lambda values are identical to the current model
```
Note: unit

### Scenario 7: Staleness guard skips unnecessary API calls
```gherkin
Given the cached odds file is less than 4 hours old
When build-data.js runs
Then The Odds API is NOT called
And the cached odds are used directly
And no API credits are consumed
```
Note: unit

### Scenario 8: Existing engine tests pass without modification
```gherkin
Given the existing test suite in src/engine/__tests__/
When npm test is run
Then all existing tests pass
And no test file was modified
```
Note: unit -- regression guard

### Scenario 9: Calibration stats computed on blended predictions
```gherkin
Given finished matches exist with both model and blended predictions
When write-artifacts.js computes calibration
Then the calibration JSON includes Brier score based on blended probabilities
And the Brier score is logged for comparison
```
Note: unit

### Scenario 10: Market data not shipped as raw odds
```gherkin
Given build-data.js completes successfully
When scanning public/data/*.json for raw odds data
Then no file contains raw decimal odds from bookmakers
And only implied probabilities are stored
```
Note: code -- grep validation

### Scenario 11: API key not present in output artifacts
```gherkin
Given build-data.js completes with ODDS_API_KEY set
When scanning all files in public/ and dist/
Then no file contains the API key value
```
Note: code -- grep validation

### Scenario 12: WhyPanel displays market blend factor
```gherkin
Given a prediction has a market blend component
When the user opens the WhyPanel for that match
Then a "Market Signal" factor row is visible
And it shows the implied probability and blend weight
```
Note: manual
