# Phase 1: Motor Core & Lifecycle — Pattern Map

**Mapped:** 2026-08-15
**Files analyzed:** 4 new (0 existing — greenfield)
**Analogs found:** 0 / 4 (no in-repo code exists; reference patterns from RESEARCH.md documented instead)

---

## Greenfield Status — Read First

**There is no existing source code in this repository.** Verified 2026-08-15:

- `Get-ChildItem` of repo root: only `.planning/` (no `src/`, no `test/`)
- `Glob("**/*.{js,ts,jsx,tsx,html,css}")`: **0 files** matched
- `AGENTS.md`: does not exist — no project coding-convention file beyond `.planning/` docs
- No project-level `.claude/skills/` or `.agents/skills/` (only user-level ECC/GSD skills, which are workflow tooling, not code patterns)

Consequently **no analog files can be copied** — this document maps each new file to the closest **external/reference patterns**, all of which are captured with line-precise excerpts in `01-RESEARCH.md` (itself derived from verified primary sources: MDN `Object.freeze`/`pageshow`/`rAF`/Page Visibility, Chrome Page Lifecycle API, WICG page-lifecycle, WebKit bug 225610, `.NET` `TimeProvider`/`FakeTimeProvider` lineage). The planner must treat RESEARCH.md §"Architecture Patterns" (lines 93–294) and §"Code Examples" (lines 357–429) as the pattern source of truth, not this file alone.

**In-repo decisions that constrain patterns (from `.planning/STATE.md`):**
- `Date.now()` wall-clock deltas at event boundaries for anything spanning sleep/hidden; `performance.now()` only as in-page refinement (STATE.md:60)
- Harness is a Phase 1 citizen — DI seam + fake clock scaffold ships with the engine in the same commit (STATE.md:63; RESEARCH.md:18 "harness-first")

---

## File Classification

| New File | Role | Data Flow | Closest In-Repo Analog | Match Quality |
|----------|------|-----------|------------------------|---------------|
| `src/slowgram.js` | engine (IIFE state spine: CONFIG, SessionClock, PhaseMachine, FatigueManager, tiny emitter, DI seam) | event-driven (lifecycle events + rAF poll) + request-response (`init`/`getState`/`on`/`destroy`/`setContext`) | **none** — no source files exist | no analog (greenfield) |
| `test/harness.js` | test utility (FakeClock, FakeDocument, FakeWindow, FakeMutationObserver, assert runner + result-table renderer) | transform (fake time via `advance(ms)`; fake event dispatch) | **none** | no analog (greenfield) |
| `test/slowgram.test.js` | test (5 suites: clock, phase, fatigue, DI, config) | synchronous request-response (assert via `getState()`) + event-driven (dispatch fake events) | **none** | no analog (greenfield) |
| `test/harness.html` | test (browser runner page — same suite on a second host) | static orchestration (`<script>` tag load order; pass/fail table render) | **none** | no analog (greenfield) |

---

## Pattern Assignments

> Each assignment cites the reference pattern in `01-RESEARCH.md` by line number, then gives the concrete excerpt the planner should copy. Excerpts are reproduced verbatim from RESEARCH.md so plan actions can reference them without re-reading the whole file.

### `src/slowgram.js` (engine, event-driven + request-response)

**Reference patterns:** RESEARCH.md Pattern 1 (IIFE + DI seam, lines 149–192), Pattern 2 (SessionClock `tick`, 194–221), Pattern 3 (FatigueManager, 223–241), Pattern 4 (PhaseMachine, 244–264), Pattern 5 (deepFreeze CONFIG, 267–284), Common Operation 3 (lifecycle binding, 398–409). **No in-repo analog — greenfield.**

