# Mundial 2026 Predictor — Technical Implementation Plan (v3, Full Detail)

---

## 0. Critical Findings Before You Start

Before implementing, three architecture-level facts verified against research:

**1. eloratings.net has no API — scraping it is fragile.**
Use a versioned pre-compiled CSV snapshot from the community mirror instead of live scraping. The build script loads a committed `data/elo-snapshot.csv` file. When a new version is available, update the file manually and commit. This is more reliable than scraping a production site every 30 minutes.

**2. Football-Data.org free tier has DELAYED results.**
Scores are not real-time. For a predictor app this is acceptable — "updated every 30 min" matches the free tier's access model. Do not promise live scores in the UI. Show `lastUpdated` prominently.

**3. "Best 3rd place" qualification is non-trivial.**
The 8 best 3rd-place teams (out of 12) advance to the Round of 32. Ranking uses 5 sequential tiebreakers (points → goal diff → goals scored → fair play → FIFA ranking). This must be implemented correctly or the bracket will break.

---

## 1. Macro Architecture

**Separation of fetch from serve** — no user ever calls an external API:

```
┌─────────────────────────────────────────────────────────────┐
│  GitHub Actions Cron (every 30 min during tournament)       │
│                                                             │
│  [openfootball/worldcup.json]  ─┐                          │
│  [Football-Data.org API]       ─┼→ scripts/build-data.js   │
│  [data/elo-snapshot.csv]       ─┘        │                  │
│                                          ▼                  │
│                               Dixon-Coles engine           │
│                               + 3rd-place ranking          │
│                               + bracket resolution          │
│                                          │                  │
│                                          ▼                  │
│                              public/data/*.json (static)   │
│                                          │                  │
│                                   git push / R2 upload     │
└─────────────────────────────────────────────────────────────┘
                                           │
                                    CDN (Cloudflare Pages)
                                           │
                               ┌───────────┴───────────┐
                               │    Web Browser (PWA)  │
                               │    iOS App (Capacitor) │
                               │    Android (Capacitor) │
                               └───────────────────────┘
```

---

## 2. Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | React + Vite | Confirmed in prototype |
| Styling | CSS Modules + CSS Variables | No runtime overhead, theme via var() swap |
| Font | Rubik (Google Fonts) | Geometric, sports-style numerals |
| Routing | React Router v6 (hash mode) | Works on static CDN without server config |
| State | React Context + localStorage | Scope is small; no need for Zustand/Jotai |
| i18n | `react-i18next` | Well-maintained, tiny, supports RTL out of the box |
| Animation | CSS transitions + `@keyframes` | No library needed for this scope |
| Share | `html-to-image` + Canvas fallback | See Section 7 |
| PWA | `vite-plugin-pwa` | One-line Vite integration |
| Mobile | Capacitor v6 (Phase 2) | Wraps same codebase for App Store |
| Build script | Node.js ESM | Runs in GitHub Actions |
| Hosting | Cloudflare Pages | Free, fast CDN, edge network |
| Cron | GitHub Actions | Free 2000 min/month, cron trigger |

---

## 3. Data Sources — Detailed

### 3.1 openfootball/worldcup.json ✅ Confirmed for 2026

- **URL**: `https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/`
- **Files**: `groups.json` (48 teams, 12 groups) + `rounds.json` (104 fixtures with dates/venues)
- **License**: Public domain
- **Rate limit**: None (raw GitHub CDN)
- **Update frequency**: Manual commits; fixture list is static after the draw; results added as they happen
- **What it gives**: Match schedule, group assignments, venues, results as they are entered
- **Limitation**: Results entry can lag 1–6 hours after the match; not a substitute for live scores
- **Fallback**: If the repo is temporarily unreachable, use the previously-cached `public/data/matches.json`

### 3.2 Football-Data.org (free tier) ⚠️ Delayed results

- **Endpoint**: `https://api.football-data.org/v4/competitions/WC/matches`
- **Auth**: `X-Auth-Token: YOUR_KEY` header (register free at football-data.org)
- **Rate limit**: 10 requests per minute
- **World Cup coverage**: Yes, competition code `WC`
- **Result delay**: Several minutes to ~1 hour delay on free tier (not real-time)
- **What it gives**: Official match results, standings, current round
- **What it does NOT give on free tier**: Lineups, player stats, formations, xG
- **Usage in build script**: Poll once per build run (not every minute). At 30-min cron interval = 48 calls/day, well within limits.

### 3.3 Elo Ratings ⚠️ Scraping fragile — use CSV snapshot

**Do NOT live-scrape eloratings.net.** Instead:
- Commit `scripts/data/elo-snapshot.csv` to the repo (columns: `team_name,elo,date`).
- Source: Download manually from `eloratings.net` or a community mirror once before the tournament, and after each matchday.
- The build script reads this file — zero network calls, zero fragility.
- **Format expected**:
  ```csv
  team,elo,updated
  Argentina,2140,2026-05-28
  France,2050,2026-05-28
  Brazil,2010,2026-05-28
  ...
  ```
