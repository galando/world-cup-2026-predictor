# Tasks — Mundial 2026 Predictor

## Implementation Order

Tasks ordered by layer: Infrastructure → Core (engine) → Build pipeline → React skeleton → Screens → Share → PWA.

---

## Task 1 — Project scaffolding [SEQUENTIAL]

Traced to: Infrastructure: required by all modules

**Create:** `package.json`, `vite.config.js`, `.gitignore`, `index.html`

**Steps:**
1. Initialize npm project with `"type": "module"` (ESM for build scripts)
2. Install dev dependencies: `react`, `react-dom`, `react-router-dom`, `vite`, `@vitejs/plugin-react`, `vitest`, `react-i18next`, `i18next`, `vite-plugin-pwa`, `html-to-image`
3. Configure Vite with React plugin + PWA plugin placeholder
4. Create minimal `index.html` with Rubik font link

**Validate:** `npm install && npx vite build` (should produce empty dist/)

---

## Task 2 — Dixon-Coles Poisson engine [SEQUENTIAL]

Traced to: Scenario: "Dixon-Coles probabilities sum to 1", "Dixon-Coles correction only affects low-score cells", "Strong team has higher win probability"

**Create:** `src/engine/poisson-dc.js`, `src/engine/__tests__/poisson-dc.test.js`

**Steps:**
1. Implement `poissonPmf(k, lambda)` — Poisson probability mass function
2. Implement `buildGrid(lambdaH, lambdaA, maxGoals=8)` — 9x9 grid
3. Implement `applyDixonColes(grid, lambdaH, lambdaA, rho=-0.05)` — correction on cells (0,0)(0,1)(1,0)(1,1) + normalization
4. Implement `aggregateOutcome(grid)` — home/draw/away probabilities
5. Write unit tests:
   - Probabilities sum to 1.0 (within 0.001)
   - Correction only affects low-score cells
   - Strong team has higher win probability
   - Zero lambda edge case handling

**Validate:** `npx vitest run src/engine/__tests__/poisson-dc.test.js`

---

## Task 3 — Elo calibration module [PARALLEL: with Task 4]

Traced to: Scenario: "Elo-to-lambda conversion produces reasonable expected goals"

**Create:** `src/engine/calibrate.js`, `src/engine/__tests__/calibrate.test.js`

**Steps:**
1. Implement `eloToLambdaDiff(eloDiff)` — converts Elo difference to expected goals difference
2. Implement `getTeamLambda(team, opponent)` — team expected goals using Elo + baseline
3. Implement `timeDecayWeight(matchDate)` — exponential decay for historical data
4. Implement attack/defence parameter computation (from match results when available)
5. Write unit tests:
   - Elo diff 340 -> lambda diff ~0.68
   - Strong team lambda > baseline
   - Weak team lambda < baseline
   - Time decay: 2-year-old match gets ~0.25 weight

**Validate:** `npx vitest run src/engine/__tests__/calibrate.test.js`

---

## Task 4 — Knockout prediction module [PARALLEL: with Task 3]

Traced to: Scenario: "Knockout qualify probabilities include penalties"

**Create:** `src/engine/knockout.js`, `src/engine/__tests__/knockout.test.js`

**Steps:**
1. Implement `predictKnockout(matchId, lambdaH, lambdaA, grid, eloHome, eloAway)`
2. Calculate 90-minute probs (with draw) + qualify probs (draw distributed via penalty model)
3. Penalty probability proportional to Elo ratio
4. Write unit tests:
   - qualify.home + qualify.away = 1.0
   - qualify.home > probs90.home (draw contributes via penalties)
   - Equal Elo = 50/50 qualify

**Validate:** `npx vitest run src/engine/__tests__/knockout.test.js`

---

## Task 5 — Build script data files [SEQUENTIAL: after Task 2]

Traced to: Infrastructure: required by build pipeline

