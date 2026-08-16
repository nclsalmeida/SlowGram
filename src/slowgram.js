/**
 * SlowGram — anti-addiction engine (v1.0, Phase 1: Motor Core & Lifecycle)
 *
 * Wave 1 tracer: engine IIFE skeleton + DI seam + SessionClock accumulation.
 * Wave 2: full deep-frozen CONFIG single object (CORE-05) + pure PhaseMachine
 * (CORE-02) with transition-guarded 'phasechange' emission.
 * Wave 3: FatigueManager (CORE-03) — hiddenAt recorded on hidden, wall-clock
 * catch-up delta on resume signals, strict > CONFIG.fatigueWindowMs reset with
 * observable 'reset' event, gap discount for unverifiable background time.
 * Wave 4: DI seam hardening (CORE-04) — resolveEnv validates every PROVIDED
 * override (descriptive Errors on malformed deps, never silent substitution),
 * init() is idempotent (internal destroy-then-reinit, no duplicated
 * listeners), destroy() removes all four listeners, sets state.destroyed, and
 * resets state to fresh pre-init values so a subsequent init() re-initializes
 * cleanly — while PRESERVING registered subscribers across re-init.
 * Wave 5 (Phase 2 tracer, 02-01): detection spine — classifyPathname
 * (D-02/D-04/D-05 decision table, pathname authoritative via the
 * env.window.location seam), ContextDetector on init, DomWatcher connecting
 * one MutationObserver to the [role="main"] feed root while REELS (D-11/D-12),
 * VideoRegistry (WeakMap, DETC-05), SelectorRegistry missStreak accounting
 * (D-09), and a per-rAF-batch takeRecords() drain — zero timers, zero DOM
 * queries inside the mutation callback, zero class-based selectors (DETC-06).
*  A single strict-mode IIFE exposing one global handle (`SlowGram`). All
 *  external capabilities (clock, document, window, MutationObserver,
 *  requestAnimationFrame) are resolved through the injected `env` object —
 *  the engine body never references bare globals outside `resolveEnv`.
 *  Wave 6 (Phase 2, 02-02): the full ContextDetector + RouteGuard contracts —
 *  refresh(source) over the D-13 sources (pathname events, role/attr
 *  mutations, rAF batch), the never-upgrade DOM-refine gate (D-02
 *  refineFromDOM), and the D-06 RouteGuard interception (pushState/
 *  replaceState wrapping + popstate/hashchange listeners + the rAF pathname
 *  re-check fallback) with destroy()-restore hygiene.
 *  Wave 7 (Phase 2, 02-03): the full DomWatcher + VideoRegistry contracts —
 *  two-root observer set ([role="main"] + [role="dialog"] containing a video,
 *  D-11/D-03), rAF-batched takeRecords() draining (D-09), the D-14
 *  self-mutation filter (mutating flag + overlay-host subtree exclusion),
 *  connect-on-REELS-only / disconnect-on-SOCIAL/UNKNOWN lifecycle (DETC-08/
 *  D-12) with reconnect re-sync (D-07), and the WeakMap VideoRegistry with
 *  loadstart/emptied per-video lifecycle reset (DETC-05, Pitfall 5).
 *  Wave 8 (Phase 2, 02-04): the full SelectorRegistry health contract —
 *  drift-declared / drift-recovered 'selectorHealth' bus events + the
 *  getSelectorHealth() handle (D-10), the D-08 dev/prod split (fail-loud
 *  console.warn in dev via _setDevMode; fail-soft prod via the bounded
 *  document-scoped <video> fallbackScope() on /reels/ only), drift declared
 *  at exactly CONFIG.health.driftThreshold zero-hit scans per rAF batch
 *  (D-09, no timer), and the per-batch health scan running on REELS even
 *  when the anchor is missing (no observer — the drift path stays loud).
 *  Wave 9 (Phase 3, 03-01): the DegradationEngine tracer — the hub routes
 *  state.phase → CONFIG.degradationMatrix → applicator map with a per-video
 *  reconcile (apply levers in the matrix, revert levers out of it — so
 *  phase 0/fatigue reset reverts automatically), the saturation applicator
 *  implementing the D-15 ancestor-wrapper gate (static, non-transformed
 *  ancestor — never the video itself, never BODY/HTML, plain functions,
 *  static values), revertAll() (LEVR-07) restoring native on SOCIAL/UNKNOWN
 *  and reset, apply-after-load on loadstart (Pattern 2), register-time
 *  apply, and a pruned registryElements[] live list (WeakMap is
 *  non-iterable) for applyAll/revertAll iteration (D-18). Lever values live
 *  only in CONFIG.leverParams (CORE-05).
 *  Wave 10 (Phase 3, 03-03): the Autoplay lever (LEVR-04 — loop-removal at
 *  phase 3 via removeAttribute, NEVER loop="false", origHadLoop restore on
 *  revert) and the pause-on-ended stop point (onEnded gated on
 *  appliedLevers.autoplay), plus the flagged Buffer capstone (LEVR-05 —
 *  CONFIG.buffer.enabled default false, frame-counted sub-200ms stall on
 *  the rAF carrier, no timers; standalone applicator-shaped helper driven
 *  from onEnded, never matrix-driven; revertAll cancels pending stalls).
 *
 *  Security posture (threat model T-01-01..03):
 *  - `init()` and every event-handler body are try/catch contained so an
 *    engine failure never propagates into the host page's global scope.
 *  - Single `SlowGram` handle; everything else closure-private; 'use strict'.
 *  - CONFIG is deep-frozen recursively at init time (WeakSet cycle guard).
 *  - No timer scheduling APIs anywhere; time is read only via env.clock.now().
 */
