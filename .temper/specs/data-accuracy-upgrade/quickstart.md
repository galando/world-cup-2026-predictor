# Quickstart: Data Accuracy Upgrade (Phase 1)

## TLDR

1. **Why**: Model misses market signal (odds) and suspension impact -- two strongest real-world predictors
2. **What**: Odds API blend + red-card suspension engine, build-time only
3. **New files**: fetch-odds.js, build-market.js, build-suspensions.js, SOURCES.md, 2 test files
4. **Modified files**: build-data.js, run-predictions.js, write-artifacts.js, calibrate.js, WhyPanel, PreMatchScreen, i18n, CI workflow
5. **Blend formula**: `pFinal = 0.75 * pModel + 0.25 * pImplied` (market weight configurable)
6. **Suspension**: `lambda *= 0.92` if team had red card in previous match
7. **Key safety**: API keys via env vars only; store only implied P (no raw odds); new engine params optional with defaults
8. **Credit budget**: 4h staleness guard = ~180 API calls/month (free tier = 500)
9. **Risk**: Medium -- shared engine touched (calibrate.js) but param is optional
10. **Start with**: Task 1 (fetch-odds.js) -> Task 2+3 (build-market + tests) -> Task 4+5 (suspensions + tests)

## Complexity: Medium (14 files)
## Risk: Medium