- **Update cadence**: Re-download and commit after each match window (FIFA A-match dates, then each match day during the tournament). This is ~8–12 manual updates total. Acceptable.
- **Backup source**: `worldfootballrankings.com` publishes the same Elo methodology and can be used as a cross-check.

### 3.4 Team Meta (visual + static config)

- `scripts/data/teams-meta.json` — committed to repo, 48 entries, maintained manually
- Contains: ISO flag code, display names (HE/EN), theme palette, FIFA ranking
- Updated once before the tournament; minor tweaks during
- **Format**: See Section 5.2

### 3.5 Flags

- Source: `https://flagcdn.com/w{size}/{iso-code}.png`
- Sizes used: `w40` (list), `w80` (card), `w160` (hero)
- No API key, no rate limit
- **CORS note**: Add `crossOrigin="anonymous"` on every `<img>` tag that will be used inside the share card canvas render

---

## 4. Tournament Format — 2026

Understanding this is required before touching the bracket or standings logic.

```
48 teams → 12 groups (A–L) of 4 teams each
Each team plays 3 group matches → 6 matches per group → 72 group matches total

Qualification from group stage:
  - Top 2 from each group = 24 teams (automatic)
  - Best 8 of the 12 third-place teams = 8 teams (ranked)
  Total: 32 teams → Round of 32

Knockout rounds:
  Round of 32 → Round of 16 → Quarterfinals → Semifinals → Final
  = 16 + 8 + 4 + 2 + 1 + 1 (3rd place) = 32 knockout matches

Grand total: 72 + 32 = 104 matches ✓
```

### 4.1 "Best 3rd Place" Algorithm (must implement correctly)

The 12 third-place teams are ranked by these criteria **in order**:

1. Points
2. Goal difference
3. Goals scored
4. Fair play score: yellow = –1, indirect red = –3, direct red = –4, yellow+red = –5
5. FIFA World Ranking (lower number = higher rank)

```javascript
function rankThirdPlace(teams) {
  return [...teams].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    if (b.fairPlay !== a.fairPlay) return b.fairPlay - a.fairPlay;
    return a.fifaRanking - b.fifaRanking; // lower number = better
  });
}
// returns sorted array; top 8 advance
```

### 4.2 Round of 32 Bracket Seeding

FIFA pre-assigns which group's third-place team goes into which bracket slot. This seeding table must be hardcoded as a lookup (12C8 = 495 possible combinations → FIFA publishes the exact table). Commit it as `scripts/data/r32-seeding-table.json`.

---

## 5. Data Files — Static Artifacts

> **Optimization**: Never split predictions into per-match files. One `predictions.json` (~150–200KB) downloaded once per session. All navigation = 0 network calls after initial load.

### 5.1 File Map

```
public/data/
  matches.json          # 104 matches: id, date, venue, stage, homeTeam, awayTeam, status, score
  predictions.json      # Dixon-Coles output for all 104 matches (see schema 5.3)
  teams.json            # 48 teams: elo, form, avgGoals, avgConceded, sqadNote, fifaRank
  teams-meta.json       # visual config: flagIso, nameHE, nameEN, theme palette
  standings.json        # 12 groups: each team's P/W/D/L/GF/GA/GD/Pts/fairPlay
  bracket.json          # knockout tree: current state + tiePredict per slot
  calibration.json      # { played, winnerHit, exactHit, brier, since }
  lastUpdated.json      # { iso: "2026-06-01T14:30:00Z", source: "football-data.org" }
```

### 5.2 teams-meta.json entry

```json
{
  "ARG": {
    "flagIso": "ar",
    "nameHE": "ארגנטינה",
    "nameEN": "Argentina",
    "fifaRank": 1,
    "theme": {
      "field":      "#0d2747",
      "field2":     "#081a31",
      "card":       "#143258",
      "line":       "rgba(255,255,255,0.05)",
      "accent":     "#74b4e6",
      "accentInk":  "#0a1b30",
      "glow":       "rgba(116,180,230,0.4)"
    }
  }
}
```

### 5.3 predictions.json entry schema

```json
{
  "matchId": "A-1",
  "stage": "group",
  "lambdaHome": 1.82,
  "lambdaAway": 0.74,
  "rho": -0.05,
  "factors": {
    "home": {
      "lambda": 1.82,
      "chain": [
        { "key": "base",  "label_he": "בסיס",         "mult": 1.35 },
        { "key": "atk",   "label_he": "כוח התקפה",    "mult": 1.78 },
        { "key": "def",   "label_he": "הגנת יריב",     "mult": 0.52 },
        { "key": "form",  "label_he": "כושר אחרון",   "mult": 1.09 },
        { "key": "venue", "label_he": "יתרון מגרש",   "mult": 1.12 }
      ]
    },
    "away": { "lambda": 0.74, "chain": [...] }
  },
  "probs": { "home": 0.61, "draw": 0.24, "away": 0.15 },
  "qualify": null,
  "topScores": [
    { "score": "2-0", "h": 2, "a": 0, "p": 0.14 },
    { "score": "1-0", "h": 1, "a": 0, "p": 0.12 },
    { "score": "2-1", "h": 2, "a": 1, "p": 0.11 },
    { "score": "1-1", "h": 1, "a": 1, "p": 0.09 }
  ],
  "scoreMatrix": [
    [0.043, 0.032, ...],
    ...
  ],
  "modelVersion": "dc-1.0"
}
```