(function (global) {
  'use strict';

  var SlowGram = {};
  var CONFIG = null;              // deep-frozen in initConfig() at init time
  var env = null;                 // resolved DI seam
  var initialized = false;        // init() idempotence guard (T-01-13)
  var listeners = {};             // event name -> subscriber callbacks
  var lifecycleHandlers = [];     // bound lifecycle listeners (removed by destroy())

  var state = {
    elapsedMs: 0,
    phase: 0,
    context: 'UNKNOWN',           // fail-safe default — clock stays paused
    visible: true,
    hiddenAt: null,
    lastBoundary: 0,
    running: false,
    destroyed: false              // set by destroy() — pollLoop consults it
  };

  // Phase 2 detection-spine module state (closure-private):
  var watcher = { observer: null, connected: false };   // DomWatcher (D-12 connect-on-REELS-only)
  var mutating = false;         // D-14 self-mutation flag — set around engine DOM writes (Pitfall 4)
  var overlayHost = null;       // D-14 overlay-host subtree exclusion seam (Phase 4 fills it)
  var videoStates = new WeakMap();                      // VideoRegistry (DETC-05, RESEARCH.md Pattern 3)
  var registryCount = 0;         // registry size fallback (WeakMap.prototype.size is non-standard on some hosts)
  var health = { missStreak: 0, drifted: false };       // SelectorRegistry (D-09/D-10)
  var pendingBatch = [];       // Phase 5 HARN-01 (D-2/D-4) — processBatch overflow queue (yield-at-cap: overflow retained for the next frame)
  var lastFrameProcessed = 0;  // Phase 5 HARN-01 — records fed to batchCallback last frame (_batchState handle)
  var killSwitchEnabled = true; // Phase 5 HARN-05 (D-12) — module latch, read from CONFIG once per init; _setKillSwitchForTest flips it
  var dev = false;           // D-08 fail-loud mode — default prod (fail-soft); _setDevMode toggles
  var bufferEnabled = false; // LEVR-05/D-27 — the flagged Buffer capstone: OFF unless _setBufferEnabled flips it (default prod never stalls)
  var applicators = {};      // Phase 3 lever map — key (matches CONFIG.degradationMatrix) -> {apply, revert} (LEVR-06)
  var registryElements = []; // D-18 live-element list for applyAll/revertAll iteration (WeakMap is non-iterable); pruned on batch removedNodes
  var overlayHostEl = null;  // Phase 4 (D-12) — the created overlay host node (null until first phase >= 1 on REELS)
  var overlayCreated = false; // Phase 4 (D-12) — lazy-creation latch, reset by teardown (D-16 single-instance)
  var overlayText = null;    // Phase 4 (D-5/D-6) — the counter text node ('N min'), created with the host
  var overlayLastMinutes = -1; // Phase 4 value-throttle latch (OVER-01 ≤1/s) — re-render only when floored minutes change
  var lastPathname = null;   // D-13 rAF-batch diff base — written by refresh(), reset by teardown()
  var routeGuard = { bound: false, h: null, origPush: null, origReplace: null };  // D-06 interception state

  /**
   * phaseFor — the pure PhaseMachine core (CORE-02): maps any elapsedMs to
   * phase 0..3, driven ONLY by CONFIG.phaseBoundariesMin (frozen). Total over
   * [0, Infinity): elapsedMs < 0 → 0 (defensive totality). Boundaries are
   * converted to integer milliseconds ONCE via the 60000 ms-per-minute
   * constant (integer multiply — no float division, no rounding, FA-04) and
   * compared with exact `elapsedMs >= boundaryMs` — exactly at a boundary
   * returns the NEXT phase (FA-03); one ms below returns the previous. No
   * 3/7/12 literals in this body — the array is the single source of truth.
   */
  function phaseFor(elapsedMs) {
    if (elapsedMs < 0) { return 0; }
    var phase = 0;
    var boundaries = CONFIG.phaseBoundariesMin;
    for (var i = 0; i < boundaries.length; i++) {
      if (elapsedMs >= boundaries[i] * 60000) { phase = i + 1; }
    }
    return phase;
  }

  /**
   * syncPhase — transition-guarded phase emitter. Computes phaseFor(elapsedMs);
   * emits 'phasechange' with the new phase ONLY when it differs from
   * state.phase — a no-op sync emits nothing (RESEARCH.md:294 anti-pattern:
   * emitting on every sync would re-apply levers per frame, T-01-06). The 0
   * boundary is handled identically to any other value so Plan 03's
   * resetSession() → sync(0) emits phasechange 0 when coming from a higher
   * phase.
   */
  function syncPhase(elapsedMs) {
    var next = phaseFor(elapsedMs);
    if (next !== state.phase) {
      state.phase = next;
      emit('phasechange', next);
      applyAll();      // D-16: on every real transition, reconcile levers against the new matrix
      overlaySync();   // Phase 4 (D-12): create+fade in the counter at first phase >= 1 (after the emit — the overlay is a bus consumer)
    }
  }

  var phaseMachine = {
    sync: syncPhase
  };

  /**
   * currentPathname — the seam source (D-02, key_links): env.window.location
   * .pathname is the ONLY pathname source — never window.location.href.
   * Fail-safe '/' when the window seam is absent (classifies UNKNOWN).
   */
  function currentPathname() {
    return (env && env.window && env.window.location) ? env.window.location.pathname : '/';
  }

  /**
   * classifyPathname — the pure decision table (02-RESEARCH.md Pattern 1,
   * D-04/D-05, all literals from CONFIG):
   *   1. REELS (D-02 authoritative): exactly /reels/ or /reels/<id>.
   *   2. SOCIAL: preserved prefixes (/direct/, /messages/, /p/, /explore/,
   *      /accounts/, /stories/) exactly or with a sub-path.
   *   3. SOCIAL (profile guard, D-05): single-segment /<username>/ whose
   *      segment is not a route keyword — profiles preserved, no allowlist.
   *   4. UNKNOWN (fail-safe, DETC-03): everything else (/, /<u>/reels/,
   *      /reel/<id>/...) — never degrades, never connects the observer.
   */
  function classifyPathname(pathname) {
    // NOTE: CONFIG prefixes carry a trailing slash ('/reels/', '/p/'), so the
    // prefix match is `indexOf(prefix) === 0` — appending '/' would produce a
    // double slash ('/reels//') and miss /reels/<id> and /p/<id>.
    if (pathname === CONFIG.reelsPrefix || pathname.indexOf(CONFIG.reelsPrefix) === 0) {
      return 'REELS';
    }
    for (var i = 0; i < CONFIG.preservedRoutes.length; i++) {
      var p = CONFIG.preservedRoutes[i];
      if (pathname === p || pathname.indexOf(p) === 0) { return 'SOCIAL'; }
    }
    var segs = pathname.split('/').filter(Boolean);      // ''-safe, ignores leading/trailing '/'
    if (segs.length === 1 && CONFIG.routeKeywords.indexOf(segs[0]) === -1) {
      return 'SOCIAL';                                    // /<username>/ — profile preserved (D-05)
    }
    return 'UNKNOWN';                                     // fail-safe (DETC-03)
  }

  /**
   * refresh — ContextDetector.refresh (D-13 full contract). Reclassifies
   * currentPathname() through the single decision table (classifyPathname —
   * no duplicated matching logic) and pushes the verdict through the
   * setContext bus (change-guarded, clock-gated). `source` is one of
   * 'pathname' | 'mutation' | 'batch' | 'route' — the argument exists to
   * keep call sites explicit and testable, and is logged nowhere (no
   * external logging, per contract). The mutation source applies the
   * never-upgrade guard (D-02, Anti-Pattern RESEARCH.md:294): a DOM signal
   * may only CONFIRM a pathname-authoritative REELS verdict — it can never
   * upgrade a non-reels pathname, because refineFromDOM() returns null
   * unless the pathname itself classifies REELS.
   */
  function refresh(source) {
    var verdict = classifyPathname(currentPathname());
    if (source === 'mutation') {
      var refined = refineFromDOM();
      if (refined !== null) { verdict = refined; }   // 'REELS' only when the pathname is REELS
    }
    lastPathname = currentPathname();
    SlowGram.setContext(verdict);
  }

  /**
   * refineFromDOM — the DOM-refine GATE (D-13 tail + D-02 never-upgrade).
   * Returns 'REELS' ONLY when the pathname itself classifies REELS, else
   * null. The empty-reels-tab edge is ACCEPTED by design (D-02): a /reels/
   * pathname with zero videos stays REELS, so no DOM query is needed — the
   * anti-upgrade rule is the load-bearing behavior (a video on /someuser/
   * never upgrades; RESEARCH.md:294).
   */
  function refineFromDOM() {
    return (classifyPathname(currentPathname()) === 'REELS') ? 'REELS' : null;
  }

  /**
   * detectContext — the init-time classification entry (source 'pathname').
   * RouteGuard and DomWatcher delegate through refresh(); no duplicated
   * matching logic (02-02 plan key_link).
   */
  function detectContext() {
    refresh('pathname');
  }

  /**
   * resolveEnv — the DI seam. Every external capability is resolved here;
   * defaults fall back to real globals when present, else null. The engine
   * body NEVER references bare Date.now()/document/window/MutationObserver/
   * requestAnimationFrame outside this function.
   *
   * Env-shape validation (T-01-12, Security Domain V5): every PROVIDED
   * override is validated before resolution — a malformed dependency throws a
   * descriptive Error instead of silently substituting (mock-vs-live
   * divergence is the forbidden failure, CORE-04). Explicit `null` is a
   * deliberate opt-out (fail-safe) and is accepted. Omitted keys default
   * from globals exactly as in Plan 01 — the default path is unchanged.
   */
  function resolveEnv(overrides) {
    // Validate each PROVIDED override. A key is "provided" when it exists in
    // the overrides object with a non-undefined value.
    if ('clock' in overrides && overrides.clock !== undefined &&
        (overrides.clock === null || typeof overrides.clock !== 'object' || typeof overrides.clock.now !== 'function')) {
      throw new Error('SlowGram: env.clock must provide now()');
    }
    if ('document' in overrides && overrides.document !== undefined &&
        overrides.document !== null &&
        (typeof overrides.document !== 'object' || typeof overrides.document.addEventListener !== 'function')) {
      throw new Error('SlowGram: env.document must be null or provide addEventListener()');
    }
    if ('window' in overrides && overrides.window !== undefined &&
        overrides.window !== null &&
        (typeof overrides.window !== 'object' || typeof overrides.window.addEventListener !== 'function')) {
      throw new Error('SlowGram: env.window must be null or provide addEventListener()');
    }
    if ('MutationObserver' in overrides && overrides.MutationObserver !== undefined &&
        overrides.MutationObserver !== null && typeof overrides.MutationObserver !== 'function') {
      throw new Error('SlowGram: env.MutationObserver must be null or a constructor');
    }
    if ('requestAnimationFrame' in overrides && overrides.requestAnimationFrame !== undefined &&
        overrides.requestAnimationFrame !== null && typeof overrides.requestAnimationFrame !== 'function') {
      throw new Error('SlowGram: env.requestAnimationFrame must be null or a function');
    }
    // D-21 platform seam: the clamp-table key (LEVR-08). Explicit null = sniff;
    // a provided value must be one of the two engines (descriptive Error).
    if ('platform' in overrides && overrides.platform !== undefined && overrides.platform !== null &&
        (typeof overrides.platform !== 'string' ||
         (overrides.platform !== 'webkit' && overrides.platform !== 'chromium'))) {
      throw new Error('SlowGram: env.platform must be null, undefined, "webkit", or "chromium"');
    }
    return {
      clock: ('clock' in overrides && overrides.clock !== undefined)
        ? overrides.clock
        : { now: function () { return Date.now(); } },
      document: ('document' in overrides && overrides.document !== undefined)
        ? overrides.document
        : (typeof document !== 'undefined' ? document : null),
      window: ('window' in overrides && overrides.window !== undefined)
        ? overrides.window
        : (typeof window !== 'undefined' ? window : null),
      MutationObserver: ('MutationObserver' in overrides && overrides.MutationObserver !== undefined)
        ? overrides.MutationObserver
        : (typeof MutationObserver !== 'undefined' ? MutationObserver : null),
      requestAnimationFrame: ('requestAnimationFrame' in overrides && overrides.requestAnimationFrame !== undefined)
        ? overrides.requestAnimationFrame
        : (typeof requestAnimationFrame !== 'undefined'
          ? (typeof window !== 'undefined' ? requestAnimationFrame.bind(window) : requestAnimationFrame)
          : null),
      visibilityState: function () {
        return env.document ? env.document.visibilityState : 'visible';
      },
      platform: ('platform' in overrides && overrides.platform !== undefined)
        ? overrides.platform
        : (typeof navigator !== 'undefined' && navigator.userAgent)
            ? (navigator.userAgent.indexOf('Chrome') !== -1 ? 'chromium'
               : navigator.userAgent.indexOf('Safari') !== -1 ? 'webkit' : 'chromium')
            : 'chromium'
    };
  }

  /**
   * initConfig — builds the single deep-frozen CONFIG constants object
   * (CORE-05). ALL phase constants, the per-phase degradation matrix, the
   * selector registry, the preserved social routes, and the fatigue window
   * live here and nowhere else — magic numbers are banned elsewhere in the
   * engine. Recursive deepFreeze (WeakSet cycle guard) + the IIFE's
   * 'use strict' convert any accidental write into a loud TypeError.
   * Values are LOCKED (RESEARCH.md FA-03/FA-07): [3,7,12] min boundaries,
   * 5-min fatigue window, 15-min segment cap. degradationMatrix/selectors/
   * preservedRoutes are consumed by later phases; storing them here from
   * day one is what keeps CORE-05's single-object intent.
   */
  function initConfig() {
    var config = {
      phaseBoundariesMin: [3, 7, 12],          // phase 0: <3m, 1: 3-7m, 2: 7-12m, 3: >=12m
      fatigueWindowMs: 300000,                 // 5 min — strict > comparison lands in Plan 03
      segmentCapMs: 900000,                    // 15 min per accumulation segment (tick consumes)
      degradationMatrix: {                     // per-phase lever applicability — Phase 3 consumes
        '0': [],
        '1': ['saturation'],
        '2': ['saturation', 'playbackRate'],
        '3': ['saturation', 'playbackRate', 'volume', 'autoplay']
      },
      selectors: {                             // DETC-06 registry — the ONLY selectors the engine may query
        video: 'video',
        roleMain: '[role="main"]',
        roleDialog: '[role="dialog"]'
      },
      reelsPrefix: '/reels/',                  // D-02 — the only REELS route
      routeKeywords: ['reels', 'direct', 'messages', 'p', 'explore', 'accounts', 'stories'],  // D-05 profile guard
      preservedRoutes: ['/direct/', '/messages/', '/p/', '/explore/', '/accounts/', '/stories/'],  // D-04
      health: { driftThreshold: 5 },           // D-09 — missStreak before drift is declared
      harness: { maxBatchRecords: 200 },       // HARN-01/D-2 — processBatch yield-at-cap: 5k/s ÷ 60fps ≈ 83/frame → ~2.4× headroom (CORE-05)
      killSwitch: { enabled: true },            // HARN-05/D-12 — master flag: OFF = every entry point no-ops + full revert (native feed)
      buffer: { enabled: false, stallFrames: 2 },  // LEVR-05/D-27 — flagged capstone: OFF by default, 2 rAF frames ≈ 33ms (sub-200ms stall)
      leverParams: {                           // D-19/D-20/D-23/D-24 — per-phase lever values (CORE-05)
        saturation: {                          // saturate(n) escalation — imperceptible gradient
          '1': 0.85,
          '2': 0.65,
          '3': 0.4
        },
        playbackRate: {                        // D-23 — subtle slow-down inside the 0.5–2.0 band (PITFALLS:79)
          '2': 0.9,
          '3': 0.8
        },
        volume: { '3': 0.5 }                   // D-24 — relative factor at the stop-point phase (matrix: phase 3 only)
      },
      clampTables: {                           // LEVR-08 / D-22 — per-platform spec of lever limits (frozen)
        webkit: {                              // Safari hard cap 2.0 — anything above silently no-ops (PITFALLS:71)
          playbackRate: { min: 0.5, max: 2 },
          volume: { min: 0, max: 1 }
        },
        chromium: {                            // audible band — beyond 4.0 Chrome mutes audio, killing the volume lever
          playbackRate: { min: 0.5, max: 4 },
          volume: { min: 0, max: 1 }
        }
      },
      overlay: {                               // Phase 4 (D-8/D-10/D-11) — the UI-SPEC contract verbatim (CORE-05)
        unitLabel: 'min',                      // D-6: bare number + unit — the ONLY text
        zIndex: 2147483000,                    // D-11: near-max — safe because the surface is pointer-events:none
        fadeMs: 400,                           // D-2: CSS opacity transition duration (~400ms, agent discretion 300-500)
        pill: {                                // 04-UI-SPEC.md geometry/typography/color
          position: 'fixed',
          left: '16px',
          // 208px from the viewport bottom — above the Reels poster's
          // profile row (avatar + username + Seguir), which sits at the top
          // of the 102px caption block (73px nav + 19px gap + 102px block =
          // 194px; +14px breathing room = 208px). User request, 2026-08.
          bottom: '208px',
          padding: '8px 12px',
          borderRadius: '8px',
          maxWidth: '200px',
          fontSize: '13px',
          fontWeight: '500',
          lineHeight: '1.4',
          background: 'rgba(12, 12, 14, 0.42)',
          color: '#F5F5F7'
        }
      }
    };
    return deepFreeze(config, new WeakSet());
  }

  /**
   * deepFreeze — recursive Object.freeze with a WeakSet cycle guard
   * (RESEARCH.md Pattern 5 / MDN deepFreeze). Strict mode converts any
   * accidental write into a loud TypeError.
   */
  function deepFreeze(object, seen) {
    seen = seen || new WeakSet();
    if (object === null || typeof object !== 'object' || seen.has(object)) {
      return object;
    }
    seen.add(object);
    var names = Object.getOwnPropertyNames(object);
    for (var i = 0; i < names.length; i++) {
      var value = object[names[i]];
      if (value && typeof value === 'object') {
        deepFreeze(value, seen);
      }
    }
    return Object.freeze(object);
  }

  /**
   * updateRunning — running := (context === 'REELS' && visible). When the
   * clock transitions to running, anchor lastBoundary at now so the time
   * before the transition (page-load origin, pause gap) is never counted.
   * Restarts the rAF poll on every false→true transition (CORE-01 live-path
   * fix): pollLoop only re-requests itself while running, so if the poll
   * dies (first frame while UNKNOWN, or after a hidden pause) the engine
   * must kick it again here — otherwise accumulation stops permanently in a
   * live WebView after the first hidden/resume cycle.
   */
  function updateRunning() {
    var running = (state.context === 'REELS' && state.visible);
    if (running && !state.running) {
      state.lastBoundary = env.clock.now();
      if (env.requestAnimationFrame) {
        env.requestAnimationFrame(pollLoop);
      }
    }
    state.running = running;
  }

  /**
   * tick — THE ONLY accumulation path. Every boundary handler and the rAF
   * poll call it. Accumulates only while running; clamps negative deltas
   * (NTP/clock back-step, Pitfall 7 — never count a backwards jump); caps a
   * single segment at CONFIG.segmentCapMs; always refreshes lastBoundary;
   * then syncs the phase machine.
   */
  function tick(now) {
    if (state.running) {
      var delta = now - state.lastBoundary;
      if (delta > 0) {            // NTP/clock back-step clamp — never go negative
        state.elapsedMs += Math.min(delta, CONFIG.segmentCapMs);
      }
    }
    state.lastBoundary = now;
    phaseMachine.sync(state.elapsedMs);
    emit('elapsed', state.elapsedMs);   // bus event per RESEARCH.md line 119
  }

  /**
   * onHidden — record hiddenAt at the moment the page hides (the catch-up
   * base for the next resume signal) and pause the clock. The rAF poll
   * self-stops because updateRunning() flips running to false; unverifiable
   * background time is never counted (Pitfall 5).
   */
  function onHidden() {
    state.hiddenAt = env.clock.now();
    state.visible = false;
    updateRunning();
  }

  /**
   * onResume — the FatigueManager catch-up (CORE-03, RESEARCH.md Pattern 3).
   * Computes the wall-clock delta since hiddenAt (fallback: lastBoundary for
   * the missed-visibilitychange/WebView case). A delta strictly greater than
   * CONFIG.fatigueWindowMs resets the session (FA-05: exactly the window does
   * NOT reset — strict >, no >=); otherwise the gap is DISCOUNTED:
   * lastBoundary refreshes to now and hiddenAt clears, so unverifiable
   * background time is never accumulated (Pitfall 5). Negative deltas
   * (NTP back-step, Pitfall 7) clamp to 0. Idempotent: with hiddenAt null and
   * a small delta it just refreshes lastBoundary — safe on repeated resume
   * signals (T-01-09). The window is read ONLY from CONFIG.fatigueWindowMs —
   * no literal in the handler (T-01-08).
   */
  function onResume() {
    var now = env.clock.now();
    var since = state.hiddenAt !== null ? state.hiddenAt : state.lastBoundary;
    var delta = now - since;
    if (delta < 0) { delta = 0; }
    if (delta > CONFIG.fatigueWindowMs) {
      resetSession();
      return;
    }
    state.hiddenAt = null;
    state.lastBoundary = now;
    state.visible = true;
    updateRunning();
    tick(now);
  }

  /**
   * resetSession — zeroes the session clock (elapsedMs 0 + phaseMachine.sync(0),
   * which emits phasechange 0 when coming from a higher phase) and makes the
   * reset OBSERVABLE via the 'reset' bus event (T-01-11: accumulated session
   * state is never silently discarded). Context is preserved — reset zeroes
   * time, not context.
   */
  function resetSession() {
    state.elapsedMs = 0;
    state.hiddenAt = null;
    state.visible = true;
    state.lastBoundary = env.clock.now();
    revertAll();                  // LEVR-07: fatigue reset restores every video to native
    phaseMachine.sync(0);         // phase 0 → the reconcile reverts anything left (backstop)
    emit('reset');
    updateRunning();
  }

  /**
   * pollLoop — rAF frame callback (NOT a timer). Re-requests itself only
   * while running; rAF is suspended when hidden, matching clock-pause
   * semantics. Contained: a failure must never escape into the host frame.
   */
  function pollLoop() {
    if (state.destroyed) { return; }   // destroy() stops the poll (T-01-10)
    if (!(state.running && env.requestAnimationFrame)) { return; }  // paused — updateRunning kicks the poll on the next running transition
    try {
      // HARN-05/D-12 gate: the WORK is gated, the HEARTBEAT is not — a
      // plain return here would kill the loop and re-enable could never
      // resume (D-13/D-14). One-frame stop comes from tick() not running.
      if (killSwitchEnabled) {
        tick(env.clock.now());
        // D-13 source 3 + D-06 fallback: the rAF batch carrier re-checks the
        // pathname ONCE per frame (pathname-diffed — a manual setContext on
        // an unchanged pathname is never clobbered, keeping the Phase 1
        // suites green). This is the bypass-proof catch for SPA links /
        // back-forward gestures / WebView navigations that skip pushState
        // (Pitfall 7) — one classifyPathname per frame, no timer.
        if (currentPathname() !== lastPathname) { refresh('batch'); }
        // Phase 2 detection batch (D-09): each frame on REELS, drain the
        // observer's pending records into the batch callback. No timers —
        // the rAF poll is the batch carrier. processBatch also runs the
        // per-batch health scan (D-09) every frame on REELS.
        if (state.context === 'REELS') {
          processBatch();
        }
      }
    } catch (err) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('SlowGram: poll loop error', err);
      }
    } finally {
      // P1-2 (audit fix, 2026-08): the heartbeat re-request lives in
      // `finally` — a throw ANYWHERE in the frame body (clock.now, a DOM
      // query in connectWatcher/healthScan, a hostile observer drain) used to
      // skip the re-request and the loop died SILENTLY (console.error only),
      // freezing accumulation, levers and drift forever (probe: one throwing
      // frame → elapsed frozen at 0). The finally schedules exactly one next
      // frame per invocation (no multi-loop risk — each call re-requests
      // once), and the reschedule itself is guarded so a broken host rAF is
      // logged, never thrown into the frame (engine containment, T-01-01).
      try {
        env.requestAnimationFrame(pollLoop);
      } catch (reschedErr) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('SlowGram: poll reschedule failed', reschedErr);
        }
      }
    }
  }

  /**
   * VideoRegistry.register — idempotent per-video state in a WeakMap keyed on
   * the element (DETC-05, RESEARCH.md Pattern 3): a recycled <video> node
   * stays one entry; entries die with the element (WeakMap GC-safety — the
   * virtualized feed dropping nodes cannot leak).
   *
   * State shape per-video: { registeredAt, src, started, ended, appliedLevers }
   * — appliedLevers is reserved for Phase 3 (null until then; Phase 2 holds
   * registration + lifecycle only, CONTEXT.md:39).
   *
   * Lifecycle listeners (loadstart/emptied) bind EXACTLY ONCE per element,
   * guarded by the WeakMap value flag entry._bound (Pitfall 5 — stale per-video
   * state on node recycling is reset on loadstart/emptied).
   */
  function registerVideo(video) {
    if (!killSwitchEnabled) { return; }       // HARN-05/D-12: kill-switch — no tracking at all
    if (!videoStates.has(video)) {
      videoStates.set(video, {
        registeredAt: env.clock.now(),
        src: readSrc(video),
        started: false,
        ended: false,
        appliedLevers: null
      });
      registryCount++;
    }
    if (registryElements.indexOf(video) === -1) {
      registryElements.push(video);  // D-18/D-29: live list for applyAll/revertAll (WeakMap is non-iterable) — a removed→re-added SAME node (virtualization recycle) re-tracks exactly once
    }
    var entry = videoStates.get(video);
    if (entry && !entry._bound) {
      entry._bound = true;
      if (typeof video.addEventListener === 'function') {
        video.addEventListener('loadstart', onLoadStart);
        video.addEventListener('emptied', onEmptied);
        video.addEventListener('ended', onEnded);   // LEVR-04 stop point (bound once per element — T-D27 discipline)
        video.addEventListener('volumechange', onVolumeChange);   // P2-4 (bound once per element — D-29 discipline)
      }
    }
    if (state.context === 'REELS') { applyToVideo(video); }   // D-16: degrade on registration (mid-phase videos)
  }

  /**
   * readSrc — normalized source read that works on fake AND real elements:
   * FakeVideoElement exposes a settable `.src` mirroring into attributes;
   * real elements expose `.src` (blob URL per State of the Art line 419).
   */
  function readSrc(video) {
    return (video.src != null && video.src !== '')
      ? video.src
      : (typeof video.getAttribute === 'function' ? video.getAttribute('src') : null);
  }

  /**
   * onLoadStart — lifecycle reset on new content loading (Pitfall 5): a fresh
   * loadstart means the node started loading NEW media; mark started, clear
   * ended, refresh src from the element.
   */
  function onLoadStart(ev) {
    var v = ev.target;
    var entry = videoStates.get(v);
    if (entry) {
      entry.started = true;
      entry.ended = false;
      entry.src = (v.src != null && v.src !== '') ? v.src : (typeof v.getAttribute === 'function' ? v.getAttribute('src') : null);
      // Pattern 2 apply-after-load (ARCHITECTURE.md): media state reset — levers
      // must re-apply to the new source; the apply is idempotent by value.
      entry.appliedLevers = null;
      if (state.context === 'REELS') { applyToVideo(v); }
    }
  }

  /**
   * onEmptied — lifecycle reset when the feed recycles the node: emptied means
   * the element's media was unloaded — state reset so a future loadstart starts
   * clean (Pitfall 5).
   */
  function onEmptied(ev) {
    var entry = videoStates.get(ev.target);
    if (entry) {
      entry.ended = true;
      entry.started = false;
      entry.src = null;
      entry.appliedLevers = null;      // media unloaded — levers re-apply on the next loadstart
    }
  }

  /**
   * onEnded — the autoplay stop point (LEVR-04, D-25): an ended event while
   * the autoplay lever is applied (phase 3) PAUSES the video — the loop
   * attribute was already removed, so the reel stops instead of restarting.
   * The pause is gated on appliedLevers.autoplay (never pauses below phase 3
   * — T-03-11). When the buffer flag is on (LEVR-05), the same stop point
   * starts the frame-counted sub-200ms stall (bufferApp.apply) AFTER the
   * pause — the resume rides the rAF carrier (processStalls), never a timer.
   */
  function onEnded(ev) {
    var entry = videoStates.get(ev.target);
    if (!entry) { return; }
    if (entry.appliedLevers && entry.appliedLevers.autoplay) {
      if (typeof ev.target.pause === 'function') { ev.target.pause(); }   // LEVR-04 stop point
      if (bufferEnabled) { bufferApp.apply(state.phase, ev.target); }     // LEVR-05 stall at the stop point
    }
  }

  /**
   * onVolumeChange — P2-4 (audit fix, 2026-08): a video that was muted /
   * inaudible at apply time never recorded the volume lever (the LEVR-03
   * gate returns early), so it stayed FULL volume for the rest of the phase
   * even after the user or Instagram unmuted it — the lever is only ever
   * re-evaluated on register/loadstart/phase-change. This listener re-runs
   * the per-video reconcile when the video BECOMES audible (muted cleared or
   * volume raised): volume applies if and only if it is in the current
   * phase's matrix (phase 3), and everything else reconciles normally.
   * Idempotent by phase. Bound once per element (D-29), unbound on teardown.
   */
  function onVolumeChange(ev) {
    var v = ev.target;
    var entry = videoStates.get(v);
    if (!entry) { return; }
    if (state.context === 'REELS' &&
        v.muted !== true &&
        typeof v.volume === 'number' && v.volume > 0) {
      applyToVideo(v);
    }
  }

  /**
   * getRegistryState — Phase 3 consumer interface: returns a COPY of the
   * per-video entry, or null when the element is not registered. Never returns
   * the live WeakMap value (callers cannot mutate engine state).
   */
  function getRegistryState(video) {
    var entry = videoStates.get(video);
    if (!entry) { return null; }
    return {
      registeredAt: entry.registeredAt,
      src: entry.src,
      started: entry.started,
      ended: entry.ended,
      appliedLevers: entry.appliedLevers
    };
  }

  /**
   * feedRoot — the REELS feed container: env.document.querySelector(roleMain).
   * Null-safe: Phase 1's FakeDocument has no querySelector, and a real page
   * may not have rendered [role="main"] yet — both return null, never throw.
   */
  function feedRoot() {
    return (env.document && typeof env.document.querySelector === 'function')
      ? env.document.querySelector(CONFIG.selectors.roleMain)
      : null;
  }

  /**
   * dialogRoot — the R2 observer root (D-03, Pattern 2 two-root set): any
   * [role="dialog"] element that CONTAINS a video. The fullscreen reels
   * viewer is a modal sibling of the feed (A2/A3: CITED, not live-verified),
   * so videos inside it would be missed by the feed root alone. Returns null
   * when absent (logged-out dump has zero dialogs — the R2 root is a no-op
   * there but stays wired for the logged-in fixture). Never body-wide.
   */
  function dialogRoot() {
    if (!env.document || typeof env.document.querySelector !== 'function') { return null; }
    var dlg = env.document.querySelector(CONFIG.selectors.roleDialog);
    if (!dlg) { return null; }
    // contains a video? (A2: dialog-as-sibling with a video inside)
    var videos = (typeof dlg.querySelectorAll === 'function')
      ? dlg.querySelectorAll(CONFIG.selectors.video)
      : [];
    return (videos && videos.length > 0) ? dlg : null;
  }

  /**
   * isOverlayHost — D-14 overlay-host subtree exclusion predicate: a node is
   * inside the engine's own overlay host subtree when overlayHost (Phase 4's
   * container; null in Phase 2) contains it. Engine-origin overlay mutations
   * must never be processed as page activity (Pitfall 4 feedback loop).
   */
  function isOverlayHost(node) {
    if (!overlayHost || !node || typeof overlayHost.contains !== 'function') { return false; }
    return overlayHost.contains(node);
  }

  /**
   * connectWatcher — DomWatcher.connect (D-11/D-12/D-03): ONE MutationObserver
   * over the two-root set — [role="main"] feed root AND any [role="dialog"]
   * containing a video — each with the locked D-11 attributeFilter. Connect
   * only while context is REELS (D-12 connect-on-REELS-only); null roots are
   * skipped so no body-wide observation ever happens (Pitfall 2). On connect
   * (including reconnect after SOCIAL/UNKNOWN), a synchronous processBatch()
   * re-syncs against the current DOM state (D-07 tail: one health scan + one
   * batch pass — records queued while disconnected are drained immediately).
   */
  function connectWatcher() {
    if (watcher.connected || !env.MutationObserver || state.context !== 'REELS') { return; }
    var roots = [];
    var main = feedRoot();
    if (main) { roots.push(main); }
    var dialog = dialogRoot();
    if (dialog) { roots.push(dialog); }
    // P1-1 (audit fix, 2026-08): the connect-time scan runs on EVERY REELS
    // connect attempt — even when no observer roots exist yet. A /reels/ page
    // whose [role="main"] anchor is missing (or renders late) previously
    // registered ZERO videos: the roots early-return below skipped the scan,
    // and health stayed 'ok' while videos exist (a video hit counts), so the
    // drift fallback never engaged — silent loss of degradation (probe: /
    // reels/ + 1 video + no anchor → registrySize 0, health ok). Same bounded
    // pattern as the drift fallbackScope: one document-scoped
    // querySelectorAll('video') on /reels/ only — never body-wide observation,
    // never on other routes. registerVideo is idempotent, so the per-attempt
    // re-scan while disconnected (see processBatch reconnect) is cheap.
    // UAT-05 (HARN-06 on-device, 2026-08-15) also motivates the scan: on the
    // live IG mobile-web feed, video nodes are RECYCLED in place (React swaps
    // src) instead of being re-added, so observer addedNodes barely fire
    // after the initial paint — an additions-only registry stays starved and
    // the levers never engage. Register the videos already present at connect
    // time (idempotent register + the per-video loadstart re-apply keep them
    // degraded as they recycle).
    scanAndRegisterInitialVideos();
    if (roots.length === 0) { return; }      // no roots → never observe anything (Pitfall 2)
    watcher.observer = new env.MutationObserver(batchCallback);
    for (var i = 0; i < roots.length; i++) {
      watcher.observer.observe(roots[i], {
        childList: true,
        subtree: true,
        attributeFilter: ['src', 'loop', 'autoplay', 'role']   // D-11 locked value
      });
    }
    watcher.connected = true;
    processBatch();                          // reconnect re-sync (D-07 tail)
  }

  /**
   * scanAndRegisterInitialVideos — UAT-05 on-device fix: one bounded scan of
   * document-scoped <video> elements at REELS connect, registering every one
   * (registerVideo is idempotent — re-connects re-register cheaply, and the
   * D-18 live list stays bounded). Runs only from connectWatcher (REELS
   * only, per the scope contract).
   */
  function scanAndRegisterInitialVideos() {
    // P2-2 (audit fix, 2026-08): prune the live list on every connect-time
    // scan. While the observer is DISCONNECTED (SOCIAL/UNKNOWN detour) the
    // removedNodes pruning cannot run, so videos removed during the detour
    // stayed in registryElements forever — the array kept a strong reference
    // (defeating the WeakMap's GC-safety) and applyAll/revertAll kept
    // iterating dead nodes. The reconnect scan is exactly the moment the
    // stale window closes (D-07 re-sync), so pruning here keeps the list
    // bounded per session. Idempotent; the live list is small.
    pruneRegistry();
    var doc = env.document;
    if (!doc || typeof doc.querySelectorAll !== 'function') { return; }
    var videos = doc.querySelectorAll('video');
    for (var i = 0; i < videos.length; i++) {
      registerVideo(videos[i]);
    }
  }

  /**
   * isDetached — P2-2: a video is detached when it is no longer connected to
   * the document. Real DOM elements expose `isConnected` (walks the full
   * ancestor chain — a detached wrapper detaches the video too); fake/harness
   * elements lack it, so the direct parentNode is the signal there (the fake's
   * append/remove only sets the direct parent).
   */
  function isDetached(video) {
    if (typeof video.isConnected === 'boolean') { return !video.isConnected; }
    return !video.parentNode;
  }

  /**
   * pruneRegistry — P2-2: filter registryElements to connected videos. The
   * WeakMap entries are untouched (they die with the element via GC once the
   * array reference is gone); the array is what applyAll/revertAll iterate.
   */
  function pruneRegistry() {
    var kept = [];
    for (var i = 0; i < registryElements.length; i++) {
      if (!isDetached(registryElements[i])) { kept.push(registryElements[i]); }
    }
    registryElements = kept;
  }

  /**
   * disconnectWatcher — DomWatcher.disconnect (D-07/D-12): tear down on
   * SOCIAL/UNKNOWN. The registry is NOT cleared here (D-07 keep-registry —
   * reconnect re-sync owns that contract).
   */
  function disconnectWatcher() {
    if (watcher.observer && typeof watcher.observer.disconnect === 'function') {
      watcher.observer.disconnect();
    }
    watcher.observer = null;
    watcher.connected = false;
  }

  /**
   * processStalls — the frame-counted buffer carrier (LEVR-05, D-26): each
   * rAF batch on REELS decrements every pending stall (entry.bufferStall)
   * and, at exactly 0, resumes the video (v.play()). No timers — the stall
   * rides the same poll loop that drives processBatch (Phase 1 ban). Gated
   * on bufferEnabled (default off — production never stalls). A stall can
   * only exist at the stop point (onEnded starts it), so the resume is
   * always a post-autoplay-pause hiccup that resolves sub-200ms.
   */
  function processStalls() {
    if (!bufferEnabled) { return; }
    for (var i = 0; i < registryElements.length; i++) {
      var v = registryElements[i];
      var entry = videoStates.get(v);
      if (!entry || !(entry.bufferStall > 0)) { continue; }
      entry.bufferStall--;
      if (entry.bufferStall <= 0 && typeof v.play === 'function') { v.play(); }
    }
  }

  /**
   * processBatch — the rAF-batch carrier (D-09): drains the observer's
   * pending records ONCE per frame via takeRecords(), feeds them to
   * batchCallback, and runs the per-batch health scan (D-09: health runs per
   * batch on /reels/). Called from the rAF poll (the no-timer batch carrier)
   * and synchronously from connectWatcher() for the reconnect re-sync
   * (D-07 tail: one health scan + one batch pass on the current DOM state).
   */
  function processBatch() {
    // P1-1 (audit fix, 2026-08): while REELS and NOT connected, re-attempt
    // connectWatcher() each batch — a [role="main"] anchor that renders AFTER
    // the initial connect attempt (roots were empty at connect time) recovers
    // without a page reload: the next frame's attempt finds the root, creates
    // the observer (D-11 two-root set) and the connect-time scan registers
    // the present videos (D-07 reconnect re-sync semantics). Cheap while
    // disconnected: connectWatcher returns fast on empty roots, and the
    // per-frame healthScan already pays the same bounded DOM queries on
    // REELS. No recursion: connectWatcher's tail processBatch() runs only
    // after watcher.connected flips true, which this guard skips.
    if (state.context === 'REELS' && !watcher.connected && env.MutationObserver) {
      connectWatcher();
    }
    // HARN-01/D-2 yield: concat the retained overflow with the observer's
    // fresh drain, then slice to the cap — overflow is RE-queued, never
    // dropped (the finite-drain gate depends on retention). No timers, no
    // performance.now — the work-count proxy is structural (D-1).
    var cap = CONFIG.harness.maxBatchRecords;
    var records = pendingBatch.concat(watcher.observer ? watcher.observer.takeRecords() : []);
    pendingBatch = [];
    if (records.length > cap) {
      pendingBatch = records.slice(cap);
      records = records.slice(0, cap);
    }
    lastFrameProcessed = 0;
    if (health.drifted) {
      // D-08 fail-soft prod fallback: while drift is declared, the scope
      // SOURCE swaps to the bounded document-scoped <video> set
      // (fallbackScope) — the registration path (batchCallback) stays. The
      // fallback is bounded by construction (T-02-14): document-scoped
      // <video> ONLY while the pathname says /reels/, never body-wide
      // observation, never on other routes. Idempotent register makes the
      // per-batch re-scan cheap. The same cap applies (consume keeps DRY).
      var videos = fallbackScope();
      var fallbackRecords = [];
      for (var i = 0; i < videos.length; i++) {
        fallbackRecords.push({ type: 'childList', addedNodes: [videos[i]], target: null });
      }
      if (fallbackRecords.length) {
        lastFrameProcessed = Math.min(fallbackRecords.length, cap);
        batchCallback(fallbackRecords.slice(0, cap));
      }
    } else if (records.length) {
      lastFrameProcessed = records.length;
      batchCallback(records);
    }
    healthScan();
    processStalls();   // LEVR-05: frame-counted buffer stall decrement rides the same batch (no timers)
  }

  /**
   * batchCallback — the rAF-batch consumer (D-09; Anti-Pattern: NO synchronous
   * DOM queries here — the records carry the targets, RESEARCH.md:291).
   * Registers every video appearing in a mutation (rec.target or
   * rec.addedNodes), guarded by the D-14 self-mutation filter: while the
   * engine's own `mutating` flag is set the whole batch is skipped (Pitfall 4
   * feedback loop), and nodes inside the engine's overlay host subtree are
   * excluded per-record. The D-13 source-2 role-attribute refresh is kept:
   * a role change on the observed roots re-runs the pathname-authoritative
   * refresh — never an upgrade (refresh('mutation') applies refineFromDOM).
   * Contained: a failure never escapes into the host page.
   */
  function batchCallback(records) {
    try {
      if (!killSwitchEnabled) { return; }       // HARN-05/D-12: kill-switch — no processing at all
      if (mutating) { return; }                 // D-14: engine's own writes — skip the whole batch
      var roleTouched = false;
      for (var i = 0; i < records.length; i++) {
        var rec = records[i];
        // D-13 source 2: a role-attribute mutation on the observed roots
        // re-runs the pathname-authoritative refresh — never an upgrade
        // (refresh('mutation') applies the refineFromDOM gate).
        if (rec.type === 'attributes' && rec.attributeName === 'role') { roleTouched = true; }
        if (rec.type === 'attributes' && rec.target && rec.target.tagName === 'VIDEO' &&
            !isOverlayHost(rec.target)) { registerVideo(rec.target); }
        var added = rec.addedNodes || [];
        for (var j = 0; j < added.length; j++) {
          if (added[j].tagName === 'VIDEO' && !isOverlayHost(added[j])) { registerVideo(added[j]); }
        }
        // D-18: a VIDEO removed from the observed roots (feed virtualization)
        // leaves the live list — the WeakMap entry dies with the element (GC),
        // the array stays bounded over a long session (T-03-03).
        var removed = rec.removedNodes || [];
        for (var r = 0; r < removed.length; r++) {
          if (removed[r].tagName === 'VIDEO' && !isOverlayHost(removed[r])) {
            dropFromRegistry(removed[r]);
          }
        }
      }
      if (roleTouched) { refresh('mutation'); }
    } catch (err) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('SlowGram: batch error', err);
      }
    }
  }

  /**
   * SelectorRegistry.healthScan — per-batch selector health accounting
   * (Pattern 4 / Common Operation 2, full D-09/D-10 contract): a hit
   * (role=main anchor OR any video) resets missStreak and recovers from
   * drift (emitting the ok event); a miss increments missStreak and declares
   * drift at exactly CONFIG.health.driftThreshold zero-hit scans — the
   * transition-guarded declaration emits the drift event + dev warn exactly
   * ONCE per drift episode (never on every scan). The missStreak is counted
   * per rAF batch — healthScan runs inside processBatch, the no-timer batch
   * carrier (D-09), so the health scan never rides a timer. The drift event
   * carries the pathname for auditability (T-02-15). The warn message reads
   * the threshold from CONFIG — no magic literal 5 in the body (T-D38).
   */
  function healthScan() {
    var anchor = null;
    var videos = [];
    if (env.document && typeof env.document.querySelector === 'function') {
      anchor = env.document.querySelector(CONFIG.selectors.roleMain);
    }
    if (env.document && typeof env.document.querySelectorAll === 'function') {
      videos = env.document.querySelectorAll(CONFIG.selectors.video) || [];
    }
    var hit = (anchor !== null) || (videos.length > 0);
    if (hit) {
      health.missStreak = 0;
      if (health.drifted) { recover(); }
      return;
    }
    health.missStreak++;
    if (health.missStreak >= CONFIG.health.driftThreshold && !health.drifted) {
      health.drifted = true;
      emit('selectorHealth', { status: 'drift', pathname: currentPathname() });
      if (dev && typeof console !== 'undefined' && console.warn) {
        console.warn('SlowGram: selector drift — feed anchor missing for ' +
          CONFIG.health.driftThreshold + ' scans');
      }
    }
  }

  /**
   * recover — drift recovery (D-08/D-10): a verified hit ends the drifted
   * state and emits the drift-recovered 'selectorHealth' event with the
   * auditable pathname — the recovery half of the D-10 event contract.
   */
  function recover() {
    health.drifted = false;
    emit('selectorHealth', { status: 'ok', pathname: currentPathname() });
  }

  /**
   * fallbackScope — the D-08 fail-soft prod fallback scope (Common Operation
   * 3): document-scoped <video> nodes, but ONLY while the pathname says
   * /reels/ or /reels/<id>. Bounded by construction (T-02-14): never
   * body-wide observation, never on other routes — on SOCIAL/UNKNOWN the
   * scope returns [] and the fallback registers nothing.
   */
  function fallbackScope() {
    var p = currentPathname();
    if (p !== CONFIG.reelsPrefix && p.indexOf(CONFIG.reelsPrefix + '/') !== 0) {
      return [];
    }
    return (env.document && typeof env.document.querySelectorAll === 'function')
      ? env.document.querySelectorAll(CONFIG.selectors.video)
      : [];
  }

  // -------------------------------------------------------------------------
  // Phase 3 — DegradationEngine (LEVR-06/07/09) + saturation lever (LEVR-01)
  // -------------------------------------------------------------------------

  /**
   * isTransformed — D-15 transform detection: an element with an inline
   * transform/filter has its own GPU layer (it would drop our filter again),
   * so it is skipped by the wrapper walk. Inline-style based in v1;
   * computed-style + on-device pixel verification are the Phase 5 device
   * gate (D-15 rule 5).
   */
  function isTransformed(node) {
    var s = node.style || {};
    return !!(s.transform || s.filter);
  }

  /**
   * filterTarget — D-15 wrapper walk: the FIRST static, non-transformed
   * ancestor of the video (Pitfall 2 — iOS drops filters applied directly to
   * <video>, which gets its own accelerated GPU layer). Never the video
   * itself; never a transformed/filtered element; bounded at BODY/HTML
   * (Anti-Pattern 6 — never body-wide, never a big container); null when no
   * safe wrapper exists → the lever skips (fail-safe, T-03-01).
   *
   * `exempt` is the element the lever itself already applied to: once OUR
   * saturate write is on the wrapper, isTransformed(wrapper) is true (it has
   * a filter) — the walk must not skip past our own target, or the next
   * apply/revert would climb to the feed root. The exemption re-detects on
   * every walk (React may replace the wrapper — Pitfall 7) while keeping the
   * wrapper we chose.
   */
  function filterTarget(video, exempt) {
    var node = video.parentNode;
    while (node) {
      if (node.tagName === 'BODY' || node.tagName === 'HTML') { return null; }
      if (!isTransformed(node) || node === exempt) { return node; }
      node = node.parentNode;
    }
    return null;
  }

  /**
   * saturationApp — the flagship lever (LEVR-01, D-15/D-17): idempotent
   * apply (same phase → no-op) writes `filter: saturate(CONFIG value)` to
   * the safe ancestor wrapper; revert restores the captured original. State
   * lives in the VideoRegistry WeakMap entry (appliedLevers.saturation +
   * origFilter) — never on the element (DETC-05). Values read ONLY from
   * CONFIG.leverParams.saturation (CORE-05). Writes ride the D-14 mutating
   * flag; the body is contained (a lever failure never breaks the host).
   */
  /**
   * clampForPlatform — LEVR-08/D-22: clamp a lever value through the frozen
   * CONFIG.clampTables spec for the resolved platform (env.platform). Every
   * lever clamps before writing, so an out-of-band value can never silently
   * no-op on WebKit (rate > 2.0) or mute audio on Chromium (rate > 4.0).
   * Unknown platform/lever → value passes through untouched.
   */
  function clampForPlatform(leverKey, value) {
    var table = CONFIG.clampTables && CONFIG.clampTables[env.platform];
    var limits = table && table[leverKey];
    if (!limits) { return value; }
    if (value < limits.min) { return limits.min; }
    if (value > limits.max) { return limits.max; }
    return value;
  }

  /**
   * playbackApp — the playbackRate lever (LEVR-02, D-23): subtle slow-down
   * inside the 0.5–2.0 band, clamped through the platform table, pitch
   * preserved (preservesPitch). Re-applied per video by the 03-01 hooks
   * (register-time, loadstart — the browser resets rate to 1.0 on source
   * change, so apply-after-load keeps it degraded). State in the registry
   * entry (origPlaybackRate + appliedLevers.playbackRate).
   */
  var playbackApp = {
    key: 'playbackRate',
    apply: function (phase, video) {
      try {
        var entry = videoStates.get(video);
        if (!entry) { return; }
        if (entry.appliedLevers && entry.appliedLevers.playbackRate === phase) { return; }
        var value = CONFIG.leverParams.playbackRate[String(phase)];
        if (value === undefined) { return; }
        value = clampForPlatform('playbackRate', value);
        mutating = true;
        try {
          if (entry.origPlaybackRate === undefined) { entry.origPlaybackRate = video.playbackRate || 1; }
          video.playbackRate = value;
          if ('preservesPitch' in video) { video.preservesPitch = true; }   // LEVR-02 pitch preservation
        } finally {
          mutating = false;
        }
        entry.appliedLevers = entry.appliedLevers || {};
        entry.appliedLevers.playbackRate = phase;
      } catch (err) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('SlowGram: playback apply error', err);
        }
      }
    },
    revert: function (video) {
      try {
        var entry = videoStates.get(video);
        if (!entry || !entry.appliedLevers || !entry.appliedLevers.playbackRate) { return; }
        mutating = true;
        try {
          video.playbackRate = (entry.origPlaybackRate !== undefined) ? entry.origPlaybackRate : 1;
        } finally {
          mutating = false;
        }
        delete entry.appliedLevers.playbackRate;
      } catch (err) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('SlowGram: playback revert error', err);
        }
      }
    }
  };
  applicators.playbackRate = playbackApp;

  /**
   * volumeApp — the volume lever (LEVR-03, D-24, Anti-Pattern 2): relative
   * factor on the ORIGINAL volume, applied ONLY when the video is unmuted
   * AND audible (muted !== true && volume > 0) with feature-detect
   * (typeof volume === 'number'). NEVER assigns video.muted — a programmatic
   * unmute pauses iOS playback; the lever only READS muted as a gate.
   * Values clamped through the platform table. Revert restores origVolume.
   */
  var volumeApp = {
    key: 'volume',
    apply: function (phase, video) {
      try {
        var entry = videoStates.get(video);
        if (!entry) { return; }
        if (entry.appliedLevers && entry.appliedLevers.volume === phase) { return; }
        // LEVR-03 gate: never while muted; never on unsupported/inaudible elements.
        if (video.muted === true) { return; }
        if (typeof video.volume !== 'number' || !(video.volume > 0)) { return; }
        var factor = CONFIG.leverParams.volume[String(phase)];
        if (factor === undefined) { return; }
        if (entry.origVolume === undefined) { entry.origVolume = video.volume; }
        var value = clampForPlatform('volume', entry.origVolume * factor);
        mutating = true;
        try {
          video.volume = value;
        } finally {
          mutating = false;
        }
        entry.appliedLevers = entry.appliedLevers || {};
        entry.appliedLevers.volume = phase;
      } catch (err) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('SlowGram: volume apply error', err);
        }
      }
    },
    revert: function (video) {
      try {
        var entry = videoStates.get(video);
        if (!entry || !entry.appliedLevers || !entry.appliedLevers.volume) { return; }
        if (entry.origVolume !== undefined) {
          mutating = true;
          try {
            video.volume = entry.origVolume;
          } finally {
            mutating = false;
          }
        }
        delete entry.appliedLevers.volume;
      } catch (err) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('SlowGram: volume revert error', err);
        }
      }
    }
  };
  applicators.volume = volumeApp;

  var saturationApp = {
    key: 'saturation',
    apply: function (phase, video) {
      try {
        var entry = videoStates.get(video);
        if (!entry) { return; }
        if (entry.appliedLevers && entry.appliedLevers.saturation === phase) { return; }
        var target = filterTarget(video, entry.filterTarget);
        if (!target) { return; }
        var value = CONFIG.leverParams.saturation[String(phase)];
        if (value === undefined) { return; }
        // First touch of THIS wrapper: remember it + its original filter so
        // revert restores exactly (D-17). A changed target (React replaced
        // the wrapper — Pitfall 7) re-captures fresh.
        if (entry.filterTarget !== target) {
          entry.filterTarget = target;
          entry.origFilter = target.style.filter || '';
        }
        mutating = true;
        try {
          target.style.filter = 'saturate(' + value + ')';
        } finally {
          mutating = false;
        }
        entry.appliedLevers = entry.appliedLevers || {};
        entry.appliedLevers.saturation = phase;
      } catch (err) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('SlowGram: saturation apply error', err);
        }
      }
    },
    revert: function (video) {
      try {
        var entry = videoStates.get(video);
        if (!entry || !entry.appliedLevers || !entry.appliedLevers.saturation) { return; }
        // Write to the STORED target (the element we actually filtered) —
        // never re-walk: our own filter would read as "transformed" and the
        // walk would climb to the feed root.
        var target = entry.filterTarget;
        if (target) {
          mutating = true;
          try {
            target.style.filter = entry.origFilter || '';
          } finally {
            mutating = false;
          }
        }
        delete entry.appliedLevers.saturation;
      } catch (err) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('SlowGram: saturation revert error', err);
        }
      }
    }
  };
  applicators.saturation = saturationApp;

  /**
   * autoplayApp — the Autoplay lever (LEVR-04, D-25): at phase 3 REMOVES the
   * loop attribute (a present loop attribute keeps the reel restarting — a
   * loop="false" write is a no-op trap, T-03-10) and captures origHadLoop;
   * revert restores PRESENCE via setAttribute('loop', '') — the attribute
   * being present is what loops, its value is irrelevant. The ended stop
   * point is driven by onEnded, which gates on appliedLevers.autoplay. State
   * lives in the registry entry (never on the element); writes ride the D-14
   * mutating flag; idempotent by phase; contained.
   */
  var autoplayApp = {
    key: 'autoplay',
    apply: function (phase, video) {
      try {
        var entry = videoStates.get(video);
        if (!entry) { return; }
        if (entry.appliedLevers && entry.appliedLevers.autoplay === phase) { return; }
        if (typeof video.hasAttribute === 'function' && video.hasAttribute('loop')) {
          if (entry.origHadLoop === undefined) { entry.origHadLoop = true; }   // first touch only
          mutating = true;
          try {
            video.removeAttribute('loop');   // NEVER loop="false" (T-03-10)
          } finally {
            mutating = false;
          }
        } else {
          entry.origHadLoop = false;
        }
        entry.appliedLevers = entry.appliedLevers || {};
        entry.appliedLevers.autoplay = phase;
      } catch (err) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('SlowGram: autoplay apply error', err);
        }
      }
    },
    revert: function (video) {
      try {
        var entry = videoStates.get(video);
        if (!entry || !entry.appliedLevers || !entry.appliedLevers.autoplay) { return; }
        if (entry.origHadLoop && typeof video.setAttribute === 'function') {
          mutating = true;
          try {
            video.setAttribute('loop', '');   // restore presence — attribute presence is what loops
          } finally {
            mutating = false;
          }
        }
        delete entry.appliedLevers.autoplay;
      } catch (err) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('SlowGram: autoplay revert error', err);
        }
      }
    }
  };
  applicators.autoplay = autoplayApp;

  /**
   * bufferApp — the flagged Buffer capstone (LEVR-05, D-26/D-27): a
   * standalone applicator-shaped helper, NOT in the applicators map — the
   * matrix is T15-locked and the reconcile revert loop would cancel a
   * matrix-driven stall. Driven ONLY from onEnded at the autoplay stop
   * point, and only while bufferEnabled (CONFIG.buffer.enabled is the
   * frozen production default). The stall is frame-counted on the rAF
   * carrier (CONFIG.buffer.stallFrames = 2 frames ≈ 33ms — sub-200ms),
   * never a timer (Phase 1 ban). apply starts a stall; revert cancels it so
   * a cancelled stall never resumes a video later (revertAll cleanliness).
   */
  var bufferApp = {
    key: 'buffer',
    apply: function (phase, video) {
      var entry = videoStates.get(video);
      if (!entry) { return; }
      entry.bufferStall = CONFIG.buffer.stallFrames;
    },
    revert: function (video) {
      var entry = videoStates.get(video);
      if (!entry) { return; }
      entry.bufferStall = 0;
    }
  };

  /**
   * applyToVideo — the per-video reconcile (D-16): apply every applicator in
   * CONFIG.degradationMatrix[phase], REVERT every applicator applied but no
   * longer in the matrix (de-escalation and phase-0 reset revert
   * automatically). Guards REELS — the hub never applies outside the Reels
   * surface (trust contract, T-03-02).
   */
  function applyToVideo(video) {
    if (state.context !== 'REELS') { return; }
    if (!videoStates.has(video)) { return; }
    var keys = CONFIG.degradationMatrix[String(state.phase)] || [];
    var k;
    for (var i = 0; i < keys.length; i++) {
      k = keys[i];
      if (applicators[k]) { applicators[k].apply(state.phase, video); }
    }
    for (k in applicators) {
      if (keys.indexOf(k) === -1) { applicators[k].revert(video); }
    }
  }

  /**
   * applyAll — the transition/batch hub pass: reconcile every live video
   * against the current phase. Guards REELS. Called after emit('phasechange')
   * (the hub emits nothing itself — T22/T23 counts stay green) and on return
   * to REELS (re-apply to the surviving registry).
   */
  function applyAll() {
    if (state.context !== 'REELS') { return; }
    for (var i = 0; i < registryElements.length; i++) {
      var v = registryElements[i];
      if (videoStates.has(v)) { applyToVideo(v); }
    }
  }

  /**
   * revertAll — LEVR-07: restore every live video to native condition.
   * Context-agnostic (the trust contract needs it on SOCIAL/UNKNOWN and on
   * fatigue reset regardless of the current context). Public handle
   * SlowGram.revertAll() + internal calls from setContext(SOCIAL|UNKNOWN)
   * and resetSession().
   */
  function revertAll() {
    for (var i = 0; i < registryElements.length; i++) {
      var v = registryElements[i];
      if (!videoStates.has(v)) { continue; }
      bufferApp.revert(v);   // LEVR-05 cleanliness — a cancelled stall never resumes a video later (social/reset)
      for (var k in applicators) { applicators[k].revert(v); }
    }
  }

  /**
   * dropFromRegistry — D-18 pruning: remove a video element from the live
   * list (batch removedNodes — feed virtualization). The WeakMap entry is
   * untouched (it dies with the element via GC); the array stays bounded.
   */
  function dropFromRegistry(video) {
    var idx = registryElements.indexOf(video);
    if (idx !== -1) { registryElements.splice(idx, 1); }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Phase 4 overlay module (D-1..D-16) — the neutral elapsed-time counter.
  // Pure presentation: rides the bus, never scans the DOM, never uses
  // timers. Values come ONLY from CONFIG.overlay (CORE-05).
  // ──────────────────────────────────────────────────────────────────────

  /**
   * buildOverlayCss — the injected shadow-root stylesheet for the counter
   * pill. Every VALUE is concatenated from CONFIG.overlay (CORE-05 / D-8);
   * the CSS property NAMES are structural (same discipline as Phase 3's
   * `style.filter` writes). pointer-events:none everywhere (D-13).
   *
   * UAT-05 (HARN-06 on-device, found 2026-08-15): the declarations MUST be
   * wrapped in a proper rule ('div { ... }' — the pill is the only element in
   * the shadow tree). Bare declarations without a selector are invalid CSS
   * and are DROPPED by the browser, which left the pill as a static block at
   * the end of body instead of the fixed bottom-left pill (z-index also
   * ignored on a static host).
   */
  function buildOverlayCss() {
    var o = CONFIG.overlay;
    var p = o.pill;
    return 'div { ' + [
      'position: ' + p.position + ';',
      'left: ' + p.left + ';',
      'bottom: ' + p.bottom + ';',
      'padding: ' + p.padding + ';',
      'border-radius: ' + p.borderRadius + ';',
      'max-width: ' + p.maxWidth + ';',
      'font-size: ' + p.fontSize + ';',
      'font-weight: ' + p.fontWeight + ';',
      'line-height: ' + p.lineHeight + ';',
      'background: ' + p.background + ';',
      'color: ' + p.color + ';',
      'pointer-events: none;',
      'z-index: ' + o.zIndex + ';',
      'font-variant-numeric: tabular-nums;',   // UI-SPEC typography — stable pill width across digit changes
      'white-space: nowrap;',                  // bounded copy — never wraps (overflow-safe on narrow screens)
      'overflow: hidden;',
      'text-overflow: clip;',                  // pathological overflow clips, never scrolls, never affects host layout
      'transition: opacity ' + o.fadeMs + 'ms;'
    ].join(' ') + ' }';
  }

  /**
   * overlayMinutes — the ONLY place session ms become displayed minutes
   * (D-5): floored Math.floor(ms / 60000). Pure; no literal drift.
   */
  function overlayMinutes(ms) {
    return Math.floor(ms / 60000);
  }

  /**
   * overlayRender — value-throttled re-render (Pattern B, OVER-01 ≤1/s): the
   * text node updates only when the FLOORED minute changes. Reads state
   * (never the bus arg, never a local counter — D-3). No-ops without a host.
   */
  function overlayRender() {
    if (!overlayHostEl || !overlayText) { return; }
    if (!overlayShouldShow()) { return; }
    var mins = overlayMinutes(state.elapsedMs);
    if (mins !== overlayLastMinutes) {
      overlayText.nodeValue = mins + ' ' + CONFIG.overlay.unitLabel;
      overlayLastMinutes = mins;
    }
  }

  /**
   * onOverlayElapsed — bus subscriber ('elapsed'): the rAF/elapsed carrier.
   * First re-checks the fullscreen clause (catches WebView fullscreen changes
   * the event missed — poll-free, D-15); then re-renders (throttled inside).
   * Zero timer APIs (Phase 1 ban).
   */
  function onOverlayElapsed() {
    // rAF/elapsed carrier: re-evaluate the predicate poll-free — catches
    // WebView fullscreen changes the event missed (entry hides, exit shows).
    if (overlayHostEl) {
      if (overlayIsFullscreen() && overlayHostEl.style.opacity !== '0') {
        overlayHideInstant();
        return;
      }
      if (!overlayIsFullscreen() && overlayShouldShow() && overlayHostEl.style.opacity !== '1') {
        overlayShow();
      }
    }
    overlayRender();
  }

  /**
   * onOverlayPhase — bus subscriber ('phasechange'): at phase < 1 fade the
   * counter out (D-2, CSS transition — no timers); at phase >= 1 render the
   * real session time (D-3 — never '0 min').
   */
  function onOverlayPhase(next) {
    if (next < 1) {
      overlayHideFade();
      return;
    }
    overlayRender();
  }

  /**
   * onOverlayReset — bus subscriber ('reset'): fatigue reset → phase 0 →
   * fade out and clear the throttle latch so a later re-entry re-renders
   * even at the same minute value (T-O13). Never shows a zeroed counter.
   */
  function onOverlayReset() {
    overlayHideFade();
    overlayLastMinutes = -1;
    if (overlayText) { overlayText.nodeValue = ''; }
  }

  /**
   * overlayIsFullscreen — OVER-03 detection (RESEARCH Pattern D): the
   * counter hides while a live video is in native fullscreen
   * (webkitDisplayingFullscreen — the canonical iOS check, WebKit bug 149386)
   * OR the document fullscreen API reports an element (desktop). Cheap reads
   * only; iterates the pruned live registry (bounded). Poll-free — this is
   * checked on the rAF/elapsed carrier + the fullscreenchange listener.
   */
  function overlayIsFullscreen() {
    var d = env.document;
    if (d && (d.fullscreenElement || d.webkitFullscreenElement)) { return true; }
    for (var i = 0; i < registryElements.length; i++) {
      var v = registryElements[i];
      if (v && v.webkitDisplayingFullscreen === true) { return true; }
    }
    return false;
  }

  /**
   * overlayShouldShow — the visibility predicate: the counter appears ONLY on
   * REELS at phase >= 1 (D-1), never while the tab is hidden (D-4, wave 4
   * fills) or fullscreen (D-15/OVER-03). Single boolean function.
   */
  function overlayShouldShow() {
    return killSwitchEnabled && state.context === 'REELS' && state.phase >= 1 && !overlayIsFullscreen();
  }

  /**
   * ensureOverlayHost — D-12 lazy creation: builds the shadow-DOM host once
   * (latched by overlayCreated), injects the pill stylesheet, registers the
   * host with the D-14 overlayHost seam so the engine's self-mutation batch
   * filter excludes its subtree, and appends it to the document body.
   * Contained: a failure logs and never breaks the host page (engine
   * containment contract); missing attachShadow support degrades silently.
   */
  function ensureOverlayHost() {
    if (overlayCreated) { return overlayHostEl; }
    var doc = env.document;
    if (!doc || typeof doc.createElement !== 'function') { return null; }
    try {
      var host = doc.createElement('div');
      if (typeof host.attachShadow !== 'function') { return null; }  // graceful: no shadow support
      var shadow = host.attachShadow({ mode: 'open' });
      if (!shadow || typeof shadow.appendChild !== 'function') { return null; }
      host.style.pointerEvents = 'none';
      host.style.zIndex = String(CONFIG.overlay.zIndex);
      var style = doc.createElement('style');
      style.textContent = buildOverlayCss();
      shadow.appendChild(style);
      // The counter text node ('N min') — created with the host; the first
      // overlayRender() sets the real value (D-3). createTextNode when the
      // injected document provides it, else a minimal text-like object.
      var pill = doc.createElement('div');
      if (typeof doc.createTextNode === 'function') {
        overlayText = doc.createTextNode('');
      } else {
        overlayText = { nodeValue: '', data: '' };
      }
      pill.appendChild(overlayText);
      shadow.appendChild(pill);
      overlayHost = host;          // D-14 seam — isInsideOverlayHost now excludes the subtree
      overlayHostEl = host;
      overlayCreated = true;
      if (doc.body && typeof doc.body.appendChild === 'function') {
        doc.body.appendChild(host);
      }
      return host;
    } catch (err) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('SlowGram: overlay host creation failed', err);
      }
      return null;
    }
  }

  /**
   * overlayShow — fade in (opacity 1 via the CSS transition, D-2). No-op
   * when the host doesn't exist or the predicate is false.
   */
  function overlayShow() {
    if (!overlayHostEl || !overlayShouldShow()) { return; }
    overlayHostEl.style.opacity = '1';
  }

  /**
   * overlayHideFade — fade out (opacity 0 via the CSS transition, D-2). The
   * INSTANT path is context/fullscreen (D-14/D-15) — overlayHideInstant.
   */
  function overlayHideFade() {
    if (!overlayHostEl) { return; }
    overlayHostEl.style.opacity = '0';
  }

  /**
   * overlayHideInstant — D-14/D-15 instant hide: opacity 0 with the CSS
   * transition DISABLED for the write, so the counter never lingers even one
   * frame on a social route or over a fullscreen takeover. The transition is
   * restored on the next show (the show path leaves it enabled — fade in).
   */
  function overlayHideInstant() {
    if (!overlayHostEl) { return; }
    overlayHostEl.style.transition = 'none';
    overlayHostEl.style.opacity = '0';
    overlayHostEl.style.transition = '';   // restored — next show fades in (D-14/D-15)
  }

  /**
   * onOverlayContext — bus subscriber ('contextchange', D-14): SOCIAL/UNKNOWN
   * → instant hide (never a fading counter on a social page); REELS → fade
   * back in with phase/time preserved (no re-creation).
   */
  function onOverlayContext(context) {
    if (context === 'REELS') {
      overlayShow();
      overlayRender();
      return;
    }
    overlayHideInstant();
  }

  /**
   * onOverlayFullscreenChange — the fullscreenchange/webkitfullscreenchange
   * listener (poll-free detection, D-15): on entry the predicate flips false
   * → instant hide; on exit → fade back in.
   */
  function onOverlayFullscreenChange() {
    if (overlayIsFullscreen()) {
      overlayHideInstant();
    } else {
      overlaySync();   // exit: create (if never created — predicate now allows) + render + fade in
    }
  }

  /**
   * onOverlayVisibilityChange — the document visibilitychange listener (D-4):
   * tab hidden → instant hide (the clock pauses; a frozen counter is noise);
   * tab visible again → fade back in (predicate re-evaluated via overlaySync).
   */
  function onOverlayVisibilityChange() {
    var d = env.document;
    if (d && d.visibilityState === 'hidden') {
      overlayHideInstant();
    } else {
      overlaySync();
    }
  }

  /**
   * overlaySync — the single creation point, called after emit('phasechange')
   * in syncPhase. Idempotent: creates the host once when the predicate first
   * becomes true, renders the real session time, and shows it (D-1/D-3).
   */
  function overlaySync() {
    if (!overlayShouldShow()) { return; }
    var host = ensureOverlayHost();
    if (host) {
      overlayRender();
      overlayShow();
    }
  }

  /**
   * overlayTeardown — D-16 destroy path: removes the overlay host from the
   * DOM entirely and clears every overlay reference (host element, D-14 seam,
   * text node, throttle latch, creation latch). Called from teardown() so a
   * destroy()/re-init cycle leaves zero dead nodes. The BUS subscriptions are
   * NOT touched — teardown preserves subscribers, so the counter re-creates
   * its host lazily on the next phase >= 1 (single instance ever).
   */
  function overlayTeardown() {
    if (overlayHostEl && overlayHostEl.parentNode &&
        typeof overlayHostEl.parentNode.removeChild === 'function') {
      overlayHostEl.parentNode.removeChild(overlayHostEl);
    }
    overlayCreated = false;
    overlayHostEl = null;
    overlayHost = null;
    overlayText = null;
    overlayLastMinutes = -1;
  }

  /**
   * disableKillSwitch — HARN-05/D-13 the REVERT-not-pause path: flips the
   * latch off, restores every live video to native (revertAll), and removes
   * the overlay host. The feed is native IMMEDIATELY — the moment the flag
   * flips — and the next frame is already clean (D-12 one-frame stop).
   * Re-enabling (latch back on) resumes a fresh session; no new timers.
   */
  function disableKillSwitch() {
    killSwitchEnabled = false;
    // P2-1 (audit fix, 2026-08): disable ENDS the session — resetSession()
    // zeroes the clock (elapsedMs/phase) through the public, observable path
    // (emit 'reset', T-01-11 — accumulated time is never silently discarded).
    // Before this, the clock kept running at phase 3 with the feed native and
    // no pill — and a re-enable resumed that stale phase-3 clock with ZERO
    // levers applied (degradation silently missing while the timer counted).
    // Now both the killed state and a re-enable are coherent: engine off =
    // no session; re-enable resumes a genuinely FRESH session from 0.
    resetSession();
    overlayTeardown();
  }

  /**
   * contained — wraps a lifecycle handler so a failure inside it never
   * escapes into the host page's global scope (T-01-01 containment).
   */
  function contained(fn) {
    return function () {
      try {
        fn.apply(null, arguments);
      } catch (err) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('SlowGram: lifecycle handler error', err);
        }
      }
    };
  }

  /**
   * bindLifecycle — the full four-signal lifecycle wiring (CORE-03,
   * RESEARCH.md Common Operation 3 + Pattern 3). Event targets are locked to
   * the Chrome Page Lifecycle API: visibilitychange/resume → document,
   * pageshow/focus → window (Shared Pattern 9 — getting targets wrong makes
   * fake-vs-live behavior diverge). pageshow is guarded by e.persisted — it
   * also fires on initial load / same-window navigation (Pitfall 8). Bound
   * handlers are recorded in lifecycleHandlers so destroy() can remove them
   * (T-01-10 listener leak). Every handler is try/catch contained.
   */
  function bindLifecycle(env) {
    var d = env.document;
    var w = env.window;
    var onVisibilityChange = contained(function () {
      if (env.visibilityState() === 'hidden') { onHidden(); } else { onResume(); }
    });
    var onResumeWrapped = contained(onResume);
    var onPageShow = contained(function (e) {
      if (e.persisted) { onResume(); }
    });
    if (d && d.addEventListener) {
      d.addEventListener('visibilitychange', onVisibilityChange);
      lifecycleHandlers.push({ target: d, type: 'visibilitychange', fn: onVisibilityChange });
      d.addEventListener('resume', onResumeWrapped);          // Chrome 68+ frozen→active (A3)
      lifecycleHandlers.push({ target: d, type: 'resume', fn: onResumeWrapped });
    }
    if (w && w.addEventListener) {
      w.addEventListener('pageshow', onPageShow);             // persisted guard (Pitfall 8)
      lifecycleHandlers.push({ target: w, type: 'pageshow', fn: onPageShow });
      w.addEventListener('focus', onResumeWrapped);           // WebView/PWA fallback
      lifecycleHandlers.push({ target: w, type: 'focus', fn: onResumeWrapped });
    }
  }

  /**
   * onRouteSignal — the single funnel for every D-06/D-13 pathname event
   * (popstate, hashchange, and the pushState/replaceState wrappers): re-run
   * the classification through refresh('route'). All RouteGuard signals
   * delegate to ContextDetector; DomWatcher reacts to context change via
   * setContext, never to the signals directly (02-02 plan key_link).
   * onRouteSignalSafe is the try/catch-contained variant (T-01-01).
   */
  function onRouteSignal() {
    refresh('route');
  }
  var onRouteSignalSafe = contained(onRouteSignal);

  /**
   * bindRouteEvents — D-13 source 1: the window popstate/hashchange
   * listeners (locked to the window target — real browsers fire these on
   * the window, not the location object). Recorded in lifecycleHandlers so
   * destroy() removes them (T-01-10 no-leak discipline). The history
   * pushState/replaceState wrapping lands with bindRouteGuard (Plan 02-02
   * Task 2); the event listeners are the refresh-source half of the same
   * contract. Both listeners share one contained handler — removal is
   * per-(target, type, fn), so teardown still removes each exactly once.
   */
  function bindRouteEvents() {
    var w = env.window;
    if (w && w.addEventListener) {
      w.addEventListener('popstate', onRouteSignalSafe);
      lifecycleHandlers.push({ target: w, type: 'popstate', fn: onRouteSignalSafe });
      w.addEventListener('hashchange', onRouteSignalSafe);
      lifecycleHandlers.push({ target: w, type: 'hashchange', fn: onRouteSignalSafe });
    }
  }

  /**
   * bindRouteGuard — the D-06 History API interception half of RouteGuard
   * (Common Operation 1, 02-RESEARCH.md:361-380). Wraps window.history
   * pushState/replaceState with bound originals: each wrapper performs the
   * REAL navigation call FIRST (orig.apply(h, arguments) — so the URL
   * actually changes) and THEN funnels the re-classification through
   * onRouteSignal → refresh('route'). Originals are stored in routeGuard so
   * unbindRouteGuard() restores them exactly (destroy hygiene, T-02-05).
   * Idempotent: routeGuard.bound guards against double-wrapping on repeated
   * binds. A missing/non-functional history is a fail-safe no-op — never a
   * throw (the rAF re-check fallback still covers pathname changes). All
   * signals funnel into ContextDetector.refresh; DomWatcher reacts via
   * setContext, never to the signals directly.
   */
  function bindRouteGuard() {
    if (routeGuard.bound) { return; }
    var h = env.window && env.window.history;
    if (!h || typeof h.pushState !== 'function' || typeof h.replaceState !== 'function') { return; }
    routeGuard.h = h;
    routeGuard.origPush = h.pushState;
    routeGuard.origReplace = h.replaceState;
    h.pushState = function () {
      routeGuard.origPush.apply(h, arguments);
      onRouteSignalSafe();
    };
    h.replaceState = function () {
      routeGuard.origReplace.apply(h, arguments);
      onRouteSignalSafe();
    };
    routeGuard.bound = true;
  }

  /**
   * unbindRouteGuard — restores the original history methods so destroy()/
   * re-init cycles are clean (mirrors Phase 1 lifecycleHandlers discipline,
   * T-02-05). The popstate/hashchange window listeners are removed by the
   * teardown lifecycleHandlers loop, NOT here — this function owns ONLY the
   * history restoration.
   */
  function unbindRouteGuard() {
    if (routeGuard.bound && routeGuard.h) {
      routeGuard.h.pushState = routeGuard.origPush;
      routeGuard.h.replaceState = routeGuard.origReplace;
    }
    routeGuard.bound = false;
    routeGuard.h = null;
    routeGuard.origPush = null;
    routeGuard.origReplace = null;
  }

  /**
   * emit — deliver data to subscribers of `event`. Subscriber failures are
   * contained so a throwing consumer can never break the engine or host.
   */
  function emit(event, data) {
    var cbs = listeners[event];
    if (!cbs) { return; }
    for (var i = 0; i < cbs.length; i++) {
      try {
        cbs[i](data);
      } catch (err) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('SlowGram: subscriber error on "' + event + '"', err);
        }
      }
    }
  }

  /**
   * teardown — the single destroy path shared by SlowGram.destroy() and the
   * idempotent init() guard. Removes all four lifecycle listeners from the
   * injected document/window via the lifecycleHandlers registry (no leak
   * across init/destroy cycles, T-01-10), stops the rAF poll via the
   * state.destroyed flag pollLoop consults, and resets state to fresh
   * pre-init values so a subsequent init() re-initializes cleanly (locked
   * contract D4/D5). SUBSCRIBERS ARE PRESERVED by design: Phase 2+ consumers
   * subscribe once at page load and must keep receiving events across
   * destroy/re-init cycles — the listener registry is never cleared here.
   */
  function teardown() {
    for (var i = 0; i < lifecycleHandlers.length; i++) {
      var h = lifecycleHandlers[i];
      if (h.target && typeof h.target.removeEventListener === 'function') {
        h.target.removeEventListener(h.type, h.fn);
      }
    }
    lifecycleHandlers = [];
    // DomWatcher teardown (T-01-10 no-leak discipline): disconnect the
    // observer so no live observer survives destroy/re-init. The registry is
    // reset to a fresh WeakMap for engine-instance isolation — the D-07
    // keep-registry contract applies to the disconnect-on-social path only,
    // not to a full engine teardown (destroy/re-init must start clean).
    revertAll();                    // LEVR-07 hygiene: destroy restores every wrapper to native
    disconnectWatcher();
    unbindRouteGuard();             // D-06: restore the original history methods (T-02-05)
    // D-29 element-listener hygiene: a destroy leaves every registered video
    // listener-free — unbind loadstart/emptied/ended from the live elements so
    // a re-init re-binds exactly once (the real DOM dedupes by fn reference;
    // the fake accumulates — the unbind keeps BOTH hosts at one bind per cycle).
    for (var ej = 0; ej < registryElements.length; ej++) {
      var ev = registryElements[ej];
      if (typeof ev.removeEventListener === 'function') {
        ev.removeEventListener('loadstart', onLoadStart);
        ev.removeEventListener('emptied', onEmptied);
        ev.removeEventListener('ended', onEnded);
        ev.removeEventListener('volumechange', onVolumeChange);   // P2-4 (D-29 unbind discipline)
      }
    }
    videoStates = new WeakMap();
    registryCount = 0;
    registryElements = [];          // D-18: fresh live list per engine instance
    overlayTeardown();              // Phase 4 (D-16): destroy removes the host from the DOM
                                    // entirely + clears the D-14 seam — re-init recreates
                                    // a fresh single host lazily on the next phase >= 1.
    health = { missStreak: 0, drifted: false };   // fresh selector health per engine instance
    lastPathname = null;                // reset the rAF-batch diff base (fresh re-init)
    state.destroyed = true;
    state.elapsedMs = 0;
    state.phase = 0;
    state.context = 'UNKNOWN';
    state.visible = true;
    state.hiddenAt = null;
    state.lastBoundary = 0;
    state.running = false;
    initialized = false;
  }

  /**
   * SlowGram.init — resolve the seam, build the frozen CONFIG, reset to a
   * fresh engine, bind lifecycle, and start the rAF poll. Idempotent
   * (T-01-13): if already initialized and not destroyed, the previous binding
   * is torn down internally BEFORE re-binding — init() is safe to call
   * repeatedly without an explicit destroy(), and listeners are never
   * duplicated (subscribers survive the re-init). Any init failure is
   * console.error'd AND rethrown — a malformed container gets a loud,
   * descriptive Error instead of a silently-half-bound engine (T-01-12).
   */
  SlowGram.init = function (overrides) {
    try {
      overrides = overrides || {};
      if (initialized && !state.destroyed) {
        teardown();                     // internal destroy-then-reinit
      }
      env = resolveEnv(overrides);
      CONFIG = initConfig();
      bufferEnabled = CONFIG.buffer.enabled;   // LEVR-05 fresh per init — a flipped _setBufferEnabled flag does not survive re-init
      pendingBatch = [];                        // HARN-01 fresh per init — a prior batch's overflow never leaks across init cycles (state isolation)
      lastFrameProcessed = 0;
      killSwitchEnabled = CONFIG.killSwitch.enabled;  // HARN-05/D-12 fresh per init — a flipped _setKillSwitchForTest flag does not survive re-init
      state.destroyed = false;
      lifecycleHandlers = [];
      bindLifecycle(env);
      bindRouteEvents();              // D-13 source 1: popstate/hashchange → refresh('route')
      bindRouteGuard();               // D-06: wrap pushState/replaceState → refresh('route')
      detectContext();                // Phase 2: classify the current pathname on init
      // Phase 4 overlay DOM listeners on the injected document, registered in
      // lifecycleHandlers so teardown removes them (no stacking across
      // init/destroy cycles — T-O29/T-O36). fullscreen (OVER-03/D-15) rides
      // the event + the rAF/elapsed carrier; visibilitychange (D-4) mirrors
      // the clock's REELS && visible gate. Both poll-free, timer-free.
      if (env.document && typeof env.document.addEventListener === 'function') {
        var fsHandler = contained(onOverlayFullscreenChange);
        env.document.addEventListener('fullscreenchange', fsHandler);
        lifecycleHandlers.push({ target: env.document, type: 'fullscreenchange', fn: fsHandler });
        env.document.addEventListener('webkitfullscreenchange', fsHandler);
        lifecycleHandlers.push({ target: env.document, type: 'webkitfullscreenchange', fn: fsHandler });
        var visHandler = contained(onOverlayVisibilityChange);
        env.document.addEventListener('visibilitychange', visHandler);
        lifecycleHandlers.push({ target: env.document, type: 'visibilitychange', fn: visHandler });
      }
      if (env.requestAnimationFrame) {
        env.requestAnimationFrame(pollLoop);
      }
      initialized = true;
    } catch (err) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('SlowGram: init failed', err);
      }
      throw err;                        // loud rethrow — never silent substitution
    }
    return SlowGram;
  };

  SlowGram.getState = function () {
    return {
      elapsedMs: state.elapsedMs,
      phase: state.phase,
      context: state.context,
      visible: state.visible,
      hiddenAt: state.hiddenAt,
      lastBoundary: state.lastBoundary   // HARN-02/D-7 — the catch-up base; suites assert the discount/reset invariants
    };
  };

  /**
   * SlowGram.getConfig — test/consumer handle returning the frozen CONFIG
   * object (full CORE-05 shape). Read via this handle so suites assert
   * against the same values the engine accumulates with (never literals).
   */
  SlowGram.getConfig = function () {
    return CONFIG;
  };

  /**
   * SlowGram._phaseFor — TEST-ONLY direct handle to the pure boundary
   * function. Documented test-only: the production surface is sync() +
   * getState().phase; suites use this handle to assert the pure boundary
   * contract (one step either side) without driving fake-clock ticks.
   */
  SlowGram._phaseFor = phaseFor;

  /**
   * SlowGram._classifyPathname — TEST-ONLY direct handle to the pure
   * decision table (precedent: _phaseFor). The production surface is
   * ContextDetector via init + the pathname seam.
   */
  SlowGram._classifyPathname = classifyPathname;

  /**
   * SlowGram._registrySize — TEST-ONLY handle returning the VideoRegistry
   * entry count. WeakMap.prototype.size is non-standard on some hosts, so a
   * closure counter is the portable source of truth.
   */
  SlowGram._registrySize = function () {
    return (typeof videoStates.size === 'number') ? videoStates.size : registryCount;
  };

  /**
   * SlowGram.getRegistryState — Phase 3 consumer interface (also used by
   * suites as the read-side of the DETC-05 contract): a COPY of the per-video
   * entry, or null for unregistered elements. Production surface: this handle
   * (registered elements only — suites assert null for unknown videos).
   */
  SlowGram.getRegistryState = getRegistryState;

  /**
   * SlowGram._getWatcherState — TEST-ONLY handle exposing the DomWatcher
   * lifecycle state: { connected, roots: [feedRoot, dialogRoot] }. Suites
   * assert connect/disconnect per DETC-08/D-12 and the two-root set per
   * D-11/D-03 (precedent: _phaseFor/_classifyPathname handles).
   */
  SlowGram._getWatcherState = function () {
    return {
      connected: watcher.connected,
      roots: [feedRoot(), dialogRoot()]
    };
  };

  /**
   * SlowGram._setMutatingForTest — TEST-ONLY handle toggling the D-14
   * self-mutation flag. Phase 3 levers set it around engine DOM writes; the
   * batch filter skips records taken while it is set. Tests drive it directly
   * to prove the Pitfall 4 protection without a lever.
   */
  SlowGram._setMutatingForTest = function (v) {
    mutating = !!v;
    return SlowGram;
  };

  /**
   * SlowGram._setOverlayHostForTest — TEST-ONLY handle injecting the D-14
   * overlay-host exclusion seam. Phase 4's real overlay container lands later;
   * this handle proves the exclusion path works with a fake host.
   */
  SlowGram._setOverlayHostForTest = function (node) {
    overlayHost = node || null;
    return SlowGram;
  };

  /**
   * SlowGram._overlayState — TEST-ONLY handle (precedent: _getWatcherState/
   * _registrySize): the observable state of the Phase 4 overlay. Suites
   * assert lazy creation (D-12), seam registration (D-14), injected CSS
   * (wave 1), and later the text/opacity lifecycle.
   */
  SlowGram._overlayState = function () {
    return {
      hostExists: !!overlayHostEl,
      created: overlayCreated,
      seamRegistered: overlayHost === overlayHostEl && overlayHostEl !== null,
      bodyAppended: !!(overlayHostEl && overlayHostEl.parentNode !== null),
      opacity: overlayHostEl ? overlayHostEl.style.opacity : null,
      shadowRoot: overlayHostEl ? (overlayHostEl.shadowRoot || null) : null,
      shouldShow: overlayShouldShow(),  // the predicate — tests assert the REELS gate directly
      text: overlayText ? overlayText.nodeValue : null,
      lastMinutes: overlayLastMinutes
    };
  };

  /**
   * SlowGram._batchState — TEST-ONLY handle (HARN-01/D-4; precedent:
   * _getWatcherState/_registrySize): the observable state of the rAF batch
   * yield. Suites assert the yield gate (no frame over maxBatchRecords) and
   * the finite-drain gate (5000 records drain in ceil(5000/200)=25 frames).
   */
  SlowGram._batchState = function () {
    return {
      lastFrameProcessed: lastFrameProcessed,
      pendingRecords: pendingBatch.length
    };
  };

  /**
   * SlowGram._setKillSwitchForTest — TEST-ONLY handle (HARN-05/D-14;
   * precedent: _setMutatingForTest/_setBufferEnabled): false runs the D-13
   * disable path (latch off + revert + overlay teardown — the feed is
   * native immediately), true flips the latch back on (resume). Resets per
   * init from CONFIG.killSwitch.enabled.
   */
  SlowGram._setKillSwitchForTest = function (v) {
    if (v === false || v === 0) {
      disableKillSwitch();
    } else {
      killSwitchEnabled = !!v;
      // P2-1 (audit fix, 2026-08): re-anchor the clock boundary at ENABLE —
      // time spent KILLED is unverifiable (the engine was explicitly off and
      // tick() is gated), so it must never be folded into the first tick of
      // the fresh session (wall-clock discipline, Pitfall 5). Harmless on a
      // no-op enable (boundary refresh only — elapsedMs is untouched).
      state.lastBoundary = env.clock.now();
    }
    return SlowGram;
  };

  /**
   * SlowGram.revertAll — public handle (LEVR-07): restore every live video
   * to native condition (wrappers cleared, appliedLevers reset). Also called
   * internally on SOCIAL/UNKNOWN context and fatigue reset. Idempotent.
   */
  SlowGram.revertAll = function () {
    revertAll();
    return SlowGram;
  };

  /**
   * SlowGram._clampForPlatform — TEST-ONLY direct handle to the pure clamp
   * function (precedent: _phaseFor/_classifyPathname). Reads the resolved
   * env.platform from the current init; suites assert the LEVR-08 clamp
   * spec (webkit 2.0 cap, chromium audible band) without driving a lever.
   */
  SlowGram._clampForPlatform = function (leverKey, value) {
    return clampForPlatform(leverKey, value);
  };

  /**
   * SlowGram._liveRegistrySize — TEST-ONLY handle (D-18, precedent:
   * _registrySize): the length of the pruned live-element list used by
   * applyAll/revertAll iteration — distinct from _registrySize() (the
   * WeakMap-based count, unchanged). Suites assert pruning keeps it bounded.
   */
  SlowGram._liveRegistrySize = function () {
    return registryElements.length;
  };

  /**
   * SlowGram.getSelectorHealth — public handle (D-10 shape): live selector
   * health state from the closure — the same health object the
   * 'selectorHealth' bus event reports (single source of truth). status is
   * 'ok' | 'drift'; missStreak counts consecutive zero-hit scans (N=5 per
   * CONFIG.health.driftThreshold).
   */
  SlowGram.getSelectorHealth = function () {
    return { status: health.drifted ? 'drift' : 'ok', missStreak: health.missStreak };
  };

  /**
   * SlowGram._setDevMode — TEST-ONLY handle toggling the D-08 fail-loud dev
   * mode (precedent: _setMutatingForTest/_setOverlayHostForTest). Default
   * false = prod: drift is fail-soft (bounded fallbackScope, no console
   * noise). Dev/harness sets true: drift also console.warn's once per
   * episode. Test suites stub console.warn and assert the warn fires exactly
   * once (T-D35).
   */
  SlowGram._setDevMode = function (flag) {
    dev = !!flag;
    return SlowGram;
  };

  /**
   * SlowGram._setBufferEnabled — TEST-ONLY handle flipping the LEVR-05
   * buffer flag (precedent: _setDevMode). Default false — production never
   * stalls (CONFIG.buffer.enabled stays frozen false); suites flip it on to
   * prove the frame-counted stall and flip it back for cleanliness. A fresh
   * init() reseeds from CONFIG (a flipped flag does not survive re-init).
   */
  SlowGram._setBufferEnabled = function (flag) {
    bufferEnabled = !!flag;
    return SlowGram;
  };

  /**
   * SlowGram.setContext — public context feed (CORE-01 gating). Throws on
   * invalid context; emits 'contextchange' only on an actual change; re-runs
   * the running gate and ticks so the clock reacts at the boundary.
   */
  SlowGram.setContext = function (context) {
    if (context !== 'REELS' && context !== 'SOCIAL' && context !== 'UNKNOWN') {
      throw new Error('SlowGram: invalid context "' + context + '"');
    }
    if (context !== state.context) {
      state.context = context;
      emit('contextchange', context);
      // DomWatcher hook (D-12 connect-on-REELS-only): REELS → observe the
      // feed root; SOCIAL/UNKNOWN → disconnect (D-07 pauses the clock via
      // updateRunning below; keep-registry — no registry clear here).
      // DegradationEngine hook (D-16): on REELS re-apply the current phase to
      // the surviving registry; on SOCIAL/UNKNOWN revert everything — the
      // trust contract (never degrade outside the Reels surface).
      if (context === 'REELS') {
        connectWatcher();
        applyAll();
      } else {
        disconnectWatcher();
        revertAll();
      }
      updateRunning();
      tick(env.clock.now());
    }
    return SlowGram;
  };

  SlowGram.on = function (event, cb) {
    if (!listeners[event]) { listeners[event] = []; }
    listeners[event].push(cb);
    return SlowGram;
  };

  SlowGram.emit = emit;

  /**
   * SlowGram.destroy — tears the engine down via teardown(): removes all four
   * lifecycle listeners from the injected document/window (no leak across
   * init/destroy cycles, T-01-10), stops the rAF poll via the state.destroyed
   * flag consulted by pollLoop, and resets state to fresh pre-init values so
   * a subsequent init() re-initializes cleanly. Registered subscribers are
   * PRESERVED across destroy/re-init (Phase 2+ consumers subscribe once at
   * page load). Returns SlowGram for chaining.
   */
  SlowGram.destroy = function () {
    teardown();
    return SlowGram;
  };

  // Phase 4 overlay bus subscriptions — ONCE at module load, before any
  // init(). Subscribers are PRESERVED across destroy/re-init (teardown
  // contract), so the counter keeps receiving events through the lifecycle.
  // All handlers are contained (emit already guards per-callback errors).
  SlowGram.on('elapsed', onOverlayElapsed);
  SlowGram.on('phasechange', onOverlayPhase);
  SlowGram.on('reset', onOverlayReset);
  SlowGram.on('contextchange', onOverlayContext);

  global.SlowGram = SlowGram;
})(typeof window !== 'undefined' ? window : globalThis);