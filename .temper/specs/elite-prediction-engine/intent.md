# Intent: Elite Prediction Engine (Phase 2)

## Problem

The current predictor uses a solid but basic Dixon-Coles Poisson model with Elo, form, home advantage, red-card suspensions, and a 25% market odds blend. Professional gambling operations (Pinnacle, Starlizard, Cultist, quantitative syndicates) use 10-50x more signal. This gap means:

1. **Missing signals** -- No xG (expected goals), no player-level data, no tactical/formation adjustments, no weather/venue effects, no travel fatigue, no squad depth, no qualifying-campaign form.
2. **Missing simulation** -- No Monte Carlo tournament simulation (10,000+ runs to compute "probability Brazil wins the World Cup"). Current bracket is single-path deterministic.
3. **Missing calibration** -- No Brier score tracking over time, no calibration plots, no backtesting against historical World Cups, no confidence intervals.
4. **Missing transparency** -- No "what-if" scenario explorer, no comparison vs bookmaker accuracy, no methodology confidence grading.

Without these, the predictor cannot compete with professional services on accuracy, and it lacks the unique value props (transparency, interactivity, fairness) that would make it *better* than gambling services from a user perspective.

## Success Criteria

### Tier 1 -- Must-Have (ships before tournament)

1. **Monte Carlo tournament simulation**: Run 10,000 tournament simulations. Output per-team probability of reaching each round (R16, QF, SF, Final, Champion). Confidence intervals on predictions.
   - Validate: scenario -- "Monte Carlo produces valid tournament-win probabilities that sum to 100%"

2. **xG-based attack/defence enhancement**: Incorporate expected-goals data from FBref/Understat as supplementary attack/defence signal (blend with existing goal-based parameters).
   - Validate: scenario -- "xG data improves attack/defence parameter accuracy for teams with < 3 tournament matches"

3. **Pre-tournament form from qualifiers**: Load qualifying campaign results (last 10 competitive matches before tournament) as prior for attack/defence when tournament data is sparse.
   - Validate: scenario -- "Teams with 0 tournament matches use qualifier-based attack/defence instead of Elo-only prior"

4. **Brier score + calibration dashboard**: Track prediction accuracy on finished matches with Brier score decomposition, log-loss, and calibration plot (predicted vs actual).
   - Validate: scenario -- "After 10 matches, calibration.json contains meaningful Brier score and per-prediction correctness"

5. **Interactive scenario explorer**: "What if team X beats Y?" -- user picks results, see how it propagates through group standings and bracket.
   - Validate: scenario -- "User can override a match result and see updated standings in real-time"

### Tier 2 -- Should-Have (ships during tournament)

6. **Venue + travel fatigue model**: Map each match venue, compute travel distance between consecutive venues, apply fatigue multiplier for teams with short rest + long travel.
   - Validate: scenario -- "Team playing 3rd match in 8 days 2000km from previous venue gets fatigue penalty"

7. **Weather impact**: Fetch match-day weather (temperature, humidity, altitude) from free API. Apply adjustment for extreme conditions.
   - Validate: scenario -- "Match at Estadio Azteca (2240m altitude) gets altitude adjustment"

8. **Head-to-head history**: Load historical matchups between teams from last 20 years. Weight by recency. Blend small amount (5%) into prediction.
   - Validate: scenario -- "Teams with dominant H2H record get slight probability boost"

9. **Squad valuation signal**: Use Transfermarkt squad market value as a supplementary strength signal. Higher squad value correlates with depth and quality.
   - Validate: scenario -- "Teams with 2x squad value advantage get measurable probability boost"

### Tier 3 -- Nice-to-Have (post-tournament or v2)

10. **Bayesian updating during matches**: Real-time probability update as goals are scored during live matches (client-side, using pre-computed conditional probability tables).
    - Validate: scenario -- "When home team scores in minute 30, win probability updates in real-time"

11. **Backtesting against historical World Cups**: Run the model retroactively on 2018 and 2022 World Cups. Compute accuracy metrics and compare to bookmaker accuracy.
    - Validate: scenario -- "Model achieves Brier score within 5% of bookmaker accuracy on 2022 World Cup"

12. **Referee statistics**: Load referee tendencies (cards per game, penalty award rate). Adjust card/suspension risk.
    - Validate: scenario -- "Referee with high card rate increases expected suspension risk"

## Constraints

- **Static site architecture**: All data fetching at build time (GitHub Actions). No backend server. No runtime API calls from client (except service worker caching).
- **Free-tier API limits**: Football-Data.org (48 calls/day), The Odds API (500 credits/month), any new API must be free tier.
- **Build time budget**: GitHub Actions must complete within 10 minutes. Monte Carlo runs 10,000 simulations, must complete in < 60 seconds in CI.
- **Bundle size**: React client must stay under 500KB gzipped. Monte Carlo runs at build time; client only consumes results.
- **Shared engine safety**: `calibrate.js`, `poisson-dc.js`, `knockout.js` are imported by both build scripts and React client. All changes must be backward-compatible.
- **Tournament timeline**: World Cup 2026 starts June 11, 2026. Tier 1 must ship before then.

## Target Users

