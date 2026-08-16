---
phase: 05-harness-hardening-device-validation
plan: 02
subsystem: testing
tags: [wall-clock, visibility, fatigue, webview, equivalence]
requires:
  - phase: 05-01
    provides: the churn yield spine + _batchState handle (no interplay; the same suite file)
  - phase: 01-motor-core-lifecycle
    provides: the clock/visibility/fatigue machinery (tick/onHidden/onResume, hiddenAt→lastBoundary fallback, T23/T24 reset coverage) this plan formalizes
provides:
  - T-W01..T-W08 wall-clock equivalence suite (counting + reset, both scenarios, dual assert)
  - getState() now exposes lastBoundary (additive — the D-7 invariant is assertable)
  - The hiddenAt=null → lastBoundary WebView fallback proven as a first-class guarantee
affects: [05-03, 05-05, 05-06 (device checklist 6-min reset item), future backgrounding work]
actuals:
  tokens: 22000
  tasks: 2
  commits: 1
tech-stack:
  added: []
  patterns: [missed-event WebView simulation (advance without flush + resume signal), dual-assert (delta + invariants)]
key-files:
  created: []
  modified: [src/slowgram.js, test/slowgram.test.js]
key-decisions:
  - "The WebView missed-event scenario is simulated by advancing the fake clock WITHOUT flush (rAF suspended in hidden tabs) + a window-focus resume signal — the T26 pattern — NOT by firing events the engine would never see"
  - "getState() forwards lastBoundary (additive, no consumer break) so the D-7 lastBoundary invariant is assertable without a new handle"
  - "The fatigue boundary (exactly-window no-reset, window+1 resets) is asserted to the millisecond against CONFIG.fatigueWindowMs — never a literal"
---

# Plan 05-02 — Wall-clock Equivalence (HARN-02) Summary

## What was built

The first-class wall-clock suite: counting equivalence (elapsed === visible delta; the hidden period contributes exactly zero) and reset equivalence (gap > fatigueWindowMs resets — the session never pretends continuity either), each in BOTH the normal visibility flow and the WebView missed-event case (hidden without the event; the Phase 1 `hiddenAt=null → lastBoundary` fallback recovers). Every test asserts the real-clock delta AND the hiddenAt/lastBoundary/elapsedMs invariants (D-7).

## Verification (both hosts)

- **Node:** `node test/slowgram.test.js` — **757 assertions passed** (727 + 30 new)
- **Edge headless harness.html:** **TOTAL: 708 passed / 708 run** — parity holds (757 − 49 Node-only scans)
- **T-W01/T-W02 counting:** a 60s hidden period contributes zero in the normal flow AND the missed-event case — elapsed === 150000 = 120000 visible + 30000 visible exactly
- **T-W03:** delta exact to the millisecond (123456)
- **T-W04:** invariants — hiddenAt set while hidden, cleared on discount, lastBoundary advanced, zero-gap resume clean
- **T-W05/T-W06 reset:** a 6-min gap zeroes the session in both scenarios; only post-resume time accumulates
- **T-W07:** exact fatigue boundary — 300000 does NOT reset (strict >), 300001 does
- **T-W08:** reset restores native — a phase-3 degraded video is native after the reset (revertAll deletes the lever)

## Notes

- Two test-side fixes: `getRegistryState().appliedLevers.saturation` is `undefined` after revert (delete semantics), not `null`; and `getState()` did not forward `lastBoundary` — added additively.
- The WebView scenario required the correct simulation: advance the clock WITHOUT flush (rAF suspended in hidden tabs) + a focus resume signal — firing visibilitychange events the engine would never receive would test nothing.
