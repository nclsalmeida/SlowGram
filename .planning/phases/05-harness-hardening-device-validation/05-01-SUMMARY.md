---
phase: 05-harness-hardening-device-validation
plan: 01
subsystem: testing
tags: [harness, churn, mutation-observer, yield, performance]
requires:
  - phase: 04-overlay-polish
    provides: the finished overlay + lifecycle (overlaySync/overlayTeardown, D-14 seam) this phase's gates ride on
provides:
  - CONFIG.harness.maxBatchRecords=200 (frozen, CORE-05) — the batch yield cap with ~2.4× headroom over 5k/s churn
  - processBatch yield-at-cap with a retained pending queue (overflow is never dropped)
  - SlowGram._batchState() test handle { lastFrameProcessed, pendingRecords }
  - injectChurn(count) additive harness helper (registration-path records)
  - T-P01..T-P07 churn suite + SCAN cap-once assert
affects: [05-02, 05-03, 05-04, 05-05, 05-06, 05-07, future perf work]
actuals:
  tokens: 26000
  tasks: 2
  commits: 1
tech-stack:
  added: []
  patterns: [work-count jank proxy (no performance.now), pending-queue yield, per-init batch state reset]
key-files:
  created: []
  modified: [src/slowgram.js, test/slowgram.test.js, test/harness.js]
key-decisions:
  - "The yield slices to the cap and RE-QUEUES overflow in pendingBatch — records are never dropped (the finite-drain gate depends on retention)"
  - "pendingBatch/lastFrameProcessed reset per init — a prior batch's overflow never leaks across init cycles (state isolation, the T-P03 leak fix)"
  - "The drifted-fallback branch keeps its existing mutual exclusion and applies the same cap (consume DRY)"
  - "The rate is DERIVED (records ÷ frames × 60fps = 12000/s drain capacity), never sampled — SCAN-safe"
---

# Plan 05-01 — Churn Performance (HARN-01) Summary

## What was built

The rAF batch yield-at-cap spine: `CONFIG.harness.maxBatchRecords = 200` (frozen, the ONLY occurrence — CORE-05), `processBatch` now concatenates the retained overflow with the observer's fresh drain and slices to the cap, re-queueing the overflow in a module-level `pendingBatch` (nothing dropped). `SlowGram._batchState()` exposes the per-frame processed count and pending depth for deterministic assertions.

## Verification (both hosts)

- **Node:** `node test/slowgram.test.js` — **727 assertions passed** (715 baseline + 12 new)
- **Edge headless harness.html:** **TOTAL: 678 passed / 678 run** — parity holds (727 − 49 Node-only scans)
- **T-P02 yield gate:** one frame processes exactly 200 of 5000 injected; 4800 retained pending — never over the cap
- **T-P03/T-P04 drain + no-drop:** drains in exactly 25 frames (ceil(5000/200)), every frame ≤ 200, Σ processed === 5000
- **T-P05 derived rate:** records ÷ frames × 60fps === 12000 records/s — the drain capacity, 2.4× the 5000/s incoming
- **T-P06 SCAN:** `maxBatchRecords: 200` appears exactly once in the engine; the no-timer/no-performance.now scans stay green with the new batch code present
- **T-P07 containment:** a hostile takeRecords() throw is contained by pollLoop's try/catch — the engine survives

## Notes

- One real bug caught in-test: `pendingBatch` was module state that leaked across freshEnv init cycles (T-P03 drained 9800 = 4800 leftover + 5000 fresh). Fixed by resetting `pendingBatch`/`lastFrameProcessed` per init — same class of state-isolation fix as the Phase 4 overlay teardown.
- No new dependencies; zero test framework additions (HARN-07 constraint intact).
