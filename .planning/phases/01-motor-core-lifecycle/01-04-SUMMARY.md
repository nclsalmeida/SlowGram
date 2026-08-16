---
phase: 01-motor-core-lifecycle
plan: 04
subsystem: core
tags: [vanilla-js, iife, di-seam, env-validation, idempotent-init, destroy, two-host, browser-smoke, zero-deps]

# Dependency graph
requires:
  - phase: 01-03
    provides: "FatigueManager + 4-signal lifecycle wiring with functional destroy(); 96 green assertions on Node; FakeDocument/FakeWindow with removeEventListener"
provides:
  - "src/slowgram.js: hardened DI seam — resolveEnv validates every PROVIDED override (clock object+now(), document/window null-or-addEventListener, MutationObserver null-or-constructor, rAF null-or-function) throwing descriptive Errors; init() idempotence guard (internal destroy-then-reinit, no duplicate listeners) + loud rethrow on init failure; teardown() shared by destroy() and the init guard — removes all 4 listeners, stops the rAF poll, resets state to fresh pre-init values, PRESERVES subscribers"
  - "test/slowgram.test.js: DI suite D1-D5 (env validation, stub-global default-path shim, idempotent init, destroy completeness + re-init cycle, destroy-reset contract) + T34 rewritten to the locked destroy-reset contract — 116 total assertions green on Node"
  - "test/harness.js: renderResults hardened to DOM-built table via textContent (no innerHTML), one row per assertion + summary row (passed/run + verdict)"
  - "test/harness.html: script order engine → harness → error handler → tests; window 'error' handler renders any uncaught error as a red FAIL row (containment observability, T-01-14)"
affects: [03-PLAN (subscriber preservation across re-init — external subscriber hooks survive destroy/reset), 05-PLAN (reset device check unaffected; destroy-reset contract: elapsedMs 0 after destroy)]

# Actuals (#2632) — pairs with the plan's `estimate` (30000 tokens) to calibrate.
actuals:
  tokens: 5717      # chars/4 over the realized diff (22870 content chars across 4 files)
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []   # zero packages by hard project constraint (CORE-04)
  patterns:
    - "DI validation on the PROVIDED override set: 'key' in overrides && overrides.key !== undefined presence check distinguishes an explicitly-null dependency (accepted, resolves to the given null) from an omitted one (defaults to globals) — only malformed non-null values throw"
    - "Internal destroy-then-reinit idempotence: init() when already initialized (and not destroyed) runs teardown() first — re-init is a clean full cycle; the idempotence guard and destroy() share teardown() so undo always exactly undoes init()'s setup"
    - "Fail-loud containment: init() catch block console.errors AND rethrows the descriptive Error (D1 suite asserts message text) — host page gets no partially-bound engine, caller sees a loud failure; browser 'error' handler turns any uncaught error into a visible red FAIL row"
    - "textContent-only DOM rendering in the harness (no innerHTML) — the two-host smoke's renderer is itself injection-safe"

key-files:
  created: []
  modified:
    - src/slowgram.js
    - test/slowgram.test.js
    - test/harness.js
    - test/harness.html

key-decisions:
  - "destroy() locks the reset-to-fresh contract (T-01-11, supersedes Plan 03's destroy-keeps-state T34): destroy() resets state to pre-init zeros/UNKNOWN/destroyed — asserted as T34b/c/d; signals after destroy are inert; a subsequent init() is a clean re-init (D4)"
  - "init() no longer clears the subscriber registry — teardown() preserves `listeners` (documented in code): external hooks subscribed once survive re-init cycles; D3 proves double-init yields exactly one contextchange (no duplicate handlers)"
  - "init() rethrows after console.error (was swallow-only): D1 depends on the loud throw; containment is preserved (error message is descriptive, host page gets no broken engine)"
  - "rg gate interpretation: the literal pattern also matches env.-qualified accesses (env.requestAnimationFrame in pollLoop/init) — gate intent is NO BARE globals outside resolveEnv; comments-stripped scan confirms every bare reference sits inside resolveEnv (default clock + global fallbacks)"
  - "Browser 'error' handler registered between harness.js and slowgram.test.js so engine errors and test-load errors are both captured; renderResults re-entrant (clears container first)"

patterns-established:
  - "Validation-throw-not-swap (T-01-12): malformed provided deps throw descriptive Errors; never silently substitute a global fallback for an explicitly-provided-but-broken dependency"
  - "Single bootstrap path (T-01-13): init() → resolveEnv() → bindLifecycle() is the only entry; destroy() undoes exactly what init() set up via the shared teardown()"

requirements-completed: [CORE-04, CORE-06]

