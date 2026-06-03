# Tasks — fix-statistics-gaps

## Implementation Order

Tasks ordered by dependency layer: shared engine first, then build scripts, then standings. Gaps that are automatically resolved by other fixes are noted as such.

---

## Task 1 — Wire `timeDecayWeight` into `computeAttackDefence` [SEQUENTIAL]

Traced to: Gap 1 (also resolves Gap 5)

**Modify:** `src/engine/calibrate.js`, `src/engine/__tests__/calibrate.test.js`

**Steps:**

1. In `computeAttackDefence`, track weighted goals alongside raw goals:
   - For each result `r`, compute `w = timeDecayWeight(r.date)`
   - Accumulate `weightedGoalsFor += r.goalsFor * w`, `weightedGoalsAgainst += r.goalsAgainst * w`, `weightedMatches += w`
   - Also track `totalWeightedGoalsFor`, `totalWeightedGoalsAgainst`, `totalWeightedMatches` for tournament averages
2. Replace raw average computation with weighted averages:
   - `teamAvgFor = stats.weightedGoalsFor / stats.weightedMatches`
   - `avgGoalsFor = totalWeightedGoalsFor / totalWeightedMatches`
3. Keep `minMatches` check against raw `stats.matches` (not weighted) — we still need actual game count threshold
4. Update JSDoc to note that results are time-weighted
5. Add tests:
   - Recent results weight more than old: verify a team with recent high scores has higher attack than same team with old high scores
   - Verify that existing test results (all same date) produce same output as before
   - Verify weighted tournament averages are correct

**Validate:** `npx vitest run src/engine/__tests__/calibrate.test.js`

**Note:** This automatically resolves Gap 5 — `computeTeams` already passes `date` in results, it will now be consumed.

---

## Task 2 — Extend `getTeamLambda` to accept attack/defence [SEQUENTIAL]

Traced to: Gap 6

**Modify:** `src/engine/calibrate.js`, `src/engine/__tests__/calibrate.test.js`

**Steps:**

1. Extend `getTeamLambda` options to accept `attack` and `opponentDefence`:
   ```js
   export function getTeamLambda(team, opponent, options = {}) {
     const eloDiff = team.elo - opponent.elo;
     const lambdaDiff = eloToLambdaDiff(eloDiff);
     let lambda = BASELINE_LAMBDA * Math.exp(lambdaDiff);
     if (options.attack) lambda *= Math.exp(options.attack);
     if (options.opponentDefence) lambda *= Math.exp(options.opponentDefence);
     if (options.homeAdvantage) lambda *= Math.exp(options.homeAdvantage);
     return lambda;
   }
   ```
2. Add tests:
   - Positive attack increases lambda
   - Positive opponentDefence increases lambda (weak defence = higher conceded rate)
   - Both params together compound correctly
3. Verify existing tests still pass (attack/defence are optional)

**Validate:** `npx vitest run src/engine/__tests__/calibrate.test.js`

---

## Task 3 — Fix penalty model to use Elo expected score [SEQUENTIAL]

Traced to: Gap 7

**Modify:** `src/engine/knockout.js`, `src/engine/__tests__/knockout.test.js`

**Steps:**

1. Replace linear ratio with standard Elo expected score formula:
   ```js
   const pHomePens = 1 / (1 + Math.pow(10, (eloAway - eloHome) / 400));
   ```
2. Update existing test for "equal Elo produces 50/50" — should still pass (2000 vs 2000 -> 0.5)
3. Add test: "larger Elo gap produces more decisive penalty split" — verify 2200 vs 1800 gives ~0.91/0.09 (not the previous 2200/4000 = 0.55)
4. Add test: "qualify probabilities still sum to 1.0" — should still pass

**Validate:** `npx vitest run src/engine/__tests__/knockout.test.js`

---

## Task 4 — Blend Elo prior with partial match data [SEQUENTIAL]

Traced to: Gap 10

**Modify:** `src/engine/calibrate.js`, `src/engine/__tests__/calibrate.test.js`

**Steps:**

1. In `computeAttackDefence`, for teams with `0 < matches < minMatches` AND positive goals:
   - Compute data-based attack/defence as if they had enough matches
   - Compute Elo prior attack/defence as before
   - Blend: `weight = matches / minMatches`
   - `attack[team] = weight * dataBased.attack + (1 - weight) * eloPrior.attack`
   - Same for defence
2. Keep the current behavior for `matches === 0` (Elo prior only)
3. Keep current behavior for `matches >= minMatches` (data only)
4. Add tests:
   - Team with 1 match: result is partially blended with Elo prior
   - Team with 2 matches (minMatches=3): result is 2/3 data, 1/3 Elo
   - Verify blending transitions smoothly from Elo-only to data-only

