---
phase: 01-motor-core-lifecycle
plan: 03
subsystem: core
tags: [vanilla-js, iife, fatigue-manager, lifecycle, visibility, pageshow, destroy, event-bus, zero-deps]

# Dependency graph
requires:
  - phase: 01-02
    provides: "deep-frozen CONFIG with fatigueWindowMs 300000 + segmentCapMs 900000; pure PhaseMachine whose sync(0) emits phasechange 0 from a higher phase; getConfig() test handle"
provides:
  - "src/slowgram.js: FatigueManager — onHidden (hiddenAt + clock pause), onResume (catch-up base = hiddenAt || lastBoundary, negative-delta clamp, strict > CONFIG.fatigueWindowMs → resetSession, else gap discount: hiddenAt=null + lastBoundary=now), resetSession (elapsedMs 0, sync(0), emit 'reset', context preserved)"
  - "src/slowgram.js: full 4-signal bindLifecycle on locked targets (visibilitychange + resume → document, pageshow[persisted] + focus → window); contained() try/catch wrapper on every handler; lifecycleHandlers registry; functional destroy() (removes 4 listeners, state.destroyed stops rAF poll, returns SlowGram)"
  - "test/slowgram.test.js: fatigue suite (T23-T34) — 38 new assertions, 96 total green on Node"
  - "test/harness.js: FakeDocument/FakeWindow gain removeEventListener so the fakes mirror the browser surface (destroy listener removal is testable)"
affects: [01-04-PLAN.md (destroy no longer a stub — DI completeness shrinks to env validation + re-init + two-host smoke), 03-PLAN (reset → revertAll() consumer hook), 05-PLAN (6-min background reset device check maps to a >5min gap)]

# Actuals (#2632) — pairs with the plan's `estimate` (30000 tokens) to calibrate.
actuals:
  tokens: 4432     # chars/4 over the realized diff (17731 content chars across 3 files)
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []   # zero packages by hard project constraint (CORE-04)
  patterns:
    - "FatigueManager catch-up (RESEARCH.md Pattern 3): hiddenAt on any hidden signal; on ANY resume signal delta = now - (hiddenAt || lastBoundary); strict > CONFIG.fatigueWindowMs → resetSession; else discount the gap (lastBoundary=now, hiddenAt=null) — unverifiable background time is never counted"
    - "Chrome Page Lifecycle API targets (Shared Pattern 9): visibilitychange/resume → document, pageshow/focus → window; pageshow guarded by e.persisted (initial-load guard, Pitfall 8)"
    - "Contained handlers: every lifecycle handler wrapped in try/catch so a failure never escapes into the host page (T-01-01); destroy() removes bound handlers from the registry (T-01-10)"
    - "Wall-clock integer-ms delta hygiene: negative deltas clamp to 0 (NTP back-step, Pitfall 7); comparison is exact integer > — no float math, no rounding (FA-08)"

key-files:
  created: []
  modified:
    - src/slowgram.js
    - test/slowgram.test.js
    - test/harness.js

key-decisions:
  - "Strict > comparison locked (FA-05): a background gap of exactly fatigueWindowMs (300000) does NOT reset; 300001 does — asserted as a boundary pair in the suite (T23 vs T24), window always read from getConfig().fatigueWindowMs"
  - "Gap discount semantics (Pitfall 5): a gap ≤ fatigueWindowMs never accumulates — hiddenAt clears and lastBoundary refreshes to now; the session clock never counts unverifiable time"
  - "hiddenAt-null fallback base = lastBoundary (WebView missed-visibilitychange case): idempotent — with hiddenAt null and a small delta onResume only refreshes lastBoundary, no spurious reset, no accumulation (T-01-09)"
  - "resetSession always emits the observable 'reset' bus event; phaseMachine.sync(0) emits phasechange 0 when coming from a higher phase; context preserved (reset zeroes time, not context)"
  - "destroy() implemented in Plan 03 (not deferred to Plan 04): removes all four lifecycle listeners via the lifecycleHandlers registry and stops the rAF poll via state.destroyed consulted by pollLoop — behavior Test 6 (T34) asserts no listener leak"
  - "Harness fakes (FakeDocument/FakeWindow) gained removeEventListener to mirror the real browser surface — without it destroy()'s listener removal is untestable (Rule 3 deviation, documented below)"