- Football fans who want accurate, transparent predictions (not gambling)
- Data nerds who appreciate methodology explanations and calibration
- Users in regions where gambling is restricted or undesired

## What Makes This Better Than Gambling Services

| Dimension | Gambling Services | This Predictor |
|-----------|------------------|----------------|
| Transparency | Black box | Full methodology, factor chain, confidence intervals |
| Accuracy goal | Maximize profit (vig built in) | Maximize calibration (Brier score) |
| Cost | Requires deposits/bets | Free, no account needed |
| Interactivity | Pick results, see odds | Scenario explorer, what-if analysis |
| Data display | Odds only | Score matrix, factor chain, Monte Carlo probabilities |
| Bias | Overround (built-in margin) | Fair probabilities (no vig) |
| Historical comparison | Not shown | Backtest results vs bookmakers displayed |
| Live updates | In-play betting | Bayesian in-match probability updates |

## Gherkin Scenarios

### Scenario 1: Monte Carlo produces valid tournament probabilities
```gherkin
Given all group matches and knockout bracket are defined
And the Monte Carlo engine runs 10,000 simulations
Then each team has a probability of reaching R16, QF, SF, Final, and winning
And the sum of "win World Cup" probabilities across all teams is 1.0 (within 0.02)
And probabilities are stored in public/data/tournament-probs.json
```
Note: unit

### Scenario 2: xG data supplements sparse tournament data
```gherkin
Given a team has played 0 tournament matches
And xG data from FBref shows the team has xG_for = 2.1 per match in qualifiers
When computeTeams builds attack/defence parameters
Then the team's attack parameter incorporates xG data
And the team's attack is not solely Elo-derived
```
Note: unit

### Scenario 3: Qualifier form provides pre-tournament prior
```gherkin
Given a team has played 0 tournament matches
And 8 qualifying matches are loaded from historical data
And the team scored 1.8 goals/game and conceded 0.9 goals/game in qualifiers
When computeTeams builds attack/defence parameters
Then attack/defence are derived from qualifier data (not Elo-only prior)
And the parameters are blended with Elo prior using match-count weighting
```
Note: unit

### Scenario 4: Brier score tracks accuracy on finished matches
```gherkin
Given 5 matches have finished with known results
And the model predicted [0.6, 0.2, 0.2] for match A (home won)
And [0.3, 0.3, 0.4] for match B (away won)
When calibration is computed
Then the Brier score is the mean squared error between predicted and actual
And calibration.json contains per-match breakdown
And the dashboard shows calibration over time
```
Note: unit

### Scenario 5: Scenario explorer updates standings in real-time
```gherkin
Given the user is on the BracketScreen
And group A has teams [MEX, CAN, FRA, AUS] with 0 matches played
When the user selects "MEX 2-0 FRA" as an override
Then group A standings update immediately (MEX: 3pts, FRA: 0pts)
And the bracket updates to reflect the new group winner
And no server round-trip is required
```
Note: manual

### Scenario 6: Venue and travel fatigue applied
```gherkin
Given CAN played their 2nd group match in Vancouver on June 17
And their 3rd group match is in Miami on June 23 (4,300 km, 6 days rest)
When computeLambda calculates CAN's expected goals for match 3
Then a fatigue multiplier of ~0.95 is applied
And the WhyPanel shows the fatigue factor in the chain
```
Note: unit

### Scenario 7: Weather/altitude adjustment applied
```gherkin
Given a match is scheduled at Estadio Azteca (altitude 2,240m)
And Mexico City temperature is forecast at 32C
When computeLambda calculates expected goals
Then an altitude adjustment is applied (high altitude favours acclimated teams)
And the WhyPanel shows the venue factor with altitude detail
```
Note: unit

### Scenario 8: Head-to-head history blended
```gherkin
Given BRA and ARG have played 15 matches in the last 20 years
And BRA won 8, drew 3, lost 4
When the prediction for BRA vs ARG is computed
Then a small H2H adjustment (5% weight) favours BRA
And the adjustment is visible in the factor chain
```
Note: unit

### Scenario 9: Squad valuation supplements strength
```gherkin
Given ENG has a squad market value of EUR 1.2B
And their opponent has a squad value of EUR 200M
When computeTeams builds team data
Then the squad value ratio contributes a supplementary strength signal
And teams with higher squad value get a modest lambda boost
```
Note: unit

### Scenario 10: Existing predictions unchanged for default parameters
```gherkin
Given no xG data, no qualifier data, no venue data, no H2H data is provided
When build-data.js runs
Then all predictions are identical to the current model output
And all existing tests pass without modification
```
Note: unit -- regression guard

### Scenario 11: Monte Carlo bracket handles third-place advancement
```gherkin
Given the 2026 format advances 8 third-place teams to R32
When Monte Carlo simulations run group stages
Then third-place team selection follows the FIFA seeding table
And the R32 bracket is correctly populated in every simulation
```
Note: unit

### Scenario 12: Build time stays within budget
```gherkin
Given Monte Carlo runs 10,000 simulations
And all data fetches complete
When the full build pipeline runs on GitHub Actions
Then total build time is under 10 minutes
And Monte Carlo simulation completes in under 60 seconds
```
Note: integration
