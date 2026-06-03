# Plan — fix-statistics-gaps

## Overview

Fix 11 audit gaps in the statistics pipeline. 9 require code changes, 2 are documentation only. Changes span 2 layers: shared engine (`src/engine/`) and build scripts (`scripts/lib/`).

## Complexity: medium

11 items but most are localized single-function changes. Two tasks (time decay wiring, H2H tiebreaker) require care due to signature changes and downstream callers.

## Risk: medium

The shared engine `calibrate.js` is imported by both Node.js build scripts and the React client. Signature changes must remain backward-compatible. The `compareTeams` signature change propagates to `rankThirdPlace` and all test callers.

## Blast Radius Analysis

### High Impact (shared engine — affects both client and server)

| File | Change | Consumers | Risk |
|------|--------|-----------|------|
| `src/engine/calibrate.js` | timeDecayWeight wired in; getTeamLambda extended | `computeTeams`, `run-predictions`, `build-data.test.js`, React client via import | Must keep backward-compat. Optional params only. |
| `src/engine/knockout.js` | Penalty model formula change | `run-predictions`, `build-data.test.js`, React client | Changes qualify % for all knockout matches. More correct but different numbers. |

### Medium Impact (build scripts — server only)

| File | Change | Consumers | Risk |
|------|--------|-----------|------|
| `scripts/lib/build-standings.js` | Fair play, H2H tiebreaker, stable sort, group size guard | `build-data.js`, `build-bracket.js`, all standings tests | Signature change to `compareTeams` (3rd arg optional). |
| `scripts/lib/run-predictions.js` | Documentation only | `build-data.js` | No functional change. |

### Low Impact (documentation only)

| File | Change | Consumers | Risk |
|------|--------|-----------|------|
| `scripts/lib/compute-teams.js` | JSDoc comment | None | None. |

### Test Files Requiring Updates

| Test File | Tasks Requiring Updates |
|-----------|------------------------|
| `src/engine/__tests__/calibrate.test.js` | Tasks 1, 2, 4 |
| `src/engine/__tests__/knockout.test.js` | Task 3 |
| `scripts/__tests__/build-standings.test.js` | Tasks 6, 7, 8, 9 |
| `scripts/__tests__/build-data.test.js` | Task 11 |
| `scripts/__tests__/build-bracket.test.js` | None (bracket logic unchanged) |

## Execution Flow

```
                    ┌─────────────────────────────────────┐
                    │  Task 5: Document home advantage     │
                    │  Task 10: Document form design       │
                    │  (no deps, no risk, parallel)        │
                    └─────────────────────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          │                           │                           │
          ▼                           ▼                           ▼
┌─────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│  Task 1: Wire   │     │  Task 2: Extend     │     │  Task 3: Fix        │
│  timeDecay in   │     │  getTeamLambda      │     │  penalty model      │
│  computeAttack  │     │  with attack/def    │     │  (knockout.js)      │
│  Defence        │     │                     │     │                     │
│  (calibrate.js) │     │  (calibrate.js)     │     │                     │
└────────┬────────┘     └──────────┬──────────┘     └──────────┬──────────┘
         │                         │                            │
         ▼                         ▼                            │
┌─────────────────┐     ┌─────────────────────┐                │
│  Task 4: Blend  │     │  (Task 2 depends on │                │
│  Elo prior with │     │   Task 1 for full   │                │
│  partial data   │     │   testing but can   │                │
│  (calibrate.js) │     │   be developed      │                │
└────────┬────────┘     │   independently)    │                │
         │              └──────────┬──────────┘                │
         │                         │                            │
         └─────────────┬───────────┘                            │
                       │                                        │
                       ▼                                        │
          ┌────────────────────────┐                            │
          │  Task 6: Populate      │                            │
          │  fair play from cards   │                            │
          │  (build-standings.js)   │                            │
          └───────────┬────────────┘                            │
                      │                                         │
                      ▼                                         │
          ┌────────────────────────┐                            │
          │  Task 7: Add head-to-  │                            │
          │  head tiebreaker       │                            │
          │  (build-standings.js)   │                            │
          └───────────┬────────────┘                            │
                      │                                         │
                      ▼                                         │
          ┌────────────────────────┐     ┌─────────────────────┐│
          │  Task 8: Stabilize     │     │  Task 9: Guard      ││
          │  sort (deterministic)  │     │  third-place for    ││
          │  (build-standings.js)   │     │  undersized groups  ││
          └───────────┬────────────┘     │  (build-standings)  ││
                      │                  └──────────┬──────────┘│
                      └─────────────┬───────────────┘           │
                                    │                           │
                                    ▼                           ▼
                       ┌──────────────────────────────────────────┐
                       │  Task 11: Full pipeline integration test │
                       │  (build-data.test.js)                    │
                       └──────────────────────────────────────────┘
```

## ASCII Dependency Diagram

```
  ENGINE LAYER (src/engine/)                  BUILD SCRIPT LAYER (scripts/lib/)
  ════════════════════════                    ══════════════════════════════════

  ┌─ calibrate.js ─────────────┐             ┌─ compute-teams.js ────────────┐
  │ Task 1: timeDecay wired    │◄─────────── │ Task 10: doc only             │
  │ Task 2: getTeamLambda ext  │   feeds     │ (auto-resolves Gap 5 via T1) │
  │ Task 4: Elo blend          │   into      └──────────────────────────────┘
  └────────────────────────────┘
           │                                   ┌─ run-predictions.js ──────────┐
           │ feeds into                        │ Task 5: doc only              │
           ▼                                   └──────────────────────────────┘
  ┌─ knockout.js ──────────────┐
  │ Task 3: Elo penalty fix    │              ┌─ build-standings.js ─────────┐
  └────────────────────────────┘              │ Task 6:  fair play           │
                                              │ Task 7:  H2H tiebreaker     │
                                              │ Task 8:  stable sort        │
                                              │ Task 9:  group size guard   │
                                              └──────────┬───────────────────┘
                                                         │
                                                         ▼
                                              ┌─ build-data.test.js ─────────┐
                                              │ Task 11: integration tests   │
                                              └──────────────────────────────┘
```

## Key Design Decisions

1. **`compareTeams` signature change** uses optional 3rd arg `h2hMap` for backward compatibility. Existing callers that don't pass it get the old behavior minus the H2H criterion.

2. **`getTeamLambda` extension** uses optional `options.attack` and `options.opponentDefence` — fully backward compatible.

3. **Time decay** uses the existing `DECAY_RATE = 0.0018` constant (385-day half-life). No new constants needed.

4. **Fair play** is forward-compatible: if match data has no `cards` field, fairPlay stays 0. When card data becomes available from the API, it will automatically flow through.

5. **Penalty model** switches from linear Elo ratio to the standard Elo expected score formula `1 / (1 + 10^(diff/400))`. This is the mathematically correct transformation and matches how Elo is used worldwide.

6. **Elo blending** for partial data uses linear interpolation between Elo prior (0 matches) and data-based estimate (minMatches). This provides smooth transition rather than a cliff.

## Rollback Strategy

Each task is a separate commit on `fix/statistics-gaps`. If any task causes issues in integration testing, that specific commit can be reverted without affecting others. The shared engine changes (Tasks 1-4) are the highest risk and should be tested together before proceeding to build script changes.
