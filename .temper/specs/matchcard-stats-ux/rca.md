# RCA: MatchCard Stats & ScorelineGrid UX Issues

## Bug 1: "2.5" unclear in ScorelineGrid
- **Root cause**: ScorelineGrid renders probability values without `%` suffix, no axis labels ("Home/Away goals"), no legend
- **Location**: `src/components/ScorelineGrid/index.jsx:40`
- **Fix**: Add `%` suffix to cell values, add axis labels ("Home →" top, "Away ↓" left), add subtitle legend

## Bug 2: "Elo Rating" / "מד כושר" unclear
- **Root cause**: Elo is jargon; Hebrew "מד כושר" = "fitness measure" is misleading
- **Location**: `src/i18n/en.json:80`, `src/i18n/he.json:80`
- **Fix**: EN → "Strength (Elo)", HE → "דירוג חוזק (Elo)"

## Bug 3: Identical stats for all teams (1.4⚽ / 1.4☁)
- **Root cause**: No matches played → all teams fallback to BASELINE_LAMBDA (1.35). TeamCompare shows these identical values as if real.
- **Location**: `src/components/TeamCompare/index.jsx:40-42`, `scripts/lib/compute-teams.js:51-52`
- **Fix**: When `matchesPlayed === 0`, derive display values from Elo-based attack/defence params (which DO vary per team) OR hide the stat entirely
