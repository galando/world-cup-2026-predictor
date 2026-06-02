# Intent — Mundial 2026 Predictor

## Intent (IDD)

### Problem

Football fans need a transparent, mathematically grounded prediction tool for the 2026 FIFA World Cup (48 teams, 12 groups, 104 matches). Existing predictors are opaque black boxes. Users want to understand *why* a prediction says 61% vs 15%, and they want to guess scores themselves and track accuracy.

### Success Criteria

1. **Predictions are mathematically sound** — Dixon-Coles Poisson model produces valid probability distributions (probs sum to 1.0 within 0.001 tolerance) for all 104 matches.
   - Validate: scenario — "Dixon-Coles probabilities sum to 1"

2. **All 104 matches render with correct predictions** — Every group-stage and knockout match displays home/draw/away probabilities, top scorelines, and expected goals.
   - Validate: scenario — "User views pre-match prediction"

3. **Third-place qualification ranking is correct** — The 8 best third-place teams are ranked using all 5 tiebreakers, matching FIFA's official algorithm.
   - Validate: scenario — "Best 3rd-place teams advance correctly"

4. **Knockout bracket resolves end-to-end** — User can override bracket picks, see cascade propagation, and the bracket produces a valid champion.
   - Validate: scenario — "User overrides bracket slot"

5. **Hebrew/English i18n works fully** — All UI text renders in both languages with correct RTL/LTR direction.
   - Validate: scenario — "User switches language"

6. **Share cards generate correctly** — Both ShareCardSquare and BracketCard produce valid PNG images.
   - Validate: scenario — "User shares match prediction"

7. **Build pipeline produces valid data** — The Node.js build script fetches, merges, computes, and writes all 7 JSON files with structural validation.
   - Validate: scenario — "Build script produces valid output"

8. **PWA installs and works offline** — App shell caches, data serves from service worker cache when offline.
   - Validate: scenario — "App works offline"

### Constraints

- **No backend server** — Static site only (Cloudflare Pages). All data served as static JSON files.
- **No user accounts** — All state in localStorage. No database, no auth.
- **No live scores** — Football-Data.org free tier has delayed results. UI must show `lastUpdated` timestamp prominently.
- **No MLE optimization** — Fixed `rho = -0.05` for Dixon-Coles correction. Not enough data at tournament start for MLE to converge.
- **No Capacitor in Phase 1** — Ship PWA first. Capacitor (iOS/Android) is Phase 2.
- **Language is independent of team theme** — User can pick any team theme and any language independently.
- **Elo ratings via committed CSV** — No live scraping of eloratings.net. Manual CSV updates committed to repo.

### Target Users

- Israeli football fans (primary: Hebrew UI)
- International football fans (secondary: English UI)
- Mobile-first users (PWA install, share to WhatsApp/Telegram)

---

## Scenarios (BDD)

### Scenario 1: Dixon-Coles probabilities sum to 1
**Note:** unit
```gherkin
Given a Poisson grid with lambdaHome=1.82 and lambdaAway=0.74
When Dixon-Coles correction is applied with rho=-0.05
Then the grid cells sum to 1.0 (within 0.001)
And the home/draw/away probabilities also sum to 1.0
```

### Scenario 2: Dixon-Coles correction only affects low-score cells
**Note:** unit
```gherkin
Given a 9x9 Poisson grid built from lambdaHome=1.5 and lambdaAway=0.9
When Dixon-Coles correction is applied with rho=-0.05
Then cells (0,0), (0,1), (1,0), (1,1) differ from raw Poisson
And all other cells remain unchanged
```

### Scenario 3: Strong team has higher win probability
**Note:** unit
```gherkin
Given team A with Elo 2140 and team B with Elo 1800
When predictions are computed for A vs B
Then team A win probability exceeds team B win probability
And team A expected goals exceed team B expected goals
```

