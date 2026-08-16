---
phase: 01-motor-core-lifecycle
reviewed: 2026-08-15T14:20:00Z
depth: deep
files_reviewed: 4
files_reviewed_list:
  - src/slowgram.js
  - test/slowgram.test.js
  - test/harness.js
  - test/harness.html
findings:
  critical: 1
  high: 1
  medium: 1
  low: 2
  total: 5
status: resolved
resolved_at: 2026-08-15T11:40:00Z
resolved_commits:
  - 57549fc (CR-01 poll restart, HI-01 provided-vs-omitted resolution)
---

# Phase 1: Code Review Report — Motor Core & Lifecycle

**Reviewed:** 2026-08-15
**Depth:** deep (cross-file call-chain tracing + live-path simulation)
**Files Reviewed:** 4 (`src/slowgram.js`, `test/slowgram.test.js`, `test/harness.js`, `test/harness.html`)
**Status:** resolved (CR-01 and HI-01 fixed in `57549fc`; MD-01/LO-01/LO-02 accepted as documented test-hygiene notes)

## Resolution (2026-08-15)

- **CR-01 (Critical)** — FIXED in `57549fc`: `updateRunning()` now re-requests the poll on every running false→true transition (restart covers `setContext('REELS')` from UNKNOWN-dead state and hidden→resume). Regression tests D6a–D6d (4 assertions) drive the real rAF request cycle: frame-while-UNKNOWN then REELS, and accumulate→hidden→flush→resume→advance→flush→elapsed-grows. Verified Node 120/120, Edge headless 119/119, zero FAIL rows.
- **HI-01 (High)** — FIXED in `57549fc`: `resolveEnv` now resolves provided keys by presence (`'key' in overrides && overrides.key !== undefined`), mirroring the validation pattern — explicit `null` stays `null` (true opt-out, zero listeners bound on both hosts), omitted keys fall back to globals. No more mock-vs-live substitution. D1f's throw-only assertion still passes; semantics now match the documented contract on both hosts.
- **MD-01 / LO-01 / LO-02 (Medium/Low)** — accepted as documented test-hygiene notes; low risk, no runtime impact, tracked for Phase 2 test-structure work.

## Summary

The Phase 1 engine is well-structured: the DI seam, deep-frozen CONFIG, pure `phaseFor`, strict-`>` fatigue reset, transition-guarded emissions, and destroy/re-init cycle all match the locked contracts, and the suite is green on Node (116 assertions, exit 0) and in the browser host (115 assertions, headless Edge, per 01-04-SUMMARY). The boundary/reset/segment math (CORE-02/CORE-03) checks out exactly: `>=` boundary comparisons, strict `>` fatigue reset with discount path, negative-delta clamps, segment cap — all verified correct.

However, adversarial review found **one critical live-path bug** that the mock harness structurally cannot detect, and **one contract violation** in the DI seam that the D1f test asserts vacuously green. Both were reproduced empirically against the shipped engine. The two-host fix in commit `3ddefde` (rAF `bind(window)` + D2 if/else) is sound in isolation but did not address — and its verification smoke could not detect — the poll-restart defect below.

## Critical Issues

### CR-01: rAF poll self-terminates permanently — live-path accumulation stops, stale `lastBoundary` can wipe legitimate sessions

**File:** `src/slowgram.js:292-304` (`pollLoop`), `:202-208` (`updateRunning`), `:425-427` (`init` initial request)

**Issue:** `pollLoop` only re-requests itself while `state.running` is true, and the *only* initial request is the single `env.requestAnimationFrame(pollLoop)` in `init()`. Two deterministic consequences in the real browser/WebView (never in the mock host):

1. **Death at startup (race):** `init()` schedules one frame; by the time it fires, `running` is `false` (default context `UNKNOWN`) unless the consumer sets `setContext('REELS')` synchronously in the same task. Phase 2's MutationObserver-driven ContextDetector delivers REELS asynchronously — the first frame almost always sees `running === false`, so the poll dies before it ever ticks.
2. **Death after any hidden period (deterministic):** the moment a `visibilitychange`→hidden (or any running→false transition) lands, the in-flight frame sees `running === false` and does not re-request. Nothing in the engine ever schedules rAF again — not `updateRunning()`, not `setContext()`, not `onResume()`. The poll is dead for the rest of the page life.