**IIFE skeleton + DI seam** (RESEARCH.md:157–190):
```javascript
(function (global) {
  'use strict';

  var SlowGram = {};
  var CONFIG = null;          // built + deepFrozen in initConfig()
  var env = null;             // resolved DI seam

  function resolveEnv(overrides) {
    return {
      clock:              overrides.clock || { now: function () { return Date.now(); } },
      document:           overrides.document || (typeof document !== 'undefined' ? document : null),
      window:             overrides.window   || (typeof window   !== 'undefined' ? window   : null),
      MutationObserver:   overrides.MutationObserver   || (typeof MutationObserver !== 'undefined' ? MutationObserver : null),
      requestAnimationFrame: overrides.requestAnimationFrame ||
                             (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : null),
      visibilityState:    overrides.visibilityState || function () {
        return env.document ? env.document.visibilityState : 'visible';
      }
    };
  }

  SlowGram.init = function (overrides) {
    overrides = overrides || {};
    env = resolveEnv(overrides);
    CONFIG = initConfig();                    // deep-frozen once
    bindLifecycle(env);                        // listeners on injected doc/window
    return SlowGram;
  };
  SlowGram.getState = function () { /* {elapsedMs, phase, context, visible, hiddenAt} */ };
  SlowGram.on = function (event, cb) { /* tiny emitter */ };
  SlowGram.destroy = function () { /* remove listeners, stop rAF poll */ };

  global.SlowGram = SlowGram;
})(typeof window !== 'undefined' ? window : globalThis);
```
Planner additions locked by research: add `SlowGram.setContext('REELS'|'SOCIAL'|'UNKNOWN')` to the public API (RESEARCH.md:471 — Phase 1 ships `setContext` so CORE-01 is testable without the Phase 2 ContextDetector; default context `UNKNOWN` = fail-safe, clock stays paused until REELS). `visibilityState` helper is part of the seam (RESEARCH.md:172–175).

**SessionClock — single `tick(now)` entry point** (RESEARCH.md:200–219):
```javascript
var SEGMENT_CAP_MS = 15 * 60 * 1000; // one accumulation segment > 15 min = suspend artifact

function tick(now) {
  if (state.running) {                       // running := context==='REELS' && visible
    var delta = now - state.lastBoundary;
    if (delta > 0) state.elapsedMs += Math.min(delta, SEGMENT_CAP_MS);
  }
  state.lastBoundary = now;
  phaseMachine.sync(state.elapsedMs);        // emits 'phasechange' only on transition
}

// rAF poll (frame callback — NOT a timer tick)
function pollLoop() {
  if (state.running && env.requestAnimationFrame) {
    tick(env.clock.now());
    env.requestAnimationFrame(pollLoop);
  }
}
```
Constraint: `tick(now)` is the **only** accumulation path — every boundary handler and the rAF poll call it (RESEARCH.md:196–197). No `setTimeout`/`setInterval` anywhere (RESEARCH.md:12, 288).

**FatigueManager — resume catch-up** (RESEARCH.md:230–240):
```javascript
function onHidden() { state.hiddenAt = env.clock.now(); pauseClock(); }
function onResume() {
  var now = env.clock.now();
  var since = state.hiddenAt || state.lastBoundary;   // catch-up base
  if (now - since > CONFIG.fatigueWindowMs) { resetSession(); return; }
  state.hiddenAt = null;
  state.lastBoundary = now;   // discount the gap: never count unverifiable time
  resumeClock();
}
// bound to: document 'visibilitychange' (visible), document 'resume',
//           window 'pageshow' (only when e.persisted), window 'focus'
```
`resetSession()` sets `elapsedMs = 0`, `phase = 0`, emits `'reset'` (RESEARCH.md:134, 234). Strict `> fatigueWindowMs` comparison per ">5 min" wording (RESEARCH.md:467).

**PhaseMachine — pure function + transition guard** (RESEARCH.md:253–264):
```javascript
// CONFIG.phaseBoundariesMin = [3, 7, 12]  → phase 0: <3m, 1: <7m, 2: <12m, 3: >=12m
function phaseFor(elapsedMs) {
  var mins = elapsedMs / 60000;
  var p = 0;
  for (var i = 0; i < CONFIG.phaseBoundariesMin.length; i++) {
    if (mins >= CONFIG.phaseBoundariesMin[i]) p = i + 1;
  }
  return p;
}
function sync(elapsedMs) {
  var next = phaseFor(elapsedMs);
  if (next !== state.phase) { state.phase = next; emit('phasechange', next); }
}
```
Boundary values are an open question — planner must lock `[3, 7, 12]` or `[3, 7, 15]` (RESEARCH.md:460–463); the machine is a total pure function over `[0, ∞)` either way.

**Deep-frozen CONFIG** (RESEARCH.md:274–284; MDN deepFreeze pattern, verbatim):
```javascript
function deepFreeze(object) {
  const propNames = Reflect.ownKeys(object);
  for (const name of propNames) {
    const value = object[name];
    if ((value && typeof value === "object") || typeof value === "function") {
      deepFreeze(value);
    }
  }
  return Object.freeze(object);
}
```
CONFIG shape: `phaseBoundariesMin`, `degradationMatrix` (per-phase lever applicability), `selectors`, `preservedRoutes`, `fatigueWindowMs` (RESEARCH.md:38, 454). Plain recursion is sufficient — literal graph is acyclic (RESEARCH.md:285).