**Create:** `scripts/data/elo-snapshot.csv`, `scripts/data/teams-meta.json`, `scripts/data/r32-seeding-table.json`

**Steps:**
1. Create `elo-snapshot.csv` with 48 teams (columns: team, elo, updated) — use latest available Elo ratings
2. Create `teams-meta.json` with 48 entries — flagIso, nameHE, nameEN, fifaRank, theme palette
3. Create `r32-seeding-table.json` — FIFA's R32 bracket slot assignments for third-place teams
4. Verify JSON files are valid and complete (48 teams each)

**Validate:** `node -e "JSON.parse(require('fs').readFileSync('scripts/data/teams-meta.json'))" && wc -l scripts/data/elo-snapshot.csv`

---

## Task 6 — Build script fetch modules [SEQUENTIAL: after Task 5]

Traced to: Scenario: "Build script handles API failure gracefully", "Rate limiting protects Football-Data.org API calls"

**Create:** `scripts/lib/fetch-openfootball.js`, `scripts/lib/fetch-results.js`, `scripts/lib/load-elo.js`

**Steps:**
1. `fetch-openfootball.js`: GET from raw.githubusercontent.com, parse groups.json + rounds.json
2. `fetch-results.js`: GET from football-data.org with rate limiting (6.5s between requests), `safeFetch` with cached fallback
3. `load-elo.js`: Read CSV, parse to Map<teamCode, elo>
4. Each module exports a single async function
5. Error handling: timeout (10s), HTTP errors, malformed responses → use cached fallback

**Validate:** `node -e "import('./scripts/lib/load-elo.js').then(m => console.log(m.loadElo().size))"` (should print 48)

---

## Task 7 — Build script compute + prediction modules [SEQUENTIAL: after Task 6]

Traced to: Scenario: "Build script produces valid output", "Calibration stats track prediction accuracy"

**Create:** `scripts/lib/compute-teams.js`, `scripts/lib/run-predictions.js`, `scripts/lib/write-artifacts.js`

**Steps:**
1. `compute-teams.js`: Filter finished matches, apply time-decay, compute attack/defence params with Elo prior
2. `run-predictions.js`: Import poisson-dc.js + calibrate.js + knockout.js, iterate all 104 matches, produce predictions[]
3. `write-artifacts.js`: Write 7 JSON files to public/data/ with validation (probs sum check, lambda positivity)
4. Add `validatePredictions()` guard before writing

**Validate:** `node scripts/build-data.js && ls -la public/data/` (should show 7+ JSON files)

---

## Task 8 — Build script standings + bracket [SEQUENTIAL: after Task 7]

Traced to: Scenario: "Group standings sort with 5-criteria tiebreaker", "Best 3rd-place teams advance correctly", "Round-of-32 seeding table resolves correctly"

**Create:** `scripts/lib/build-standings.js`, `scripts/lib/build-bracket.js`

**Steps:**
1. `build-standings.js`: Group teams by group, compute P/W/D/L/GF/GA/GD/Pts/fairPlay, sort with 5-criteria tiebreaker, rank third-place teams (top 8 advance)
2. `build-bracket.js`: Resolve knockout bracket using standings + R32 seeding table, compute tiePredict per unresolved slot
3. Write tests for both modules
4. Verify bracket produces 32 knockout matches from 24 auto-qualified + 8 best third-place

**Validate:** `npx vitest run scripts/__tests__/ && node scripts/build-data.js`

---

## Task 9 — Build script orchestrator + GitHub Actions [SEQUENTIAL: after Task 8]

Traced to: Scenario: "Build script produces valid output"

**Create:** `scripts/build-data.js`, `.github/workflows/update-data.yml`

**Steps:**
1. Wire all modules in correct execution order (load → fetch → merge → compute → predict → standings → bracket → write)
2. Add timing logs and error summary
3. Create GitHub Actions workflow with cron schedule (*/30), Node 20 setup, secret references
4. Add `scripts/cache/` directory for fallback data

