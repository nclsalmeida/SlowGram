# Phase 1: Motor Core & Lifecycle - Research

**Researched:** 2026-08-15
**Domain:** Zero-dependency vanilla-JS IIFE state spine — session clock (wall-clock deltas), phase machine, fatigue reset, frozen CONFIG, DI seam + fake clock harness
**Confidence:** HIGH (timing/lifecycle primitives multi-source verified; one in-repo ambiguity flagged: phase boundaries)
**Phase type:** Greenfield (no existing code — only `.planning/` docs exist)

## Summary

Phase 1 is the deterministic state spine of SlowGram: a single IIFE engine file (`src/slowgram.js`) with a strict dependency DAG — deep-frozen `CONFIG` → `SessionClock` → `PhaseMachine` → (future) `DegradationEngine`, with `FatigueManager` as a leaf that resets the spine, and a DI seam (`clock`/`document`/`window`/`MutationObserver`/`requestAnimationFrame`) that makes the **same file** run under a hand-rolled fake-clock harness and live in WKWebView/WebView. No packages, no bundler, no test framework — the IIFE *is* the artifact.

The two prior-research tensions resolve cleanly this session. **(1) Timing primitive:** `performance.now()` does **not** tick during system sleep on macOS/Linux/iOS ([VERIFIED: WebKit bug 225610], [VERIFIED: MDN Performance.now "If you are timing a long operation, you may find Date.now() more useful"]), while `Date.now()` is subject to NTP/clock jumps but is the correct clock for anything spanning background/sleep. Decision: **`Date.now()` wall-clock deltas at event boundaries for all session accounting and fatigue catch-up** — the STACK.md `performance.now()` recommendation is overruled by the sleep-suspension evidence and by the in-repo decision already logged in STATE.md. **(2) Poll mechanism:** CORE-01 forbids timer ticks outright ([VERIFIED: .planning/REQUIREMENTS.md:12]), so there is **no `setInterval`/`setTimeout` anywhere**; accumulation happens in a single `tick(now)` entry point called from (a) lifecycle/context boundary handlers and (b) a `requestAnimationFrame` poll **while running only** — rAF is a frame callback, not a timer, and it is suspended in hidden pages ([VERIFIED: MDN Window.requestAnimationFrame]), which exactly matches "clock pauses when hidden."

