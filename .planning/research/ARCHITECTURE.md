# Architecture Research

**Domain:** Injected client-side anti-addiction engine (vanilla JS IIFE, zero deps) degrading passive Reels consumption inside Instagram web on WKWebView/WebView
**Researched:** 2026-08-15
**Confidence:** MEDIUM

## Standard Architecture

### System Overview

The engine is a single self-contained IIFE with eight internal modules. The dependency graph is a strict DAG: `CONFIG` is read by everything; `Clock → PhaseMachine → DegradationEngine` forms the state spine; `Watcher → Detector → Clock` forms the signal path; `Overlay` and `FatigueManager` are leaves off the spine.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          SlowGram IIFE (injected)                            │
├──────────────────────────────────────────────────────────────────────────────┤
│                              CONFIG (pure data)                              │
│            phases, thresholds, selectors, preserved routes, params           │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐   ┌───────────────────┐   ┌─────────────────────────────┐  │
│  │  DomWatcher  │──▶│   ContextDetector │   │       SessionClock          │  │
│  │ MutationObs. │   │  pathname + DOM   │──▶│ wall-clock accumulator      │  │
│  │ rAF-batched  │   │  → REELS/SOCIAL   │   │ ticks ONLY on reels+visible │  │
│  └──────┬───────┘   └───────────────────┘   └──────────────┬──────────────┘  │
│         │ registers                                       │ elapsedMs       │
│         ▼                                                  ▼                 │
│  ┌──────────────┐                                  ┌─────────────────────┐  │
│  │ VideoRegistry│                                  │     PhaseMachine    │  │
│  │ WeakMap<el,  │◀── apply/revert ──┐              │ elapsed → phase 0..3│  │
│  │ state>       │                   │              └──────────┬──────────┘  │
│  └──────────────┘                   │                         │ phasechange │
│                                     ▼                         ▼              │
│                      ┌──────────────────────────────────────────────┐       │
│                      │           DegradationEngine (hub)            │       │
│                      │  routes phase → applicable Applicators       │       │
│                      │  Filter │ Playback │ Volume │ Autoplay │Buffer│       │
│                      └──────────────────────────────────────────────┘       │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐          ┌───────────────────────────────────────────────┐  │
│  │   Overlay   │◀─elapsed─│             FatigueManager                     │  │
│  │ neutral mm:ss│         │ visibilitychange/pagehide → hiddenAt;         │  │
│  │ pointer-events:none    │ delta > 5min → reset Clock+Phase+Applicators  │  │
│  └─────────────┘          └───────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────────────┤
│                              Bootstrap (init + error containment)           │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| CONFIG | Single source of truth: 4 phase thresholds (0–3/3–7/7–12/15+ min), per-phase degradation parameter table, selector table (role/attribute/pathname), preserved social routes, fatigue reset window (>5 min) | Plain frozen object literal; the only module with magic numbers |
| SessionClock | Accumulates **reels-eligible active time only**: ticks while context == REELS && `document.visibilityState === 'visible'`. Pauses on social routes and when hidden. Never depends on timer accuracy — wall-clock deltas captured at event boundaries | `Date.now()` deltas; 1s interval tick while active as a convenience, corrected on every visibilitychange/contextchange |
| PhaseMachine | Pure mapping `elapsedMs → phase` (0 NATIVE / 1 MICRO / 2 SENSORY / 3 STOP). Emits `phasechange` only when phase actually transitions (idempotent) | Small state object + transition guard; unit-testable without DOM |
| ContextDetector | Classifies current surface: **REELS** (reels feed / video surfaces), **SOCIAL** (preserved routes), **UNKNOWN** (fail-safe = no degradation). Pathname is authoritative for preserved routes; DOM signals (role/attr + video presence) refine reels detection | `RouteGuard` matching `/direct/`, `/messages`, profiles, search against `location.pathname` first; role/video signals second |
| DomWatcher | MutationObserver wrapper. Watches `document.body` (childList+subtree), batches records via rAF, filters by type, ignores its own overlay subtree, feeds new `<video>` nodes to VideoRegistry and role/attribute signals to ContextDetector | Single `MutationObserver`, `requestAnimationFrame` coalescing, record filter (addedNodes only) |
| VideoRegistry | Tracks every degraded video element in a WeakMap with per-element state. **Resets state on `loadstart`/`emptied`/`ended`** because React virtualized feeds recycle the same `<video>` node for different reels | `WeakMap<HTMLVideoElement, VideoState>`; lifecycle listeners attached once per element |
| DegradationEngine | Hub between phase and media. On `phasechange` or video registration: computes which Applicators apply at current phase, calls `apply(phase, video, ctx)`; on reset calls `revert(video)` | Applicator registry array, per-phase applicability matrix |
| Applicators (×5) | One degradation lever each: Filter (CSS saturate/contrast/brightness), Playback (`playbackRate`), Volume (`volume`, never `muted`), Autoplay (pause-on-loop-end / block restart), Buffer (simulated buffering: pause + spinner + resume). Each idempotent, revertible | `{ key, apply(phase, video), revert(video) }`; volume/rate stored/restored |
| Overlay | Neutral elapsed-time counter (`mm:ss`), `pointer-events:none`, `z-index: 2147483647`, non-judgmental copy, hidden on SOCIAL routes | Fixed-position div host appended to body; Shadow DOM to isolate from Instagram CSS; text updated ≤1/s |
| FatigueManager | On `visibilitychange`/`pagehide` → record `hiddenAt` and pause Clock. On return → `delta = now - hiddenAt`; if `delta > 5min` → `Clock.reset()` + `PhaseMachine → 0` + `DegradationEngine.revertAll()`. Wall-clock only, no timers | Event listeners + one timestamp; no interval |
| Bootstrap | IIFE entry: DOM-readiness wait, CONFIG load, module wiring, global `try/catch` containment so Instagram is never broken by engine failure | IIFE body; each module init wrapped |

