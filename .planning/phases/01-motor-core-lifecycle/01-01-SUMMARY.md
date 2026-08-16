---
phase: 01-motor-core-lifecycle
plan: 01
subsystem: core
tags: [vanilla-js, iife, di-seam, fake-clock, session-clock, zero-deps, harness, event-bus]

# Dependency graph
requires: []
provides:
  - "src/slowgram.js: strict-mode IIFE engine with DI seam (clock/document/window/MutationObserver/requestAnimationFrame), deep-frozen CONFIG.segmentCapMs, single tick(now) accumulation path, rAF poll, minimal visibilitychange lifecycle binding, public API init/getState/getConfig/setContext/on/emit/destroy, bus events contextchange + elapsed"
  - "test/harness.js: FakeClock/FakeDocument/FakeWindow/FakeMutationObserver/FakeRAF + assert runner + renderResults — dual-host (Node require + browser globals)"
  - "test/slowgram.test.js: CORE-01 clock suite — 28 assertions, fully synchronous, fake-clock driven"
  - "test/harness.html: browser runner loading engine → harness → tests in order"
affects: [01-02-PLAN.md, 01-03-PLAN.md, 01-04-PLAN.md]

# Actuals (#2632) — pairs with the plan's `estimate` (32000 tokens) to calibrate.
actuals:
  tokens: 5737     # chars/4 over the realized diff (22950 chars across 4 files)
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []   # zero packages by hard project constraint (CORE-04)
  patterns:
    - "IIFE + DI seam: resolveEnv(overrides) with global fallbacks; engine body never touches bare globals outside it"
    - "Single tick(now) accumulation path: every boundary handler and the rAF poll call it"
    - "deepFreeze (WeakSet cycle guard) + strict mode for CONFIG immutability"
    - "Containment: init() and every event-handler/subscriber body try/catch console.error + return (T-01-01)"
    - "Fake-clock determinism: advance(ms) moves time only; one raf.flush() = one frame = one tick"

key-files:
  created:
    - src/slowgram.js
    - test/harness.js
    - test/slowgram.test.js
    - test/harness.html
  modified: []

key-decisions:
  - "Session clock anchors lastBoundary at now when the running gate transitions to true — page-origin/pause gaps are never counted, so advance(180000) after REELS accumulates exactly 180000 (truth #1)"
  - "init() resets accumulation state and the listener registry — each re-init (fresh mocks per test) behaves as a brand-new engine"
  - "init() starts the rAF poll so one raf.flush() = one frame = one tick under the harness"
  - "SlowGram.getConfig() added as the test/consumer CONFIG handle — suites assert segmentCapMs from the engine's own source, never literals"

patterns-established:
  - "Pattern 1: DI seam — resolveEnv(overrides) resolves clock/document/window/MutationObserver/requestAnimationFrame/visibilityState; zero bare globals in the engine body"
  - "Pattern 2: SessionClock — single tick(now) entry point, running-gated, delta>0 clamp, CONFIG.segmentCapMs cap, phaseMachine.sync call site from day one"
  - "Pattern 5: deepFreeze with WeakSet cycle guard (MDN pattern + cycle safety)"
  - "Error containment: init() + every event handler + subscriber delivery wrapped in try/catch that console.error's and returns"
  - "Dual-host harness: same test file runs `node test/slowgram.test.js` and test/harness.html via global-attached constructors"

requirements-completed: [CORE-01, CORE-04, CORE-06]

# Coverage metadata (#1602) — per-deliverable traceability for verify-work UAT routing.
coverage:
  - id: D1
    description: "Engine IIFE skeleton with DI seam — init(overrides) accepts injected clock/document/window/MutationObserver/requestAnimationFrame; engine body has no bare global references outside resolveEnv; single SlowGram handle"
    requirement: CORE-04
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#T5 (DI seam reflection + public API surface) + source scans"
        status: pass
    human_judgment: false
  - id: D2
    description: "Session clock accumulation contract — REELS+visible accumulates exact deltas; SOCIAL/UNKNOWN/hidden never accumulate; negative deltas clamp; single segments cap at CONFIG.segmentCapMs"
    requirement: CORE-01
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#T1-T4, T6-T8 (clock suite)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Context feed + event bus — setContext REELS/SOCIAL/UNKNOWN with default UNKNOWN fail-safe, invalid context throws, contextchange emitted only on real change, elapsed emitted per tick"
    requirement: CORE-01
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#T9, T10"
        status: pass
    human_judgment: false
  - id: D4
    description: "Dual-host harness — FakeClock advance-driven suite green on the Node host; the same engine file loads in test/harness.html for the browser host"
    requirement: CORE-06
    verification:
      - kind: unit
        ref: "node test/slowgram.test.js (28 assertions, exit 0)"
        status: pass
    human_judgment: true
    rationale: "The browser-host half of the same-file/two-hosts contract requires opening test/harness.html in a browser and confirming the pass/fail table renders green; the formal two-host gate lands in Plan 04."