For knockout matches: `"qualify": { "home": 0.72, "away": 0.28 }`, and `"stage"` is one of `"r32" | "r16" | "qf" | "sf" | "final"`.

---

## 6. Prediction Engine — Dixon-Coles

### 6.1 Model File: `src/engine/poisson-dc.js`

This file is **shared between the build script and the client**. Import it in both.

```
src/engine/
  poisson-dc.js     # core math
  calibrate.js      # Elo → lambda conversion + time-decay weighting
  knockout.js       # qualify probability for knockout rounds
```

### 6.2 Core Math

**Step 1 — Expected goals (lambda):**
```
lambda_home = exp( attack_home + defence_away + home_adv )
lambda_away = exp( attack_away + defence_home )
```
`home_adv` is non-zero only for Mexico, USA, Canada (the three hosts). Set to `ln(1.15)` ≈ 0.14 as a reasonable prior; refine after group-stage data accumulates.

**Step 2 — Poisson grid (9×9):**
```javascript
function poissonPmf(k, lambda) {
  return Math.exp(-lambda) * Math.pow(lambda, k) / factorial(k);
}

function buildGrid(lambdaH, lambdaA, maxGoals = 8) {
  const grid = [];
  for (let h = 0; h <= maxGoals; h++) {
    grid[h] = [];
    for (let a = 0; a <= maxGoals; a++) {
      grid[h][a] = poissonPmf(h, lambdaH) * poissonPmf(a, lambdaA);
    }
  }
  return grid;
}
```

**Step 3 — Dixon-Coles correction with `rho = -0.05`:**

> **Use `rho = -0.05` as a fixed constant for the MVP.** Do not attempt MLE optimization yet — it requires >50 match results to converge and will produce worse estimates than the fixed value at tournament start.

```javascript
function applyDixonColes(grid, lambdaH, lambdaA, rho = -0.05) {
  const g = grid.map(row => [...row]);
  g[0][0] *= (1 - lambdaH * lambdaA * rho);
  g[1][0] *= (1 + lambdaA * rho);
  g[0][1] *= (1 + lambdaH * rho);
  g[1][1] *= (1 - rho);
  // normalize
  const sum = g.flat().reduce((a, b) => a + b, 0);
  return g.map(row => row.map(v => v / sum));
}
```

**Step 4 — Aggregate:**
```javascript
function aggregateOutcome(grid) {
  let home = 0, draw = 0, away = 0;
  grid.forEach((row, h) =>
    row.forEach((p, a) => {
      if (h > a) home += p;
      else if (h === a) draw += p;
      else away += p;
    })
  );
  return { home, draw, away };
}
```

### 6.3 Team Strength Calibration (`calibrate.js`)

Since World Cup teams play rarely, use Elo as the primary signal:

```javascript
// Elo difference → expected goals difference (calibrated on 2010–2022 WC data)
function eloToLambdaDiff(eloDiff) {
  return eloDiff / 400 * 0.8; // empirically: 400 Elo ≈ 0.8 goal advantage
}

function getTeamLambda(team, opponent) {
  const eloDiff = team.elo - opponent.elo;
  const avgGoals = 1.35; // historical WC average goals per team per game
  return avgGoals * Math.exp(eloToLambdaDiff(eloDiff));
}
```

Time-decay weight for historical match data (used when enough results accumulate):
```
weight(matchDate) = exp( -0.0018 * daysSince(matchDate) )
```
`0.0018` ≈ half-life of ~385 days; a match 2 years ago gets weight ≈ 0.25.

**Attack/Defence parameters** (used once we have tournament results):
```
attack[team]   = log(avgGoalsScored[team]) - log(avgGoalsScored[all])
defence[team]  = log(avgGoalsConceded[team]) - log(avgGoalsConceded[all])
```
Start from Elo-derived prior; update incrementally after each match day.

### 6.4 Knockout Round Predictions (`knockout.js`)

For stages r32, r16, qf, sf, final — two outputs:

```javascript
function predictKnockout(matchId, lambdaH, lambdaA, grid, eloHome, eloAway) {
  const probs90 = aggregateOutcome(grid); // includes draw
  // penalty probability: proportional to Elo
  const pHomePens = eloHome / (eloHome + eloAway);
  const qualify = {
    home: probs90.home + probs90.draw * pHomePens,
    away: probs90.away + probs90.draw * (1 - pHomePens)
  };
  return { probs90, qualify };
}
```

