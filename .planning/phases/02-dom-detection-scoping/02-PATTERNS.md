# Phase 2: DOM Detection & Scoping — Pattern Map

**Mapped:** 2026-08-15
**Files analyzed:** 6 (3 modified in place, 3 new)
**Analogs found:** 6 / 6 — every Phase 2 file maps to a real in-repo analog (3 are exact same-file self-analogs; demo.html maps to harness.html; fixtures/dom-mocks map to harness.js idioms)

---

## Read First — Phase 2 Is an Extension Phase, Not Greenfield

Phase 1 shipped the engine seam; **Phase 2 extends the four existing files in place and adds three new ones.** Every new/modified file has a real, fully-read in-repo analog below — there are **no greenfield files**. The strongest analogs are the files being modified themselves: the planner must treat `src/slowgram.js`, `test/harness.js`, and `test/slowgram.test.js` as *self-analogs* — new code goes inside the existing structure following the idioms already present, never as new parallel modules.

**Locked seam facts that constrain every pattern (from `02-CONTEXT.md`):**
- CONFIG already carries `selectors` (`video`, `[role="main"]`) and `preservedRoutes` placeholders (src/slowgram.js:175-179) — Phase 2 fills real values and adds a `health` block; consumers read via `SlowGram.getConfig()` (src/slowgram.js:469-471).
- `SlowGram.setContext()` is the ContextDetector output feed (src/slowgram.js:486-497) — throws on invalid, emits `contextchange` only on change, re-runs `updateRunning()` + `tick()`.
- `resolveEnv` already resolves `document`/`window`/`MutationObserver`/`requestAnimationFrame` with shape validation (src/slowgram.js:103-150) — DomWatcher builds its observer from these, no new env keys required.
- Event bus `on`/`emit` (src/slowgram.js:376-388, 499-505) survives destroy/re-init — `selectorHealth` plugs into the same bus; Phase 2+ consumers subscribe once at page load.
- No timers (CORE-01): DomWatcher health scan and batch processing ride the rAF poll — never `setInterval`.