**Lifecycle binding with correct targets** (RESEARCH.md:402–408; Chrome Page Lifecycle API):
```javascript
function bindLifecycle(env) {
  var d = env.document, w = env.window;
  if (d) d.addEventListener('visibilitychange', onVisibilityChange);
  if (d) d.addEventListener('resume', onResume);            // Chrome 68+ frozen→active
  if (w) w.addEventListener('pageshow', function (e) { if (e.persisted) onResume(); });
  if (w) w.addEventListener('focus', onResume);             // WebView/PWA fallback
}
```

**Error handling / containment** (RESEARCH.md:533–534): no in-repo error-handling analog exists. Pattern: bootstrap `try/catch` containment around `init()` and every event handler — engine failures must never propagate to the host page's global scope. `'use strict'` at the IIFE top converts frozen-object writes into loud `TypeError`s (RESEARCH.md:291, 340–344).

**Validation of the DI seam** (RESEARCH.md:528): `init()` must defensively validate the injected `env` shape — a harness/container passing malformed deps must fail loudly, not crash the host.

---

### `test/harness.js` (test utility, fake-time transform)

**Reference patterns:** RESEARCH.md Common Operation 2 (Clock DI, lines 382–396), Common Operation 4 (harness usage, 411–429), Pattern 1's `resolveEnv` overrides shape (164–176, the harness↔engine contract), Validation Architecture (489–505), Wave 0 spec (513–516). **No in-repo analog — greenfield.**

**FakeClock** (RESEARCH.md:386–396; Clock-pattern lineage: noddde Clock, .NET `TimeProvider`/`FakeTimeProvider`):
```javascript
var SystemClock = { now: function () { return Date.now(); } };
// Test: FakeClock — time only moves when the test calls advance(ms).
function FakeClock(startMs) {
  var t = startMs === undefined ? 0 : startMs;
  return {
    now: function () { return t; },
    advance: function (ms) { t += ms; return t; }   // Phase 1: no timers to fire
  };
}
```
Phase 1 semantics: `advance(ms)` merely moves `now()` — there are no timers to fire (RESEARCH.md:396). Fake origin is an arbitrary constant (e.g. `1_000_000`); tests assert deltas only, never absolute time (RESEARCH.md:456).

**Harness surface required by Wave 0** (RESEARCH.md:513–516; VALIDATION.md:56):
- `FakeClock` — `{now, advance}`
- `FakeDocument` — `visibilityState` + `addEventListener`/`dispatchEvent` + `setVisibility(v)` helper
- `FakeWindow` — `addEventListener`/`dispatchEvent`
- `FakeMutationObserver` — stub (must be injectable as `null`/stub; engine feature-detects, RESEARCH.md:168)
- `assert` runner (~30 lines) + result-table renderer consumed by `harness.html`
- `FakeEvent` (or `new Event` in Node ≥ v24 — `Event` is global) so tests can dispatch `visibilitychange`/`pageshow`/`focus`/`resume` with `persisted` flag on `pageshow`

**Harness usage shape the engine must satisfy** (RESEARCH.md:414–429):
```javascript
var clock = FakeClock(1_000_000);          // arbitrary stable origin
var doc = FakeDocument({ visibilityState: 'visible' });
var win = FakeWindow();
SlowGram.init({ clock: clock, document: doc, window: win, MutationObserver: null });

clock.advance(3 * 60 * 1000);              // fake 3 minutes pass
doc.setVisibility('hidden'); doc.dispatchEvent(new Event('visibilitychange'));
assert.equal(SlowGram.getState().elapsedMs, 0);   // hidden time never accumulates

clock.advance(6 * 60 * 1000);              // 6 min background
doc.setVisibility('visible'); doc.dispatchEvent(new Event('visibilitychange'));
assert.equal(SlowGram.getState().phase, 0);       // fatigue reset fired
assert.equal(SlowGram.getState().elapsedMs, 0);
```
Run command: `node test/slowgram.test.js` (Node v24.19.0 available — RESEARCH.md:477).

---

### `test/slowgram.test.js` (test, synchronous unit suites)

**Reference patterns:** RESEARCH.md Common Operation 4 (411–429), Validation Architecture test map (497–505), Wave 0 (513–514), Assumptions A1/A7 (450, 456). **No in-repo analog — greenfield.**

Five suites, per the requirement→test map (RESEARCH.md:497–505):