**Validate:** `npx vitest run src/engine/__tests__/calibrate.test.js`

---

## Task 5 — Document home advantage design choice [SEQUENTIAL]

Traced to: Gap 2

**Modify:** `scripts/lib/run-predictions.js`

**Steps:**

1. Add JSDoc to `getHomeAdvantage` explaining the design decision:
   - Home advantage applies ONLY to host nations (MEX, USA, CAN) when designated as "home" team
   - The "home" designation in the seeding table is structurally arbitrary for non-hosts, but for host nations it correlates with venue
   - When venue-to-country mapping becomes available, this can be refined to check actual venue
   - Non-host teams never receive home advantage, which is correct for neutral-site World Cup matches
2. Add a code comment at the `HOST_NATIONS` constant explaining the 3 host countries
3. No functional change — this is documentation only

**Validate:** Code review of comments. `npx vitest run scripts/__tests__/build-data.test.js` still passes.

---

## Task 6 — Populate fair play from card data [SEQUENTIAL]

Traced to: Gap 3

**Modify:** `scripts/lib/build-standings.js`, `scripts/__tests__/build-standings.test.js`

**Steps:**

1. Add fair play deduction constants:
   ```js
   const FP_YELLOW = -1;
   const FP_SECOND_YELLOW = -3;
   const FP_STRAIGHT_RED = -4;
   ```
2. In the match processing loop, after updating goals/points, check for `match.cards`:
   ```js
   if (match.cards) {
     const homeCards = match.cards.filter(c => c.team === match.homeTeam);
     const awayCards = match.cards.filter(c => c.team === match.awayTeam);
     home.fairPlay += sumFairPlay(homeCards);
     away.fairPlay += sumFairPlay(awayCards);
   }
   ```
3. Implement `sumFairPlay(cards)`:
   ```js
   function sumFairPlay(cards) {
     return cards.reduce((sum, card) => {
       if (card.type === 'yellow') return sum + FP_YELLOW;
       if (card.type === 'second_yellow') return sum + FP_SECOND_YELLOW;
       if (card.type === 'red') return sum + FP_STRAIGHT_RED;
       return sum;
     }, 0);
     }
   ```
4. Add tests:
   - Match with no cards: fairPlay stays 0
   - Match with yellow cards: fairPlay decreases by -1 each
   - Match with red card: fairPlay decreases by -4
   - Tiebreaker with fair play works end-to-end

**Validate:** `npx vitest run scripts/__tests__/build-standings.test.js`

---

## Task 7 — Add head-to-head tiebreaker [SEQUENTIAL: after Task 6]

Traced to: Gap 4

**Modify:** `scripts/lib/build-standings.js`, `scripts/__tests__/build-standings.test.js`

**Steps:**

1. Change `compareTeams` signature to `compareTeams(a, b, h2hMap)` where `h2hMap` is optional:
   ```js
   export function compareTeams(a, b, h2hMap) {
     // 1. Points
     if (b.pts !== a.pts) return b.pts - a.pts;
     // 2. Head-to-head (if available)
     if (h2hMap) {
       const h2h = h2hMap[`${a.team}_${b.team}`] || 0;
       if (h2h !== 0) return h2h; // positive = a beat b, negative = b beat a
     }
     // 3. Goal difference
     if (b.gd !== a.gd) return b.gd - a.gd;
     // 4. Goals scored
     if (b.gf !== a.gf) return b.gf - a.gf;
     // 5. Fair play
     if (b.fairPlay !== a.fairPlay) return b.fairPlay - a.fairPlay;
     // 6. FIFA ranking
     return a.fifaRank - b.fifaRank;
   }
   ```
2. Build the H2H map in `buildStandings` before sorting:
   ```js
   function buildH2HMap(matches, groupTeams) {
     const map = {};
     const teamSet = new Set(groupTeams);
     for (const match of matches) {
       if (match.stage !== 'group' || match.status !== 'FINISHED' || !match.score) continue;
       if (!teamSet.has(match.homeTeam) || !teamSet.has(match.awayTeam)) continue;
       const { home: h, away: a } = match.score;
       // Store points diff from A's perspective
       if (h > a) {
         map[`${match.homeTeam}_${match.awayTeam}`] = -1; // a before b (home beat away)
         map[`${match.awayTeam}_${match.homeTeam}`] = 1;  // b before a
       } else if (a > h) {
         map[`${match.homeTeam}_${match.awayTeam}`] = 1;
         map[`${match.awayTeam}_${match.homeTeam}`] = -1;
       }
       // Draw = 0, no entry needed
     }
     return map;
   }
   ```