**UI rule**: Always show BOTH blocks in knockout matches:
- "תוצאת 90 דקות" (with draw bar) — for "guess the score" feature
- "עלייה לשלב הבא" (home/away only, no draw) — for bracket progression

---

## 7. Build Script — Full Specification

### 7.1 File: `scripts/build-data.js`

```
scripts/
  build-data.js          # main entry point
  lib/
    fetch-openfootball.js  # GET worldcup.json fixtures
    fetch-results.js       # GET football-data.org results
    load-elo.js            # read elo-snapshot.csv
    compute-teams.js       # calculate attack/defence from history
    run-predictions.js     # Dixon-Coles for all 104 matches
    build-standings.js     # group tables with tiebreaker sort
    build-bracket.js       # knockout tree + qualify probs
    write-artifacts.js     # write all public/data/*.json
  data/
    elo-snapshot.csv       # committed, updated manually
    teams-meta.json        # committed, maintained manually
    r32-seeding-table.json # hardcoded FIFA seeding table
```

### 7.2 Build Execution Order

```
1. load elo-snapshot.csv → Map<teamCode, elo>
2. load teams-meta.json → Map<teamCode, meta>
3. fetch openfootball fixtures → raw match list (104 entries)
4. fetch football-data.org results (with rate limiting: max 8 req/burst, sleep 60s between pages)
5. merge: attach actual scores to fixture list
6. compute-teams:
   a. filter matches with status === 'FINISHED'
   b. apply time-decay weights
   c. compute attack[]/defence[] with Elo prior (MLE if ≥20 finished matches, else Elo-only)
7. run-predictions: Dixon-Coles for all 104 matches → predictions[]
8. build-standings: group tables with 5-criterion sort for 3rd place
9. build-bracket: resolve current knockout bracket + tiePredict per unplayed slot
10. compute calibration stats (played, winnerHit, exactHit, brier score)
11. write all JSON files to public/data/
```

### 7.3 Rate Limiting Football-Data.org

```javascript
async function fetchWithRateLimit(urls) {
  const results = [];
  for (const url of urls) {
    const res = await fetch(url, { headers: { 'X-Auth-Token': process.env.FD_API_KEY } });
    results.push(await res.json());
    await sleep(6500); // 10 req/min → 1 req per 6.5s with safety margin
  }
  return results;
}
```

### 7.4 Error Handling Strategy

```javascript
// Each fetch is wrapped: fail gracefully, use last-known-good data
async function safeFetch(url, fallbackFile) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`[build] fetch failed for ${url}: ${err.message} — using cached fallback`);
    return JSON.parse(fs.readFileSync(fallbackFile, 'utf8'));
  }
}
```

Fallback files = the previous build's output committed to `scripts/cache/`. The cron never leaves the site in a broken state.

### 7.5 Data Validation Before Writing

```javascript
function validatePredictions(predictions) {
  for (const p of predictions) {
    const sum = p.probs.home + p.probs.draw + p.probs.away;
    if (Math.abs(sum - 1) > 0.001) throw new Error(`probs don't sum to 1 for ${p.matchId}`);
    if (p.lambdaHome <= 0 || p.lambdaAway <= 0) throw new Error(`invalid lambda for ${p.matchId}`);
  }
}
// Never write broken JSON to disk
```

### 7.6 GitHub Actions Config

```yaml
# .github/workflows/update-data.yml
name: Update Match Data

on:
  schedule:
    - cron: '*/30 * * * *'   # every 30 min during tournament
  workflow_dispatch:            # manual trigger for testing

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GH_PAT }}   # PAT with repo write permission

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci --workspace=scripts

      - name: Run build
        env:
          FD_API_KEY: ${{ secrets.FD_API_KEY }}
        run: node scripts/build-data.js

      - name: Commit updated data
        run: |
          git config user.email "bot@mundial-predictor.app"
          git config user.name "Data Bot"
          git add public/data/
          git diff --staged --quiet || git commit -m "chore: update match data $(date -u +%Y-%m-%dT%H:%M:%SZ)"
          git push
```

**Secrets required in repo settings**:
- `FD_API_KEY`: Football-Data.org API key (free tier)
- `GH_PAT`: Personal Access Token with `repo` scope (for the push step)

---

## 8. Frontend Architecture

### 8.1 Project Structure

```
src/
  engine/
    poisson-dc.js        # shared with build script
    knockout.js
    calibrate.js
  hooks/
    useData.js           # fetch + memory cache + error state
    useTheme.js          # CSS variable injection from localStorage
    useLang.js           # i18n language from localStorage
    useGuess.js          # guess state per matchId (localStorage)
  components/
    Flag/
    FormDot/
    FormRow/
    MiniLean/
    PredictionBars/
    PredictionDonut/
    ScorelineGrid/
    Card/
    Btn/
    Pitch/               # SVG pitch background
    Ico/                 # inline SVG icon set
    StageChip/
    Skeleton/
    CalibrationBadge/
    WhyPanel/
    DigitStepper/
    LikelyScores/
    GuessArea/
    FeedbackCard/
    ResultCard/
    TeamCompare/
    MatchCard/
    FilterBar/
    BracketTie/
    Trophy/
  screens/
    HomeScreen/
    PreMatchScreen/
    TeamScreen/
    TeamPickerScreen/
    BracketScreen/
  share/
    ShareCardSquare/     # 320×320 share image component
    BracketCard/         # 360×360 bracket share image
    renderToImage.js     # html-to-image + canvas fallback
  i18n/
    he.json              # Hebrew strings
    en.json              # English strings
    index.js             # react-i18next setup
  App.jsx
  main.jsx
  theme.css              # :root CSS variables
  index.css              # global reset + base styles
