# Phase 5: Harness Hardening & Device Validation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-15
**Phase:** 5-harness-hardening-device-validation
**Areas discussed:** Performance & Churn, Wall-clock Equivalence, Social Preservation First-Class, Drift & Real-DOM Snapshot, Kill-switch, On-device Checklist

---

## Performance & Churn (HARN-01)

| Option | Description | Selected |
|--------|-------------|----------|
| A — Deterministic work-count in rAF batch | Records/frame under synthetic churn, no real profiler, no performance.now | ✅ (D-1) |
| B — Real-time profiler | performance.now vs 16.6ms frame budget | — |
| C — Hybrid | Deterministic gate + non-blocking informative benchmark | — |
| A — Per-record batch cap | CONFIG.harness.maxBatchRecords = 200; batch yields at cap | ✅ (D-2) |
| B — Live-video count cap | Cap by registry size | — |
| C — No cap, just measure | Report only, no approval gate | — |
| A — Batch injection into FakeMutationObserver | 5k records enqueued, drain via raf.flush, rate = records÷frames×60fps | ✅ (D-3) |
| B — Real-time mutation loop | 5k real mutations in 1s (busy-loop) | — |
| C — Real DOM churn | Build/mutate 5k FakeElements | — |
| A — Two gates (yields + drains) | No frame over the cap AND finite-frame drain | ✅ (D-4) |
| B — One gate (drains only) | Would pass a single-frame 5k burst = the jank we forbid | — |
| C — Real-time ms gate | Flaky, same objection as B in Q1 | — |

## Wall-clock Equivalence (HARN-02)

| Option | Description | Selected |
|--------|-------------|----------|
| A — Counting equivalence | Motor accumulates only verifiable visible time; hidden discounted | part of ✅ (D-5) |
| B — Reset equivalence only | Gap >5min resets (already covered by T23/T24) | part of ✅ (D-5) |
| C — Both as first-class | Counting test + reset test, each with hidden-period fixture | ✅ (D-5) |
| A — Normal visibility driver | setVisibility + visibilitychange dispatch | part of ✅ (D-6) |
| B — WebView missed-event case | Hidden without event; fallback hiddenAt-null→lastBoundary | part of ✅ (D-6) |
| C — Both scenarios | Normal + WebView | ✅ (D-6) |
| A — Real-clock delta vs motor | elapsedMs == visible delta | part of ✅ (D-7) |
| B — State invariants only | hiddenAt/lastBoundary/elapsedMs states | part of ✅ (D-7) |
| C — Both | Delta (promise) + invariants (mechanism) | ✅ (D-7) |

## Social Preservation First-Class (HARN-03)

| Option | Description | Selected |
|--------|-------------|----------|
| A — Full cartesian matrix | Every preservedRoute × every lever + overlay | ✅ (D-8) |
| B — Aggregate behavior only | State zeroed on SOCIAL, no per-lever sweep | — |
| C — Matrix + one real-DOM social route | Cartesian + buildSocialRoute fixture | — (matrix is the gate; fixture is a bonus) |
| A — Pre/post state snapshot | State identical across the detour | part of ✅ (D-9) |
| B — Explicit revertAll assert only | Weaker; misses dirty pre-detour state | — |
| C — Snapshot + re-application assert | Detour transparent AND degradation re-applied on return | ✅ (D-9) |

## Drift & Real-DOM Snapshot (HARN-04)

| Option | Description | Selected |
|--------|-------------|----------|
| A — Versioned snapshot + runbook | Fixture + refresh procedure; selectors test fails first in CI | ✅ (D-10) |
| B — Runtime periodic re-scan | Cost/network for a 3-selector dependency | — |
| A — Health check feeds refresh | N=5 drift → first-class test naming the missing selector | ✅ (D-11) |
| B — Health check prod-only | Drift silent until a user complains | — |

## Kill-switch (HARN-05)

| Option | Description | Selected |
|--------|-------------|----------|
| A — Single master flag + module latch | CONFIG.killSwitch.enabled; every entry point no-ops; off within one frame | ✅ (D-12) |
| B — Full teardown on disable | Like destroy — heavier than a reversible switch | — |
| A — Disable = revert | revertAll + overlay removed + accumulation stops (native feed immediately) | ✅ (D-13) |
| B — Disable = pause only | Degradation stays applied | — |
| A — Flip → zero work; re-enable → resumes | The test contract | ✅ (D-14) |

## On-device Checklist (HARN-06)

| Option | Description | Selected |
|--------|-------------|----------|
| A — Markdown checklist + device-check.html | Per-platform checklist + REAL-DOM companion page | ✅ (D-15) |
| B — Checklist only | No runnable page | — |
| A — Minimal 3-surface matrix | iOS Safari / Android Chrome / Android WebView; variance annotated | ✅ (D-15) |
| B — Broad device matrix | Hard gate on many devices | — |
| A — Items map 1:1 to existing guarantees | Clamps / iOS filter / volume / 6-min reset / social + overlay | ✅ (D-15) |

---

**Locked:** 15 decisions (D-1..D-15). **Deferred:** real-profiler CPU, runtime re-scan, broad device matrix.