## Recommended Project Structure

```
SlowGram/
├── src/
│   ├── slowgram.js            # single bundled IIFE (the only artifact injected)
│   ├── modules/               # source modules, concatenated in order by build.js
│   │   ├── config.js          # CONFIG: phases, selectors, routes, params
│   │   ├── clock.js           # SessionClock
│   │   ├── phase-machine.js   # PhaseMachine
│   │   ├── detector.js        # ContextDetector + RouteGuard
│   │   ├── watcher.js         # DomWatcher (MutationObserver)
│   │   ├── video-registry.js  # VideoRegistry
│   │   ├── applicators/       # one file per lever
│   │   │   ├── filter.js
│   │   │   ├── playback.js
│   │   │   ├── volume.js
│   │   │   ├── autoplay.js
│   │   │   └── buffer.js
│   │   ├── engine.js          # DegradationEngine hub
│   │   ├── overlay.js         # neutral counter overlay
│   │   ├── fatigue.js         # FatigueManager
│   │   └── bootstrap.js       # init + error containment
│   ├── build.js               # zero-dependency concatenation (no bundler)
│   └── tests/
│       ├── dom-mocks/         # mock DOM of Instagram selectors (roles, video, pathname)
│       ├── unit/              # clock, phase-machine, detector, applicators
│       └── demo/
│           └── demo.html      # demo page harness for manual/visual validation
```

### Structure Rationale

- **modules/ separated but zero-dep:** the artifact must be a single IIFE with no imports, so source lives as ordered modules and `build.js` does trivial concatenation into `slowgram.js`. No npm, no bundler — matches the "vanilla, zero dependencies, injectable" constraint.
- **applicators/ one file per lever:** each degradation technique has different platform constraints (volume vs muted autoplay, playbackRate clamping, CSS filter cost). Isolating them lets the test harness validate each lever independently and lets a lever be disabled without touching the rest.
- **CONFIG as a pure data module first:** every other module reads thresholds/selectors from it. The 4-phase timeline, selector table, and preserved routes are the highest-churn items (Instagram DOM drift) — centralizing them means a selector fix is one-line.
- **tests/dom-mocks before demo:** the milestone requires deterministic validation of degradation, which needs a mock of Instagram's selectors (roles, `<video>`, pathnames) that the unit tests and demo page both consume.

## Architectural Patterns

### Pattern 1: Event-Bus State Spine (Clock → PhaseMachine → Engine)

**What:** Time flows one direction: Clock accumulates elapsedMs; PhaseMachine derives phase; DegradationEngine reacts. Downstream modules never read DOM or timers — they consume the phase/elapsed signals only.
**When to use:** When many independent effects (5 applicators + overlay + fatigue) must stay coherent off a single timeline.
**Trade-offs:** Adds a thin event layer; pays off in testability (clock and machine are pure and unit-testable with fake time) and in guaranteed coherence (one source of truth for phase, so applicators can never disagree).