```

### 8.2 Data Loading (`useData.js`)

```javascript
// Fetches all JSON once, caches in module-level Map, never re-fetches
const cache = new Map();

export function useData(key) {
  const [data, setData] = useState(cache.get(key) ?? null);
  const [loading, setLoading] = useState(!cache.has(key));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (cache.has(key)) return;
    fetch(`/data/${key}.json`)
      .then(r => r.json())
      .then(d => { cache.set(key, d); setData(d); setLoading(false); })
      .catch(e => { setError(e); setLoading(false); });
  }, [key]);

  return { data, loading, error };
}
```

Load order on app start: `matches` + `teams` + `teams-meta` → parallel. `predictions` deferred until first PreMatch screen is opened (largest file).

### 8.3 Routing

Using React Router v6 in hash mode (`createHashRouter`) for CDN compatibility:

```
/                     → HomeScreen
/match/:matchId       → PreMatchScreen
/team/:teamCode       → TeamScreen
/bracket              → BracketScreen
/settings             → TeamPickerScreen
```

Back navigation uses `useNavigate(-1)`. Deep links work on all platforms.

### 8.4 Theme System

```javascript
// useTheme.js
export function useTheme() {
  const [teamCode, setTeamCode] = useState(
    () => localStorage.getItem('theme_team') ?? null
  );
  useEffect(() => {
    const root = document.documentElement;
    const meta = teamCode ? teamsMetaCache[teamCode]?.theme : defaultTheme;
    Object.entries(meta).forEach(([k, v]) => root.style.setProperty(`--${k}`, v));
  }, [teamCode]);
  const setTeam = code => { setTeamCode(code); localStorage.setItem('theme_team', code); };
  return { teamCode, setTeam };
}
```

Default theme (dark green/pitch) defined in `theme.css`. Team themes override via inline style on `:root`.

### 8.5 Internationalization

Using `react-i18next`. Language is **independent of team theme** — a user can support Argentina and read in English.

```javascript
// i18n/index.js
i18next.init({
  lng: localStorage.getItem('lang') ?? 'he',
  resources: { he: { translation: heStrings }, en: { translation: enStrings } },
  interpolation: { escapeValue: false }
});
```

RTL/LTR: `<html dir={i18n.language === 'he' ? 'rtl' : 'ltr'}>` — updated reactively on language change.

### 8.6 CSS Variable Definitions

```css
/* theme.css — default (pitch green) */
:root {
  --ink: #f3f7f4;
  --ink-dim: rgba(243, 247, 244, 0.62);
  --ink-faint: rgba(243, 247, 244, 0.40);
  --win:   #46c98a;
  --drawc: #d8b24a;
  --loss:  #e0726a;
  --away:  #8ba2af;
  --field:       #0d1f14;
  --field2:      #091509;
  --card:        #132819;
  --line:        rgba(255, 255, 255, 0.05);
  --accent:      #46c98a;
  --accent-ink:  #07140c;
  --glow:        rgba(70, 201, 138, 0.40);
  --radius-card: 20px;
  --radius-btn:  999px;
}
```

---

## 9. Screen Specifications

### 9.1 HomeScreen

**Data**: `matches`, `teams-meta`, `lastUpdated`

**Sections**:
1. App header: logo + settings icon → TeamPicker
2. Subtitle: "כל אחוז מגיע ממודל שקוף" + `lastUpdated` chip
3. `FilterBar`: chips — הכל / הנבחרת שלי / לפי בית (A–L) / לפי שלב
4. Banner: "חזה את הטורניר כולו →" → BracketScreen
5. Match list: `MatchCard` × N, sorted by date
   - If "הנבחרת שלי" filter active and team has no more games: `EmptyState` + "הנבחרת שלך סיימה את הדרך"
6. `EmptyState` if filter returns 0 results

**MatchCard fields**: flags (w40), home/away names, date/time local, venue city, `StageChip`, `MiniLean` (home%/draw%/away%), score if finished.

**Preferred team**: MatchCards for `teamCode` float to top, gold border, star icon.

### 9.2 PreMatchScreen

**Data**: `matches[matchId]`, `predictions[matchId]`, `teams[homeCode]`, `teams[awayCode]`, `teams-meta`

**Layout** (scroll, sticky top bar):

```
┌─ TopBar (sticky) ────────────────────────────────────┐
│  ← back    Argentina – Mexico    [share icon]         │
└──────────────────────────────────────────────────────┘