**Validate:** `node scripts/build-data.js` end-to-end; verify all 7 JSON files in public/data/

---

## Task 10 — Build script tests [PARALLEL: with Task 11]

Traced to: Scenario: "Best 3rd-place teams advance correctly", "Group standings sort with 5-criteria tiebreaker", "Round-of-32 seeding table resolves correctly"

**Create:** `scripts/__tests__/build-standings.test.js`, `scripts/__tests__/build-bracket.test.js`, `scripts/__tests__/build-data.test.js`

**Steps:**
1. Test third-place ranking with known data (12 teams, verify sort order + top 8 selection)
2. Test group standings with tiebreaker scenarios
3. Test bracket cascade resolution
4. Test build-data integration (mock external fetches, verify output structure)

**Validate:** `npx vitest run scripts/__tests__/`

---

## Task 11 — React project + CSS foundation [PARALLEL: with Task 10]

Traced to: Infrastructure: required by all screens, Scenario: "User selects a team theme"

**Create:** `src/main.jsx`, `src/App.jsx`, `src/theme.css`, `src/index.css`

**Steps:**
1. Configure Vite for React (already in vite.config.js from Task 1)
2. Create App.jsx with React Router v6 (createHashRouter) + route definitions
3. Create theme.css with CSS variable definitions (default pitch green theme)
4. Create index.css with global reset + RTL base styles
5. Verify dev server starts: `npx vite`

**Validate:** `npx vite build` (should produce dist/ with index.html)

---

## Task 12 — React hooks [SEQUENTIAL: after Task 11]

Traced to: Scenario: "User views pre-match prediction", "User switches language", "User selects a team theme", "User submits a score guess", "App works offline"

**Create:** `src/hooks/useData.js`, `src/hooks/useTheme.js`, `src/hooks/useLang.js`, `src/hooks/useGuess.js`

**Steps:**
1. `useData.js`: Module-level cache Map, fetch-once pattern, loading/error state
2. `useTheme.js`: Read team from localStorage, apply CSS variables to :root
3. `useLang.js`: react-i18next integration, localStorage persistence, RTL dir attribute
4. `useGuess.js`: Per-matchId guess state in localStorage, save/load/clear

**Validate:** `npx vitest run src/hooks/` (if tests) or manual verification in dev server

---

## Task 13 — i18n setup [PARALLEL: with Task 12]

Traced to: Scenario: "User switches language"

**Create:** `src/i18n/he.json`, `src/i18n/en.json`, `src/i18n/index.js`

**Steps:**
1. Create he.json with all Hebrew strings (match labels, screen titles, button text, feedback messages, offline banner, share text)
2. Create en.json with English equivalents
3. Create index.js with i18next.init configuration (language from localStorage, fallback 'he')
4. Ensure all strings cover: HomeScreen, PreMatchScreen, TeamScreen, TeamPickerScreen, BracketScreen, share cards, error states

**Validate:** `node -e "import('./src/i18n/index.js')" && diff <(jq -S 'keys' src/i18n/he.json) <(jq -S 'keys' src/i18n/en.json)` (keys should match)

---

## Task 14 — Shared components (atoms) [SEQUENTIAL: after Task 12]

Traced to: Scenario: "User views pre-match prediction", Infrastructure: required by all screens

**Create:** Flag, FormDot, FormRow, MiniLean, Card, Btn, Pitch, Ico, StageChip, Skeleton, CalibrationBadge

**Steps:**
1. Create each component as a directory with index.jsx + styles.module.css
2. Flag: team flag image from flagcdn.com with crossOrigin
3. FormDot/FormRow: win/draw/loss dots + last-5 row
4. MiniLean: mini home/draw/away bar
5. Card/Btn: reusable styled containers/buttons
6. Pitch: SVG pitch background pattern
7. Ico: inline SVG icon set (share, settings, back, etc.)
8. StageChip: group/R32/R16/QF/SF/Final label chip
9. Skeleton: loading placeholder
10. CalibrationBadge: model accuracy display

