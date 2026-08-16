---
phase: 05-harness-hardening-device-validation
plan: 04
subsystem: testing
tags: [drift, selectors, fixture, health-check, runbook]
requires:
  - phase: 05-03
    provides: the social matrix suite (same suite file; no interplay)
  - phase: 02-dom-detection
    provides: CONFIG.selectors registry, the N=5 selectorHealth machinery (T-D33/T-D34), the versioned instagram-shapes fixture + dom-mocks builders
provides:
  - T-D01..T-D06 drift suite — the versioned fixture walk (fail-first, named selector) + health-linkage tests
  - 05-DRIFT-RUNBOOK.md — the capture → update fixture → re-run → commit loop (D-10)
  - The N=5 threshold proven CONFIG-driven and the anchored registration proven restored after recovery (D-11)
affects: [05-07 (harness.html load-order contract), future selector changes, milestone drift guarantees]
actuals:
  tokens: 22000
  tasks: 2
  commits: 1
tech-stack:
  added: []
  patterns: [fail-first fixture walk (selector-name assert messages), one-guarantee linkage (walk + health share CONFIG.selectors)]
key-files:
  created: [.planning/phases/05-harness-hardening-device-validation/05-DRIFT-RUNBOOK.md]
  modified: [test/slowgram.test.js]
key-decisions:
  - "The loggedIn shape carries no videos field (non-load-bearing) — its video evidence is the dialog root; the walk and integrity asserts honor the shape contract"
  - "The N=5 declaration (T-D33) and recovery (T-D34) already existed as first-class Phase 2 tests — this plan LINKS them to CONFIG + the fixture instead of duplicating them"
  - "T-D05 proves the anchored observer survives a drift episode: connected at init, it keeps registering after recovery — full restoration, not half-recovered"
  - "Fixture-dependent tests run on the Node host (require); the browser harness skips them cleanly (the established TD5 pattern) — parity formula holds"
---

# Plan 05-04 — Drift & Snapshot (HARN-04) Summary

## What was built

The first-class drift guard: the versioned real-DOM fixture (instagram-shapes.js) is walked against `CONFIG.selectors` — failing FIRST in CI with the missing selector NAMED and its shape source when Instagram changes the DOM (D-10). The existing N=5 health machinery is linked to the refresh loop (D-11): the threshold is proven CONFIG-driven, and a drift episode is proven to end with FULL anchored restoration (the observer connected at init keeps registering after recovery). The refresh runbook (05-DRIFT-RUNBOOK.md) documents the capture → update → re-run → commit loop.

## Verification (both hosts)

- **Node:** `node test/slowgram.test.js` — **847 assertions passed** (818 + 29 new)
- **Edge headless harness.html:** **TOTAL: 778 passed / 778 run** — parity holds (847 − 69 Node-only: the fixture walk runs via require on Node; the browser harness skips it cleanly, per the Phase 2 TD5 pattern)
- **T-D01:** fixture integrity — both shapes tagged with sources; loggedOut feed has videos; loggedIn evidence via the dialog root
- **T-D02:** the selector walk — video + [role=main] resolve in both shapes; [role=dialog] contractually absent from loggedOut, present in loggedIn; every assert names the selector + source
- **T-D03:** logged-in realism — hasLoop/hasAutoplay tagged in the shape data and honored by the builder; loggedOut never loops
- **T-D04:** N=5 boundary CONFIG-driven — drift declared at exactly `CONFIG.health.driftThreshold`, one event
- **T-D05:** drift → recovery → anchored registration restored (the connected observer survives the episode)
- **T-D06:** fixture↔health linkage — a vanished anchor makes the walk fail NAMING the selector; both guards share CONFIG.selectors (one source of truth)

## Notes

- No runtime re-scan was added — the guard is the versioned fixture + the existing N=5 health (D-10 cost/network rationale).
- Test-only plan (plus the runbook doc): zero engine changes, zero new dependencies, both hosts green.