3. Pass H2H map to `sort`:
   ```js
   const h2hMap = buildH2HMap(matches, teamList.map(t => t.team));
   teamList.sort((a, b) => compareTeams(a, b, h2hMap));
   ```
4. Update `rankThirdPlace` — no H2H for cross-group comparison, pass `null`:
   ```js
   export function rankThirdPlace(teams) {
     return [...teams].sort((a, b) => compareTeams(a, b, null));
   }
   ```
5. Update all existing callers of `compareTeams` in tests to pass optional third arg
6. Add tests:
   - Two teams tied on points: H2H winner ranks higher
   - Three-way tie: H2H only applies between pairs that played each other
   - No H2H data (no matches played): falls through to GD
   - Draw in H2H match: no preference, falls through to GD

**Validate:** `npx vitest run scripts/__tests__/build-standings.test.js`

---

## Task 8 — Stabilize sort with deterministic final tiebreaker [SEQUENTIAL: after Task 7]

Traced to: Gap 9

**Modify:** `scripts/lib/build-standings.js`, `scripts/__tests__/build-standings.test.js`

**Steps:**

1. Replace `return 0` in `compareTeams` with `return a.team.localeCompare(b.team)` — alphabetical team code as final deterministic tiebreaker
2. Update test for "returns 0 when all criteria equal" to expect alphabetical ordering instead
3. Add test: identical stats for MEX and RSA — MEX comes before RSA alphabetically

**Validate:** `npx vitest run scripts/__tests__/build-standings.test.js`

---

## Task 9 — Guard third-place ranking for undersized groups [SEQUENTIAL: after Task 8]

Traced to: Gap 11

**Modify:** `scripts/lib/build-standings.js`, `scripts/__tests__/build-standings.test.js`

**Steps:**

1. Change the guard from `teamList.length >= 3` to `teamList.length === 4`:
   ```js
   if (teamList.length === 4) {
     thirdPlaceTeams.push(sortedGroups[groupLetter][2]);
   }
   ```
2. Add test: group with 3 teams does not contribute to third-place ranking
3. Add test: group with 4 teams does contribute correctly
4. Log a warning if a group has != 4 teams: `console.warn('[build-standings] Group ${groupLetter} has ${teamList.length} teams (expected 4)')`

**Validate:** `npx vitest run scripts/__tests__/build-standings.test.js`

---

## Task 10 — Document form design choice (no code change) [SEQUENTIAL]

Traced to: Gap 8

**Modify:** `scripts/lib/compute-teams.js`

**Steps:**

1. Add JSDoc comment to `buildForm` explaining that form is intentionally binary (W/D/L) and capped at last 5 matches, sorted by date descending. This implicitly handles recency without needing time-decay weights since only recent matches are considered.
2. No code change.

**Validate:** Code review of comments.

---

## Task 11 — Full pipeline integration test [SEQUENTIAL: after all above]

Traced to: All gaps

**Modify:** `scripts/__tests__/build-data.test.js`

**Steps:**

1. Run existing integration test suite — verify all still pass after changes
2. Add new integration test: build full pipeline with mock data that includes:
   - Matches from different dates (tests time decay)
   - Matches with card data (tests fair play)
   - Tied teams with H2H results (tests tiebreaker)
   - Host nation matches (tests home advantage documentation)
3. Verify `validatePredictions` still passes for all predictions
4. Verify standings sort order matches FIFA criteria for all test scenarios

**Validate:** `npx vitest run scripts/__tests__/`

---

## Task Summary

| Task | Gap(s) | Description | Files Changed | Risk |
|------|--------|-------------|---------------|------|
| 1 | 1, 5 | Wire timeDecayWeight into computeAttackDefence | calibrate.js, calibrate.test.js | Medium |
| 2 | 6 | Extend getTeamLambda with attack/defence | calibrate.js, calibrate.test.js | Low |
| 3 | 7 | Fix penalty model to Elo expected score | knockout.js, knockout.test.js | Low |
| 4 | 10 | Blend Elo prior with partial match data | calibrate.js, calibrate.test.js | Low |
| 5 | 2 | Document home advantage design choice | run-predictions.js | None |
| 6 | 3 | Populate fair play from card data | build-standings.js, build-standings.test.js | Low |
| 7 | 4 | Add head-to-head tiebreaker | build-standings.js, build-standings.test.js | Medium |
| 8 | 9 | Stabilize sort with deterministic tiebreaker | build-standings.js, build-standings.test.js | Low |
| 9 | 11 | Guard third-place for undersized groups | build-standings.js, build-standings.test.js | Low |
| 10 | 8 | Document form design choice | compute-teams.js | None |
| 11 | all | Full pipeline integration test | build-data.test.js | Low |