**Validate:** `npx vite build` (no import errors)

---

## Task 15 — PreMatchScreen components [SEQUENTIAL: after Task 14]

Traced to: Scenario: "User views pre-match prediction", "User submits a score guess"

**Create:** PredictionBars, PredictionDonut, WhyPanel, ScorelineGrid, LikelyScores, DigitStepper, GuessArea, FeedbackCard, ResultCard, TeamCompare

**Steps:**
1. PredictionBars: horizontal bars for home/draw/away percentages
2. PredictionDonut: donut chart toggle for probability visualization
3. WhyPanel: accordion showing factor chain per team (multiplier dots)
4. ScorelineGrid: 7x7 interactive probability matrix
5. LikelyScores: top-4 scoreline list
6. DigitStepper: 0-9 stepper for score input
7. GuessArea: home/away steppers + submit button
8. FeedbackCard: guess feedback with model comparison
9. ResultCard: post-match result display
10. TeamCompare: side-by-side team comparison header

**Validate:** Navigate to /match/A-1 in dev server; verify all components render

---

## Task 16 — PreMatchScreen assembly [SEQUENTIAL: after Task 15]

Traced to: Scenario: "User views pre-match prediction", "User submits a score guess", "Knockout qualify probabilities include penalties"

**Create:** `src/screens/PreMatchScreen/index.jsx`

**Steps:**
1. Assemble all sub-components in correct layout order
2. Load data via useData (match, prediction, teams, teams-meta)
3. Wire GuessArea with useGuess (save to localStorage)
4. Wire FeedbackCard (show after guess submit)
5. Add QualifyBlock for knockout matches
6. Add sticky top bar with back navigation + share button
7. Handle match not found (invalid matchId)

**Validate:** Full PreMatchScreen renders with real data from public/data/

---

## Task 17 — MatchCard + HomeScreen [SEQUENTIAL: after Task 16]

Traced to: Scenario: "User views pre-match prediction"

**Create:** `src/components/MatchCard/`, `src/components/FilterBar/`, `src/components/EmptyState/`, `src/screens/HomeScreen/index.jsx`

**Steps:**
1. MatchCard: flags, names, date/time, venue, stage chip, mini prediction bars, score if finished
2. Preferred team styling: gold border, star icon, float to top
3. FilterBar: chips for all/my-team/group(A-L)/stage
4. EmptyState: empty filter result message
5. HomeScreen: header + filter + match list sorted by date
6. Wire navigation to PreMatchScreen on card tap

**Validate:** HomeScreen renders match list; filter chips work; card tap navigates

---

## Task 18 — TeamScreen + TeamPickerScreen [PARALLEL: with Task 19]

Traced to: Scenario: "User switches language", "User selects a team theme"

**Create:** `src/screens/TeamScreen/index.jsx`, `src/screens/TeamPickerScreen/index.jsx`

**Steps:**
1. TeamScreen: hero (flag w160, name, FIFA rank, Elo), stat strip, tournament matches, head-to-head
2. TeamPickerScreen: language toggle section, theme section, team grid (4 columns, 48 teams), clear button
3. Language toggle: independent of team selection, triggers dir flip
4. Team grid: theme preview on hover, checkmark + ring on select, greyed out for no-theme teams

**Validate:** Navigate to /team/ARG and /settings; verify both screens render

---

## Task 19 — BracketScreen [PARALLEL: with Task 18]

Traced to: Scenario: "User overrides bracket slot"

**Create:** `src/screens/BracketScreen/index.jsx`, `src/components/BracketTie/`, `src/components/Trophy/`

**Steps:**
1. BracketTie: two team rows with qualify%, winner highlight, tap to override
2. Bracket layout: R32 -> R16 -> QF -> SF -> Final -> Champion
3. Cascade logic: override resets downstream to model prediction
4. Trophy component: champion reveal card
5. "Fill by model" button: auto-fill all unresolved slots
6. Persist user overrides in localStorage