### Scenario 4: Knockout qualify probabilities include penalties
**Note:** unit
```gherkin
Given a knockout match between team A (Elo 2050) and team B (Elo 1920)
When knockout prediction is computed
Then qualify.home + qualify.away equals 1.0 (within 0.001)
And qualify.home is greater than probs90.home (because draw probability contributes via penalties)
```

### Scenario 5: Best 3rd-place teams advance correctly
**Note:** unit
```gherkin
Given 12 third-place teams with varied records:
  | team | pts | gd | gf | fairPlay | fifaRank |
  | C1   | 4   | 2  | 5  | -3       | 8        |
  | C2   | 4   | 1  | 4  | -5       | 12       |
  | C3   | 4   | 1  | 3  | -2       | 5        |
  | C4   | 3   | 0  | 3  | -1       | 15       |
  | C5   | 3   | -1 | 2  | -4       | 20       |
  | C6   | 3   | -1 | 2  | -4       | 25       |
  | C7   | 2   | -2 | 2  | -2       | 10       |
  | C8   | 2   | -2 | 1  | -1       | 30       |
  | C9   | 2   | -3 | 1  | -6       | 18       |
  | C10  | 1   | -4 | 1  | -3       | 22       |
  | C11  | 1   | -5 | 0  | -2       | 35       |
  | C12  | 0   | -6 | 0  | -8       | 40       |
When rankThirdPlace is called
Then teams are sorted by points desc, then goalDiff desc, then goalsFor desc, then fairPlay desc, then fifaRank asc
And the top 8 teams are selected for advancement
```

### Scenario 6: Build script produces valid output
**Note:** integration
```gherkin
Given elo-snapshot.csv with 48 teams, teams-meta.json with 48 entries, and openfootball fixtures
When build-data.js is executed
Then 7 JSON files are written to public/data/
And each file is valid JSON
And predictions.json contains entries for all 104 matches
And each prediction has probs.home + probs.draw + probs.away = 1.0 (within 0.001)
And standings.json contains 12 groups with sorted team rankings
And lastUpdated.json contains an ISO timestamp
```

### Scenario 7: Build script handles API failure gracefully
**Note:** mock
```gherkin
Given the Football-Data.org API is unreachable (timeout)
And previously cached data exists in scripts/cache/
When build-data.js is executed
Then the build completes successfully using cached data
And a warning is logged about the API failure
And output JSON files are still valid
```

### Scenario 8: User views pre-match prediction
**Note:** integration
```gherkin
Given the app has loaded matches.json and predictions.json
When the user navigates to /match/A-1 (Argentina vs Mexico)
Then the PreMatchScreen displays:
  | TeamCompare with flags, names, FIFA rank, form, avg goals |
  | PredictionBars showing home/draw/away probabilities |
  | WhyPanel accordion with factor chain for each team |
  | ScorelineGrid (7x7 probability matrix) |
  | LikelyScores (top 4 scorelines with percentages) |
  | GuessArea with digit steppers (0-9) for each team |
```

### Scenario 9: User submits a score guess
**Note:** integration
```gherkin
Given the user is on PreMatchScreen for match A-1
When the user sets the guess to 2-0 and taps "check my guess"
Then the guess is saved to localStorage keyed by matchId
And FeedbackCard appears showing:
  | "The model gives this 14%" (matching the topScores entry for 2-0) |
  | Comparison bar: user guess vs model prediction |
```

### Scenario 10: User switches language
**Note:** integration
```gherkin
Given the app is displaying in Hebrew (RTL)
When the user navigates to TeamPickerScreen and selects "English"
Then all UI text switches to English
And the HTML dir attribute changes from "rtl" to "ltr"
And the language preference is persisted in localStorage
And the selected team theme remains unchanged
```

### Scenario 11: User selects a team theme
**Note:** integration
```gherkin
Given the app is showing the default green pitch theme
When the user navigates to TeamPickerScreen and selects Argentina
Then CSS variables on :root update to Argentina's theme colors
And the theme selection is persisted in localStorage
And MatchCards for Argentina float to top with gold border
And the language remains unchanged
```