StageChip + "יום שישי 13.6 · 21:00 · MetLife Stadium"

┌─ TeamCompare ────────────────────────────────────────┐
│  [ARG flag]              [MEX flag]                   │
│  ארגנטינה                מקסיקו                       │
│  FIFA #1                 FIFA #12                     │
│  FormRow W W W D W       FormRow D W L W W            │
│  1.9 ⚽ / 0.6 ☁          1.1 ⚽ / 1.2 ☁              │
│  [→ TeamScreen]          [→ TeamScreen]               │
└──────────────────────────────────────────────────────┘

┌─ PredictionBlock ────────────────────────────────────┐
│  "תחזית המודל"   [CalibrationBadge]   [donut toggle]  │
│                                                        │
│  ████████████████████  61%  ארגנטינה                  │
│  ████████             24%  תיקו                       │
│  █████                15%  מקסיקו                     │
│                                                        │
│  ▼ "איך הגענו לאחוזים האלה?" (WhyPanel accordion)    │
└──────────────────────────────────────────────────────┘

[knockout only: QualifyBlock — see 9.2.1]

┌─ ScorelineGrid ──────────────────────────────────────┐
│  7×7 probability matrix (0–6 goals each side)        │
│  tap cell → updates GuessArea                        │
└──────────────────────────────────────────────────────┘

┌─ LikelyScores ───────────────────────────────────────┐
│  2-0  14% │ 1-0  12% │ 2-1  11% │ 1-1  9%           │
└──────────────────────────────────────────────────────┘

┌─ GuessArea ──────────────────────────────────────────┐
│  [ARG flag] [stepper 0–9] : [stepper 0–9] [MEX flag] │
│  [כפתור "בדוק את הניחוש שלי"]                        │
└──────────────────────────────────────────────────────┘

[→ FeedbackCard after submit]
[→ ResultCard if match is finished]
```

#### 9.2.1 QualifyBlock (knockout matches only)

```
┌─ QualifyBlock ───────────────────────────────────────┐
│  "מי עולה לשלב הבא?"                                 │
│  ████████████████████████████  72%  ארגנטינה          │
│  ████████████                  28%  מקסיקו            │
│  ℹ "כולל הארכה ופנדלים"                              │
└──────────────────────────────────────────────────────┘
```

#### 9.2.2 WhyPanel

```
┌─ WhyPanel ───────────────────────────────────────────┐
│  ארגנטינה → 1.82 שערים צפויים                        │
│  בסיס: 1.35 × כוח התקפה: ×1.78 🟢 × הגנת יריב:×0.52│
│  × כושר אחרון: ×1.09 🟢 × יתרון מגרש: ×1.00         │
│                                                       │
│  מקסיקו → 0.74 שערים צפויים                          │
│  בסיס: 1.35 × כוח התקפה: ×0.91 🔴 × הגנת יריב:×0.75│
│  × כושר אחרון: ×0.96 🔴 × יתרון מגרש: ×0.70 (גולת נ.)│
└──────────────────────────────────────────────────────┘
```

Multiplier colors: 🟢 >1.03 | ⚪ 0.97–1.03 | 🔴 <0.97 (rendered as colored dots, not emoji).

### 9.3 TeamScreen

**Data**: `teams[teamCode]`, `teams-meta[teamCode]`, `matches` (filtered), calibration

Sections:
1. Hero: flag (w160), name, FIFA rank, Elo rating
2. Stat strip: form (last 5), avg goals scored/conceded, clean sheets %, Elo trend
3. "משחקי הטורניר": MatchCards for this team only (past + future)
4. Head-to-head (if opponent is set): recent 5 mutual results

### 9.4 TeamPickerScreen

**Note**: Language toggle is separate from team picker — place them in clearly separate sections.

Sections:
1. "שפת ממשק" — toggle: עברית | English (changes `lang` in localStorage, triggers dir flip)
2. "ערכת הצבעים" — option: "ירוק אצטדיון (ברירת מחדל)" radio
3. "נבחרת אהובה" — grid 4 columns, 48 teams
   - Teams with theme (defined in teams-meta) = fully interactive, color preview on hover
   - Teams without theme = greyed out, tooltip "בקרוב"
   - Selected team: checkmark + ring in team accent color
4. "נקה בחירה" button (resets to default green)

### 9.5 BracketScreen

**Data**: `bracket.json`, `predictions`, `teams-meta`

Sections:
1. Header: "חיזוי הטורניר כולו" + progress dots (X/7 stages filled)
2. "השאר לפי המודל" button (auto-fill all unresolved slots with tiePredict)
3. Bracket SVG/grid layout:
   - Round of 32 (16 ties) → R16 (8 ties) → QF (4) → SF (2) → Final → Champion
   - Each `BracketTie`: two team rows, `qualify%`, winner slot highlighted
   - Unplayed: dimmed, shows tiePredict%
   - User override: tap team → becomes selected, propagates downstream; tap again → reverts
4. Champion reveal card: Trophy + flag + team name + "שלי" vs "המודל"
5. "שתף את ה-Bracket שלי" → BracketCard share image

**Cascade logic**: When user overrides a slot, all downstream slots that depended on it reset to model prediction. Show a subtle animation.

---

## 10. Share System

### 10.1 ShareCardSquare (320×320px)

Used after guessing a match score.

```
┌──────────────────────────────────┐
│  ░░░░ pitch SVG lines ░░░░       │  ← radial gradient BG + pitch texture
│                                  │
│  🌍 MUNDIAL PREDICTOR            │  ← brand row
│                                  │
│  [ARG flag]  3 – 1  [MEX flag]  │  ← score 64px bold gold
│  ארגנטינה         מקסיקו         │
│                                  │
│  ┌────────────────────────────┐  │
│  │ המודל נותן לזה 11%         │  │  ← feedback
│  │ ███▌░░░░ 61% לארגנטינה    │  │  ← MiniLean
│  └────────────────────────────┘  │
│                                  │
│  mundial-predictor.app           │  ← URL
└──────────────────────────────────┘
```

### 10.2 BracketCard (360×360px)

Used from BracketScreen.

```
┌──────────────────────────────────┐
│  🏆 ארגנטינה                      │  ← champion + trophy
│  [ARG flag large]                │
│                                  │
│  גמר      ARG × FRA              │
│  חצי      ARG × ESP   BRA × FRA  │
│  רבע      ARG×URU ESP×GER        │
│           BRA×POR FRA×ENG        │
│                                  │
│  4 בחירות שלי · 3 מהמודל         │
│  mundial-predictor.app           │
└──────────────────────────────────┘
```

### 10.3 Render Pipeline (`share/renderToImage.js`)

```javascript
export async function renderToImage(ref) {
  // Attempt 1: html-to-image
  try {
    await preloadFonts(); // wait for Rubik to be ready in document
    const blob = await htmlToImage.toBlob(ref.current, {
      pixelRatio: 2,
      skipFonts: false,
      fetchRequestInit: { mode: 'cors' }
    });
    if (blob && blob.size > 5000) return blob; // sanity check
  } catch (e) {
    console.warn('html-to-image failed, falling back to canvas', e);
  }

  // Attempt 2: manual canvas render
  return renderToCanvas(ref.current);
}