# Metrics
duration: 6min
completed: 2026-08-15
status: complete
---

# Phase 1 Plan 1: Tracer — Engine Skeleton + DI Seam + SessionClock Accumulation Summary

**Wave 1 tracer shipped: the DI seam → injected fake clock → single tick() accumulation → getState() path proven end-to-end on the Node host — a strict-mode IIFE engine with `init/getState/getConfig/setContext/on/emit/destroy`, a dual-host fake-clock harness (Node + browser), and the full CORE-01 clock contract (REELS+visible accumulates exact deltas, everything else never, negative deltas clamp, segments cap at `segmentCapMs`) green across 28 assertions.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-08-15T10:09:34Z
- **Completed:** 2026-08-15T10:15:13Z
- **Tasks:** 2 (1 tracer + 1 TDD auto)
- **Files modified:** 4 created

## Accomplishments
- Engine IIFE (`src/slowgram.js`): single `SlowGram` handle, `resolveEnv` DI seam with global fallbacks, `deepFreeze(CONFIG.segmentCapMs)` with WeakSet cycle guard, `tick(now)` as the ONLY accumulation path (running-gated, `delta > 0` NTP back-step clamp, `segmentCapMs` cap), rAF poll (frame callback, not a timer), minimal `visibilitychange` lifecycle binding, tiny emitter with `contextchange` + `elapsed` bus events, contained `init()` + handlers per threat T-01-01
- Dual-host harness (`test/harness.js`): `FakeClock{now,advance}`, `FakeDocument` + `setVisibility`, `FakeWindow`, `FakeMutationObserver` stub, `FakeRAF{request,flush}`, `assert{equal,ok,throws}` runner, `renderResults` table — attached to globals so the same test file runs under Node and in a browser
- CORE-01 clock suite (`test/slowgram.test.js`): 28 assertions — exact-delta REELS+visible accumulation, SOCIAL/UNKNOWN/hidden exclusions, negative-delta clamp, segment cap via `getConfig()`, elapsed/contextchange emission contracts, invalid-context throw, DI seam reflection, no-timer + no-bare-`Date.now` source scans; `node test/slowgram.test.js` exits 0
- Browser host prepared (`test/harness.html`): engine → harness → tests `<script>` load order, `renderResults('results')` pass/fail table (smoke run by hand; formal two-host gate in Plan 04)

## Task Commits

Each task was committed atomically:

1. **Task 1: Engine skeleton + DI seam + SessionClock accumulation (tracer)** - `c657050` (feat)
2. **Task 2 RED: CORE-01 clock contract tests** - `a75c83d` (test) — 3 of 28 assertions fail as expected (getConfig handle, CONFIG-based cap, elapsed event)
3. **Task 2 GREEN: complete CORE-01 clock contract** - `0b35c5a` (feat) — all 28 assertions green

## Files Created/Modified
- `src/slowgram.js` - The injectable engine IIFE (zero deps): DI seam, deep-frozen CONFIG, single tick() accumulation path, rAF poll, lifecycle binding, event bus, contained error handling
- `test/harness.js` - FakeClock/FakeDocument/FakeWindow/FakeMutationObserver/FakeRAF + assert runner + renderResults; dual-host (Node require + browser `<script>`)
- `test/slowgram.test.js` - CORE-01 clock suite (28 assertions) + no-timer/no-bare-Date.now source scans; same file runs in Node and test/harness.html
- `test/harness.html` - Browser runner page: `<script>` load order engine → harness → tests, pass/fail table container