patterns-established:
  - "Pattern 3 (FatigueManager): onHidden/onResume/resetSession per RESEARCH.md:223-241 — derived from RESEARCH.md Pattern 3, Pitfalls 3/5/7/8"
  - "Shared Pattern 6 (fatigue catch-up on every resume signal, gap discounted): RESEARCH.md:284-287 — implemented across all four signals with the pageshow persisted guard"
  - "Shared Pattern 9 (lifecycle event target mapping): RESEARCH.md:298-301 — visibilitychange/resume → document; pageshow/focus → window"

requirements-completed: [CORE-03]

# Coverage metadata (#1602) — per-deliverable traceability for verify-work UAT routing.
coverage:
  - id: D1
    description: "FatigueManager core — onHidden records hiddenAt and pauses the clock; onResume computes delta since hiddenAt (fallback lastBoundary), clamps negative deltas to 0, resets the session when delta strictly > CONFIG.fatigueWindowMs (exactly the window does NOT reset), otherwise discounts the gap (hiddenAt=null, lastBoundary=now — unverifiable time never counted); resetSession zeroes elapsedMs, sync(0) emits phasechange 0 from a higher phase, emits 'reset', preserves context; window read ONLY from CONFIG.fatigueWindowMs (rg-verified)"
    requirement: CORE-03
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#T23-T28 (fatigue core suite) + rg scan: handler reads CONFIG.fatigueWindowMs only"
        status: pass
    human_judgment: false
  - id: D2
    description: "Full 4-signal lifecycle wiring — document visibilitychange (hidden→onHidden else onResume) + document resume, window pageshow (guarded by e.persisted — persisted:false ignored on initial load) + window focus, all on locked Chrome Page Lifecycle targets; functional destroy() removes all four listeners and stops the rAF poll via state.destroyed (no leak across init/destroy cycles)"
    requirement: CORE-03
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#T29-T34 (per-signal catch-up + pageshow guard + destroy no-leak suite)"
        status: pass
    human_judgment: false

# Metrics
duration: 5min
completed: 2026-08-15
status: complete
---

# Phase 1 Plan 3: FatigueManager + 4-Signal Lifecycle Wiring Summary

**The FatigueManager (CORE-03): `hiddenAt` recorded on any hidden signal, wall-clock catch-up delta computed on ANY of four resume signals (visibilitychange/resume → document, pageshow[persisted]/focus → window), strict `> CONFIG.fatigueWindowMs` (300000) reset with an observable `'reset'` event, shorter gaps discounted — never accumulated — plus a functional `destroy()` that removes every listener and stops the rAF poll. 38 new assertions (96 total) green under the fake clock.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-08-15T13:24:00Z
- **Completed:** 2026-08-15T13:29:30Z
- **Tasks:** 2 (Task 1 TDD; Task 2 auto)
- **Files modified:** 3

## Accomplishments