| Suite | Covers | Assertion shape |
|-------|--------|-----------------|
| clock suite | CORE-01 | REELS+visible accumulates via `advance(ms)`; SOCIAL/UNKNOWN and hidden time do not; negative deltas clamp to 0 (RESEARCH.md:313, 349) |
| phase suite | CORE-02 | `phaseFor` maps elapsed→phase per **CONFIG** boundaries (never literals — RESEARCH.md:463); `phasechange` emitted only on real transitions (idempotent sync) |
| fatigue suite | CORE-03 | background `> fatigueWindowMs` via each of the 4 resume signals resets; `≤` does not and gap is discounted; `pageshow` with `persisted === false` is ignored (RESEARCH.md:355, 502) |
| DI suite | CORE-04 | `init({clock, document, window, MutationObserver})` works under mocks; default env resolves from globals in a browser (`harness.html`); malformed `env` fails loudly |
| config suite | CORE-05 | `Object.isFrozen` on **every** nested node of CONFIG (RESEARCH.md:319); strict-mode write to any nested property throws |

Cross-cutting assertions: no timers installed anywhere (spy rAF/`setInterval` absence — RESEARCH.md:288); engine never touches bare globals under mocks (RESEARCH.md:151, 503).

---

### `test/harness.html` (test, browser runner — static orchestration)

**Reference patterns:** RESEARCH.md Validation Architecture (489–495, 515), VALIDATION.md:23, 58. **No in-repo analog — greenfield.**

No code pattern to copy — it is a plain page with three `<script>` tags in load order **engine → harness → tests** (RESEARCH.md:145, 515), plus a pass/fail table rendered by harness.js's result-table renderer (RESEARCH.md:515; VALIDATION.md:58). Smoke host for the "same file, two hosts" contract (RESEARCH.md:503; VALIDATION.md:63–67). No framework config, no build step.

---

## Shared Patterns

Cross-cutting patterns that apply to multiple new files. Sources are RESEARCH.md reference patterns (no in-repo sources exist).

### 1. Strict mode + recursive deepFreeze
**Source:** RESEARCH.md:267–284, 340–344 (MDN `Object.freeze` verified pattern)
**Apply to:** `src/slowgram.js` (CONFIG at module load), `test/slowgram.test.js` (config suite asserts `Object.isFrozen` on all nested nodes)
```javascript
'use strict';   // top of the IIFE — frozen-object writes throw TypeError instead of silently failing
function deepFreeze(object) {
  const propNames = Reflect.ownKeys(object);
  for (const name of propNames) {
    const value = object[name];
    if ((value && typeof value === "object") || typeof value === "function") {
      deepFreeze(value);
    }
  }
  return Object.freeze(object);
}
```

### 2. DI seam — `env` resolution with global fallback
**Source:** RESEARCH.md:164–176 (Pattern 1) — the harness↔engine contract
**Apply to:** `src/slowgram.js` (`resolveEnv`), `test/harness.js` (must supply the exact overrides shape: `clock`, `document`, `window`, `MutationObserver`, `requestAnimationFrame`, `visibilityState`)
Key rule: engine body never references bare `Date.now()`/`document`/`window`/`MutationObserver`/`requestAnimationFrame` (RESEARCH.md:151).

### 3. Tiny event emitter + transition-guarded emission
**Source:** RESEARCH.md:186 (`SlowGram.on`), 261–264 (`sync` emits only on real transitions), 294 (anti-pattern: emitting on every sync)
**Apply to:** `src/slowgram.js` — bus events `'contextchange' | 'phasechange' | 'reset' | 'elapsed'` (RESEARCH.md:119); Phase 2+ consumers subscribe, Phase 1 logs/emits for harness. Idempotent emission is mandatory.

### 4. No-timer discipline — single accumulation path
**Source:** RESEARCH.md:12, 196–197, 213–219, 288, 328–332
**Apply to:** `src/slowgram.js` only — every boundary handler and the rAF poll call the same `tick(now)`; `setTimeout`/`setInterval` are forbidden by CORE-01. rAF is a frame callback (not a timer), suspended when hidden — matching clock-pause semantics.

### 5. Wall-clock delta hygiene
**Source:** RESEARCH.md:200–208, 346–350 (Pitfall 7)
**Apply to:** `src/slowgram.js` (`tick`), `test/slowgram.test.js` (clock suite asserts clamping)
Clamp negative deltas to 0 (NTP/clock steps); cap a single segment at `SEGMENT_CAP_MS = 15 min`; minute-scale thresholds tolerate millisecond slew. `Date.now()` for everything spanning sleep/hidden — never `performance.now()` (STATE.md:60; RESEARCH.md:310–314).