**Canonical pattern sources the planner must cite alongside this file** (verified anchors):
- `02-RESEARCH.md` Pattern 1 classifyPathname (lines 180-206), Pattern 2 two-root observer (208-230), Pattern 3 VideoRegistry WeakMap (232-247), Pattern 4 self-mutation filter (249-261), Pattern 5 FakeElement mini-DOM (263-287), Common Ops 1-3 (361-412), Validation Architecture test map (493-503), Wave 0 gaps (510-514)
- `.planning/research/PITFALLS.md` §Pitfall 1 (line 20), §Pitfall 6 (line 137), §Pitfall 7 (line 162), §Performance Traps (line 265), §"Looks Done But Isn't" (line 303)
- `.planning/research/ARCHITECTURE.md` §Component Responsibilities (line 49), §Pattern 2 (line 127), §Pattern 4 (line 162), §Data Flow (line 183), §Anti-Pattern 4 (line 258)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/slowgram.js` **(MODIFY)** | engine — IIFE state spine + new ContextDetector, RouteGuard, DomWatcher, VideoRegistry, SelectorRegistry, `getSelectorHealth()` handle | event-driven (mutation records, route signals, rAF batch) + request-response (`setContext` feed, `getSelectorHealth`/`getConfig` handles) | `src/slowgram.js` itself (Phase 1 seam) | **exact — same file** |
| `test/harness.js` **(MODIFY)** | test utility — new FakeElement mini-DOM, record-producing FakeMutationObserver, FakeVideoElement, FakeLocation | transform (fake DOM state, mutation-record queue, fake events) | `test/harness.js` itself | **exact — same file** |
| `test/slowgram.test.js` **(MODIFY)** | test — 8 new DETC suites + fixture-driven detection tests | synchronous unit + integration (fixture-driven, rAF flush) | `test/slowgram.test.js` itself | **exact — same file** |
| `test/fixtures/` **(NEW)** | test fixture — Instagram DOM snapshot data (logged-out + logged-in shapes) | static data (loaded by both hosts via global-attach + module.exports) | `test/harness.js` dual-host attach idiom (lines 179-197) | role-match |
| `test/dom-mocks/` **(NEW, planner discretion)** | test utility — fixture builder composing FakeElement trees | transform (assemble Instagram-shaped trees from fixture data) | `test/harness.js` factory idiom (FakeDocument/FakeWindow/FakeRAF) | role-match |
| `demo.html` **(NEW)** | demo page — DETC-07 deliverable, deterministic detection demo | static orchestration (script load order + status render) | `test/harness.html` | **exact (structural)** |
| `test/harness.html` | **UNCHANGED** — research line 174: "unchanged — loads harness.js + test file, renderResults" | static orchestration | itself | no change needed |

---

## Pattern Assignments

### `src/slowgram.js` (engine — MODIFY, exact self-analog)

**Analog:** `src/slowgram.js` (Phase 1 seam — every excerpt below is the idiom new Phase 2 code must follow inside the same IIFE).

**IIFE skeleton + global handle** (lines 28-31, 521):
```javascript
(function (global) {
  'use strict';

  var SlowGram = {};
  var CONFIG = null;              // deep-frozen in initConfig() at init time
  var env = null;                 // resolved DI seam
  ...
  global.SlowGram = SlowGram;
})(typeof window !== 'undefined' ? window : globalThis);
```
New components (ContextDetector/RouteGuard/DomWatcher/VideoRegistry/SelectorRegistry) are **closure-private functions + state vars** inside this IIFE, exactly like `phaseFor`/`syncPhase`/`tick`/`pollLoop` — never new globals, never a second module.

**resolveEnv DI seam — DomWatcher's observer source** (lines 103-150): `MutationObserver` (line 138-140), `document` (132-134), `window` (135-137), `requestAnimationFrame` (141-145) are all already resolved with shape validation. DomWatcher must build observers from `env.MutationObserver` and query via `env.document` — **no new env keys**. The validation idiom to extend if a new dep were needed (it isn't):
```javascript
if ('MutationObserver' in overrides && overrides.MutationObserver !== undefined &&
    overrides.MutationObserver !== null && typeof overrides.MutationObserver !== 'function') {
  throw new Error('SlowGram: env.MutationObserver must be null or a constructor');
}
```

**initConfig — CONFIG.selectors / preservedRoutes placeholders to fill** (lines 164-182):
```javascript
function initConfig() {
  var config = {
    phaseBoundariesMin: [3, 7, 12],
    fatigueWindowMs: 300000,
    segmentCapMs: 900000,
    degradationMatrix: { '0': [], '1': ['saturation'], '2': ['saturation', 'playbackRate'], '3': ['saturation', 'playbackRate', 'volume', 'autoplay'] },
    selectors: {                             // placeholder registry — Phase 2 owns real values
      video: 'video',
      roleMain: '[role="main"]'
    },
    preservedRoutes: ['/direct/', '/messages/']   // Phase 2 RouteGuard consumes
  };
  return deepFreeze(config, new WeakSet());
}
```
Phase 2 fills: full `preservedRoutes` (D-04: `/direct/`, `/messages/`, profiles, `/p/`, `/explore/`, `/accounts/`, stories), `reelsPrefix`, `routeKeywords`, and a new `health: { driftThreshold: 5 }` block (D-09). **All new selector/route/health constants live ONLY here** — no magic strings in module bodies (CORE-05, mirrored by T11-T15 config-suite assertions).

**setContext — the ContextDetector output feed** (lines 486-497). Detectors call this; no new clock plumbing:
```javascript
SlowGram.setContext = function (context) {
  if (context !== 'REELS' && context !== 'SOCIAL' && context !== 'UNKNOWN') {
    throw new Error('SlowGram: invalid context "' + context + '"');
  }
  if (context !== state.context) {
    state.context = context;
    emit('contextchange', context);
    updateRunning();
    tick(env.clock.now());
  }
  return SlowGram;
};
```
ContextDetector's contract: default UNKNOWN (fail-safe), only explicit `/reels/` pathname → REELS, route flip to preserved → SOCIAL (D-07 pauses the clock via this call).

**Event bus — `selectorHealth` plugs in here** (lines 376-388 + 499-505):
```javascript
function emit(event, data) {
  var cbs = listeners[event];
  if (!cbs) { return; }
  for (var i = 0; i < cbs.length; i++) {
    try { cbs[i](data); } catch (err) { ... }
  }
}
SlowGram.on = function (event, cb) {
  if (!listeners[event]) { listeners[event] = []; }
  listeners[event].push(cb);
  return SlowGram;
};
```
New event name `'selectorHealth'` (D-10) — same bus, same contained-subscriber semantics.

**rAF poll — the DomWatcher batch carrier** (lines 308-320): `pollLoop` is the no-timer frame callback. DomWatcher's `processBatch` and the per-batch health scan (D-09) piggyback the same rAF discipline — one batch per frame, re-request only while relevant:
```javascript
function pollLoop() {
  try {
    if (state.destroyed) { return; }
    if (state.running && env.requestAnimationFrame) {
      tick(env.clock.now());
      env.requestAnimationFrame(pollLoop);
    }
  } catch (err) { ... }
}
```

**contained() — every DomWatcher/ContextDetector handler must be wrapped** (lines 326-336): the containment idiom engine failures never escape into Instagram's page:
```javascript
function contained(fn) {
  return function () {
    try { fn.apply(null, arguments); } catch (err) { ... }
  };
}
```

**Public-handle idiom — `getSelectorHealth()` mirrors these** (lines 454-479):
```javascript
SlowGram.getConfig = function () { return CONFIG; };          // :469
SlowGram._phaseFor = phaseFor;   // TEST-ONLY handle (lines 473-479) — pure fn exposed for suites
```
`SlowGram.getSelectorHealth()` (D-10) follows `getConfig`: returns live health state (`{status:'ok'|'drift', missStreak, ...}`) from the closure. If a pure `classifyPathname` is exposed for tests, follow the `_phaseFor` test-only-handle precedent.

**Teardown / destroy** (lines 401-418, 516-519): DomWatcher's `disconnect()` on SOCIAL/UNKNOWN (D-07/D-12) must follow the same no-leak discipline as `teardown()`'s `lifecycleHandlers` registry — track observers in a module var, disconnect explicitly; **VideoRegistry (WeakMap) is NOT cleared** (D-07 keep-registry).

---

### `test/harness.js` (test utility — MODIFY, exact self-analog)

**Analog:** `test/harness.js` itself. Extend, don't restructure: keep the IIFE + global-attach + module.exports dual-host shape; the current `FakeMutationObserver` (lines 78-80) is a stub that Phase 2 replaces.

**Dual-host attach idiom (all new fakes must follow)** (lines 9-10, 179-197):
```javascript
(function (global) {
  'use strict';
  ...
  global.FakeClock = FakeClock;
  global.FakeDocument = FakeDocument;
  global.FakeWindow = FakeWindow;
  global.FakeMutationObserver = FakeMutationObserver;
  global.FakeRAF = FakeRAF;
  global.assert = assert;
  global.renderResults = renderResults;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FakeClock: FakeClock, FakeDocument: FakeDocument, FakeWindow: FakeWindow,
      FakeMutationObserver: FakeMutationObserver, FakeRAF: FakeRAF, assert: assert, renderResults: renderResults };
  }
})(typeof window !== 'undefined' ? window : globalThis);
```
New `FakeElement`, `FakeVideoElement`, `FakeLocation`, and the record-producing `FakeMutationObserver` are attached the same way (global + module.exports) so `slowgram.test.js` references them identically on both hosts.

**Fake factory idiom — the shape new fakes copy** (FakeWindow, lines 54-75): constructor functions returning plain objects with closure-captured state; `addEventListener`/`removeEventListener`/`dispatchEvent` with a `listeners` map. `FakeVideoElement` extends this with `src`, `getAttribute`/`setAttribute`, and `dispatchEvent` for `loadstart`/`emptied` (DETC-05). `FakeLocation` adds `pathname` (readable/writable) plus `history.pushState`/`replaceState` and `popstate`/`hashchange` dispatch (D-06) — driven by the test, exactly like `FakeClock.advance()` drives time.

**FakeMutationObserver stub to replace** (lines 78-80):
```javascript
function FakeMutationObserver() {
  // Phase 2 wires real observation; this plan only needs the seam slot.
}
```
Phase 2 version: `observe(target, config)` records `{target, config}` + accumulates mutation records; `disconnect()` clears; `takeRecords()` drains the queue; plus a test helper `record(mutations)` to inject records so the rAF batch processes them (mirrors `FakeRAF.flush()` driving the batch, lines 83-95).

**FakeRAF — the batch driver** (lines 83-95): one `flush()` = one frame. DomWatcher batch tests: `observer.record([...])` → `raf.flush()` → assert registry/health state.
```javascript
function FakeRAF() {
  var pending = null;
  return {
    request: function (cb) { pending = cb; },
    flush: function () { if (pending) { var cb = pending; pending = null; cb(); } }
  };
}
```

**Assert runner** (lines 99-118): `equal`/`ok`/`throws` — DETC suites use these only; no external framework.

---

### `test/slowgram.test.js` (test — MODIFY, exact self-analog)

**Analog:** `test/slowgram.test.js` itself. 8 new suites (DETC-01..08, per RESEARCH.md test map lines 493-503) append as more IIFE test blocks; the existing 40 tests (T1-T40) must stay green.

**Dual-host header** (lines 11-14) — unchanged:
```javascript
if (typeof require === 'function' && typeof module !== 'undefined') {
  require('../src/slowgram.js');  // IIFE attaches global.SlowGram
  require('./harness.js');        // attaches harness globals
}
```

**freshEnv() — extend with DOM mocks** (lines 19-32): every DETC test builds fresh mocks; Phase 2 adds `doc`/`win`/`raf`/`observer`/`location`/`video` built from the new fakes + fixtures:
```javascript
function freshEnv() {
  var clock = FakeClock(1000000);
  var doc = FakeDocument({ visibilityState: 'visible' });
  var win = FakeWindow();
  var raf = FakeRAF();
  SlowGram.init({
    clock: clock, document: doc, window: win,
    MutationObserver: null, requestAnimationFrame: raf.request
  });
  return { clock: clock, doc: doc, win: win, raf: raf };
}
```

**Per-test IIFE block idiom + event dispatch** (lines 35-41, 294-298) — DETC suites copy this shape; route/mutation signals dispatch as plain event literals (`{ type: 'popstate' }`, `{ type: 'hashchange' }`) on `win`, matching the `pageshow`/`focus` precedent:
```javascript
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(180000);
  e.raf.flush();
  assert.equal(SlowGram.getState().elapsedMs, 180000, 'T1: ...');
})();
```

**CONFIG-driven assertions (never literals)** (lines 157-186, T11-T15): the config suite asserts `Object.isFrozen` on every CONFIG node — **the selectors/preservedRoutes/health blocks must be added to T11/T15's frozen-node assertions**, and new suites read `SlowGram.getConfig().selectors` / `.preservedRoutes` / `.health.driftThreshold` (never magic strings) exactly as T14/T23 read `segmentCapMs`/`fatigueWindowMs`.

**Source-scan idiom for the no-timer / no-class-selector rules** (lines 718-734): regex scans of `src/slowgram.js` with comments stripped. Phase 2 additions: assert zero `querySelectorAll` call sites inside the mutation callback, `attributeFilter` contains exactly `['src','loop','autoplay','role']`, and no `setInterval` appears (Pitfall 6 / DETC-04).

**Host epilogue** (lines 737-752) — unchanged: browser renders the table; Node sets `process.exitCode`.

---

### `test/fixtures/` (test fixture — NEW, role-match analog)

**Analog:** `test/harness.js` dual-host attach idiom (lines 179-197) — fixture data must be loadable identically under Node `require` and browser `<script>`.

**Purpose:** static Instagram DOM snapshot data from the verified live dump (02-RESEARCH.md:11, 247) + the logged-in shape per A1/A2. Two shapes minimum (Pitfall 6: fake-vs-live divergence — the logged-out dump shows no `loop`/`autoplay`; logged-in videos carry `loop`). Each fixture tagged with its source (live dump vs community).

**Pattern to copy** — the dual-host object export:
```javascript
(function (global) {
  'use strict';
  var fixtures = { reelsLoggedOut: {...}, reelsLoggedIn: {...} };
  global.SlowGramFixtures = fixtures;
  if (typeof module !== 'undefined' && module.exports) { module.exports = fixtures; }
})(typeof window !== 'undefined' ? window : globalThis);
```
Consumed by `test/dom-mocks/` (builder) and `test/slowgram.test.js` (fixture-driven tests). No new runtime deps; data only — no logic beyond the attach wrapper.

---

### `test/dom-mocks/` (test utility — NEW, planner discretion, role-match analog)

**Analog:** `test/harness.js` factory idiom — constructor functions returning plain objects with closure state (FakeWindow lines 54-75, FakeRAF lines 83-95).

**Purpose:** fixture builder composing `FakeElement` trees from `test/fixtures/` data — `role="main"` → video children per the verified shape, and a `role="dialog"` root for D-03 tests (02-RESEARCH.md Pattern 5, lines 263-287; the FakeElement factory is already fully specified there).

**Pattern to copy** — a `buildReelsFeed(fixture)` factory returning a tree, plus `buildDialogRoot()`, attached to globals + module.exports exactly like harness.js. If this lands inside `test/harness.js` instead of a separate file, that is also acceptable — the research marks the split "planner discretion" (02-RESEARCH.md:176).

---

### `demo.html` (demo page — NEW, exact structural analog)

**Analog:** `test/harness.html` — the only existing HTML page in the repo; structural match (plain page, script load order, container div, inline containment).

**Pattern to copy** (harness.html lines 1-39, abridged):
```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SlowGram — ...</title>
  <style>body { font-family: system-ui, -apple-system, sans-serif; margin: 2rem; color: #222; } ...</style>
</head>
<body>
  <h1>...</h1>
  <div id="results"></div>
  <script src="../src/slowgram.js"></script>
  <script src="harness.js"></script>
  <script> /* containment observability: window 'error' → FAIL row */ </script>
  <script src="slowgram.test.js"></script>
</body>
</html>
```
DETC-07 demo.html differences: loads `src/slowgram.js` + a **hand-built Instagram-mock DOM inline** (from `test/dom-mocks/`/`test/fixtures/`) + a small demo script driving `SlowGram.init({...overrides with fakes...})` and rendering the live context/health verdict (REELS/SOCIAL/UNKNOWN + `getSelectorHealth()`), using `textContent`-style safe rendering as `renderResults` does (harness.js:128-177). Keep the `window.addEventListener('error', ...)` containment script so a broken engine shows as red text, never a blank page.

---

## Shared Patterns

Cross-cutting idioms that apply to multiple Phase 2 files. All sources are in-repo (Phase 1 code) or the verified research docs.

### 1. Deep-frozen single CONFIG — no magic strings
**Source:** src/slowgram.js:164-203 (initConfig + deepFreeze); test/slowgram.test.js:157-197 (T11-T15 frozen-node + value assertions)
**Apply to:** `src/slowgram.js` (fill selectors/preservedRoutes, add reelsPrefix/routeKeywords/health block), `test/slowgram.test.js` (extend T11/T15 + read via `getConfig()`)
Rule: selectors, route prefixes, keywords, and `health.driftThreshold` live ONLY in CONFIG; tests assert against `getConfig()` values, never literals (CORE-05).

### 2. DI seam — everything through `env`, validated loudly
**Source:** src/slowgram.js:103-150 (resolveEnv + shape validation); test/harness.js:179-197 (fakes attach for injection)
**Apply to:** `src/slowgram.js` (DomWatcher uses `env.MutationObserver`/`env.document`/`env.window`/`env.requestAnimationFrame`), `test/harness.js` (FakeMutationObserver/FakeVideoElement/FakeLocation injectable), `test/slowgram.test.js` (DETC-04/07/08 pass fakes through `init({...})`)
Rule: engine body never references bare `document`/`window`/`MutationObserver`/`requestAnimationFrame` outside resolveEnv (Phase 1 locked; mock-vs-live divergence is the forbidden failure, CORE-04).

### 3. Event bus + transition-guarded emission
**Source:** src/slowgram.js:376-388 (emit, contained subscribers), 486-497 (setContext emits only on change), 499-505 (on); test/slowgram.test.js:133-143 (T9: contextchange exactly-once)
**Apply to:** `src/slowgram.js` (new `'selectorHealth'` event, D-10), `test/slowgram.test.js` (DETC-06 asserts drift-declared + drift-recovered emissions exactly once each)
Rule: emit only on real transitions — a repeated health scan with no state change emits nothing.

### 4. No-timer discipline — rAF batch, per-frame
**Source:** src/slowgram.js:308-320 (pollLoop), 215-224 (updateRunning restarts the poll); test/harness.js:83-95 (FakeRAF one-flush-one-frame); test/slowgram.test.js:718-734 (source scan forbids timers)
**Apply to:** `src/slowgram.js` (DomWatcher processes `takeRecords()` in the rAF batch; health scan per batch D-09), `test/slowgram.test.js` (DETC-04/06 drive batches via `raf.flush()`; extend the source scan)
Rule: `setTimeout`/`setInterval` are forbidden everywhere (CORE-01) — including the health check.

### 5. Error containment — engine failures never escape the host page
**Source:** src/slowgram.js:326-336 (contained wrapper), 376-388 (contained subscribers), 430-452 (init try/catch + loud rethrow); test/harness.html:25-35 (window error → FAIL row)
**Apply to:** `src/slowgram.js` (wrap every DomWatcher callback, ContextDetector refresh, RouteGuard signal handler in `contained`), `demo.html` (keep the error-containment script)
Rule: a throwing mutation callback or route handler logs via `console.error`, never propagates into Instagram's page scope.

### 6. Self-mutation filtering — `mutating` flag + overlay exclusion (D-14)
**Source:** 02-RESEARCH.md Pattern 4 (lines 249-261) + ARCHITECTURE.md §Pattern 4 (line 162) / §Anti-Pattern 4 (line 258)
**Apply to:** `src/slowgram.js` (DomWatcher batch skips records taken while `mutating`; nodes inside the engine's overlay host subtree excluded — overlay host lands in Phase 4, the exclusion seam ships now), `test/slowgram.test.js` (DETC-04 asserts engine-origin batches are skipped)
Rule: Phase 3 lever writes set `mutating` around style/attribute writes — Phase 2 ships the flag and the batch guard.

### 7. Pathname authoritative (D-02) — classification never upgrades on DOM signals
**Source:** 02-RESEARCH.md Pattern 1 (lines 180-206) + PITFALLS.md §Pitfall 1 (line 20)
**Apply to:** `src/slowgram.js` (ContextDetector/RouteGuard classify `env.window.location.pathname` only; DOM refines within `/reels/`), `test/slowgram.test.js` (DETC-01/03: a video present while pathname is `/` or `/{username}/` never yields REELS)
Rule: REELS only for `/reels/` prefixes; UNKNOWN is the fail-safe default (DETC-03); the empty-reels-tab edge is accepted.

### 8. WeakMap per-video state + lifecycle reset (DETC-05)
**Source:** 02-RESEARCH.md Pattern 3 (lines 232-247) + ARCHITECTURE.md §Pattern 2 (line 127)
**Apply to:** `src/slowgram.js` (VideoRegistry: WeakMap keyed on element, `loadstart`/`emptied` listeners reset per-video state — blob: src swaps per reel), `test/harness.js` (FakeVideoElement dispatches `loadstart`/`emptied`), `test/slowgram.test.js` (DETC-05)
Rule: never an array/id-map — WeakMap is GC-safe when the virtualized feed drops nodes; registry is NOT cleared on social routes (D-07).

### 9. Two-root observer set (D-11 + D-03)
**Source:** 02-RESEARCH.md Pattern 2 (lines 208-230) + PITFALLS.md §Pitfall 6 (line 137)
**Apply to:** `src/slowgram.js` (DomWatcher observes `[role="main"]` AND `[role="dialog"]` containing a video while pathname is `/reels/`; `childList`+`subtree`, `attributeFilter ['src','loop','autoplay','role']`; connect only on REELS, disconnect on SOCIAL/UNKNOWN), `test/slowgram.test.js` (DETC-04/08 assert `observe()` targets and `disconnect()` call counts)
Rule: never body-wide observation; no `querySelectorAll` inside the mutation callback — drain `takeRecords()` per batch.

### 10. Harness fakes mirror locked event targets
**Source:** test/slowgram.test.js:394-493 (T29-T33 lock document vs window targets); src/slowgram.js:348-370 (bindLifecycle targets)
**Apply to:** `test/harness.js` (FakeLocation dispatches `popstate`/`hashchange` on window; video events on FakeVideoElement), `test/slowgram.test.js` (DETC-02: pushState/popstate/hashchange + rAF re-check all drive classification)
Rule: getting the target wrong makes fake-vs-live behavior diverge (CORE-04) — route signals dispatch on `window`, mutations dispatch through the observer, video lifecycle on the element.

---

## No Analog Found

None — all 6 Phase 2 files map to real in-repo analogs (3 exact same-file, 1 exact structural, 2 role-match). The only file deliberately NOT touched is `test/harness.html` (research line 174: unchanged). **Planner caution:** do not invent external analogs (e.g., jsdom, Playwright) — the project bans external packages (STACK.md:15-42), and the hand-rolled FakeElement mini-DOM is already fully specified in 02-RESEARCH.md Pattern 5 (lines 263-287).

---

## Metadata

**Analog search scope:** `C:/Users/Usuario/Downloads/EcoInsta/src/**` + `test/**` (all 4 source files read in full: src/slowgram.js 522 lines, test/slowgram.test.js 752 lines, test/harness.js 198 lines, test/harness.html 39 lines); `demo.html` verified absent (glob: 0 matches); no `AGENTS.md`/`CLAUDE.md` in the project (no extra convention file)
**Files scanned:** 4 source files + 3 planning docs (02-CONTEXT.md, 02-RESEARCH.md, 01-PATTERNS.md) + section anchors verified in research/PITFALLS.md, ARCHITECTURE.md, STACK.md
**Pattern extraction date:** 2026-08-15
**Patterns valid until:** 2026-09-14 (matches RESEARCH.md validity — platform-doc-dependent; Instagram DOM drift is the expiry driver, mitigated by the SelectorRegistry health check + fixture-refresh runbook)
**Inherited decisions the planner must carry:** A4 — `/{username}/reels/` classifies UNKNOWN (not SOCIAL) under the locked D-05 guard; Phase 4 must treat UNKNOWN like SOCIAL for overlay-hiding (02-RESEARCH.md:436); A2 — fullscreen viewer `role="dialog"` is CITED-not-live-verified; the R2 root + health check make failure loud, not silent (02-RESEARCH.md:434, 463)