# Intent: fix-statistics-gaps

## Summary

Fix ALL 11 gaps in the statistics and calculation pipeline identified during codebase audit. These gaps range from dead code to incorrect tiebreaker logic to unused calibration parameters.

## Motivation

A thorough audit of the engine + build pipeline found 11 gaps across the statistics, prediction, and standings modules. While severity varies, the user has requested ALL be fixed for correctness and code hygiene.

## Complete Gap List (11 items)

### Gap 1 — `timeDecayWeight` computed but never used in attack/defence [MEDIUM]
- **File:** `src/engine/calibrate.js:70-87`
- **Problem:** `computeAttackDefence` sums goals with equal weight. `timeDecayWeight` is defined (line 49) and tested but never called. Recent matches should count more than old ones.
- **Fix:** Weight each match result by `timeDecayWeight(result.date)` when accumulating goals in `computeAttackDefence`. Use weighted averages instead of raw sums.

### Gap 2 — Home advantage only for host nations, not venue-aware [MEDIUM]
- **File:** `scripts/lib/run-predictions.js:18-23`
- **Problem:** `getHomeAdvantage` applies home boost when team is a host nation AND `isHome=true`. But the "home" designation in the seeding table is arbitrary for non-hosts. A host nation at a neutral venue still gets the boost.
- **Fix:** Home advantage ONLY applies when a HOST nation is physically playing at a home venue. Since match venue data doesn't map to host countries, keep current host-nation + isHome logic but add a JSDoc clarifying the assumption. For all non-host vs non-host matches, no advantage either way (already correct).

### Gap 3 — Fair play score never populated [MEDIUM]
- **File:** `scripts/lib/build-standings.js:21`
- **Problem:** `fairPlay: 0` is initialized but never updated from match data. Tiebreaker criterion 4 compares fairPlay but all teams always have 0.
- **Fix:** Populate fair play from card data in match results if available (yellow=-1, second yellow=-3, straight red=-4). If no card data exists in the match object, keep as 0. Forward-compatible.

### Gap 4 — No head-to-head tiebreaker [MEDIUM]
- **File:** `scripts/lib/build-standings.js:100-111`
- **Problem:** FIFA mandates head-to-head result between tied teams as tiebreaker criterion 2. Currently `compareTeams` goes straight from points to GD, skipping H2H.
- **Fix:** Insert head-to-head as criterion between points and GD. Requires passing match results into the comparison function. Signature change: `compareTeams(a, b, h2hResults)` where `h2hResults` is `{ [teamA_teamB]: pointsDiff }`.

### Gap 5 — `computeTeams` passes results to `computeAttackDefence` without dates being used [LOW]
- **File:** `scripts/lib/compute-teams.js:14-29`
- **Problem:** `computeTeams` correctly includes `date` in each result object passed to `computeAttackDefence`, but since Gap 1 means dates are ignored, the data is prepared but unused.
- **Fix:** Automatically resolved when Gap 1 is fixed (date field will be consumed by `timeDecayWeight`).

### Gap 6 — `getTeamLambda` in calibrate.js never uses attack/defence params [LOW]
- **File:** `src/engine/calibrate.js:34-39`
- **Problem:** `getTeamLambda` computes lambda from Elo + home advantage only. It ignores attack/defence parameters even when available. The `computeLambda` in `run-predictions.js` does use them, so `getTeamLambda` is a simplified version that underestimates.
- **Fix:** Add optional `attack`/`defence` parameters to `getTeamLambda` options. When provided, apply them like `run-predictions.js` does. This makes the shared engine function complete.

### Gap 7 — Penalty model in knockout.js uses Elo linearly, not logistically [LOW]
- **File:** `src/engine/knockout.js:30`
- **Problem:** `pHomePens = eloHome / (eloHome + eloAway)` is a linear ratio of raw Elo values (~2000). For Elo 2100 vs 1900, this gives 2100/4000 = 0.525, barely distinguishing teams. A logistic or Elo-difference-based model would be more discriminating.
- **Fix:** Use Elo difference with a scaling factor: `pHomePens = 1 / (1 + 10^((eloAway - eloHome) / 400))` — standard Elo expected score formula.

### Gap 8 — `buildForm` in compute-teams.js doesn't use timeDecayWeight [LOW]
- **File:** `scripts/lib/compute-teams.js:66-71`
- **Problem:** `buildForm` takes last 5 results by date but treats W/D/L equally regardless of recency. A match from 2 years ago counts the same as yesterday.
- **Fix:** This is acceptable as-is for form (W/D/L is binary), but document the design choice. Form is already sorted by date descending and capped at 5, so recency is implicitly handled by only using recent matches. No code change needed, just documentation.

### Gap 9 — `compareTeams` sort is not stable for identical records across groups [LOW]
- **File:** `scripts/lib/build-standings.js:100-111`
- **Problem:** When `rankThirdPlace` sorts teams from different groups with identical stats, FIFA rules call for drawing of lots. Code just returns `0` (implementation-dependent order).
- **Fix:** Add a deterministic final tiebreaker (e.g., alphabetical team code) so sort is always stable and reproducible across runs. Replace `return 0` with `return a.team.localeCompare(b.team)`.

### Gap 10 — `computeAttackDefence` Elo fallback doesn't weight by number of matches [LOW]
- **File:** `src/engine/calibrate.js:101-106`
- **Problem:** When a team has between 0 and `minMatches` results, the Elo prior is used raw with no blending. A team with 2 matches gets the same Elo-only attack/defence as a team with 0 matches.
- **Fix:** Blend the data-based estimate with the Elo prior when `0 < matches < minMatches`. Use a linear blend: `weight = matches / minMatches`, `result = weight * dataBased + (1 - weight) * eloPrior`.

### Gap 11 — `rankThirdPlace` doesn't exclude teams from groups with fewer than 4 teams [LOW]
- **File:** `scripts/lib/build-standings.js:76-79`
- **Problem:** The code assumes `teamList.length >= 3` means a valid third-place team exists. If a group has fewer than 4 teams (data quality issue), the third-place ranking would include invalid entries.
- **Fix:** Add a guard: only push to `thirdPlaceTeams` if `teamList.length === 4` (or whatever the expected group size is). This is defensive but prevents edge-case corruption.

## Out of Scope

- UI changes
- Knockout bracket resolution logic (beyond the penalty model fix)
- Elo data quality / source changes

## Success Criteria

- All existing tests continue to pass
- New tests cover each gap fix
- `timeDecayWeight` is actually used in attack/defence computation
- Head-to-head tiebreaker follows FIFA ordering
- Fair play score populated when card data present
- Home advantage logic documented and correct for host nations
- Penalty model uses standard Elo expected score formula
- All sort functions are stable and deterministic

## Branch Strategy

New branch `fix/statistics-gaps` from `main` (not from current `fix/matchcard-stats-ux`).

## Dependencies

- `calibrate.js` is shared between Node.js build scripts AND React client (ES modules)
- `build-standings.js` is Node.js only (build script)
- Pipeline order: build-data.js -> compute-teams -> run-predictions -> build-standings -> build-bracket
- Gap 5 is automatically resolved when Gap 1 is fixed (no separate work needed)
- Gap 8 requires documentation only (no code change)