**Example:**
```javascript
// clock.js — never trusts setInterval accuracy
function tick(now) {
  if (state.running) {           // running = context===REELS && visible
    state.elapsedMs += now - state.lastTick;
  }
  state.lastTick = now;
  if (phaseChanged) emit("phasechange", phase);
}
// engine.js — subscriber
on("phasechange", (phase) => {
  registry.forEach((v) => applicatorsFor(phase).forEach((a) => a.apply(phase, v)));
});
```

### Pattern 2: WeakMap State with Element-Lifecycle Reset (VideoRegistry)

**What:** Per-video degradation state (original volume, playbackRate, whether we paused it) lives in a `WeakMap` keyed by the element; every per-element state is discarded on `loadstart`/`emptied` because Instagram's virtualized feed recycles video nodes across different reels.
**When to use:** Any DOM-observation system where the framework recycles nodes.
**Trade-offs:** WeakMap prevents leaks when React unmounts videos; the cost is that state must be re-applied on every `loadstart` (apply-after-load hook), which is mandatory anyway since `playbackRate` resets to 1.0 on a new source.

**Example:**
```javascript
function register(video) {
  const st = registry.get(video) || (registry.set(video, {}), registry.get(video));
  video.addEventListener("loadstart", () => {
    st.applied = {};            // forget prior degradation; source changed
    engine.applyTo(video);      // re-apply current phase to the new source
  });
}
```

### Pattern 3: Applicator Interface (idempotent apply/revert)

**What:** Every degradation lever implements `{ key, apply(phase, video), revert(video) }`; `apply` is idempotent (same phase → no-op) and `revert` restores the original values captured on first touch. The engine never knows the details of any lever.
**When to use:** When you have a growing family of effects with different platform constraints that must be uniformly applied, skipped, or undone.
**Trade-offs:** Slight indirection; huge win for the fatigue-reset (one `revertAll()` call) and for disabling a lever in the field.

```javascript
// volume.js — MUST NOT touch video.muted (WebKit pauses playback on programmatic unmute)
const volume = {
  key: "volume",
  apply(phase, v) {
    if (!v.__ecoOrig) v.__ecoOrig = v.volume;
    v.volume = Math.max(0, v.__ecoOrig * CONFIG.phases[phase].volumeFactor);
  },
  revert(v) { if (v.__ecoOrig) { v.volume = v.__ecoOrig; delete v.__ecoOrig; } },
};
```

### Pattern 4: Guarded MutationObserver (feedback-loop containment)

**What:** The observer watches `document.body`, but the engine also mutates the DOM (overlay host, style attributes on videos). Every mutation callback checks that the mutation's target is not inside the engine's own overlay host and that attribute mutations are the ones the engine intends; self-mutations are short-circuited with a mutating flag.
**When to use:** Any MutationObserver that coexists with its own DOM writes.
**Trade-offs:** Slightly defensive code; without it, the engine's own filter/style writes retrigger the observer in an infinite loop (verified pitfall in the research).

```javascript
function onMutations(list) {
  if (mutating) return;                       // we caused these; ignore
  const nodes = [];
  for (const m of list) {
    if (m.type === "childList") {
      for (const n of m.addedNodes) {
        if (n.nodeType === 1 && !n.closest(OVERLAY_SELECTOR)) nodes.push(n);
      }
    }
  }
  rAF(() => process(nodes));                  // batch to one pass per frame
}
```

## Data Flow

### Request Flow (signal path)

```
Instagram DOM mutation (React adds video / role change)
    ↓
DomWatcher (MutationObserver, rAF-batched, self-mutation-filtered)
    ├─ addedNodes containing <video> ──────────▶ VideoRegistry.register(video)
    └─ role/attribute signals ────────────────▶ ContextDetector.refreshContext()
location pathname change (SPA navigation) ───▶ ContextDetector.refreshContext()
    ↓
ContextDetector → context: REELS | SOCIAL | UNKNOWN   (RouteGuard wins on preserved routes)
    ↓
SessionClock: running = (context === REELS && visible); elapsedMs += ΔDate.now()
    ↓
PhaseMachine: elapsedMs → phase 0..3  (emit phasechange on transition only)
    ↓
DegradationEngine: for each registered video → Applicators[phase].apply(phase, video)
    ↓
video element state mutated (filter style, playbackRate, volume, pause, buffer spinner)
```

