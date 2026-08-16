---
phase: 01-motor-core-lifecycle
plan: 02
subsystem: core
tags: [vanilla-js, iife, deep-freeze, phase-machine, transition-guard, config, event-bus, zero-deps]

# Dependency graph
requires:
  - phase: 01-01
    provides: "Engine IIFE + DI seam + SessionClock accumulation (tick reads CONFIG.segmentCapMs from day one), deepFreeze WeakSet helper, getConfig() handle, event bus, FakeClock/FakeRAF harness"
provides:
  - "src/slowgram.js: full deep-frozen CONFIG single object (phaseBoundariesMin [3,7,12], fatigueWindowMs 300000, segmentCapMs 900000, per-phase degradationMatrix, selectors registry, preservedRoutes) — magic numbers confined to the initConfig factory (rg-verified)"
  - "src/slowgram.js: pure PhaseMachine — phaseFor(elapsedMs) total over [0, Infinity) driven ONLY by CONFIG.phaseBoundariesMin (integer-ms >= comparison, FA-03/FA-04); sync(elapsedMs) transition-guarded 'phasechange' emitter; SlowGram._phaseFor test-only handle"
  - "test/slowgram.test.js: config suite (deep-freeze on all nested nodes, strict-mode throw-on-write, locked values, degradationMatrix keys '0'..'3', preservedRoutes contents) + phase suite (boundary one-step-either-side, totality, negative input, CONFIG-derived ms, transition-guard emission counts) — 58 assertions total, green on Node"
affects: [01-03-PLAN.md, 01-04-PLAN.md, 02-PLAN (selector registry consumption), 03-PLAN (degradationMatrix consumption)]

# Actuals (#2632) — pairs with the plan's `estimate` (30000 tokens) to calibrate.
actuals:
  tokens: 3338     # chars/4 over the realized diff (13354 chars across 2 files)
  tasks: 2
  commits: 4

# Tech tracking
tech-stack:
  added: []   # zero packages by hard project constraint (CORE-04)
  patterns:
    - "Single deep-frozen CONFIG object: every constant (phases, fatigue window, segment cap, degradation matrix, selectors, preserved routes) lives in one factory; magic numbers banned elsewhere (rg-verified)"
    - "Total pure function + transition guard: phaseFor(elapsedMs) has no side effects and reads only frozen CONFIG; sync emits 'phasechange' only on real transitions (no emission storm, T-01-06)"
    - "Integer-ms boundary math: boundaries[i] * 60000 converted once (no float division, no rounding); exact elapsedMs >= boundaryMs comparison — no tie-breaking ambiguity (FA-04)"
    - "CONFIG-derived test values: suites compute boundaries from getConfig().phaseBoundariesMin — never 3/7/12 literals (RESEARCH.md:463)"

key-files:
  created: []
  modified:
    - src/slowgram.js
    - test/slowgram.test.js

key-decisions:
  - "phaseBoundariesMin = [3, 7, 12] locked (FA-03): phase 0: <3m, 1: 3-7m, 2: 7-12m, 3: >=12m — '15+' is descriptive of the stop-point phase's tail; boundary comparison is elapsedMs >= boundaryMs (integer ms), so exactly at a boundary returns the NEXT phase"
  - "fatigueWindowMs = 300000 (5 min) and segmentCapMs = 900000 (15 min) stored in CONFIG — the VALUES live in the constants object; the strict > comparison semantics land in Plan 03"
  - "degradationMatrix and selectors stored in Phase 1 even though Phase 3/2 consume them (A5) — CORE-05 single-object intent; 'no magic numbers scattered' means later-phase constants live here from day one"
  - "phaseFor is defensive-total: elapsedMs < 0 returns 0; Number.MAX_SAFE_INTEGER terminates the loop safely (phase 3)"
  - "SlowGram._phaseFor exposed as a documented test-only handle for the pure boundary contract; the production surface stays sync() + getState().phase"

patterns-established:
  - "Pattern 4 (PhaseMachine): pure phaseFor + transition-guarded sync — derived from RESEARCH.md:244-264; no 3/7/12 literals in the function body"
  - "Pattern 5 (deep-frozen CONFIG): recursive deepFreeze with WeakSet cycle guard + 'use strict' — nested writes throw TypeError (RESEARCH.md:267-284, MDN)"
  - "Shared Pattern 3 (transition-guarded emission): sync emits only when phase changes — idempotent no-op sync emits nothing (RESEARCH.md:294 anti-pattern honored)"
  - "Test values derived from CONFIG: boundary assertions compute b[i]*60000 — the array is the single source of truth"

requirements-completed: [CORE-02, CORE-05]