- `src/slowgram.js` **FatigueManager core** — `onHidden()` records `state.hiddenAt = env.clock.now()`, sets `visible = false`, and `updateRunning()` flips the running gate so the rAF poll self-stops (no background ticking). `onResume()` computes `delta = now - (hiddenAt !== null ? hiddenAt : lastBoundary)` — the lastBoundary fallback is the missed-visibilitychange/WebView catch-up base (RESEARCH.md:232); negative deltas clamp to 0 (NTP back-step, Pitfall 7); `delta > CONFIG.fatigueWindowMs` (strict `>`, no `>=` — FA-05: exactly 300000 does NOT reset) → `resetSession()`; otherwise the gap is **discounted**: `hiddenAt = null; lastBoundary = now` (Pitfall 5 — unverifiable background time is never counted), then `visible = true; updateRunning(); tick(now)`. Idempotent on repeated resume signals with hiddenAt null (T-01-09)
- `src/slowgram.js` **`resetSession()`** — `elapsedMs = 0`, `hiddenAt = null`, `visible = true`, `lastBoundary = now`, `phaseMachine.sync(0)` (Plan 02's transition guard emits `phasechange` 0 when coming from a higher phase), `emit('reset')` (T-01-11: the reset is always observable), `updateRunning()` — context is preserved (reset zeroes time, not context)
- `src/slowgram.js` **full 4-signal `bindLifecycle(env)`** — `document.addEventListener('visibilitychange', onVisibilityChange)` (routes hidden→onHidden / visible→onResume, cross-checked against `env.visibilityState()`), `document.addEventListener('resume', onResume)` (Chrome 68+ frozen→active, A3), `window.addEventListener('pageshow', e → if (e.persisted) onResume())` (Pitfall 8 initial-load guard), `window.addEventListener('focus', onResume)` (WebView/PWA fallback) — all on the locked Chrome Page Lifecycle targets (Shared Pattern 9), every handler wrapped in a `contained()` try/catch (T-01-01); bound handlers recorded in the `lifecycleHandlers` registry
- `src/slowgram.js` **functional `destroy()`** — removes all four listeners from the injected document/window via the registry, sets `state.destroyed = true` (pollLoop consults it and returns, stopping the rAF poll — T-01-10), returns SlowGram; `init()` resets `state.destroyed` and the registry for fresh-engine semantics
- `test/harness.js` — FakeDocument/FakeWindow gain `removeEventListener(type, cb)` so the fakes mirror the browser surface and destroy()'s listener removal is actually testable
- `test/slowgram.test.js` — fatigue suite T23–T34: strict-reset boundary pair (window+1 vs exactly window via `getConfig().fatigueWindowMs`, never literals), short-gap discount, hiddenAt-null fallback, negative-delta clamp, context preservation on reset, per-signal catch-up (document resume / pageshow persisted:true / window focus / visibilitychange→visible), pageshow persisted:false initial-load guard, destroy no-leak (all four signals dispatched after destroy leave hiddenAt/elapsedMs/phase/visible untouched); `node test/slowgram.test.js` exits 0 — 96 assertions

## Task Commits

Each task was committed atomically (Task 1 with RED before GREEN):

1. **Task 1 RED: fatigue behavior tests** - `7697a7c` (test) — 6 assertions fail as expected (reset logic absent: T23b/c/d/e, T28a/c)
2. **Task 1 GREEN: FatigueManager core (onHidden/onResume/resetSession)** - `e2f9e77` (feat) — all 77 assertions green
3. **Task 2: full 4-signal lifecycle wiring + functional destroy** - `205f8a3` (feat) — all 96 assertions green

## Files Created/Modified

- `src/slowgram.js` - Modified: `onHidden`, `onResume`, `resetSession` (FatigueManager core), `contained` wrapper, 4-signal `bindLifecycle` with `lifecycleHandlers` registry, `state.destroyed` flag, pollLoop destroyed check, functional `destroy()`, init resets (`state.destroyed`, `lifecycleHandlers`), Wave 3 header
- `test/slowgram.test.js` - Modified: fatigue core suite (T23–T28) + lifecycle wiring suite (T29–T34), 38 new assertions (58 → 96)
- `test/harness.js` - Modified: `removeEventListener` added to FakeDocument + FakeWindow (Rule 3 deviation)

## Decisions Made

- **Strict `>` fatigue comparison locked (FA-05)** — a gap of exactly `fatigueWindowMs` (300000 ms) does NOT reset; 300001 ms does; asserted as a boundary pair (T23 vs T24) with the window always derived from `getConfig().fatigueWindowMs`
- **Gaps ≤ window are discounted, never accumulated** (Pitfall 5, prohibition P1) — the discount path (`hiddenAt = null; lastBoundary = now`) means unverifiable background time is never counted; the session clock cannot "lie" across backgrounding
- **hiddenAt-null fallback base = lastBoundary** — a resume signal with hiddenAt null (WebView missed visibilitychange) uses lastBoundary as the catch-up base and only refreshes it; idempotent, no spurious reset, no accumulation (T-01-09)
- **Reset is always observable** (prohibition P2) — `resetSession()` emits the `'reset'` bus event and `sync(0)` emits `phasechange` 0 from a higher phase; accumulated state is never silently discarded
- **destroy() shipped in Plan 03, not Plan 04** — the plan's Task 2 action explicitly requires functional destroy (listener removal + `state.destroyed` poll stop) to make the no-leak behavior test possible; Plan 04's DI-completeness scope shrinks accordingly

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] FakeDocument/FakeWindow lacked `removeEventListener`**
- **Found during:** Task 2 (destroy no-leak test T34)
- **Issue:** The plan requires `destroy()` to remove all four listeners from the injected document/window (acceptance criteria + threat mitigation T-01-10), but the Plan 01 harness fakes only exposed `addEventListener`/`dispatchEvent` — the browser surface they mirror (PATTERNS.md Shared Pattern 9: "the harness must mirror exactly") includes `removeEventListener`. Without it, listener removal is untestable and T34 can only assert the `state.destroyed` half of the contract.
- **Fix:** Added `removeEventListener(type, cb)` to FakeDocument and FakeWindow in `test/harness.js` (indexOf + splice, mirroring the engine's needs). `destroy()` feature-detects `removeEventListener` so real-browser behavior is unchanged.
- **Files modified:** `test/harness.js` (also `src/slowgram.js`, `test/slowgram.test.js` per plan)
- **Commit:** `205f8a3`
- **Note:** This file was outside the plan's `files_modified` list (src/slowgram.js, test/slowgram.test.js); the addition is additive and non-breaking (all prior 58 assertions stay green).

No other deviations — the locked contracts were all implemented exactly as written (strict `>`, gap discount, hiddenAt-null fallback, pageshow persisted guard, reset preserves context, CONFIG-only window reads, try/catch containment, zero timers, no bare Date.now outside resolveEnv).

## Auth Gates

None — no external service or credential was required.

## Issues Encountered

- None — both RED phases failed for exactly the expected reasons. Documented RED nuance: in Task 1 RED, T24/T25/T26/T27 (+T28b) passed *vacuously* — the pre-FatigueManager visibilitychange handler never sets `hiddenAt`, so `hiddenAt === null` holds and hidden-time pause matches the discount semantics by accident. In Task 2 RED, T31 (no pageshow listener yet → no reset trivially) and T33 (visibilitychange already wired in Task 1) passed vacuously. The genuine failures (6 in Task 1 RED: T23b/c/d/e, T28a/c; 12 in Task 2 RED: T29×3, T30×3, T32×3, T34b/c/e) are exactly the missing functionality each GREEN resolved.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Ready for 01-04 (DI completeness):** `destroy()` is already functional (listener removal + poll stop) — Plan 04's remaining scope is `env` shape validation, re-init hardening, and the two-host browser smoke (open test/harness.html in Edge)
- **Consumers staged:** Phase 3 DegradationEngine can subscribe to `'reset'` to drive `revertAll()`; `'phasechange'`/`'elapsed'` remain the lever-routing signals; `state.destroyed` gives Phase 4+ a clean teardown contract
- **Carried concern:** browser-host smoke (open test/harness.html in Edge) is manual until Plan 04's formal two-host gate; the 6-min on-device background reset (HARN-06) maps to a >5min gap and stays a Phase 5 device check

## TDD Gate Compliance

- **Task 1:** RED gate `7697a7c` (`test(01-03): ...`) exists before GREEN gate `e2f9e77` (`feat(01-03): ...`) — verified in git log
- **Task 2:** no separate RED commit — the plan marks Task 2 `type="auto"` (no `tdd="true"`), so tests + implementation ship in one commit `205f8a3` (`feat(01-03): ...`); the RED check was still run against the Task 1 state (12 genuine failures) before implementation, then verified green
- **RED failure quality (fail-fast rule honored):** Task 1 RED failed exactly the 6 missing-reset assertions; Task 2 RED failed exactly the 12 missing-signal/destroy assertions. No unexpected passes of real functionality (vacuously-passing assertions are documented under Issues Encountered).

## Known Stubs

None introduced by this plan. Pre-existing intentional placeholders from 01-02 (selectors registry, unconsumed degradationMatrix) remain tracked in 01-02-SUMMARY.md and are resolved by Phase 2/3 plans.

## Threat Flags

None — all new surface (4 lifecycle listeners, `'reset'` bus event, `destroy()`) is covered by the plan's threat register (T-01-08..T-01-11) with mitigations implemented and asserted in the suite.

---
*Phase: 01-motor-core-lifecycle*
*Completed: 2026-08-15*

## Self-Check: PASSED

- FOUND: src/slowgram.js, test/slowgram.test.js, test/harness.js, .planning/phases/01-motor-core-lifecycle/01-03-SUMMARY.md
- FOUND: commits 7697a7c (fatigue RED), e2f9e77 (fatigue GREEN), 205f8a3 (lifecycle wiring + destroy)
- `node test/slowgram.test.js` exits 0 — 96 assertions passed