### 6. Fatigue catch-up on every resume signal, gap discounted
**Source:** RESEARCH.md:230–240, 334–338 (Pitfall 5)
**Apply to:** `src/slowgram.js` (FatigueManager), `test/slowgram.test.js` (fatigue suite covers all 4 signals)
`hiddenAt` on any hidden signal; on **any** resume signal compute `delta = now - hiddenAt` (fallback `lastBoundary`); `delta > fatigueWindowMs` → reset; `delta ≤ fatigueWindowMs` → discount the gap (`lastBoundary = now`, never accumulate unverifiable time). Guard `pageshow` with `event.persisted === true` (RESEARCH.md:352–355).

### 7. Fake-clock determinism (`advance(ms)`)
**Source:** RESEARCH.md:386–396, 411–429 (FakeTimeProvider lineage)
**Apply to:** `test/harness.js` (FakeClock), `test/slowgram.test.js` (all time driven by `advance`), `src/slowgram.js` (must consume `env.clock.now()` only)
Time moves only when the test calls `advance(ms)`; runs fully synchronously — no timers exist, so no waiting. Test asserts use CONFIG values, never literals (RESEARCH.md:463, 456).

### 8. Error containment (engine never breaks the host page)
**Source:** RESEARCH.md:533–534 (Security Domain, DoS threat)
**Apply to:** `src/slowgram.js` — bootstrap `try/catch` around `init()` and every event handler; single `SlowGram` handle on `window`, everything else closure-private.

### 9. Lifecycle event target mapping
**Source:** RESEARCH.md:402–408 (Chrome Page Lifecycle API — verified event targets)
**Apply to:** `src/slowgram.js` (`bindLifecycle`), `test/harness.js` (FakeDocument/FakeWindow must expose the right targets)
`visibilitychange`/`resume` → **document**; `pageshow`/`pagehide`/`focus` → **window**. Getting targets wrong makes the fake-vs-live behavior diverge — the harness must mirror exactly.

---

## No Analog Found

All four files have **no close match in the codebase** because the repository is greenfield (verified: zero source files; only `.planning/` docs). The planner should use the RESEARCH.md reference patterns cited above (Patterns 1–5, Common Operations 1–4, Validation Architecture §"Recommended Project Structure" lines 136–147) and the verified external lineages:

| File | Role | Data Flow | Reason No Analog | Pattern Source to Use |
|------|------|-----------|------------------|----------------------|
| `src/slowgram.js` | engine | event-driven + request-response | No existing JS in repo | RESEARCH.md Patterns 1–5 (149–284) + Common Op 3 (398–409); external: MDN `Object.freeze`, Chrome Page Lifecycle API |
| `test/harness.js` | test utility | transform (fake time) | No existing JS in repo | RESEARCH.md Common Op 2 + 4 (382–429); external: .NET `TimeProvider`/`FakeTimeProvider`, noddde Clock |
| `test/slowgram.test.js` | test | synchronous unit | No existing JS in repo | RESEARCH.md Validation Architecture (497–505) + Assumptions A1/A7 |
| `test/harness.html` | test (browser runner) | static orchestration | No existing HTML in repo | RESEARCH.md Recommended Project Structure (136–147) + VALIDATION.md:23 |

**Planner caution:** do NOT invent an analog such as "copy from `no-scroll`" — the `no-scroll` (davidtheclark/no-scroll) reference in PROJECT.md is a conceptual philosophy source (inverted scroll philosophy), not a codebase file to copy patterns from (PROJECT.md:7, 45). All excerpts above are the authoritative patterns.

---

## Metadata

**Analog search scope:** repo root `C:/Users/Usuario/Downloads/EcoInsta` — `src/**`, `test/**`, `**/*.{js,ts,jsx,tsx,html,css}` via Glob; recursive directory listing via Bash; `AGENTS.md` probe; project skills probe (`.claude/skills`, `.agents/skills`)
**Files scanned:** 0 source files (10 `.planning/` docs read for context: PROJECT.md, REQUIREMENTS.md, STATE.md, RESEARCH.md, VALIDATION.md + research/ dir)
**Pattern extraction date:** 2026-08-15
**Patterns valid until:** 2026-09-14 (matches RESEARCH.md validity — platform-doc-dependent)
**Open questions inherited (must be locked before plan actions reference CONFIG values):** phase boundaries `[3,7,12]` vs `[3,7,15]` (RESEARCH.md:460–463); strict `>` vs `≥` fatigue comparison (464–467); default context UNKNOWN via `setContext` (468–471)
