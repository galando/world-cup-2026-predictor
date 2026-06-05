# Data Sources

This document lists all external data sources used by the Mundial 2026 Predictor build pipeline.

## Elo Ratings

- **Source**: [eloratings.net](https://www.eloratings.net/World.tsv)
- **Format**: TSV (tab-separated values)
- **License**: Public data, used with attribution
- **Derivation**: Parsed from TSV; 2-letter country codes mapped to 3-letter canonical codes via internal mapping table. Elo integer rating extracted per team.
- **Storage**: `scripts/data/elo-snapshot.csv` (private build cache), `public/data/teams.json` (Elo field per team)
- **Refresh**: Fetch if cache is >23 hours old. Fallback to existing CSV on failure.

## Match Fixtures

- **Source**: [OpenFootball](https://github.com/openfootball/worldcup.json) (`2026/rounds.json`, `2026/groups.json`)
- **Format**: JSON
- **License**: Public domain (OpenFootball license)
- **Derivation**: Parsed into unified match objects with matchId, date, venue, homeTeam, awayTeam, stage, group. Team names normalized to 3-letter codes.
- **Storage**: `public/data/matches.json`
- **Refresh**: Fetched every build. Falls back to generated schedule from `teams-meta.json` group assignments and `r32-seeding-table.json`.

## Match Results

- **Source**: [Football-Data.org](https://www.football-data.org/) API v4 (`/v4/competitions/WC/matches`)
- **Format**: JSON API
- **License**: Free tier (TIER_ONE), API key required
- **Derivation**: Match status and scores extracted from `score.fullTime` field. Team codes from `homeTeam.tla` / `awayTeam.tla`. Red/yellow card events from match details.
- **Storage**: Results merged into `public/data/matches.json` (status + score fields). No raw API response stored.
- **Refresh**: Fetched every build when `FD_API_KEY` is set. Gracefully skipped otherwise.

## Betting Odds (Market Signal)

- **Source**: [The Odds API](https://the-odds-api.com/) (`/v4/sports/soccer_fifa_world_cup/odds/`)
- **Format**: JSON API
- **Parameters**: `regions=eu`, `markets=h2h`, `oddsFormat=decimal`
- **License**: Free tier (500 credits/month), API key required
- **Derivation**:
  1. Raw decimal odds fetched per match from multiple bookmakers
  2. Vig (overround) removed via standard method: `impliedP = (1/odds) / sum(1/odds)`
  3. Implied probabilities averaged across bookmakers
  4. Blended with model predictions at 25% market / 75% model weight
- **Storage**:
  - `scripts/cache/odds.json` — raw API response (private build cache, never deployed)
  - `public/data/market.json` — derived implied probabilities only (no raw odds)
  - `public/data/predictions.json` — blended probabilities in `probs` field, market metadata in `market` field
- **ToS Compliance**: Raw decimal odds from bookmakers are **never** stored in `public/` or `dist/`. Only derived implied probabilities (after vig removal) are included in public artifacts.
- **Refresh**: Fetched if cache is >4 hours old. Fallback to cached file on failure. Entirely skipped if `ODDS_API_KEY` is not set.

## Teams Metadata

- **Source**: Manually curated from FIFA World Cup 2026 announcements
- **Format**: JSON
- **Storage**: `scripts/data/teams-meta.json` (source), `public/data/teams-meta.json` (output)
- **Contents**: Team codes, names (EN/HE), FIFA rankings, flag ISO codes, group assignments

## R32 Seeding Table

- **Source**: Manually curated from FIFA World Cup 2026 bracket structure
- **Format**: JSON
- **Storage**: `scripts/data/r32-seeding-table.json`
- **Contents**: Match slots for Round of 32 through Final with dates and venues

## Summary of Public Artifacts

All files in `public/data/` are derived data products. No API keys, raw odds, or personally identifiable information are included.

| File | Contents | Derived From |
|------|----------|-------------|
| `matches.json` | Match schedule + results | OpenFootball, Football-Data.org |
| `predictions.json` | Dixon-Coles predictions + market blend | Elo, computed team stats, odds |
| `teams.json` | Team strength data | Elo, match results |
| `teams-meta.json` | Team metadata | Manual curation |
| `standings.json` | Group standings | Match results |
| `bracket.json` | Tournament bracket | Standings, predictions, seeding |
| `calibration.json` | Prediction accuracy stats | Predictions vs actual results |
| `market.json` | Implied probabilities (vig-removed) | The Odds API |
| `lastUpdated.json` | Build timestamp | Build time |