Consequences in the live host: accumulation and phase transitions happen *only* at boundary events (CORE-01's continuous accounting breaks); worse, `lastBoundary` goes stale, so a later missed-`visibilitychange` resume computes `delta = now - lastBoundary` spanning the whole session — `onResume` then **fatigue-resets a legitimately watched session** (data loss of session state). This is exactly the divergence CORE-06's "same file, two hosts" contract exists to prevent, and the harness masks it because every test flushes *after* making `running` true and re-inits per test.

**Reproduction (verified against shipped code):**
- `init()` → `raf.flush()` (frame while UNKNOWN) → `setContext('REELS')` → `advance(180000)` → `raf.flush()` → `elapsedMs === 0` (expected 180000).
- REELS active, poll alive → hidden → `raf.flush()` (poll dies) → visible resume → `advance(60000)` → `raf.flush()` → `elapsedMs` stays at the pre-hidden value (visible minute never counted; expected +60000).
- `setContext('REELS')` schedules **no** rAF request (`raf.pending === null` immediately after).

**Fix:** restart the poll on every running false→true transition in `updateRunning()`:

```js
function updateRunning() {
  var running = (state.context === 'REELS' && state.visible);
  if (running && !state.running) {
    state.lastBoundary = env.clock.now();
    if (env.requestAnimationFrame) {
      env.requestAnimationFrame(pollLoop);   // restart the poll — live path currently never does
    }
  }
  state.running = running;
}
```

Add a regression test that reproduces the resume case (accumulate → hidden → flush → resume → advance → flush → elapsed must grow), which the current suite does not cover. Note: `FakeRAF.request` overwrites `pending`, so a restart adds at most one pending callback — no double-fire in the harness.

## High Issues

### HI-01: Explicit-`null` overrides are silently substituted with global fallbacks — the documented "opt-out" diverges per host

**File:** `src/slowgram.js:106-127` (validation accepts `null`) vs `:128-137` (resolution `overrides.x || global`)

**Issue:** Validation explicitly accepts `null` as a "deliberate opt-out" (D1f documents this), but resolution uses `overrides.document || (typeof document !== 'undefined' ? document : null)` — the `||` chain conflates "omitted" with "provided-but-null". In a browser/WebView (the production target), `SlowGram.init({ document: null, window: null, requestAnimationFrame: null, ... })` silently resolves to the **real** document/window/rAF: `bindLifecycle` attaches all four listeners to the live page, and a real rAF poll is scheduled — even though the container explicitly opted out. Under Node (no globals), the same call binds nothing. Same call, different behavior per host — precisely the mock-vs-live divergence CORE-04 forbids ("never silently substitute"). The `clock: null` case likewise substitutes the real `Date.now` clock.

**Reproduction (verified):** with `global.document`/`global.window`/`global.requestAnimationFrame` defined, `init({ clock, document: null, window: null, MutationObserver: null, requestAnimationFrame: null })` logs all four listener registrations on the "real" objects; the identical call in Node registers zero. The D1f assertion (`test/slowgram.test.js:554-560`) only checks "does not throw", so it passes on both hosts while the semantics diverge.

**Fix:** resolve provided keys by presence, not truthiness — mirror the validation pattern already used (`'key' in overrides && overrides.key !== undefined`):

```js
function provided(o, key) { return (key in o) && o[key] !== undefined; }
return {
  clock: provided(overrides, 'clock') ? overrides.clock
        : { now: function () { return Date.now(); } },
  document: provided(overrides, 'document') ? overrides.document
           : (typeof document !== 'undefined' ? document : null),
  window: provided(overrides, 'window') ? overrides.window
         : (typeof window !== 'undefined' ? window : null),
  MutationObserver: provided(overrides, 'MutationObserver') ? overrides.MutationObserver
                   : (typeof MutationObserver !== 'undefined' ? MutationObserver : null),
  requestAnimationFrame: provided(overrides, 'requestAnimationFrame') ? overrides.requestAnimationFrame
                        : (typeof requestAnimationFrame !== 'undefined'
                            ? (typeof window !== 'undefined' ? requestAnimationFrame.bind(window) : requestAnimationFrame)
                            : null),
  ...
};
```

## Medium Issues

### MD-01: D2 browser branch leaves the live engine bound to the harness page, relying on implicit teardown ordering

**File:** `test/slowgram.test.js:605-614` (browser branch of D2)

**Issue:** The browser branch calls `SlowGram.init()` with no overrides — registering four real lifecycle listeners on the harness page's document/window and setting `context='REELS'` (`running=true`). Cleanup relies entirely on D3's `freshEnv()` init triggering the idempotence guard's internal `teardown()` later in the same synchronous script. Today that ordering holds (D3 follows immediately, and the real rAF frame fires only after the script completes, seeing `state.destroyed === true`), so the leak window is zero — but the branch is one reorder away from leaving live listeners + a running engine attached to the host page, and it never asserts accumulation on the default path (only no-throw + context reflection), so the CR-01 defect cannot surface there either.

**Fix:** end the browser branch with an explicit `SlowGram.destroy()` (mirroring the Node branch's `finally` restore), and add a synchronous accumulation probe where possible. At minimum, document the implicit ordering dependency in a comment.

## Low Issues

### LO-01: Subscriber registry survives destroy/re-init — cross-test listener bleed makes the suite order-dependent

**File:** `src/slowgram.test.js:120-149, 256-273, 283-303` (and every `SlowGram.on` registration); `src/slowgram.js:385-402` (`teardown` preserves `listeners`)

**Issue:** Subscriber preservation across destroy/re-init is a locked, documented contract — but the test suite relies on it *implicitly*: subscribers registered by T8/T9/T23 etc. remain registered and fire on every later test's `'elapsed'`/`'contextchange'`/`'reset'`/`'phasechange'` emissions. Today no assertion breaks (each test counts only its own callback), but any future test that asserts "no events fired" will false-fail from stale earlier-test subscribers, and event payloads accumulate in dead arrays. This is a test-isolation fragility, not a runtime bug.

**Fix:** add a `SlowGram._clearListeners()` test-only handle (or per-suite unsubscribe), and/or have each suite snapshot subscriber counts before and assert deltas after. Document the preservation contract's test implications in the test header.

### LO-02: D1f asserts "does not throw" only — the null-opt-out semantics are never verified, masking HI-01

**File:** `test/slowgram.test.js:554-560`

**Issue:** The D1f comment documents "explicit null deps are accepted (fail-safe default path)" — but the assertion checks only that `init` doesn't throw. Under a browser-like global environment the same call binds real listeners (see HI-01), and this test passes vacuously on both hosts while the documented opt-out contract is violated on one of them. The headless-Edge smoke therefore could not have caught HI-01.

**Fix:** strengthen D1f to assert the *effect* of the nulls — e.g., after `init({... document: null, window: null ...})`, assert `SlowGram.getState()` reflects no live binding (visible stays `true` and a dispatched `visibilitychange` on the real document leaves state untouched), or at minimum assert the resolved env via a test handle.

---

## Notes on Verified-Correct Areas (no findings)

- **CORE-02 boundary math** (`src/slowgram.js:59-67`): `>=` integer-ms comparison, `[3,7,12]` from CONFIG only, negative→0, `Number.MAX_SAFE_INTEGER`→3 — all confirmed by trace and suite.
- **CORE-03 fatigue contract** (`:254-285`): strict `>` (exactly 300000 does not reset), gap discount clears `hiddenAt` and refreshes `lastBoundary`, negative delta clamps, reset preserves context, `sync(0)` emits phasechange 0 — confirmed.
- **CORE-05**: `deepFreeze` WeakSet-guarded; `300000`/`900000`/`[3,7,12]` confined to `initConfig`; strict-mode writes throw (asserted T12/T13).
- **CORE-01 source scans**: single `Date.now()` inside `resolveEnv`; zero `setTimeout`/`setInterval`/`performance.now` (suite-asserted).
- **`3ddefde` fix soundness**: `requestAnimationFrame.bind(window)` is correct for the default path and does not touch injected fakes; the D2 if/else correctly sidesteps getter-only Window accessors. The remaining gaps are the ones listed above (CR-01 is not observable from D2's browser assertions; HI-01 is masked by D1f's throw-only check).
- **Idempotent init / destroy** (`:414-436, :385-402`): teardown-then-reinit, listener removal via `lifecycleHandlers`, state reset, subscriber preservation — all match the locked D3/D4/D5 contracts.
- **Security**: no injection surfaces — `textContent`-only rendering in `renderResults` and the browser error handler; engine event handlers and subscribers are try/catch-contained; no innerHTML, no eval, no bare-global leaks outside `resolveEnv`.

---

_Reviewed: 2026-08-15_
_Reviewer: gsd-code-reviewer (adversarial, deep)_
_Depth: deep_