# Coverage metadata (#1602) — per-deliverable traceability for verify-work UAT routing.
coverage:
  - id: D1
    description: "DI seam validation — init(overrides) with malformed provided deps (clock without now(), document/window without addEventListener, MutationObserver non-constructor, rAF non-function) throws descriptive Errors (message text asserted); explicitly-null deps accepted (init proceeds with null document/window/MutationObserver/rAF — D1f); omitted deps resolve from globals (D2 stub-global shim: default path binds the fake document/window/MutationObserver/rAF and drives a REELS context + hidden visibility without any real DOM)"
    requirement: CORE-04
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#D1-D2 (DI validation + default-path shim suite)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Idempotent init + complete destroy — init() twice without destroy() yields exactly one contextchange (no duplicate listeners, D3); destroy() removes all 4 listeners (signal inert after destroy, D4), stops the rAF poll, resets state to fresh pre-init values (elapsedMs 0, phase 0, context UNKNOWN, visible true, hiddenAt null, lastBoundary 0, running false) and a subsequent init() re-initializes cleanly accumulating 120000ms (D5, T34a-h)"
    requirement: CORE-06
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#D3-D5 + T34 (idempotence, destroy completeness, re-init cycle)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Two-host smoke — the SAME src/slowgram.js + harness + tests run green under Node mocks (node test/slowgram.test.js → 116 assertions, exit 0) and load in a plain browser page (test/harness.html: engine → harness → error handler → tests; renderResults textContent table with summary row; window 'error' → red FAIL row; fs-based source scan guarded by typeof process check so the browser host skips it)"
    requirement: CORE-06
    verification:
      - kind: unit
        ref: "node test/slowgram.test.js → 116 assertions, exit 0 (Node host automated)"
        status: pass
      - kind: manual
        ref: "test/harness.html in a real browser (Edge) — renderResults must show 116 green rows + green summary row"
        status: pending
    human_judgment: true

# Metrics
duration: 9min
completed: 2026-08-15
status: complete
---

# Phase 1 Plan 4: DI Seam Hardening + Two-Host Smoke Summary

## What was built

The DI seam around `SlowGram.init(overrides)` is now hardened end-to-end, and the engine is proven to run the identical suite on two hosts.

**Task 1 (TDD, RED `cc8eae6` → GREEN `3404892`):** `resolveEnv` validates every *provided* override with descriptive Errors; `init()` is idempotent (internal destroy-then-reinit) and fails loud (console.error + rethrow); `destroy()` now completes the contract via a shared `teardown()` — removes all 4 listeners, stops the rAF poll, resets state to fresh pre-init values, preserves subscribers. The DI suite D1–D5 (20 assertions) plus rewritten T34 (destroy-reset contract) brought the suite from 96 → 116 green.

**Task 2 (`f686d7c`):** `renderResults` hardened to a textContent-built DOM table with a summary row (totals + verdict); `harness.html` gains a window `'error'` → red FAIL-row handler; the fs-based source scan in the test file is wrapped in an explicit `typeof process !== 'undefined'` guard so the browser host skips Node-only assertions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Critical] init() swallow-only error path**
- **Found during:** Task 1 (D1 suite design)
- **Issue:** Pre-existing init() caught bootstrap errors with console.error only — the caller could never observe a broken init (silent containment violated the fail-loud intent).
- **Fix:** init() rethrows the descriptive Error after logging; D1 asserts the thrown message. Containment preserved — no partially-bound engine escapes.
- **Files modified:** src/slowgram.js
- **Commit:** 3404892

**2. [Rule 2 - Critical] destroy() left state partially initialized**
- **Found during:** Task 1 (T34 rewrite)
- **Issue:** Plan 03's destroy() removed listeners and set `state.destroyed` but left elapsedMs/context/lastBoundary populated — a re-init was not a clean cycle.
- **Fix:** destroy() now resets ALL state to fresh pre-init values (T34b/c/d assert the full contract); signals after destroy are inert; re-init accumulates cleanly (D4/D5).
- **Files modified:** src/slowgram.js, test/slowgram.test.js
- **Commit:** 3404892, cc8eae6

**3. [Rule 1 - Bug] renderResults innerHTML injection surface**
- **Found during:** Task 2
- **Issue:** renderResults built the table via string concatenation + innerHTML — test labels flowed through HTML parsing (trusted labels today, but the renderer is a reusable surface).
- **Fix:** DOM-built table with textContent for every cell; no innerHTML anywhere in the renderer.
- **Files modified:** test/harness.js
- **Commit:** f686d7c

**4. [Rule 1 - Bug] Two-host default-env divergence (CORE-06) — found AFTER execution by the headless-Edge smoke**
- **Found during:** Post-wave verification (this is what the "open harness.html in Edge" human-check was for — automated in headless Edge instead).
- **Issue 4a:** D1f (`init({... document: null, window: null, ...})`) THREW `TypeError: Illegal invocation` in a real browser. `resolveEnv` falls back to the native global `requestAnimationFrame`, and `init()` calls it detached as `env.requestAnimationFrame(pollLoop)` — the browser rAF requires `this === window`. Node can never see this (no native rAF), so it was a silent mock-vs-live divergence.
- **Fix 4a:** `resolveEnv` binds the default-path rAF to its receiver (`requestAnimationFrame.bind(window)` when `window` exists; unchanged when absent). Injected fakes are untouched — the binding applies only to the global fallback.
- **Issue 4b:** D2's stub-global shim (`globalThis.document = doc`) THREW in strict mode and aborted the whole test script — `window.document`/`window` are getter-only accessors on the Window (configurable:false, hasGetter:true). D2–D5 never ran in the browser (row count stopped at 103).
- **Fix 4b:** D2 is now two-host aware — Node keeps the shim (D2a/D2b); the browser host exercises the default path against the REAL live globals (init() with no overrides resolves document/window/rAF, D2a–D2c).
- **Result:** Node 116/116, headless Edge 115/115, zero FAIL rows. Assertion-count delta is the documented host branch (D2 shim 2 asserts vs real-globals 3; SCAN Node-only).
- **Files modified:** src/slowgram.js, test/slowgram.test.js
- **Commit:** 3ddefde