### Scenario 12: User overrides bracket slot
**Note:** integration
```gherkin
Given the bracket is showing model predictions for all knockout slots
When the user taps on France in a Round-of-32 tie (overriding the model's pick)
Then France is highlighted as the selected winner
And the downstream Round-of-16 slot updates to show France
And all subsequent downstream slots that depended on the original winner reset to model prediction
And the user's override is persisted in localStorage
```

### Scenario 13: User shares match prediction
**Note:** manual
```gherkin
Given the user has submitted a guess (3-1) for match A-1
When the user taps the share button
Then a 320x320 PNG image is generated containing:
  | Pitch gradient background |
  | "MUNDIAL PREDICTOR" brand |
  | Flags + score (3 - 1) + team names |
  | Model probability feedback text |
  | App URL |
And the Web Share API is invoked with the image (or download fallback on desktop)
```

### Scenario 14: User shares bracket
**Note:** manual
```gherkin
Given the user has completed their bracket predictions
When the user taps "share my bracket" on BracketScreen
Then a 360x360 PNG image is generated containing:
  | Champion team + flag + trophy |
  | Bracket summary (final, semis, quarters) |
  | "X picks by me, Y by model" |
  | App URL |
```

### Scenario 15: App works offline
**Note:** integration
```gherkin
Given the app has been loaded at least once (service worker cached)
When the user goes offline and opens the app
Then the app shell renders from service worker cache
And previously fetched JSON data is served from cache
And an offline banner appears: "Offline mode - data may not be up to date"
```

### Scenario 16: Rate limiting protects Football-Data.org API calls
**Note:** unit
```gherkin
Given the build script needs to make multiple API calls
When fetchWithRateLimit is called with a list of URLs
Then each request waits at least 6.5 seconds before the next request
And no more than 10 requests are made per minute
```

### Scenario 17: Calibration stats track prediction accuracy
**Note:** unit
```gherkin
Given 20 matches have been played with actual results
And predictions were made for all 20 matches
When calibration stats are computed
Then calibration.json contains:
  | played: 20 |
  | winnerHit: count of correct winner predictions |
  | exactHit: count of correct exact score predictions |
  | brier: Brier score across all predictions |
  | since: ISO timestamp of first match |
```

### Scenario 18: Group standings sort with 5-criteria tiebreaker
**Note:** unit
```gherkin
Given Group A with 4 teams having the following records:
  | team | pts | gd | gf | fairPlay |
  | ARG  | 7   | 4  | 7  | -2       |
  | MEX  | 4   | 0  | 4  | -3       |
  | POL  | 4   | 0  | 4  | -5       |
  | KSA  | 1   | -4 | 2  | -1       |
When group standings are computed
Then ARG ranks 1st (most points)
And MEX ranks 2nd (same pts/gd/gf as POL, but better fairPlay -3 > -5)
And POL ranks 3rd
And KSA ranks 4th
```

### Scenario 19: Elo-to-lambda conversion produces reasonable expected goals
**Note:** unit
```gherkin
Given team A with Elo 2140 and team B with Elo 1800 (diff = 340)
When eloToLambdaDiff is called with diff=340
Then the result is approximately 0.68 (340/400 * 0.8)
And team A's lambda is higher than the baseline (1.35)
And team B's lambda is lower than the baseline
```

### Scenario 20: Round-of-32 seeding table resolves correctly
**Note:** unit
```gherkin
Given the 8 best third-place teams are identified (C1, C3, C4, C5, C6, C7, C8, C9)
And the FIFA R32 seeding table is loaded from r32-seeding-table.json
When bracket resolution assigns third-place teams to R32 slots
Then each slot receives exactly one third-place team
And no team is assigned to multiple slots
And the assignment matches the FIFA seeding table lookup
```