### State Management

```
CONFIG ──▶ SessionClock ──▶ PhaseMachine ──▶ DegradationEngine ──▶ video elements
                │                │                │
                ▼                ▼                │
             Overlay        (phasechange)    (apply/revert)
                │                               │
                └──────────── FatigueManager ◀──┘
        (visibilitychange → hiddenAt; delta > 5min → reset all three)
```

### Key Data Flows

1. **Phase progression:** Clock accumulates only reels-eligible visible time → PhaseMachine transitions 0→1→2→3 at the CONFIG thresholds (0–3/3–7/7–12/15+ min) → Engine applies the phase's degradation matrix to every registered video.
2. **Context switch to SOCIAL:** RouteGuard matches `/direct/`, `/messages`, profile, or search pathname → Clock pauses (reels time stops counting) → Engine reverts all degradation to identity → Overlay hides. Social routes are never degraded — this is fail-safe by construction (pathname checked first, "never degrade" default for UNKNOWN).
3. **Fatigue reset:** `visibilitychange` → hidden: record `hiddenAt`, stop Clock. → visible: `delta = now - hiddenAt`; if `delta > 5min` → reset elapsedMs to 0, force phase 0, revert all videos, hide overlay until next reels context.
4. **Video recycling:** React reuses a `<video>` node → `loadstart` fires → VideoRegistry clears applied state → Engine re-applies current phase (fresh playbackRate, volume cap, etc.) so degradation persists across reel changes without stale state.

## Scaling Considerations

| Scale (DOM complexity) | Architecture Adjustments |
|------------------------|--------------------------|
| Small demo harness (1–5 videos, no scroll) | Full engine; every component active; simplest validation target |
| Real Instagram feed (10+ videos, infinite scroll, virtualization, rapid mutations) | rAF batching + record filtering mandatory; only degrade videos the phase says; WeakMap prevents leaks; per-element lifecycle reset handles recycling |
| Heavy session (15+ min, hundreds of reel swaps, both engines WebKit/Chromium) | DegradationEngine must be O(active videos), not O(all videos ever); overlay updates ≤1/s; no per-tick DOM scans — all event-driven |

### Scaling Priorities

1. **First bottleneck: MutationObserver callback volume.** A fast-scrolling Reels feed mutates constantly. Fix: rAF coalescing, filter to `childList` addedNodes only, ignore attribute mutations we caused, and skip nodes inside the overlay host. Verified via MDN: observers deliver batched microtask records; the cost is in the callback, not the observer.
2. **Second bottleneck: per-video state re-application on recycling.** Every reel swap fires `loadstart`; if re-application is O(1) per video (read CONFIG matrix, write 3–4 properties) it stays negligible even at hundreds of swaps. Avoid any DOM query inside the hot path — iterate the WeakMap, don't re-query selectors.

## Anti-Patterns

### Anti-Pattern 1: Using setInterval as the session-time source of truth

**What people do:** `setInterval(() => elapsed++, 1000)`.
**Why it's wrong:** Background tabs throttle timers aggressively (Chrome ~10s, Firefox 30s budget-based; verified MDN) and WKWebView may suspend JS entirely when backgrounded. The clock drifts and the phase timeline becomes wrong — and worse, a heavily-throttled timer can make a session look shorter than reality, defeating the anti-addiction purpose.
**Do this instead:** Wall-clock deltas at event boundaries (`Date.now()` on visibilitychange/contextchange/tick), recomputed against the actual elapsed real time.

### Anti-Pattern 2: Toggling `video.muted` programmatically to degrade volume