**Validate:** Bracket renders; tap override works; cascade resets downstream

---

## Task 20 — Share system [SEQUENTIAL: after Tasks 18, 19]

Traced to: Scenario: "User shares match prediction", "User shares bracket"

**Create:** `src/share/ShareCardSquare/`, `src/share/BracketCard/`, `src/share/renderToImage.js`

**Steps:**
1. renderToImage.js: html-to-image with pixelRatio:2, canvas fallback, font preloading
2. ShareCardSquare: 320x320 pitch gradient, brand row, flags+score, model feedback, URL
3. BracketCard: 360x360 champion, bracket summary, picks count, URL
4. Web Share API integration with download fallback for desktop
5. Ensure all img tags have crossOrigin="anonymous"

**Validate:** Generate share image from PreMatchScreen and BracketScreen; verify PNG output

---

## Task 21 — PWA configuration [SEQUENTIAL: after Task 20]

Traced to: Scenario: "App works offline"

**Modify:** `vite.config.js` (add PWA plugin config)
**Create:** PWA icons (`public/icon-192.png`, `public/icon-512.png`)

**Steps:**
1. Configure vite-plugin-pwa in vite.config.js (manifest, workbox, runtime caching for /data/*.json)
2. Create app icons (192x192, 512x512)
3. Add offline banner component (shows when navigator.onLine === false)
4. Add install prompt banner (after 2 visits, dismissible)
5. NetworkFirst strategy for data JSON files (try network, fallback to cache)

**Validate:** `npx vite build` produces service worker; Lighthouse PWA audit passes

---

## Task 22 — Final integration + polish [SEQUENTIAL: after Task 21]

Traced to: Scenario: "App works offline", "User switches language"

**Steps:**
1. Full RTL/LTR testing in both Hebrew and English
2. Mobile viewport testing (375px - 428px width)
3. Verify all routes work with hash-based deep links
4. Performance audit (Lighthouse: PWA, Performance, Accessibility)
5. Verify offline behavior (disable network in DevTools)
6. Cross-browser testing (Chrome, Safari, Firefox)
7. Final review of all JSON data contracts

**Validate:** Lighthouse score > 90 for Performance, > 80 for Accessibility, PWA passes

---

## Task Summary

| Task | Description | Dependencies | Parallel? |
|------|-------------|-------------|-----------|
| 1 | Project scaffolding | None | Sequential |
| 2 | Dixon-Coles engine | 1 | Sequential |
| 3 | Elo calibration | 1 | With Task 4 |
| 4 | Knockout module | 1 | With Task 3 |
| 5 | Build data files | 2 | After Task 2 |
| 6 | Build fetch modules | 5 | After Task 5 |
| 7 | Build compute modules | 6 | After Task 6 |
| 8 | Build standings + bracket | 7 | After Task 7 |
| 9 | Build orchestrator + CI | 8 | After Task 8 |
| 10 | Build script tests | 8 | With Task 11 |
| 11 | React + CSS foundation | 2 | With Task 10 |
| 12 | React hooks | 11 | After Task 11 |
| 13 | i18n setup | 11 | With Task 12 |
| 14 | Shared components | 12 | After Task 12 |
| 15 | PreMatch sub-components | 14 | After Task 14 |
| 16 | PreMatchScreen assembly | 15 | After Task 15 |
| 17 | HomeScreen | 16 | After Task 16 |
| 18 | Team + Picker screens | 16 | With Task 19 |
| 19 | BracketScreen | 16 | With Task 18 |
| 20 | Share system | 18, 19 | After Tasks 18+19 |
| 21 | PWA configuration | 20 | After Task 20 |
| 22 | Final integration | 21 | After Task 21 |

**Estimated total files: ~65**
**Estimated effort: 22 tasks across 10 stages**