**5. [Rule 1 - Critical] rAF poll self-terminates permanently (CR-01) �?" found by post-wave code review, reproduced empirically**
- **Found during:** Post-wave code review (gsd-code-reviewer, adversarial deep).
- **Issue:** `pollLoop` re-requests itself only while `state.running`. The only initial request is the single `init()` frame; if the first frame fires while UNKNOWN (Phase 2's async ContextDetector guarantees it), or after any hidden→running=false transition, nothing ever restarts the poll �?" accumulation stops permanently in a live WebView, and a stale `lastBoundary` can fatigue-reset a legitimate session on the next missed-visibilitychange resume. The mock harness masks it (every test flushes after making running true).
- **Fix:** `updateRunning()` now re-requests the poll on every running false→true transition (covers setContext, onResume, resetSession). Regression tests D6a�?"D6d drive the real rAF request cycle: frame-while-UNKNOWN then REELS, and accumulate→hidden→flush→resume→advance→flush→elapsed-grows.
- **Result:** Node 120/120, headless Edge 119/119, zero FAIL rows.
- **Files modified:** src/slowgram.js, test/slowgram.test.js
- **Commit:** 57549fc

**6. [Rule 1 - High] Explicit-null overrides silently substituted with globals (HI-01) �?" found by post-wave code review**
- **Found during:** Post-wave code review.
- **Issue:** `resolveEnv` used truthy-coalescing (`overrides.document || global`) �?" conflating "omitted" with "provided-but-null". In a browser, `init({ document: null, window: null, rAF: null, ... })` silently bound all four real listeners; under Node it bound none. Same call, different behavior per host �?" violates CORE-04 ("never silently substitute").
- **Fix:** resolution now checks key presence (`'key' in overrides && overrides.key !== undefined`), mirroring the validation pattern �?" explicit null stays null (true opt-out, zero listeners on both hosts); omitted keys default from globals. D1f semantics now match the documented contract on both hosts.
- **Result:** both hosts identical for null opt-out containers.
- **Files modified:** src/slowgram.js
- **Commit:** 57549fc

### Contract Adjustments (documented, deliberate)

- **T34 contract changed** (destroy-keeps-state → destroy-resets-to-fresh): locked in the plan's must-have truths ("destroy() removes all lifecycle listeners, stops the rAF poll, and resets engine state so a subsequent init() re-initializes cleanly"). Plan 03's T34 asserted the old keep-state behavior and was rewritten in the RED commit.
- **init() preserves subscribers** (supersedes Plan 01's "init resets listener registry" line): teardown() preserves `listeners` so external subscriber hooks survive re-init; D3 proves no duplicate handlers. Code comment documents the contract.
- **rg gate interpretation:** literal pattern matches `env.requestAnimationFrame` in pollLoop/init — those are seam property accesses, NOT bare globals. Comments-stripped scan (`pcre2` negative lookbehind for `env.`/`overrides.`) confirms every bare reference sits inside resolveEnv (lines 129–135: default clock + global fallbacks). The engine's automated source scan (`Date.now()` count === 1) also passes.

## Pending Human Verification (deferred to verify-work)

- **DONE during post-wave verification via headless Edge** (automated replacement for "open harness.html in Edge"): the browser host renders `TOTAL: 119 passed / 119 run` with zero FAIL rows (115/115 pre-review-fix; +4 from the new D6 poll-restart regression). This uncovered and fixed the two two-host divergences in deviation 4 (rAF receiver binding + D2 shim getter-only globals), and the post-wave code review surfaced CR-01 (poll restart) and HI-01 (null opt-out semantics), both fixed in deviations 5/6. The remaining item is a visual spot-check in a GUI browser (table layout, colors) — cosmetic only, no behavioral risk.

## Auth Gates

None — no authentication was required for any task.

## Known Stubs

None — no placeholder values, no mock-only wiring, no TODOs left in modified files. `resolveEnv` fallback `overrides.clock || { now: ... }` is the intended default path (tested by D2), not a stub.

## TDD Gate Compliance

- RED gate: `test(01-04)` commit `cc8eae6` exists (failing DI suite + T34 rewrite, verified 11 expected failures before implementation).
- GREEN gate: `feat(01-04)` commit `3404892` follows and turns the suite green (116 assertions, exit 0).
- REFACTOR gate: not needed — no cleanup pass required after GREEN.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. The added surface (init validation errors, browser error handler) is defensive, not reachable-by-attacker: validation runs only on code-supplied overrides, and the error handler renders a FAIL row without executing attacker input (textContent only).

## Self-Check: PASSED