async function renderToCanvas(el) {
  // Draws text and flags using Canvas 2D API only
  // No external assets, no CSS dependencies
  const canvas = document.createElement('canvas');
  // ... simplified canvas drawing
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}
```

**Pre-load requirement**: All `<img>` tags inside share card components must have `crossOrigin="anonymous"`. Load them at app startup (preload into browser cache) so they're available synchronously when the canvas renders.

**Sharing flow**:
```javascript
async function share(blob, filename) {
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'המניחוש שלי' });
  } else {
    // Desktop fallback: download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
```

---

## 11. PWA (Web — Phase 1)

Using `vite-plugin-pwa`. Configuration in `vite.config.js`:

```javascript
VitePWA({
  registerType: 'autoUpdate',
  manifest: {
    name: 'Mundial 2026 Predictor',
    short_name: 'Mundial',
    theme_color: '#0d1f14',
    background_color: '#0d1f14',
    display: 'standalone',
    orientation: 'portrait',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
    ]
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
    runtimeCaching: [{
      urlPattern: /^\/data\/.+\.json$/,
      handler: 'NetworkFirst',       // try network, fall back to cache
      options: { cacheName: 'data-cache', expiration: { maxAgeSeconds: 1800 } }
    }]
  }
})
```

**Offline behavior**: App shell + previous data JSON cached by service worker. User can browse last-known predictions offline. Show "מצב לא מקוון — הנתונים עשויים שלא להיות מעודכנים" banner when `navigator.onLine === false`.

**Install prompt**: Show a dismissible "הוסף למסך הבית" banner after the user visits twice. Use the `beforeinstallprompt` event.

---

## 12. Mobile App — Capacitor (Phase 2)

Capacitor wraps the exact same Vite build — no code duplication.

### 12.1 Setup

```bash
npm install @capacitor/core @capacitor/cli
npx cap init "Mundial 2026" "app.mundial.predictor"
npx cap add ios
npx cap add android
```

`capacitor.config.ts`:
```typescript
{
  appId: 'app.mundial.predictor',
  appName: 'Mundial 2026',
  webDir: 'dist',
  server: { androidScheme: 'https' }  // avoids mixed-content issues
}
```

Build + sync:
```bash
npm run build && npx cap sync
npx cap open ios      # opens Xcode
npx cap open android  # opens Android Studio
```

### 12.2 Native Enhancements (Phase 2 only)

| Feature | Capacitor Plugin | Notes |
|---|---|---|
| Push notifications | `@capacitor/push-notifications` | Notify before key matches |
| Haptic feedback | `@capacitor/haptics` | On guess submit, on share |
| Status bar styling | `@capacitor/status-bar` | Match app theme color |
| Safe area | CSS `env(safe-area-inset-*)` | Already in CSS; works without plugin |
| Share | `@capacitor/share` | Replaces Web Share API |

### 12.3 What Does NOT Change for Capacitor

- All React/Vite code
- All CSS, themes, animations
- Data fetching (`/data/*.json` served from same CDN)
- Share card rendering

### 12.4 Phase 1 vs Phase 2 Decision Point

Ship PWA at launch (fastest path to users). Add Capacitor only if:
- Users on iOS complain about PWA install UX (Safari's "Add to Home Screen" is less discoverable)
- You want push notifications for match reminders
- App Store presence is required for discoverability

---

## 13. Testing Strategy

### 13.1 Engine Unit Tests (`src/engine/__tests__/`)

Critical: the math must be correct before the UI is built.

```javascript
// poisson-dc.test.js
test('probabilities sum to 1', () => {
  const grid = applyDixonColes(buildGrid(1.5, 0.9), 1.5, 0.9, -0.05);
  expect(grid.flat().reduce((a, b) => a + b, 0)).toBeCloseTo(1, 4);
});

test('strong team wins more often', () => {
  const strong = aggregateOutcome(applyDixonColes(buildGrid(2.5, 0.5), 2.5, 0.5, -0.05));
  const even   = aggregateOutcome(applyDixonColes(buildGrid(1.2, 1.2), 1.2, 1.2, -0.05));
  expect(strong.home).toBeGreaterThan(even.home);
});

test('qualify probs sum to 1 for knockout', () => {
  const result = predictKnockout('sf-1', 1.8, 1.1, grid, 2050, 1920);
  expect(result.qualify.home + result.qualify.away).toBeCloseTo(1, 4);
});
```

### 13.2 Build Script Tests (`scripts/__tests__/`)

```javascript
test('third-place ranking sorts by 5 criteria correctly', () => { ... });
test('bracket resolve cascades correctly when slot overridden', () => { ... });
test('Dixon-Coles tau correction applies only to (0,0)(0,1)(1,0)(1,1)', () => { ... });
```

### 13.3 No E2E in Phase 1

Manual QA for the UI is sufficient for MVP. Add Playwright only if the team grows.

---

## 14. Implementation Order

### Stage 1 — Engine (no UI)
1. `src/engine/poisson-dc.js` — core math + unit tests
2. `src/engine/knockout.js` — qualify logic + tests
3. `scripts/lib/` — fetch modules + build-data.js (outputs valid JSON)
4. Verify `predictions.json` for known matchups against intuition

### Stage 2 — Data pipeline
5. `scripts/data/elo-snapshot.csv` + `teams-meta.json` — populate 48 teams
6. Full `scripts/build-data.js` run — verify all 7 JSON files are produced correctly
7. GitHub Actions cron setup + secret configuration

### Stage 3 — React skeleton
8. Vite + React project init, `vite-plugin-pwa`, React Router (hash)
9. CSS variables + default theme, Rubik font
10. `useData` hook + `useTheme` + `useLang` (react-i18next)
11. Shared components: `Flag`, `FormDot`, `MiniLean`, `Card`, `Btn`, `Pitch`, `Ico`

### Stage 4 — Core screen
12. `PreMatchScreen` — full layout, all sub-components
13. `PredictionBars`, `WhyPanel`, `ScorelineGrid`, `GuessArea`, `FeedbackCard`
14. Knockout mode: `QualifyBlock`

### Stage 5 — Home + navigation
15. `HomeScreen` — `MatchCard` list, `FilterBar`
16. React Router wiring, back navigation

### Stage 6 — Team + Picker screens
17. `TeamScreen`
18. `TeamPickerScreen` — team grid + language toggle

### Stage 7 — Bracket
19. `BracketScreen` — layout, `BracketTie`, cascade logic

### Stage 8 — Share
20. `ShareCardSquare` + `BracketCard`
21. `renderToImage.js` — html-to-image + canvas fallback
22. Web Share API integration

### Stage 9 — PWA
23. Manifest + service worker via `vite-plugin-pwa`
24. Offline banner, install prompt
25. Performance audit (Lighthouse)

### Stage 10 — Capacitor (Phase 2, after launch)
26. Capacitor init + iOS/Android platforms
27. Native share, haptics, status bar

---

## 15. What Not to Build in Phase 1

- No user accounts, no login, no database
- No live scores (delayed results are fine and honest)
- No MLE optimization (use `rho = -0.05` fixed)
- No Capacitor (ship PWA first)
- No leaderboard
- No lineups, formations, xG (require paid API)
- No push notifications (Phase 2 with Capacitor)
- Do not couple language to team theme — always two separate settings