## Decisions Made
- **lastBoundary anchored on running transition** — `updateRunning()` sets `lastBoundary = env.clock.now()` when the gate turns true, so page-origin/pause time is never counted and `advance(180000)` after `setContext('REELS')` accumulates exactly 180000 (plan truth #1)
- **init() = fresh engine** — re-init resets accumulation state and the listener registry, because the plan's test structure re-inits with fresh mocks per test; without it state leaks across tests
- **init() starts the rAF poll** — `env.requestAnimationFrame(pollLoop)` at init so one `raf.flush()` = one frame = one tick (the plan's tests drive time through flush)
- **`getConfig()` test/consumer handle** — the frozen CONFIG is read through the engine itself so suites assert `segmentCapMs` from the same source tick() accumulates with, never literals (per plan Task 2)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] init() resets state + listener registry on re-init**
- **Found during:** Task 1 (design of the clock suite — each test re-inits with fresh mocks)
- **Issue:** state (`elapsedMs`, `context`, …) and `listeners` are module-level; a second `init()` would inherit the previous test's accumulation/context and subscriptions, breaking Test 2/3 (expect 0) and the "exactly once" event counts
- **Fix:** `init()` resets all state fields to defaults and `listeners = {}` before binding — re-init is a brand-new engine
- **Files modified:** src/slowgram.js
- **Verification:** full suite green with per-test re-init (28 assertions, exit 0)
- **Committed in:** c657050 (Task 1 commit)

**2. [Rule 3 - Blocking] init() starts the rAF poll**
- **Found during:** Task 1 (Test 1 requires `raf.flush()` to drive a tick)
- **Issue:** without a first `requestAnimationFrame(pollLoop)` at init, `FakeRAF.pending` is null, `flush()` is a no-op, and no accumulation ever happens — Test 1 would stay at 0
- **Fix:** `init()` calls `env.requestAnimationFrame(pollLoop)` after binding lifecycle
- **Files modified:** src/slowgram.js
- **Verification:** Test 1 accumulates exactly 180000 after one flush
- **Committed in:** c657050 (Task 1 commit)

**3. [Rule 3 - Blocking] updateRunning() anchors lastBoundary on the running transition**
- **Found during:** Task 1 (Test 1 exact-delta truth)
- **Issue:** with `lastBoundary` left at its initial 0, the first `setContext('REELS')` tick would count the whole fake-clock origin (1000000 ms), making `elapsedMs` 900000 instead of 0 — Test 1's "exactly 180000" could never hold
- **Fix:** when running transitions false→true, set `lastBoundary = env.clock.now()` first so the first delta is 0; same semantics on visible→running resumes
- **Files modified:** src/slowgram.js
- **Verification:** all accumulation truths (exact delta, exclusions, cap) pass
- **Committed in:** c657050 (Task 1 commit)

**4. [Rule 1 - Bug] Source scan counted Date.now occurrences inside JSDoc comments**
- **Found during:** Task 1 verification (`node test/slowgram.test.js` failed 1 of 17)
- **Issue:** the `Date.now` scan matched the engine's own documentation prose ("no bare Date.now() outside resolveEnv"), flagging 3 occurrences instead of the single code call site
- **Fix:** scans strip comments (`/\*...\*/` and `//...`) before matching — the rule is enforced on code, not prose
- **Files modified:** test/slowgram.test.js
- **Verification:** suite green (17 → 28 assertions); grep confirms the only `Date.now()` call site is the resolveEnv default clock
- **Committed in:** c657050 (Task 1 commit)

**5. [Rule 3 - Blocking] Test file require path**
- **Found during:** Task 1 first run (Node MODULE_NOT_FOUND)
- **Issue:** `require('./slowgram.js')` from `test/slowgram.test.js` resolves to `test/slowgram.js` — the engine lives in `src/`
- **Fix:** `require('../src/slowgram.js')`
- **Files modified:** test/slowgram.test.js
- **Verification:** suite runs under Node, exit 0
- **Committed in:** c657050 (Task 1 commit)

---

**Total deviations:** 5 auto-fixed (1 bug, 4 blocking)
**Impact on plan:** All auto-fixes were required for the plan's own test contract to hold (per-test re-init, flush-driven ticks, exact-delta truths). No scope creep; no new architectural surface beyond the plan's artifacts. The tracer verdict stands: the DI seam → injected clock → single tick() → getState() path works end-to-end.

## Issues Encountered
- Task 1's initial run surfaced the require-path and comment-scan issues above — both resolved inline before the tracer commit (documented as deviations 4 and 5)
- No auth gates, no package installs (zero-package project — T-01-SC N/A), no environment blockers

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- **Ready for 01-02 (Frozen CONFIG + PhaseMachine):** `tick()` already calls `phaseMachine.sync(elapsedMs)` from day one — Plan 02 fills the no-op stub with the pure `phaseFor` + transition-guarded `phasechange` emitter with zero architectural change; `getConfig()` handle is in place for CONFIG-shape assertions
- **Ready for 01-03 (FatigueManager):** `bindLifecycle` already wires `visibilitychange` with the visible gate and tick; Plan 03 adds the 4-signal catch-up (`resume`/`pageshow`/`focus`) and the strict >5-min reset on top of the existing boundary-tick shape
- **Ready for 01-04 (DI completeness):** `destroy()` stub and the two-host browser smoke are the remaining gaps; `env` shape validation lands there
- **Carried concern:** browser-host smoke (open test/harness.html in Edge) is manual until Plan 04's formal two-host gate

## TDD Gate Compliance

- RED gate commit `a75c83d` (`test(01-01): add CORE-01 clock contract tests (RED)`) exists before GREEN commit `0b35c5a` (`feat(01-01): complete CORE-01 clock contract`) — verified in git log
- RED suite failed exactly the 3 expected assertions (getConfig handle, CONFIG-based cap, elapsed event); no unexpected passes — fail-fast rule honored
- Task 1 (tracer, `tdd="false"`) shipped as a real implementation with its own `<verify>` per tracer contract

---
*Phase: 01-motor-core-lifecycle*
*Completed: 2026-08-15*

## Self-Check: PASSED

- FOUND: src/slowgram.js, test/harness.js, test/slowgram.test.js, test/harness.html, .planning/phases/01-motor-core-lifecycle/01-01-SUMMARY.md
- FOUND: commits c657050 (tracer), a75c83d (RED), 0b35c5a (GREEN)
- `node test/slowgram.test.js` exits 0 — 28 assertions passed