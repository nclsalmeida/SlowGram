---
phase: 05-harness-hardening-device-validation
plan: 05
subsystem: engine
tags: [kill-switch, safety-valve, revert, latch, gating]
requires:
  - phase: 05-04
    provides: the drift suite (same suite file; no interplay)
  - phase: 03-degradation-levers
    provides: revertAll/applyAll + the four applicators (the disable path reverts through them)
  - phase: 04-overlay-polish
    provides: overlayTeardown + the D-14 overlay seam (the disable path removes the host)
provides:
  - CONFIG.killSwitch.enabled (frozen, exactly once — CORE-05)
  - killSwitchEnabled module latch + disableKillSwitch() (REVERT-not-pause: revertAll + overlay teardown)
  - The four gate points: pollLoop (work-gated, heartbeat alive), batchCallback, registerVideo, overlay predicate
  - SlowGram._setKillSwitchForTest handle + per-init latch reset
  - T-K01..T-K08 suite + the gate-completeness source scan (T-K07)
affects: [05-06 (device checklist — the kill switch is a manual safety check), all future entry points (the T-K07 scan guards them)]
actuals:
  tokens: 26000
  tasks: 2
  commits: 1
tech-stack:
  added: []
  patterns: [work-gate-not-heartbeat gating, disable-path helper (latch flip + revert + teardown), per-init latch re-seed, function-body completeness scan]
key-files:
  created: []
  modified: [src/slowgram.js, test/slowgram.test.js]
key-decisions:
  - "pollLoop gates the WORK inside `if (killSwitchEnabled)`, keeping `requestAnimationFrame(pollLoop)` unconditional — a plain return would kill the heartbeat and break re-enable (D-13/D-14)"
  - "Disable runs disableKillSwitch(): latch off + revertAll + overlayTeardown synchronously — the feed is native the moment the flag flips (D-13 REVERT, never pause)"
  - "The latch re-seeds per init from CONFIG — a test flip never survives re-init (precedent: bufferEnabled at :1803)"
  - "T-K07 scans the four function BODIES (extractBody) for the latch — a new entry point without the gate fails the suite"
---

# Plan 05-05 — Kill-switch (HARN-05) Summary

## What was built

The safety valve: frozen `CONFIG.killSwitch.enabled=true` read once into a module latch, consulted at the four cheapest gate points — pollLoop (the WORK is gated while the rAF heartbeat stays alive), batchCallback (no processing), registerVideo (no tracking), and the overlay predicate (no render). Disabling runs the D-13 REVERT path (revertAll + overlay teardown → native feed immediately); re-enabling resumes a fresh session; the latch re-seeds per init; the T-K07 source scan guards every future entry point.

## Verification (both hosts)

- **Node:** `node test/slowgram.test.js` — **866 assertions passed** (847 + 19 new)
- **Edge headless harness.html:** **TOTAL: 793 passed / 793 run** — parity holds (866 − 73 Node-only)
- **T-K01:** CONFIG.killSwitch frozen, enabled true, exactly once in the engine (SCAN)
- **T-K02:** the next frame after the flip does zero accumulation (one-frame stop)
- **T-K03:** no video registers while killed (batchCallback/registerVideo no-op)
- **T-K04:** disable REVERTS — degraded video native + overlay host removed immediately
- **T-K05:** re-enable resumes FRESH — accumulation continues, no legacy degradation auto-reapplies
- **T-K06:** the flip does NOT survive re-init (latch re-seeded from CONFIG)
- **T-K07:** all four gate points consult the latch (function-body scan)
- **T-K08:** kill under churn — 5000 pending records process zero

## Notes

- The one design subtlety resolved during implementation: the pollLoop gate MUST keep the heartbeat alive — a `return` would make re-enable impossible. The one-frame stop comes from `tick()` not running.
- No new timers or listeners — the kill-switch is synchronous latch checks; the Phase 1 SCAN stays green.