The fatigue reset must treat **every resume signal as a catch-up point**, not just `visibilitychange`: Chrome 77+ frozen background tabs resume via `resume`/`pageshow` **without** firing `visibilitychange` ([VERIFIED: react-page-visibility issue #9], [VERIFIED: developer.chrome.com page-lifecycle-api]), and Android WebView's `visibilitychange` is not guaranteed (called from `Activity.onStop`) ([CITED: WICG page-lifecycle]). The robust design: record `hiddenAt` on any hidden signal; on any resume signal (`visibilitychange`→visible, `pageshow`, `focus`, `resume`) compute `delta = now - hiddenAt` (fallback `lastBoundary`); `delta > fatigueWindow` (5 min, in CONFIG) → full reset; `delta ≤ fatigueWindow` → **discount the gap** (never accumulate unverifiable time — the session clock never "lies", satisfying HARN-02's spirit in Phase 1).

One ambiguity must be resolved by the discuss phase before planning locks: the phase boundary text "0–3 / 3–7 / 7–12 / 15+ min" for 4 phases is **mathematically inconsistent** (four intervals cannot map onto four phases without a hole at 12–15). Recommended resolution: boundaries `[3, 7, 12]` minutes stored as one ordered array in CONFIG (`phaseBoundariesMin`), phase 3 = 12+ (the "15+" prose describes the stop-point phase's tail). Alternative: `[3, 7, 15]`. Either way the machine is a total pure function over `[0, ∞)` driven by CONFIG — a one-line change.

**Primary recommendation:** Build the Phase 1 engine as one strict-mode IIFE exposing `SlowGram.init(env)` / `SlowGram.getState()` / `SlowGram.on(event, cb)` / `SlowGram.destroy()`, with every external capability resolved through the injected `env` object (never bare globals), `CONFIG` deep-frozen recursively, and the fake clock (`now()` + `advance(ms)`) shipped in the same commit as the engine — harness-first.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Session time accounting (elapsedMs) | Browser/Client (injected script) | — | Engine runs entirely inside the WebView page context; zero server involvement by design (no network calls, no storage) |
| Phase derivation (elapsedMs → phase) | Browser/Client | — | Pure function in module scope; DOM-free, unit-testable without any DOM |
| Lifecycle observation & fatigue reset | Browser/Client | — | Uses native Page Visibility/Lifecycle events on injected `document`/`window` |
| Frozen CONFIG | Browser/Client (module scope) | — | Plain object literal, deep-frozen at module load; the only module holding magic numbers |
| Deterministic verification | Test Harness (Node + plain browser page) | — | Same engine file, driven by fake clock + fake doc/win; runs `node test/slowgram.test.js` or `test/harness.html` |
| CDN/API/Database tiers | — | — | N/A by design — the v1 motor is a self-contained injected script (zero dependencies, zero network) |

## Phase Requirements

| ID | Description (verbatim from REQUIREMENTS.md) | Research Support |
|----|---------------------------------------------|------------------|
| CORE-01 | "Session clock acumula apenas tempo visível de Reels (context==REELS && visible) via deltas `Date.now()` em fronteiras de evento — nunca ticks de timer" | Date.now() wall-clock deltas at event boundaries (sleep-safe; performance.now rejected for sleep-spanning). Accumulation gated on `context === 'REELS' && visible`. No timers: single `tick(now)` from boundary handlers + rAF poll while running. Negative deltas clamped; gap discounting on resume |
| CORE-02 | "PhaseMachine é função pura que mapeia `elapsedMs → phase 0..3` (0–3 / 3–7 / 7–12 / 15+ min) e emite `phasechange` apenas em transições reais" | Pure total function over `[0,∞)` driven by CONFIG threshold array; transition-guarded emitter (only emit when `newPhase !== currentPhase`). Boundary text ambiguity flagged for discuss-phase (see Open Questions) |
| CORE-03 | "Reset de fadiga reinicia a sessão quando o app fica em background >5 min, computado via delta de wall-clock no catch-up (sinais: `visibilitychange`, `pageshow`, `focus`)" | Resume-catch-up design: `hiddenAt` on hidden; every resume signal computes wall-clock delta; >5 min → reset, ≤5 min → discount gap. Added `resume` (document) because Chrome frozen tabs resume without visibilitychange. WebView delivery unreliability documented |
| CORE-04 | "Motor é IIFE vanilla autocontida, zero dependências, com seam de injeção de dependência (`clock`, `MutationObserver`, `document`, `window`) para o harness" | Revealing-module IIFE + `init(env)` DI seam with real-global defaults; `'use strict'`; event targets bound to injected doc/window (visibilitychange/resume→document; pageshow/focus→window). `requestAnimationFrame` added to the seam as the poll mechanism |
| CORE-05 | "CONFIG é objeto congelado único com fases, matriz de degradação por fase, seletores, rotas preservadas e janela de fadiga — sem números mágicos espalhados" | Single deep-frozen object (freeze is shallow — recursive deepFreeze required); shape spec'd with phases, degradation matrix, selectors, preserved routes, fatigue window; strict mode so accidental mutation throws |
| CORE-06 | "Skeleton de fake clock (`advance(ms)`) como keystone do harness determinístico; o mesmo arquivo do motor roda sob mocks e no WebView" | Fake clock `{now(), advance(ms)}` (no timers in Phase 1, so advance only moves `now`); fake document/window with `dispatchEvent`; same `src/slowgram.js` under mocks (Node + harness.html) and live (defaults to real globals) |

## Standard Stack

Zero new technologies — all primitives are Baseline web-platform APIs [VERIFIED: prior research STACK.md verdict; confirmed this session]. Nothing is installed; there is no build step.

### Core
| Primitive | Version/Baseline | Purpose | Why Standard |
|-----------|------------------|---------|--------------|
| `Date.now()` wall-clock deltas | Baseline (universal) | Session clock + fatigue catch-up | Ticks during sleep (performance.now doesn't on non-Windows — WebKit bug 225610); coarse minute-scale thresholds tolerate NTP slew; clamp negative deltas |
| `Object.freeze()` + recursive `deepFreeze` | ES5, Baseline | CONFIG immutability | Freeze is shallow; nested objects/arrays need recursion; strict-mode assignment to frozen property throws TypeError [VERIFIED: MDN Object.freeze] |
| Page Visibility API (`visibilitychange`, `document.visibilityState`) | Baseline July 2015 | Hidden/visible gating for clock | The only reliable "is the user looking" signal; hidden = last reliably observable state on mobile |
| Page Lifecycle events (`resume` on document; `pageshow`/`pagehide` on window) | Chrome 68+ / baseline | Catch-up on frozen-tab resume | Chrome 77+ freezes background tabs after 5 min and resumes WITHOUT visibilitychange [VERIFIED: developer.chrome.com] |
| `requestAnimationFrame` | Baseline | Phase-poll while running | Frame callback (not a timer — satisfies "no timer ticks"); suspended when hidden, matching clock-pause semantics [VERIFIED: MDN] |
| IIFE + revealing module + `init(env)` DI seam | n/a (pattern) | Single-file artifact, injectable | Same file under mocks and live; zero globals beyond one `SlowGram` handle |

### Supporting
| Primitive | Purpose | When to Use |
|-----------|---------|-------------|
| `window.focus`/`blur` events | Resume catch-up fallback | WebView/PWA cases where visibilitychange is missed (WebKit bug #202399) |
| `document.hidden` | Immediate hidden check | Idempotent guard inside handlers (state may be stale if an event was missed) |
| `Event.persisted` on `pageshow` | Distinguish bfcache restore from initial load | Only treat `pageshow` as a resume when `event.persisted === true` [VERIFIED: MDN Window.pageshow] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `Date.now()` deltas | `performance.now()` | Rejected: does not tick during sleep on macOS/Linux/iOS — session time would freeze across backgrounding [VERIFIED: WebKit bug 225610, Mozilla bug 1709767]. Use Date.now for anything spanning sleep; performance.now only as an in-page refinement if ever needed |
| rAF poll while running | `setInterval(1000)` tick | Rejected: timer ticks are forbidden by CORE-01; timers are throttled to 1/min when hidden (Chrome 88 heavy throttling) and audio-exempt pages over-count [VERIFIED: MDN Page Visibility API] |
| Recursive deepFreeze helper | Single `Object.freeze(CONFIG)` | Single freeze leaves nested objects/arrays mutable — the degradation matrix and selector table would silently accept writes [VERIFIED: MDN] |
| Event-driven boundary accumulation only | rAF poll + boundaries | Without a poll, a passively-watched 25-min Reels session accumulates nothing until the next event; rAF keeps `lastBoundary` fresh while visible so catch-up deltas stay tiny and phase transitions fire on time |
| One engine file + `build.js` concat | Multi-file ESM with bundler | Zero-dependency constraint and single-artifact injection rule out bundlers; if the file grows in later phases, split source modules and concatenate with a trivial `build.js` (no npm) |

**Installation:**
```bash
# Nothing to install. Deliverables are:
#   src/slowgram.js        -> the injectable engine IIFE (zero deps)
#   test/harness.js        -> FakeClock + fake document/window + tiny assert runner
#   test/slowgram.test.js  -> test cases (plain JS)
#   test/harness.html      -> browser page loading the three files via <script>
npm init -y   # optional, repo hygiene only; NOT required to run
```

## Package Legitimacy Audit

**No packages.** This phase installs nothing — zero dependencies is a hard project constraint ([VERIFIED: .planning/PROJECT.md:52 "Tech stack: Vanilla JS, IIFE autocontida, zero dependências"]). There is no npm dependency graph to audit. The test harness is deliberately hand-rolled (see Don't Hand-Roll) because pulling Jest/Playwright/jsdom would violate CORE-04/CORE-06 and HARN-07.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| *(none)* | — | — | — | — | — | Zero-dependency by design |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                    ┌────────────────────────────────────────────────────────┐
                    │  src/slowgram.js  (IIFE, 'use strict', zero deps)       │
                    ├────────────────────────────────────────────────────────┤
                    │  CONFIG  (deep-frozen: phases, degradationMatrix,      │
                    │           selectors, preservedRoutes, fatigueWindow)   │
                    ├────────────────────────────────────────────────────────┤
                    │  env = init({clock, document, window, MutationObserver,│
                    │            requestAnimationFrame})  ← DI seam          │
                    └───────────────┬────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
  ┌──────────────┐          ┌──────────────┐            ┌─────────────────┐
  │  SessionClock │          │ FatigueManager│            │  PhaseMachine    │
  │ tick(now)     │◀──hidden/│ hiddenAt/delta│            │ phaseFor(ms)     │
  │  running =    │   resume │  >5min→reset │            │  + transition    │
  │  REELS+visible│  events  │              │            │  guard           │
  └──────┬───────┘          └──────┬───────┘            └────────┬────────┘
         │ elapsedMs                │ reset()                    │ phasechange
         ▼                          ▼                            ▼
  ┌───────────────────────────────────────────────────────────────────┐
  │  Event bus: 'contextchange' | 'phasechange' | 'reset' | 'elapsed' │
  │  (Phase 2+ consumers subscribe; Phase 1 logs/emits for harness)   │
  └───────────────────────────────────────────────────────────────────┘
        ▲
        │  boundary events (via injected document/window):
        │  visibilitychange(doc) · resume(doc) · pageshow(win, persisted)
        │  focus(win) · contextchange (Phase 2 will feed REELS/SOCIAL/UNKNOWN)
        │  + rAF poll while running (frame callback, not a timer)
```

Data flow for the primary use case (session time):
1. User watches Reels (context==REELS, visible). rAF poll fires `tick(now)` per frame → `elapsedMs += clamp(now - lastBoundary, 0, cap)`; `lastBoundary = now`.
2. Any boundary event (visibility/focus/pageshow/resume/contextchange) calls the same `tick(now)` with the same semantics.
3. `tick` calls `PhaseMachine.sync(elapsedMs)` → if phase changed, emit `phasechange`.
4. `visibilitychange`→hidden: record `hiddenAt`, clock pauses (no accumulation; rAF stops anyway).
5. On resume: compute `delta = now - hiddenAt`; `delta > 5min` → `reset()` (elapsedMs=0, phase=0, emit `reset`); else discount the gap and resume accumulating.

### Recommended Project Structure
```
SlowGram/
├── src/
│   └── slowgram.js          # single IIFE engine (the only injected artifact)
├── test/
│   ├── harness.js           # FakeClock {now, advance}, fake document/window,
│   │                        #   fake MutationObserver stub, ~30-line assert runner
│   ├── slowgram.test.js     # all CORE-01..06 test cases (plain JS, no framework)
│   └── harness.html         # browser page: <script> tags for engine+harness+tests
└── (optional) build.js      # later phases only, if the single file needs splitting
```

### Pattern 1: IIFE + DI seam (CORE-04, CORE-06)

**What:** The engine is a strict-mode IIFE exposing a minimal public API. All external capabilities (`Date`, `document`, `window`, `MutationObserver`, rAF) are resolved through an `env` object injected via `init(env)`; when a dependency is omitted, a default resolving from `globalThis` is used. The engine body never references bare `Date.now()`/`document`/`window`/`MutationObserver`/`requestAnimationFrame`.
**When to use:** Any single-file script that must run identically under mocks and in production (the harness constraint).
**Example:**
```javascript
// Source: synthesized from Revealing-Module + DI patterns [ASSUMED: design synthesis;
//   dependencies defaulted from globals per prior STACK.md research]
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
**Pitfall avoided:** bare-global coupling makes the file untestable under mocks; the seam makes the same file the production artifact (CORE-06).

### Pattern 2: SessionClock — single `tick(now)` entry point (CORE-01)

**What:** One function owns accumulation. It reads the clock once, checks `running = (context === 'REELS' && visible)`, adds `clamp(now - lastBoundary, 0, SEGMENT_CAP)` when running, always refreshes `lastBoundary`, then syncs the phase machine. Every boundary handler and the rAF poll call this same function — there is exactly one accumulation path, so mock and browser behavior can never diverge.
**When to use:** Any time accounting that must be deterministic and timer-free.
**Example:**
```javascript
// Source: [ASSUMED: design synthesis from REQUIREMENTS CORE-01 + prior ARCHITECTURE.md]
//   SEGMENT_CAP value is a recommendation (see Assumptions A4)
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
**Pitfall avoided:** timer-throttling drift and the CORE-01 timer-tick prohibition.

### Pattern 3: FatigueManager — resume catch-up, never a background timer (CORE-03)

**What:** Record `hiddenAt` on any hidden signal. On **any** resume signal, compute the wall-clock delta since `hiddenAt` (fallback: `lastBoundary`). If `delta > CONFIG.fatigueWindowMs` (5 min) → full reset (elapsedMs=0, phase=0, emit `reset`). If `delta ≤ fatigueWindowMs` → do **not** accumulate the gap (it is unverifiable); just resume from `now`. No timer ever runs in the background.
**When to use:** Lifecycle state that must survive WebView suspensions and missed events.
**Example:**
```javascript
// Source: [ASSUMED: design synthesis from REQUIREMENTS CORE-03 + PITFALLS.md P4/P5]
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
**Pitfall avoided:** visibilitychange-only reset (missed in WebView / Chrome frozen tabs) and lying clocks (HARN-02 spirit).

### Pattern 4: PhaseMachine — pure function + transition guard (CORE-02)

**What:** `phaseFor(elapsedMs)` is a total pure function over `[0, ∞)` derived from the CONFIG boundary array; `sync()` compares against the current phase and emits `phasechange` only on a real transition (idempotent). No DOM, no timers — unit-testable with the fake clock alone.
**When to use:** Deriving discrete state from a monotonic quantity where downstream consumers must never disagree.
**Example:**
```javascript
// Source: [ASSUMED: design synthesis from REQUIREMENTS CORE-02; boundaries flagged in
//   Open Questions — the array is the single source of truth]
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

### Pattern 5: Deep-frozen CONFIG (CORE-05)

**What:** `Object.freeze` is shallow ([VERIFIED: MDN]) — a recursive `deepFreeze` (cycle-guarded) makes the whole object graph immutable; `'use strict'` converts accidental writes into loud `TypeError`s instead of silent no-ops.
**When to use:** A read-only constants object consumed by every module.
**Example:**
```javascript
// Source: MDN deepFreeze example, verbatim pattern [VERIFIED: MDN Object.freeze]
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
Guard for cycles with a `WeakSet` of visited objects if CONFIG ever nests shared references; CONFIG's literal graph is acyclic, so the plain recursion is sufficient here.

### Anti-Patterns to Avoid
- **Accumulating time on a setInterval tick:** forbidden by CORE-01; throttled/audio-exempt in background; drifts. Use `tick(now)` from boundaries + rAF.
- **`performance.now()` for session/elapsed:** freezes across sleep on non-Windows. Use `Date.now()`.
- **Shallow `Object.freeze(CONFIG)`:** the nested degradation matrix/selector table stay mutable. Deep-freeze.
- **Sloppy-mode engine code:** frozen-object writes fail silently. `'use strict'` at the IIFE top.
- **Resume handler that accumulates the whole gap:** after a 3-min background the clock would "count" 3 hidden minutes — a lying clock. Discount the gap.
- **Listening to `pageshow` without `event.persisted`:** pageshow also fires on initial load; the handler must be idempotent or guarded.
- **PhaseMachine emitting on every sync:** downstream Phase-2+ consumers would re-apply levers per frame. Transition guard is mandatory.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session timekeeping | Timer-tick counters | `Date.now()` wall-clock deltas at event boundaries + rAF poll | Timers are throttled (1/min hidden, Chrome 88), audio-exempt pages over-count, and CORE-01 forbids them; wall-clock deltas are the standard for sleep-spanning measurement |
| Visibility/lifecycle tracking | Custom polling of focus/interval heuristics | Native Page Visibility + Page Lifecycle events (`visibilitychange`, `resume`, `pageshow`, `focus`) | The platform events are exactly the semantics needed; custom heuristics duplicate the state machine Chrome/WebKit already maintains |
| CONFIG immutability | Manual discipline ("don't mutate CONFIG") | `deepFreeze` recursive helper + strict mode | Manual discipline fails silently; deepFreeze makes violations throw at the first write |
| Deterministic tests | Jest / Playwright / vi.useFakeTimers / jsdom | Hand-rolled FakeClock `{now, advance}` + fake doc/window + ~30-line assert runner | CORE-04/CORE-06/HARN-07 require zero test dependencies and the same engine file under mocks; frameworks are explicitly out of scope [VERIFIED: .planning/STACK.md] |
| Fake clock | `Date.now` monkey-patching in tests | Injected `clock` object with `now()`/`advance(ms)` | Patching globals leaks across tests and cannot drive injected code; injection is the canonical Clock pattern (TimeProvider/FakeTimeProvider lineage) |

**Key insight:** every item in this table is a *silent-failure* domain — wrong clocks, missed resets, and mutable CONFIG all fail without errors. The standard primitives exist precisely because they are the battle-tested versions of these behaviors.

## Common Pitfalls

### Pitfall 1: Using `performance.now()` for session time
**What goes wrong:** Session elapsed freezes across backgrounding on iOS/macOS/Linux — a 10-min backgrounded break counts as ~0 ms; on resume the fatigue delta also computes 0 and the reset never fires.
**Why it happens:** `performance.now()` is backed by a monotonic clock that does not tick during system sleep on non-Windows ([VERIFIED: WebKit bug 225610], [VERIFIED: Mozilla bug 1709767]); spec Level 2 says it should tick, but implementations diverge.
**How to avoid:** `Date.now()` for everything spanning hidden/sleep; clamp negative deltas to 0 (NTP/clock steps).
**Warning signs:** Phase transitions happen at different wall-clock times on iOS vs Android; fatigue reset never fires after a 6-min background on device.

### Pitfall 2: Shallow freeze — "CONFIG is frozen" but nested objects mutate
**What goes wrong:** `Object.freeze(CONFIG)` leaves `CONFIG.phases`, the degradation matrix, and the selector table mutable; a Phase 3+ write silently changes thresholds.
**Why it happens:** Freeze is shallow by spec ([VERIFIED: MDN]); only immediate properties are locked.
**How to avoid:** Recursive `deepFreeze` at module load; `Object.isFrozen` assertion in tests for every nested node.
**Warning signs:** A test mutating `CONFIG.phases[1].thresholdMin` does not throw.

### Pitfall 3: `visibilitychange`-only fatigue reset
**What goes wrong:** Reset never fires in WebViews and Chrome frozen tabs: Android WebView does not guarantee `visibilitychange` (host must call `onPause/onResume`) and Chrome 77+ frozen tabs resume via `resume`/`pageshow` without `visibilitychange` ([VERIFIED: WICG page-lifecycle], [VERIFIED: react-page-visibility #9]).
**Why it happens:** The Page Visibility API is a browser concept; WebViews are a different lifecycle host, and Chrome's freeze intervention bypasses visibility events on resume.
**How to avoid:** Listen to `visibilitychange` (document), `resume` (document), `pageshow` (window, `persisted===true`), `focus` (window); compute wall-clock catch-up delta on every resume signal.
**Warning signs:** Manual device test — background 6 minutes, return, feed still degraded / no reset log.

### Pitfall 4: Timer ticks as the time source
**What goes wrong:** `setInterval(() => elapsed++, 1000)` drifts: hidden tabs throttle to ~1/min, audio-playing tabs are exempt (over-count), WKWebView may suspend JS entirely.
**Why it happens:** Ticking is the obvious implementation; browsers actively sabotage ticks in hidden pages by design.
**How to avoid:** `tick(now)` at event boundaries + rAF poll while running; rAF is a frame callback (not a timer), suspended when hidden — exactly aligned with clock-pause semantics.
**Warning signs:** Session seconds ≠ wall-clock seconds in a manual watch test.

### Pitfall 5: Accumulating unverifiable time on resume
**What goes wrong:** The clock "counts" a 3-minute background gap as watch time because `visibilitychange`→hidden never fired (WebView) and the clock was still "running" — the session lies and phases advance while the user is away.
**Why it happens:** Resume handlers that blindly add `now - lastBoundary`.
**How to avoid:** On resume signals, compute the fatigue delta first; if `≤ fatigueWindow`, discount the gap (`lastBoundary = now`, no accumulation); only rAF-poll segments (small, verified visible) accumulate.
**Warning signs:** Phase 2 arrives right after the user returns from a short background break.

### Pitfall 6: Sloppy mode hides frozen-object bugs
**What goes wrong:** Assignment to a frozen property silently fails in non-strict code; the engine "works" but CONFIG writes vanish.
**Why it happens:** `Object.freeze` throws only in strict mode ([VERIFIED: MDN]).
**How to avoid:** `'use strict';` at the top of the IIFE; strict mode also catches other silent bugs (undeclared vars).
**Warning signs:** Console shows no error on a CONFIG mutation attempt in a test.

### Pitfall 7: `Date.now()` backward/forward jumps (NTP, timezone)
**What goes wrong:** An NTP step can make `endTime < startTime` (negative delta) or a forward jump inflates a segment ([CITED: SO 42866475]; MDN High precision timing).
**Why it happens:** Wall clock is not monotonic; OS daemons adjust it.
**How to avoid:** Clamp negative deltas to 0; cap a single segment (`SEGMENT_CAP_MS`, see Assumptions A4); thresholds are minute-scale so millisecond slew is irrelevant.
**Warning signs:** A debug log shows a negative segment or a >15-min single segment.

### Pitfall 8: `pageshow` fires on initial load too
**What goes wrong:** A naive `pageshow → resume handler` treats the initial page load as a resume-from-background; with `hiddenAt` null it may mis-compute.
**Why it happens:** pageshow fires on initial load, same-window navigation, background-tab open, prerender, and bfcache restore ([VERIFIED: MDN Window.pageshow]).
**How to avoid:** Only treat `pageshow` as a resume when `event.persisted === true`; keep the handler idempotent (resume when `hiddenAt != null`).

## Code Examples

Verified patterns from official sources:

### Common Operation 1: Deep freeze (CORE-05)
```javascript
// Source: MDN Object.freeze — deepFreeze example (verbatim pattern)
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze
function deepFreeze(object) {
  // Retrieve the property names defined on object
  const propNames = Reflect.ownKeys(object);

  // Freeze properties before freezing self
  for (const name of propNames) {
    const value = object[name];

    if ((value && typeof value === "object") || typeof value === "function") {
      deepFreeze(value);
    }
  }

  return Object.freeze(object);
}
```

### Common Operation 2: Clock DI (CORE-04/CORE-06)
```javascript
// Source: Clock-pattern lineage (noddde Clock pattern; .NET TimeProvider/FakeTimeProvider)
// Interface: Clock { now(): number }  — production wraps Date.now, tests inject a fake.
var SystemClock = { now: function () { return Date.now(); } };
// Test: FakeClock — time only moves when the test calls advance(ms).
function FakeClock(startMs) {
  var t = startMs === undefined ? 0 : startMs;
  return {
    now: function () { return t; },
    advance: function (ms) { t += ms; return t; }   // Phase 1: no timers to fire; Phase 3 buffer lever extends this
  };
}
```
Note on `advance` semantics (from FakeTimeProvider lineage): a single `advance` fires every pending timer whose wake-up point passed, synchronously — relevant only when Phase 3 adds timers; in Phase 1 `advance` merely moves `now()`.

### Common Operation 3: Lifecycle listener registration with correct targets (CORE-03)
```javascript
// Source: Chrome Page Lifecycle API docs — event targets (visibilitychange/resume → document;
//   pageshow/pagehide → window; focus → window) [VERIFIED: developer.chrome.com/docs/web-platform/page-lifecycle-api]
function bindLifecycle(env) {
  var d = env.document, w = env.window;
  if (d) d.addEventListener('visibilitychange', onVisibilityChange);
  if (d) d.addEventListener('resume', onResume);            // Chrome 68+ frozen→active
  if (w) w.addEventListener('pageshow', function (e) { if (e.persisted) onResume(); });
  if (w) w.addEventListener('focus', onResume);             // WebView/PWA fallback
}
```

### Common Operation 4: Harness assertions (CORE-01/02/03/05/06)
```javascript
// Source: [ASSUMED: harness design from STACK.md + fake-clock determinism research]
// Driven fully synchronously — no timers exist, so no waiting:
var clock = FakeClock(1_000_000);          // arbitrary stable origin
var doc = FakeDocument({ visibilityState: 'visible' });
var win = FakeWindow();
SlowGram.init({ clock: clock, document: doc, window: win, MutationObserver: null });

clock.advance(3 * 60 * 1000);              // fake 3 minutes pass
// the rAF poll is faked too; under the harness, tick is also triggered by events:
doc.setVisibility('hidden'); doc.dispatchEvent(new Event('visibilitychange'));
assert.equal(SlowGram.getState().elapsedMs, 0);   // hidden time never accumulates

clock.advance(6 * 60 * 1000);              // 6 min background
doc.setVisibility('visible'); doc.dispatchEvent(new Event('visibilitychange'));
assert.equal(SlowGram.getState().phase, 0);       // fatigue reset fired
assert.equal(SlowGram.getState().elapsedMs, 0);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Date`-only timing everywhere | `performance.now()` monotonic for in-page intervals; `Date.now()` wall-clock for sleep-spanning | MDN HR-Time guidance / WebKit bug 225610 / Mozilla 1709767 | Session clocks that span background MUST use wall clock; monotonic-only clocks freeze on iOS |
| `visibilitychange` as the sole background signal | Page Lifecycle API: `resume`/`freeze`/`pageshow` + multi-signal catch-up | Chrome 68+ freeze intervention (Chrome 77 in the field) | Frozen tabs resume without visibilitychange — resume handlers must cover all signals |
| `setInterval` timekeeping | Event-boundary wall-clock deltas + rAF polls | Chrome 88 heavy timer throttling (1/min hidden) | Timer ticks are unusable for truthful session time |
| `Object.freeze` assumed deep | Recursive `deepFreeze` + strict mode | Long-standing ES5 semantics | Shallow freeze is the standard footgun; nested config stays mutable |
| Test frameworks for determinism | Injected fake clock (`advance(ms)`) | FakeTimeProvider lineage (2019+) | Zero-dep harness gives identical determinism without node_modules |

**Deprecated/outdated:**
- `performance.now()` for anything spanning hidden/sleep on non-Windows — use `Date.now()` ([VERIFIED: MDN Performance.now]).
- `setInterval`-based session counters — forbidden by CORE-01 and defeated by throttling ([VERIFIED: MDN Page Visibility API]).
- `Object.freeze` alone for config immutability — use `deepFreeze` ([VERIFIED: MDN]).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase boundaries resolve to `phaseBoundariesMin: [3, 7, 12]` (phase 3 = 12+, "15+" is descriptive of the stop-point phase's tail) — the requirement text "0–3 / 3–7 / 7–12 / 15+" cannot map 4 phases onto 4 intervals | PhaseMachine / Open Questions | If the intended boundaries are `[3, 7, 15]` (phase 2 = 7–15), phase transitions occur at different times — one-line CONFIG change, but harness assertions must match the locked values |
| A2 | rAF poll is an acceptable "non-timer" accumulation trigger ("no timer ticks anywhere" refers to `setTimeout`/`setInterval`; rAF is a frame callback) | SessionClock | If a stricter reading forbids any periodic callback, phase transitions during a passively-watched session would only fire at the next boundary event — behavior stays correct, transitions can lag by up to the inter-event gap |
| A3 | Fatigue catch-up must also listen to `document 'resume'` (Chrome frozen tabs) in addition to the three signals named in CORE-03 | FatigueManager | Extra signal is strictly additive; missing it would skip resets only in Chrome-frozen-tab WebViews on Android |
| A4 | `SEGMENT_CAP_MS = 15 min` per accumulation segment (a single >15-min segment implies a suspend artifact) | SessionClock | If an exotic environment delivers one giant rAF gap while genuinely visible, up to 15 min of watch time is dropped per occurrence; conservative direction (never over-count) is the product's stated bias |
| A5 | CONFIG includes a `degradationMatrix` (per-phase lever applicability) and `selectors` table in Phase 1 even though Phase 2/3 consume them — "no magic numbers scattered" (CORE-05) implies later-phase constants live here from day one | CONFIG | If deferred, Phase 3 introduces a second constants object — violates CORE-05's single-object intent |
| A6 | `SlowGram.on(...)` emitter and `getState()` are part of the Phase 1 public API so the harness and later phases subscribe deterministically | IIFE skeleton | If the event bus is deferred, the Phase-1 harness can still assert via `getState()`, but the Phase 2/3 wiring contract is less proven |
| A7 | Fake clock origin is an arbitrary constant (e.g., `1_000_000`); tests never assert absolute time, only deltas | Fake clock | If any test asserts an absolute timestamp, fake-origin choice leaks into assertions — harmless but noisy |

## Open Questions (RESOLVED)

1. **Phase boundary values — the 12–15 min gap**
   - What we know: REQUIREMENTS.md and ROADMAP.md both state "0–3 / 3–7 / 7–12 / 15+ min" for a 4-phase machine, which is arithmetically impossible (4 intervals, 4 phases, one hole at 12–15). Verbatim: `elapsedMs → phase 0..3 (0–3 / 3–7 / 7–12 / 15+ min)` [VERIFIED: .planning/REQUIREMENTS.md:13]; PROJECT.md:29 repeats "0–3 / 3–7 / 7–12 / 15+ minutos".
   - What's unclear: whether phase 3 begins at 12 min (recommended — `[3,7,12]`) or 15 min (`[3,7,15]`, making phase 2 span 7–15).
   - Recommendation: lock `[3, 7, 12]` minutes in the discuss phase; store as a single `phaseBoundariesMin` array in CONFIG; harness asserts use the CONFIG values, never literals.
   - RESOLVED: locked as `phaseBoundariesMin: [3, 7, 12]` (phase 0: <3m, 1: 3–7m, 2: 7–12m, 3: >=12m; "15+" is descriptive of the stop-point phase's tail) — locked in 01-02-PLAN.md flagged assumption FA-03 (CORE-02 boundary contract: `elapsedMs >= boundaryMs` integer-ms comparison from CONFIG only, one step either side asserted).
2. **Fatigue window exact value**
   - What we know: ">5 min" is the stated contract [VERIFIED: .planning/REQUIREMENTS.md:14]; HARN-06's device checklist says "reset 6min".
   - What's unclear: whether the comparison is strict `> 5 min` (reset at 5:00.001) or `≥ 5 min`.
   - Recommendation: `fatigueWindowMs = 5 * 60 * 1000`, reset when `delta > fatigueWindowMs` (strict), per ">5 min" wording; the 6-min device test is just a safe margin.
   - RESOLVED: strict `>` comparison locked — a background gap of exactly `fatigueWindowMs` (300000 ms) does NOT reset; 300001 ms does — locked in 01-03-PLAN.md flagged assumption FA-05 (CORE-03 boundary contract; one step either side asserted in the fatigue suite).
3. **Context feed for Phase 1**
   - What we know: CORE-01 requires `context==REELS` gating, but ContextDetector is Phase 2.
   - What's unclear: how the clock learns the context in Phase 1.
   - Recommendation: Phase 1 ships `setContext('REELS'|'SOCIAL'|'UNKNOWN')` as part of the public API (called by tests directly; wired to ContextDetector in Phase 2); default context `UNKNOWN` (fail-safe — clock stays paused until explicitly set to REELS). This makes CORE-01 testable today without building the detector.
   - RESOLVED: Phase 1 ships `setContext('REELS'|'SOCIAL'|'UNKNOWN')` with default `UNKNOWN` (fail-safe — clock stays paused until explicitly set to REELS) — locked in 01-01-PLAN.md (public API surface `init`, `getState`, `setContext`, `on`, `emit`, `destroy`; invalid context throws `Error`; `'contextchange'` emitted only on actual change).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Running the harness under Node (`node test/slowgram.test.js`) | ✓ | v24.19.0 | — |
| npm | Optional manifest only — not required to run | ✓ | 11.17.0 | — |
| Browser (Edge/Chrome) | `test/harness.html` — same suite in a plain page | ✓ (Edge) | — | Edge found at `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`; Chrome not at default path (non-blocking — Edge or any modern browser runs the page) |
| WKWebView / Android WebView | Production target | ✗ (no device in this phase) | — | v1 is engine-only; on-device validation is Phase 5 (HARN-06), so no device needed for Phase 1 |

**Missing dependencies with no fallback:** none — Phase 1 requires only Node or a browser to run the harness.
**Missing dependencies with fallback:** device/WebView (deferred to Phase 5 by scope; the DI seam means the engine is container-agnostic).

## Validation Architecture

*(`workflow.nyquist_validation: true` in .planning/config.json — section required)*

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None — hand-rolled ~30-line assert runner in `test/harness.js` (zero dependencies, per CORE-04/CORE-06/HARN-07) |
| Config file | none — files loaded via `<script>` tags in `test/harness.html`; no framework config |
| Quick run command | `node test/slowgram.test.js` |
| Full suite command | `node test/slowgram.test.js` + open `test/harness.html` in a browser (same tests, two hosts) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CORE-01 | REELS+visible accumulates via `advance(ms)`; SOCIAL/UNKNOWN and hidden time do not; no timers anywhere | unit | `node test/slowgram.test.js` (clock suite) | ❌ Wave 0 |
| CORE-02 | `phaseFor` maps elapsed→phase per CONFIG boundaries; `phasechange` emitted only on real transitions | unit | `node test/slowgram.test.js` (phase suite) | ❌ Wave 0 |
| CORE-03 | Background >5 min (via visibilitychange/pageshow/focus/resume) resets; <5 min does not and gap is discounted | unit | `node test/slowgram.test.js` (fatigue suite) | ❌ Wave 0 |
| CORE-04 | `init(env)` with injected clock/doc/win works; default env works in a browser; engine never touches bare globals | unit + smoke | `node test/slowgram.test.js` (DI suite) + `test/harness.html` | ❌ Wave 0 |
| CORE-05 | CONFIG is deep-frozen: `Object.isFrozen` on all nested nodes; mutation throws in strict mode | unit | `node test/slowgram.test.js` (config suite) | ❌ Wave 0 |
| CORE-06 | Same `src/slowgram.js` runs under mocks (Node) and in `harness.html`; fake clock `advance(ms)` drives all time | unit + smoke | `node test/slowgram.test.js` + `test/harness.html` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `node test/slowgram.test.js`
- **Per wave merge:** `node test/slowgram.test.js` + `test/harness.html` smoke (open in Edge)
- **Phase gate:** full suite green on both hosts before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/harness.js` — FakeClock (`now`/`advance`), FakeDocument (visibilityState + addEventListener/dispatchEvent), FakeWindow (addEventListener/dispatchEvent), FakeMutationObserver stub, assert runner + result table renderer
- [ ] `test/slowgram.test.js` — suites for clock, phase machine, fatigue, DI seam, CONFIG freezing
- [ ] `test/harness.html` — `<script>` tags for engine + harness + tests, renders pass/fail table
- [ ] `src/slowgram.js` — the engine IIFE itself (the unit under test)

## Security Domain

*(`workflow.security_enforcement: true`, ASVS level 1 — section required)*

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A — no auth; injected client-side script with no users/accounts |
| V3 Session Management | no | N/A — no session concept in the engine |
| V4 Access Control | no | N/A — no resources to gate |
| V5 Input Validation | yes (partial) | Validate the injected `env` shape in `init()` (defensive — a harness or container passing malformed deps must fail loudly, not crash the host); all "input" is DOM observation, never user-supplied strings executed |
| V6 Cryptography | no | N/A — zero crypto, zero network, zero storage (by design) |

### Known Threat Patterns for {stack}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Engine exception breaking Instagram's page | DoS (host) | Bootstrap `try/catch` containment around `init()` and every event handler; engine failures must never propagate to the host page's global scope [CITED: ARCHITECTURE.md Bootstrap responsibility] |
| Global namespace pollution / collision | Tampering | Single `SlowGram` handle on `window` only; everything else closure-private; `'use strict'` |
| Frozen-CONFIG bypass via nested mutation | Tampering | `deepFreeze` recursion + strict mode (throws on write) |
| Clock spoofing by a compromised container | Spoofing | Not a Phase 1 threat — the container is trusted; documented as a container-domain trust boundary |

**Phase-1 security notes carried from prior research:** never touch `video.muted` programmatically (WebKit pauses playback — Phase 3 lever design, but the constraint is logged now); no synthetic events, no network, no storage — the engine's surface is deliberately minimal, which *is* the security posture ([CITED: PITFALLS.md Security Mistakes]).

## Sources

### Primary (HIGH confidence)
- MDN — `Object.freeze()` / deep-freeze pattern and strict-mode TypeError semantics (fetched 2026-08-15)
- MDN — `Window.requestAnimationFrame` (paused in background tabs/hidden iframes); `Window.pageshow` (fires on initial load, bfcache restore with `persisted`, background-tab open); `Performance.now` (sleep-ticking divergence; "Date.now() more useful for long operations"); Page Visibility API (rAF/timer throttling rules) (fetched 2026-08-15)
- Chrome for Developers — Page Lifecycle API (states active/passive/hidden/frozen/discarded; event targets: visibilitychange/resume→document, pageshow/pagehide→window; frozen tabs resume without visibilitychange) (fetched 2026-08-15)
- WICG page-lifecycle spec/readme — Android `visibilitychange` not guaranteed (Activity.onStop); frozen/discarded states; resume-then-pageshow ordering
- WebKit bugzilla 225610 — `performance.now()` does not tick during system sleep (HIGH)
- Mozilla bugzilla 1709767 — `performance.now()` pauses during sleep on Linux/macOS (HIGH)
- In-repo source-of-truth values: `.planning/REQUIREMENTS.md:12-17` (CORE-01..06 verbatim), `.planning/ROADMAP.md:23-35` (Phase 1 goal/success criteria), `.planning/PROJECT.md` (stack constraint, out-of-scope), `.planning/STATE.md` (decision: Date.now() for sleep-spanning)

### Secondary (MEDIUM confidence)
- persistent.info (2016) — measured `performance.now()` freeze across laptop sleep; switched to `Date.now()` (consistent with WebKit/Mozilla bugs)
- pgilad/react-page-visibility issue #9 — Chrome 77+ background tabs frozen after 5 min; resume without visibilitychange (production evidence)
- WICG page-lifecycle GitHub discussion — Android `onPause` guaranteed vs `onStop` not; mobile swipe-away fires no pagehide/unload
- StackOverflow 42866475 — NTP step produced `endTime < startTime` with `Date.now()` deltas
- gomakethings / skillstuff / Go Make Things — vanilla-IIFE, revealing module, dependency-injected `init(options)` patterns
- noddde Clock pattern + .NET `TimeProvider`/`FakeTimeProvider` — Clock interface + `advance(ms)` fake-clock semantics (used as the design lineage for the harness)

### Tertiary (LOW confidence)
- none for Phase 1 — all claims above trace to primary platform docs or in-repo planning documents

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all primitives are Baseline web-platform APIs verified against MDN/Chrome/WICG this session; zero packages
- Architecture: HIGH — timing primitive, lifecycle signals, freeze semantics, and fake-clock design each trace to verified primary sources; the one design synthesis (segment cap, discount-gap resume) is conservative and flagged
- Pitfalls: HIGH — every pitfall maps to a verified platform behavior (sleep-freezing clocks, throttling, shallow freeze, WebView lifecycle gaps)

**Research date:** 2026-08-15
**Valid until:** 2026-09-14 (30 days — platform docs; the in-repo requirements are the binding constraint)