**What people do:** `video.muted = true` (or unmute) to control audio.
**Why it's wrong:** Verified WebKit policy (iOS 10+): if a video gains an audio track or is unmuted without a user gesture, **playback pauses**. Unmuting user reels could kill playback entirely; muting removes the audio lever we want to preserve for unmuted sessions.
**Do this instead:** Operate on `video.volume` only. Instagram reels autoplay muted by default (standard practice per Chrome's autoplay doc); the volume lever matters when the user has unmuted via gesture.

### Anti-Pattern 3: Querying/relying on Instagram's obfuscated CSS classes

**What people do:** `.x1n2onr6`-style selectors from DevTools inspection.
**Why it's wrong:** React obfuscated class names change on every deploy; the script silently stops detecting reels (and could theoretically mis-target social surfaces). Project constraint: role/attribute selectors only.
**Do this instead:** `[role=...]`, `aria-label`/attribute selectors, `<video>` presence, and `location.pathname` — all centralized in CONFIG so a drift fix is a one-line change.

### Anti-Pattern 4: Observer feedback loop (self-mutations retriggering the observer)

**What people do:** Watch `document.body`, then set `video.style.filter`, which the observer reports back → apply again → loop.
**Why it's wrong:** Infinite CPU burn on the user's device — the exact thing a high-performance constraint forbids.
**Do this instead:** `mutating` flag around self-writes + filter mutations whose target is inside the overlay host; only act on `childList` addedNodes of real Instagram content.

### Anti-Pattern 5: Degrading by pausing everything / blocking scroll / guilt copy

**What people do:** pause all videos aggressively at phase 3, or freeze scroll, or overlay "STOP SCROLLING!" text.
**Why it's wrong:** Scroll must stay 100% native (project constraint); aggressive pause bleeds into social UX; guilt copy violates the "neutral, non-judgmental counter" requirement and is explicitly out of scope.
**Do this instead:** Degrade via desinteresse (saturation, rate, volume, occasional simulated buffer); pause only the loop-restart of reels at phase 3; counter copy stays neutral ("tempo de sessão: 12:34").

### Anti-Pattern 6: Heavy CSS filters on large containers

**What people do:** `filter: blur(5px)` on the whole feed container to "degrade".
**Why it's wrong:** `blur()` is GPU-expensive and filtering a large ancestor forces recompositing of the whole page (memory pressure on low-end devices, known WebKit/Chromium video-filter quirks).
**Do this instead:** Cheap per-pixel ops (`saturate`, `contrast`, `brightness`) applied to the video element itself or a small wrapper, with a `will-change` hint; never `blur`, never filter big ancestors.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Instagram web DOM | Read-only observation: `MutationObserver` on `document.body`; `[role]`/attribute selectors; `<video>` elements; `location.pathname` | Never write to Instagram's tree except style/volume/rate/pause on detected videos — all revertible; role/attribute selectors only (project constraint); selector drift expected → central CONFIG |
| Native container (WKWebView/WebView) | None in v1 — the engine is injected as a single script and is fully self-contained | Container-level knobs (e.g. `mediaTypesRequiringUserActionForPlayback` on WKWebView) are out of scope but documented as the container's lever over autoplay strictness |
| Overlay host | Appended to `document.body` inside the engine's own subtree | Must be excluded from observer processing; Shadow DOM isolates styles; `pointer-events:none`, max z-index |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| CONFIG → all modules | Direct import (concatenated scope) | No module mutates CONFIG; single frozen object |
| SessionClock → PhaseMachine | `elapsedMs` read + `phasechange` event | Pure derivation; machine never touches DOM |
| PhaseMachine → DegradationEngine | `phasechange` event + phase object | Engine is the only writer to video elements |
| DomWatcher → VideoRegistry | `register(video)` on addedNodes | Registry owns per-element lifecycle (loadstart reset) |
| DomWatcher → ContextDetector | `signal(role/attr)` + pathname events | Detector is the only authority on context |
| ContextDetector → SessionClock | `contextchange` (REELS/SOCIAL/UNKNOWN) | Clock runs only on REELS+visible |
| VideoRegistry ↔ DegradationEngine | `apply(phase, video)` / `revert(video)` | Applicators get the element, never query the DOM |
| FatigueManager → Clock/PhaseMachine/Engine | `reset()` command | One-way; fatigue never reads phase |
| Overlay ← SessionClock | `elapsed` snapshot (≤1/s) | Overlay renders only; never influences state |

## Build Order (dependency-driven)

Everything below is **NEW** (greenfield — no existing code). Order respects the DAG: spine first, signal path second, effects third, leaves and wiring last, harness scaffolded before it is needed for validation.

1. **CONFIG + module skeleton + build.js** — no deps; every other module reads CONFIG. Establishes the 4-phase timeline (0–3/3–7/7–12/15+), parameter table, selector table, preserved routes. *Avoids: selector drift scattered across files (Anti-Pattern 3).*
2. **SessionClock + PhaseMachine** — deps: CONFIG. Pure, unit-testable with fake time; establishes the state spine and the phase thresholds. *Avoids: setInterval timekeeping (Anti-Pattern 1).*
3. **ContextDetector + RouteGuard** — deps: CONFIG. Pathname-based SOCIAL detection is pure logic and testable with mocked `location`; SOCIAL/UNKNOWN must be correct before any degradation exists. *Avoids: degrading social routes (project constraint).*
4. **tests/dom-mocks + demo.html scaffold** — deps: CONFIG selectors. Build the Instagram DOM mock (roles, video elements, pathnames) now so every later component is validated against it. *Needed by: Watcher, VideoRegistry, all applicators.*
5. **DomWatcher + VideoRegistry** — deps: CONFIG, Detector, mocks. MutationObserver with rAF batching, self-mutation filter, element lifecycle reset. *Avoids: feedback loops (Anti-Pattern 4) and stale recycled-video state.*
6. **Applicators in dependency-cheap order: Filter → Playback → Volume → Autoplay → Buffer** — deps: CONFIG, VideoRegistry, mocks. Each lever validated independently: Filter is pure CSS (cheapest, no media API); Playback (playbackRate 1.0–1.5, conservative per MDN clamping); Volume (`volume` only, never `muted` — WebKit pause risk); Autoplay (pause-on-loop-end at phase 3); Buffer (pause + spinner + resume, needs care against fighting Instagram's own loading states). *Avoids: muted-toggle playback kill (Anti-Pattern 2), filter cost (Anti-Pattern 6).*
7. **DegradationEngine hub** — deps: PhaseMachine, VideoRegistry, applicators. Wires phase → applicability matrix; `revertAll()` for reset.
8. **Overlay** — deps: CONFIG, Clock. Neutral counter, pointer-events none, Shadow DOM, hidden on SOCIAL.
9. **FatigueManager** — deps: Clock, PhaseMachine, Engine. visibilitychange/pagehide hiddenAt; delta > 5 min → reset. *Depends on everything it resets — must come after revertAll exists.*
10. **Bootstrap + full integration + device validation** — wires all modules, error containment; then real-device validation of visibility semantics (iOS version variance = MEDIUM-confidence area from research).

**Why this order:** CONFIG→Clock→PhaseMachine gives a testable spine before any DOM code exists; Detector+mocks before Watcher ensures SOCIAL safety is verified first; applicators after the registry so they never own lifecycle; FatigueManager last because it resets every module it depends on; Bootstrap last because it wires complete modules. Parallelizable lanes: mocks/demo (4) can start alongside 2–3; applicators (6) can be split across parallel workstreams once VideoRegistry (5) lands.

## Sources

- MDN — Autoplay guide for media and Web Audio APIs (verified 2026-08-15; muted autoplay allowed, gesture needed for sound, play() Promise/NotAllowedError) — HIGH
- WebKit blog — "New `<video>` Policies for iOS" (Jer Noble, 2016; still the operative WebKit policy: muted/no-audio autoplay allowed, unmute-without-gesture pauses, playsinline required, offscreen autoplay pauses) — HIGH
- Chrome for Developers — "Autoplay policy in Chrome" (muted autoplay always allowed; sound requires interaction/MEI) — HIGH
- MDN — HTMLMediaElement.playbackRate (negative rates unsupported WebKit/Blink; engines mute audio outside useful range ~0.25–4.0; resets on source change; preservesPitch) — HIGH
- MDN — Page Visibility API (visibilitychange, throttling of timers/rAF in background, wall-clock deltas) — HIGH
- MDN — MutationObserver (batched microtask records, disconnect/takeRecords, observe options) — HIGH
- MDN — Media buffering, seeking, and time ranges + HTMLMediaElement.buffered (TimeRanges, progress event — basis for simulated-buffer lever) — HIGH
- MDN — HTMLMediaElement.volume/muted (programmatic control works; WebKit pause-on-unmute constraint from WebKit blog) — HIGH
- Instagram web DOM structure specifics (role/attr stability, virtualization/recycling): **LOW-MEDIUM** — not verified against a live Instagram DOM this session; selectors and recycling behavior must be validated with the dom-mocks harness and real device during build

---
*Architecture research for: SlowGram v1.0 Motor Anti-Vício (degradation engine for Instagram web in WKWebView/WebView)*
*Researched: 2026-08-15*