# Coverage metadata (#1602) — per-deliverable traceability for verify-work UAT routing.
coverage:
  - id: D1
    description: "Single deep-frozen CONFIG constants object — phaseBoundariesMin [3,7,12], fatigueWindowMs 300000, segmentCapMs 900000, per-phase degradationMatrix (keys 0..3), selectors registry, preservedRoutes [/direct/, /messages/]; every nested node frozen; strict-mode writes throw TypeError; magic numbers confined to the factory"
    requirement: CORE-05
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#T11-T15 (config suite) + rg scan of 300000/900000 confined to initConfig"
        status: pass
    human_judgment: false
  - id: D2
    description: "Pure PhaseMachine — phaseFor(elapsedMs) total over [0, Infinity) driven only by CONFIG.phaseBoundariesMin with integer-ms >= comparison (exactly at boundary returns next phase, one ms below returns previous, negative clamps to 0, Number.MAX_SAFE_INTEGER → 3); sync emits 'phasechange' only on real transitions (no-op sync emits nothing); SlowGram._phaseFor test-only handle"
    requirement: CORE-02
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#T16-T22 (phase suite, fake-clock driven)"
        status: pass
    human_judgment: false

# Metrics
duration: 4min
completed: 2026-08-15
status: complete
---

# Phase 1 Plan 2: Frozen CONFIG + Pure PhaseMachine Summary

**Full deep-frozen CONFIG single object (CORE-05 — all phase constants, degradation matrix, selectors, preserved routes in one immutable factory) plus a pure PhaseMachine (CORE-02 — phaseFor maps elapsedMs → phase 0..3 driven only by the CONFIG boundary array, with a transition-guarded `phasechange` emitter), both green across 30 new assertions (58 total) under the fake clock.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-08-15T10:18:08Z
- **Completed:** 2026-08-15T10:22:03Z
- **Tasks:** 2 (both TDD auto)
- **Files modified:** 2

## Accomplishments
- `src/slowgram.js` `initConfig()` now builds the full CORE-05 constants object: `phaseBoundariesMin: [3, 7, 12]` (locked FA-03), `fatigueWindowMs: 300000`, `segmentCapMs: 900000`, per-phase `degradationMatrix` (`'0'..'3'`), `selectors` registry placeholder, `preservedRoutes: ['/direct/', '/messages/']` — deep-frozen recursively via the WeakSet-guarded `deepFreeze`; `rg -n "300000|900000" src/slowgram.js` matches ONLY the factory body
- `src/slowgram.js` `phaseFor(elapsedMs)` — pure total function over `[0, Infinity)`: `elapsedMs < 0 → 0`; boundaries converted to integer ms once (`boundaries[i] * 60000`, no float division); exact `elapsedMs >= boundaryMs` (FA-03: exactly at 3m/7m/12m → next phase; 1 ms below → previous); `Number.MAX_SAFE_INTEGER → 3`; reads ONLY `CONFIG.phaseBoundariesMin` — zero 3/7/12 literals in the body
- `src/slowgram.js` `sync(elapsedMs)` — replaces the Plan 01 no-op stub: sets `state.phase` and emits `'phasechange'` ONLY on real transitions; a no-op sync emits nothing (RESEARCH.md:294, T-01-06); 0 boundary handled identically so Plan 03's `resetSession() → sync(0)` will emit phasechange 0 from a higher phase
- `SlowGram._phaseFor` — documented test-only direct handle to the pure function (production surface stays `sync()` + `getState().phase`)
- `test/slowgram.test.js` — config suite (T11–T15: `Object.isFrozen` on CONFIG + every nested node, strict-mode throw on write, locked values `[3,7,12]`/`300000`/`900000`, degradationMatrix keys `'0'..'3'`, preservedRoutes contents) + phase suite (T16–T22: one-step-either-side ×4 via CONFIG-derived boundaries, totality, negative input, CONFIG-derived ms, transition-guard emission counts driven by FakeClock + FakeRAF); `node test/slowgram.test.js` exits 0 — 58 assertions

## Task Commits

Each task was committed atomically with RED before GREEN:

1. **Task 1 RED: deep-frozen CONFIG contract tests** - `687cdf5` (test) — 5 assertions fail as expected (full CONFIG shape missing: T14a/b, T15a/b/c)
2. **Task 1 GREEN: full deep-frozen CONFIG single object** - `aa1c1c1` (feat) — all 41 assertions green
3. **Task 2 RED: PhaseMachine boundary + transition-guard tests** - `0518e3b` (test) — 10 assertions fail as expected (_phaseFor handle missing, sync stub no-op)
4. **Task 2 GREEN: pure PhaseMachine with transition-guarded phasechange** - `b061057` (feat) — all 58 assertions green

## Files Created/Modified
- `src/slowgram.js` - Modified: full `initConfig()` factory (all CORE-05 constants, deep-frozen), `phaseFor` pure total function, `syncPhase` transition-guarded emitter (replaces the Plan 01 stub via `phaseMachine.sync = syncPhase`), `SlowGram._phaseFor` test-only handle, updated header/getConfig docstrings
- `test/slowgram.test.js` - Modified: config suite (T11–T15) + phase suite (T16–T22), 30 new assertions (28 → 58)

## Decisions Made
- **`phaseBoundariesMin: [3, 7, 12]` locked with `>=` integer-ms comparison** — exactly at a boundary returns the next phase (FA-03); one ms below returns the previous; boundaries derive from CONFIG, never literals in tests or the phaseFor body (RESEARCH.md:463)
- **All constants in one frozen object (A5)** — degradationMatrix (Phase 3) and selectors (Phase 2) stored from day one per CORE-05's "no magic numbers scattered" intent; the factory is the only place 300000/900000/[3,7,12] appear (rg-verified)
- **Defensive totality for phaseFor** — negative elapsedMs clamps to 0; `Number.MAX_SAFE_INTEGER` terminates the boundary loop safely at phase 3 (FA-04)
- **Test-only `_phaseFor` handle** — documented as test-only so the pure boundary contract is asserted directly without driving fake-clock ticks; sync + getState().phase remain the production surface

## Deviations from Plan

None - plan executed exactly as written. Both tasks followed the locked contracts (values, boundary semantics, transition guard, no-literal source scans); no auto-fixes were required (Rule 1/2/3 never triggered).

## Issues Encountered
- None — the RED phases failed for exactly the expected reasons (missing CONFIG shape; missing `_phaseFor` handle + no-op sync stub). The only nuance worth noting is documented under TDD Gate Compliance: config-suite tests T11–T13 pass vacuously in the RED run because `Object.isFrozen(undefined) === true` (ES2015 non-object semantics) and strict-mode writes to a frozen/non-existent property throw regardless — the genuine RED failures were the shape assertions T14/T15.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- **Ready for 01-03 (FatigueManager):** `sync(0)` handles the 0 boundary identically to any other value, so Plan 03's `resetSession()` → `sync(0)` will emit `phasechange` 0 when coming from a higher phase; `CONFIG.fatigueWindowMs` (300000) is in place for the strict `>` comparison; `bindLifecycle` already wires `visibilitychange` with the visible gate and tick
- **Ready for 01-04 (DI completeness):** `destroy()` stub and the two-host browser smoke remain; `env` shape validation lands there
- **Consumers staged:** Phase 2 RouteGuard reads `CONFIG.preservedRoutes`; Phase 2 selector registry replaces the `selectors` placeholder; Phase 3 DegradationEngine reads `CONFIG.degradationMatrix` per phase
- **Carried concern:** browser-host smoke (open test/harness.html in Edge) is manual until Plan 04's formal two-host gate

## TDD Gate Compliance

- **Task 1:** RED gate `687cdf5` (`test(01-02): ...`) exists before GREEN gate `aa1c1c1` (`feat(01-02): ...`) — verified in git log
- **Task 2:** RED gate `0518e3b` (`test(01-02): ...`) exists before GREEN gate `b061057` (`feat(01-02): ...`) — verified in git log
- **RED failure quality (fail-fast rule honored):** Task 1 RED failed exactly the 5 missing-shape assertions (T14a/b, T15a/b/c); Task 2 RED failed exactly the 10 expected assertions (_phaseFor missing ×5, no-op sync emissions ×5). No unexpected passes of real functionality.
- **Documented nuance:** in Task 1 RED, T11 (isFrozen) and T12/T13 (throws) passed *vacuously* — `Object.isFrozen(undefined)` returns `true` for non-objects (ES2015), and strict-mode writes throw on the already-frozen/non-extensible CONFIG or on `undefined[0]` regardless of the missing shape. These tests genuinely assert the CORE-05 contract in GREEN (nested nodes exist AND are frozen; writes throw). Not a gate violation — the suite still failed on the shape assertions that the GREEN implementation resolves.

## Known Stubs

| Stub | File | Reason | Resolved by |
|------|------|--------|-------------|
| `selectors: {video, roleMain}` placeholder registry | src/slowgram.js (initConfig) | Intentional per plan (A5) — Phase 1 only stores it; Phase 2 owns real selector values | Phase 2 (DOM Detection & Scoping) |
| `degradationMatrix` stored but unconsumed | src/slowgram.js (initConfig) | Intentional per plan — Phase 1 only stores it; Phase 3 DegradationEngine routes per-phase applicability | Phase 3 (Degradation Levers) |

---
*Phase: 01-motor-core-lifecycle*
*Completed: 2026-08-15*

## Self-Check: PASSED

- FOUND: src/slowgram.js, test/slowgram.test.js, .planning/phases/01-motor-core-lifecycle/01-02-SUMMARY.md
- FOUND: commits 687cdf5 (config RED), aa1c1c1 (config GREEN), 0518e3b (phase RED), b061057 (phase GREEN)
- `node test/slowgram.test.js` exits 0 — 58 assertions passed