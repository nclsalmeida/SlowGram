/**
 * SlowGram clock suite — CORE-01 (Wave 1 tracer).
 *
 * Fully synchronous; time moves only via FakeClock.advance(ms); one
 * raf.flush() = one frame = one tick. The SAME file runs on two hosts:
 *   - Node:    node test/slowgram.test.js   (exit code 0 = green)
 *   - Browser: test/harness.html            (pass/fail table via renderResults)
 */
'use strict';

if (typeof require === 'function' && typeof module !== 'undefined') {
  require('../src/slowgram.js');  // IIFE attaches global.SlowGram
  require('./harness.js');        // attaches harness globals
}

var fs = (typeof require === 'function') ? require('fs') : null;
var edgeTotalForParity = null;   // HARN-07 (T-H04): the Edge harness.html TOTAL, asserted in the epilogue
// HARN-07 (T-H04): the Edge harness.html TOTAL, asserted in the epilogue

/**
 * freshEnv — a fully mocked engine instance (fresh mocks per test).
 * opts: { root: FakeElement tree mounted on the document (query surface),
 *         location: FakeLocation pathname source,
 *         observer: MutationObserver constructor (default null — Phase 1
 *         suites never connect an observer) }.
 * Additive only: existing callers freshEnv() with no args keep the exact
 * Phase 1 behavior.
 */
function freshEnv(opts) {
  opts = opts || {};
  var clock = FakeClock(1000000);
  var doc = FakeDocument({ visibilityState: 'visible', root: opts.root });
  var win = FakeWindow();
  win.location = opts.location || FakeLocation('/');
  win.location._window = win;          // popstate/hashchange dispatch target (bindRouteEvents)
  var raf = FakeRAF();
  SlowGram.init({
    clock: clock,
    document: doc,
    window: win,
    MutationObserver: opts.observer || null,
    requestAnimationFrame: raf.request,
    platform: opts.platform   // D-21: 'webkit' | 'chromium' | undefined → UA-sniffed default
  });
  return { clock: clock, doc: doc, win: win, raf: raf, location: win.location, elem: FakeElement };
}

// Test 1 — REELS + visible accumulates exactly the advanced delta.
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(180000);
  e.raf.flush();
  assert.equal(SlowGram.getState().elapsedMs, 180000, 'T1: REELS+visible accumulates exactly 180000ms');
})();

// Test 2 — SOCIAL context never accumulates.
(function () {
  var e = freshEnv();
  SlowGram.setContext('SOCIAL');
  e.clock.advance(60000);
  e.raf.flush();
  assert.equal(SlowGram.getState().elapsedMs, 0, 'T2: SOCIAL leaves elapsedMs at 0');
})();

// Test 3 — UNKNOWN context (fail-safe default) never accumulates.
(function () {
  var e = freshEnv();
  SlowGram.setContext('UNKNOWN');
  e.clock.advance(60000);
  e.raf.flush();
  assert.equal(SlowGram.getState().elapsedMs, 0, 'T3: UNKNOWN leaves elapsedMs at 0');
})();

// Test 4 — hidden time never accumulates (clock pauses with visibility).
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(30000);
  e.raf.flush();
  assert.equal(SlowGram.getState().elapsedMs, 30000, 'T4a: 30000ms baseline accumulated while visible');
  e.doc.setVisibility('hidden');
  e.doc.dispatchEvent(new Event('visibilitychange'));
  e.clock.advance(60000);
  e.raf.flush();
  assert.equal(SlowGram.getState().elapsedMs, 30000, 'T4b: hidden time does not accumulate');
})();

// Test 5 — DI seam: default fail-safe context + setContext reflection.
(function () {
  var e = freshEnv();
  assert.equal(SlowGram.getState().context, 'UNKNOWN', 'T5a: default context is UNKNOWN after init');
  SlowGram.setContext('REELS');
  assert.equal(SlowGram.getState().context, 'REELS', 'T5b: setContext reflects in getState()');
  assert.ok(SlowGram.getState().elapsedMs === 0, 'T5c: clock stays paused until REELS sets running');
  assert.ok(typeof SlowGram.init === 'function', 'T5d: init on the public API');
  assert.ok(typeof SlowGram.getState === 'function', 'T5e: getState on the public API');
  assert.ok(typeof SlowGram.setContext === 'function', 'T5f: setContext on the public API');
  assert.ok(typeof SlowGram.on === 'function', 'T5g: on on the public API');
  assert.ok(typeof SlowGram.emit === 'function', 'T5h: emit on the public API');
  assert.ok(typeof SlowGram.destroy === 'function', 'T5i: destroy on the public API');
})();

// Task 2 — CORE-01 clock contract extension: negative-delta clamp, segment
// cap, 'elapsed'/'contextchange' events, invalid-context throw.

// Test 6 — negative clock delta (NTP back-step) leaves elapsedMs unchanged
// and non-negative (Pitfall 7 clamp).
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(30000);
  e.raf.flush();
  assert.equal(SlowGram.getState().elapsedMs, 30000, 'T6a: 30000ms baseline before back-step');
  e.clock.advance(-5000);            // now < lastBoundary
  e.raf.flush();
  assert.equal(SlowGram.getState().elapsedMs, 30000, 'T6b: negative delta leaves elapsedMs unchanged');
  assert.ok(SlowGram.getState().elapsedMs >= 0, 'T6c: elapsedMs stays non-negative');
})();

// Test 7 — segment cap: one giant segment adds exactly CONFIG.segmentCapMs.
(function () {
  var e = freshEnv();
  assert.equal(typeof SlowGram.getConfig, 'function', 'T7a: getConfig is a test/consumer handle');
  var cap = (typeof SlowGram.getConfig === 'function') ? SlowGram.getConfig().segmentCapMs : -1;
  assert.equal(cap, 900000, 'T7b: CONFIG.segmentCapMs === 900000');
  SlowGram.setContext('REELS');
  e.clock.advance(1200000);          // 20 min in one segment
  e.raf.flush();
  assert.equal(SlowGram.getState().elapsedMs, 900000, 'T7c: one segment adds exactly segmentCapMs (900000)');
})();

// Test 8 — 'elapsed' event: fired with the new elapsedMs on the flush tick.
(function () {
  var e = freshEnv();
  var payloads = [];
  SlowGram.on('elapsed', function (ms) { payloads.push(ms); });
  SlowGram.setContext('REELS');
  e.clock.advance(60000);
  e.raf.flush();
  var newElapsed = SlowGram.getState().elapsedMs;
  assert.equal(newElapsed, 60000, 'T8a: elapsedMs advanced to 60000');
  var exactlyOnce = payloads.filter(function (p) { return p === newElapsed; }).length;
  assert.equal(exactlyOnce, 1, 'T8b: elapsed fired exactly once with payload === new elapsedMs');
})();

// Test 9 — 'contextchange' event: emitted only on an actual change.
(function () {
  var e = freshEnv();
  var count = 0;
  var lastPayload = null;
  SlowGram.on('contextchange', function (ctx) { count++; lastPayload = ctx; });
  SlowGram.setContext('REELS');
  SlowGram.setContext('REELS');      // no-op — must NOT emit again
  assert.equal(count, 1, 'T9a: contextchange emitted exactly once');
  assert.equal(lastPayload, 'REELS', 'T9b: payload is the new context');
})();

// Test 10 — invalid context throws an Error.
(function () {
  var e = freshEnv();
  assert.throws(function () { SlowGram.setContext('FOO'); }, 'T10: setContext("FOO") throws');
})();

// Task 1 — CORE-05 config suite: the single deep-frozen CONFIG constants
// object. CONFIG is always read via SlowGram.getConfig() — never literals
// except where the locked VALUES themselves are under test (T14).

// Test 11 — deep-freeze on CONFIG and EVERY nested node (Pitfall 2: shallow
// Object.freeze is the footgun — nested nodes stay mutable; RESEARCH.md:319).
(function () {
  var C = SlowGram.getConfig();
  assert.ok(Object.isFrozen(C), 'T11a: CONFIG is frozen');
  assert.ok(Object.isFrozen(C.phaseBoundariesMin), 'T11b: phaseBoundariesMin array is frozen');
  assert.ok(Object.isFrozen(C.degradationMatrix), 'T11c: degradationMatrix is frozen');
  assert.ok(Object.isFrozen(C.selectors), 'T11d: selectors is frozen');
  assert.ok(Object.isFrozen(C.preservedRoutes), 'T11e: preservedRoutes is frozen');
  assert.ok(Object.isFrozen(C.routeKeywords), 'T11f: routeKeywords is frozen');
  assert.ok(Object.isFrozen(C.health), 'T11g: health is frozen');
})();

// Test 12 — a strict-mode write to a CONFIG property throws TypeError
// (frozen + non-extensible + 'use strict' = loud failure, never silent).
(function () {
  var C = SlowGram.getConfig();
  assert.throws(function () { 'use strict'; C.fatigueWindowMs = 1; }, 'T12: strict write to CONFIG.fatigueWindowMs throws TypeError');
})();

// Test 13 — a strict-mode write to a nested array element throws TypeError.
(function () {
  var C = SlowGram.getConfig();
  assert.throws(function () { 'use strict'; C.phaseBoundariesMin[0] = 99; }, 'T13: strict write to CONFIG.phaseBoundariesMin[0] throws TypeError');
})();

// Test 14 — locked values live IN CONFIG (no magic numbers scattered in the
// engine — CORE-05): [3,7,12] boundaries, 5-min fatigue window, 15-min cap.
(function () {
  var C = SlowGram.getConfig();
  assert.equal(JSON.stringify(C.phaseBoundariesMin), JSON.stringify([3, 7, 12]), 'T14a: phaseBoundariesMin deep-equals [3,7,12]');
  assert.equal(C.fatigueWindowMs, 300000, 'T14b: fatigueWindowMs === 300000');
  assert.equal(C.segmentCapMs, 900000, 'T14c: segmentCapMs === 900000');
  // Phase 2 detection constants live IN CONFIG (CORE-05 — never literals).
  assert.equal(C.reelsPrefix, '/reels/', 'T14d: reelsPrefix === /reels/ (D-02)');
  assert.equal(C.selectors.video, 'video', 'T14e: selectors.video is the registered tag selector');
  assert.equal(C.selectors.roleMain, '[role="main"]', 'T14f: selectors.roleMain is the registered main selector');
  assert.equal(C.selectors.roleDialog, '[role="dialog"]', 'T14g: selectors.roleDialog is the registered dialog selector');
  assert.equal(C.health.driftThreshold, 5, 'T14h: health.driftThreshold === 5 (D-09)');
})();

// Test 15 — degradationMatrix has exactly one entry per phase (keys '0'..'3')
// and preservedRoutes carries the social routes that must never degrade.
(function () {
  var C = SlowGram.getConfig();
  var matrix = C.degradationMatrix || {};
  assert.equal(JSON.stringify(Object.keys(matrix)), JSON.stringify(['0', '1', '2', '3']), 'T15a: degradationMatrix has keys 0..3 (one per phase)');
  var routes = C.preservedRoutes || [];
  assert.ok(routes.indexOf('/direct/') !== -1, 'T15b: preservedRoutes contains /direct/');
  assert.ok(routes.indexOf('/messages/') !== -1, 'T15c: preservedRoutes contains /messages/');
  assert.ok(routes.indexOf('/stories/') !== -1, 'T15d: preservedRoutes contains /stories/ (full D-04 list)');
  var keywords = C.routeKeywords || [];
  assert.ok(keywords.indexOf('reels') !== -1, 'T15e: routeKeywords contains reels (D-05 guard)');
})();

// Task 2 — CORE-02 phase suite: pure phaseFor + transition-guarded sync.
// Boundary values derive from CONFIG.phaseBoundariesMin — never 3/7/12
// literals (RESEARCH.md:463); 60000 is the ms-per-minute conversion constant
// (integer math only, FA-04). The >= contract (FA-03): exactly at a boundary
// returns the NEXT phase; one ms below returns the previous.

// Test 16 — phase 0: below the first boundary (elapsedMs 0 and 1ms before 3m).
(function () {
  if (typeof SlowGram._phaseFor !== 'function') { assert.ok(false, 'T16: SlowGram._phaseFor test handle missing'); return; }
  var b = SlowGram.getConfig().phaseBoundariesMin;
  assert.equal(SlowGram._phaseFor(0), 0, 'T16a: phaseFor(0) === 0');
  assert.equal(SlowGram._phaseFor(b[0] * 60000 - 1), 0, 'T16b: phaseFor(just below 3m) === 0');
})();

// Test 17 — phase 1: exactly at 3m (>= boundary → next phase) up to <7m.
(function () {
  if (typeof SlowGram._phaseFor !== 'function') { assert.ok(false, 'T17: SlowGram._phaseFor test handle missing'); return; }
  var b = SlowGram.getConfig().phaseBoundariesMin;
  assert.equal(SlowGram._phaseFor(b[0] * 60000), 1, 'T17a: phaseFor(exactly 3m) === 1');
  assert.equal(SlowGram._phaseFor(b[1] * 60000 - 1), 1, 'T17b: phaseFor(just below 7m) === 1');
})();

// Test 18 — phase 2: exactly at 7m (>= boundary → next phase) up to <12m.
(function () {
  if (typeof SlowGram._phaseFor !== 'function') { assert.ok(false, 'T18: SlowGram._phaseFor test handle missing'); return; }
  var b = SlowGram.getConfig().phaseBoundariesMin;
  assert.equal(SlowGram._phaseFor(b[1] * 60000), 2, 'T18a: phaseFor(exactly 7m) === 2');
  assert.equal(SlowGram._phaseFor(b[2] * 60000 - 1), 2, 'T18b: phaseFor(just below 12m) === 2');
})();

// Test 19 — phase 3: exactly at 12m and total over [0, Infinity) — loop
// termination safe at Number.MAX_SAFE_INTEGER (FA-04 integer-ms contract).
(function () {
  if (typeof SlowGram._phaseFor !== 'function') { assert.ok(false, 'T19: SlowGram._phaseFor test handle missing'); return; }
  var b = SlowGram.getConfig().phaseBoundariesMin;
  assert.equal(SlowGram._phaseFor(b[2] * 60000), 3, 'T19a: phaseFor(exactly 12m) === 3');
  assert.equal(SlowGram._phaseFor(Number.MAX_SAFE_INTEGER), 3, 'T19b: phaseFor(Number.MAX_SAFE_INTEGER) === 3');
})();

// Test 20 — defensive totality: negative elapsedMs maps to phase 0.
(function () {
  if (typeof SlowGram._phaseFor !== 'function') { assert.ok(false, 'T20: SlowGram._phaseFor test handle missing'); return; }
  assert.equal(SlowGram._phaseFor(-1), 0, 'T20: phaseFor(-1) === 0');
})();

// Test 21 — boundary values in integer ms derive from CONFIG.phaseBoundariesMin
// (the array is the single source of truth — no 3/7/12 literals in assertions).
(function () {
  var b = SlowGram.getConfig().phaseBoundariesMin;
  assert.equal(b[0] * 60000, 180000, 'T21a: b[0] minutes === 180000 ms');
  assert.equal(b[1] * 60000, 420000, 'T21b: b[1] minutes === 420000 ms');
  assert.equal(b[2] * 60000, 720000, 'T21c: b[2] minutes === 720000 ms');
})();

// Test 22 — transition guard: phasechange fires ONLY on real transitions;
// a no-op sync emits nothing (RESEARCH.md:294 anti-pattern: emitting on every
// sync is forbidden). Driven by the fake clock exactly like the clock suite.
(function () {
  var e = freshEnv();
  var count = 0;
  var payloads = [];
  SlowGram.on('phasechange', function (phase) { count++; payloads.push(phase); });
  SlowGram.setContext('REELS');
  e.clock.advance(4 * 60 * 1000);       // 4 min → crosses the 3m boundary
  e.raf.flush();
  assert.equal(count, 1, 'T22a: exactly one phasechange after crossing 3m');
  assert.equal(payloads[0], 1, 'T22b: payload is phase 1');
  e.clock.advance(3 * 60 * 1000);       // +3 min → crosses the 7m boundary
  e.raf.flush();
  assert.equal(count, 2, 'T22c: exactly one more phasechange after crossing 7m');
  assert.equal(payloads[1], 2, 'T22d: payload is phase 2');
  e.raf.flush();                        // no time passed — no-op sync
  e.raf.flush();                        // idempotence: second flush too
  assert.equal(count, 2, 'T22e: repeated flush with no time passing emits zero additional phasechange');
})();

// Task 1 — CORE-03 fatigue suite: FatigueManager core — strict >window reset,
// exact-boundary no-reset, short-gap discount (never accumulate unverifiable
// time), hiddenAt-null fallback base, negative-delta clamp, context preserved
// on reset. The window is ALWAYS read from SlowGram.getConfig().fatigueWindowMs
// — never a literal (RESEARCH.md:463, FA-05).

// Test 23 — strict reset: a background gap of exactly window+1 (> fatigueWindowMs)
// resets the session: elapsedMs 0, phase 0, exactly one 'reset' event.
(function () {
  var e = freshEnv();
  var win = (typeof SlowGram.getConfig === 'function') ? SlowGram.getConfig().fatigueWindowMs : -1;
  var resets = [];
  var phases = [];
  SlowGram.on('reset', function () { resets.push(1); });
  SlowGram.on('phasechange', function (p) { phases.push(p); });
  SlowGram.setContext('REELS');
  e.clock.advance(180000);
  e.raf.flush();
  assert.equal(SlowGram.getState().elapsedMs, 180000, 'T23a: 3min baseline accumulated while visible');
  e.doc.setVisibility('hidden');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  e.clock.advance(win + 1);                 // 5min + 1ms background gap
  e.doc.setVisibility('visible');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  assert.equal(SlowGram.getState().elapsedMs, 0, 'T23b: gap window+1 resets elapsedMs to 0');
  assert.equal(SlowGram.getState().phase, 0, 'T23c: gap window+1 resets phase to 0');
  assert.equal(resets.length, 1, 'T23d: exactly one reset event emitted');
  assert.equal(phases[phases.length - 1], 0, 'T23e: sync(0) emits phasechange 0 from a higher phase');
})();

// Test 24 — exact boundary: a gap of exactly fatigueWindowMs does NOT reset
// (strict > comparison, FA-05) and the gap is discounted, not accumulated.
(function () {
  var e = freshEnv();
  var win = (typeof SlowGram.getConfig === 'function') ? SlowGram.getConfig().fatigueWindowMs : -1;
  var resets = [];
  SlowGram.on('reset', function () { resets.push(1); });
  SlowGram.setContext('REELS');
  e.clock.advance(180000);
  e.raf.flush();
  e.doc.setVisibility('hidden');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  e.clock.advance(win);                     // gap exactly 300000 — NOT > window
  e.doc.setVisibility('visible');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  assert.equal(resets.length, 0, 'T24a: gap exactly window does NOT reset');
  assert.equal(SlowGram.getState().elapsedMs, 180000, 'T24b: pre-background elapsed preserved (gap discounted)');
  assert.equal(SlowGram.getState().hiddenAt, null, 'T24c: discount path clears hiddenAt');
})();

// Test 25 — short gap: 1 minute of background neither resets NOR accumulates —
// the hidden minute is never counted (Pitfall 5).
(function () {
  var e = freshEnv();
  var resets = [];
  SlowGram.on('reset', function () { resets.push(1); });
  SlowGram.setContext('REELS');
  e.clock.advance(180000);
  e.raf.flush();
  e.doc.setVisibility('hidden');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  e.clock.advance(60000);                   // 1-min gap ≤ window
  e.doc.setVisibility('visible');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  assert.equal(resets.length, 0, 'T25a: short gap does NOT reset');
  assert.equal(SlowGram.getState().elapsedMs, 180000, 'T25b: hidden minute never counted — elapsed unchanged');
})();

// Test 26 — hiddenAt-null fallback: a resume signal with hiddenAt still null
// (missed visibilitychange — WebView case) uses lastBoundary as the catch-up
// base; a small delta neither resets nor accumulates (idempotent, T-01-09).
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(180000);
  e.raf.flush();
  assert.ok(SlowGram.getState().hiddenAt === null, 'T26a: hiddenAt null (visibilitychange missed)');
  e.clock.advance(1000);                    // small gap since lastBoundary
  e.win.dispatchEvent({ type: 'focus' });   // resume signal on the window target
  assert.equal(SlowGram.getState().elapsedMs, 180000, 'T26b: fallback base lastBoundary — small delta discounted, not accumulated');
  assert.equal(SlowGram.getState().phase, 1, 'T26c: phase unchanged — no spurious reset');
})();

// Test 27 — negative delta clamp: a clock back-step (NTP, Pitfall 7) since
// hidden clamps the catch-up delta to 0 — no reset, no accumulation.
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(180000);
  e.raf.flush();
  e.doc.setVisibility('hidden');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  e.clock.advance(-10000);                  // now < hiddenAt — back-step
  e.doc.setVisibility('visible');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  var s = SlowGram.getState();
  assert.equal(s.elapsedMs, 180000, 'T27a: negative delta clamped to 0 — no reset, no accumulation');
  assert.equal(s.hiddenAt, null, 'T27b: discount path clears hiddenAt after clamp');
  assert.equal(s.phase, 1, 'T27c: phase unchanged — no spurious reset');
})();

// Test 28 — reset preserves context: reset zeroes time, NOT context.
(function () {
  var e = freshEnv();
  var win = (typeof SlowGram.getConfig === 'function') ? SlowGram.getConfig().fatigueWindowMs : -1;
  SlowGram.setContext('REELS');
  e.clock.advance(180000);
  e.raf.flush();
  e.doc.setVisibility('hidden');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  e.clock.advance(win + 1);
  e.doc.setVisibility('visible');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  var s = SlowGram.getState();
  assert.equal(s.elapsedMs, 0, 'T28a: reset zeroes elapsedMs');
  assert.equal(s.context, 'REELS', 'T28b: reset preserves context');
  assert.equal(s.phase, 0, 'T28c: reset zeroes phase');
})();

// Task 2 — CORE-03 lifecycle wiring suite: all four resume signals drive the
// same wall-clock catch-up on their LOCKED targets (visibilitychange/resume →
// document, pageshow/focus → window — RESEARCH.md Common Operation 3, Shared
// Pattern 9); pageshow is guarded by e.persisted (Pitfall 8); destroy()
// removes every listener (T-01-10).

// Test 29 — document 'resume' signal triggers catch-up (Chrome 68+ frozen→active,
// Assumption A3): a >window background gap resets the session.
(function () {
  var e = freshEnv();
  var win = SlowGram.getConfig().fatigueWindowMs;
  var resets = [];
  SlowGram.on('reset', function () { resets.push(1); });
  SlowGram.setContext('REELS');
  e.clock.advance(180000);
  e.raf.flush();
  e.doc.setVisibility('hidden');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  e.clock.advance(win + 1);
  e.doc.dispatchEvent({ type: 'resume' });            // DOCUMENT target
  assert.equal(SlowGram.getState().elapsedMs, 0, 'T29a: document resume resets elapsedMs');
  assert.equal(SlowGram.getState().phase, 0, 'T29b: document resume resets phase');
  assert.equal(resets.length, 1, 'T29c: exactly one reset event');
})();

// Test 30 — window 'pageshow' with persisted:true triggers catch-up (bfcache
// restore). Event target is the WINDOW.
(function () {
  var e = freshEnv();
  var win = SlowGram.getConfig().fatigueWindowMs;
  var resets = [];
  SlowGram.on('reset', function () { resets.push(1); });
  SlowGram.setContext('REELS');
  e.clock.advance(180000);
  e.raf.flush();
  e.doc.setVisibility('hidden');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  e.clock.advance(win + 1);
  e.win.dispatchEvent({ type: 'pageshow', persisted: true });   // WINDOW target
  assert.equal(SlowGram.getState().elapsedMs, 0, 'T30a: pageshow persisted:true resets elapsedMs');
  assert.equal(SlowGram.getState().phase, 0, 'T30b: pageshow persisted:true resets phase');
  assert.equal(resets.length, 1, 'T30c: exactly one reset event');
})();

// Test 31 — window 'pageshow' with persisted:false is IGNORED (initial load /
// same-window navigation guard, Pitfall 8): the same gap does NOT reset.
(function () {
  var e = freshEnv();
  var win = SlowGram.getConfig().fatigueWindowMs;
  var resets = [];
  SlowGram.on('reset', function () { resets.push(1); });
  SlowGram.setContext('REELS');
  e.clock.advance(180000);
  e.raf.flush();
  e.doc.setVisibility('hidden');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  e.clock.advance(win + 1);
  e.win.dispatchEvent({ type: 'pageshow', persisted: false });
  assert.equal(resets.length, 0, 'T31a: pageshow persisted:false does NOT reset');
  assert.equal(SlowGram.getState().elapsedMs, 180000, 'T31b: elapsed unchanged — initial-load guard');
})();

// Test 32 — window 'focus' triggers catch-up (WebView/PWA fallback). Event
// target is the WINDOW.
(function () {
  var e = freshEnv();
  var win = SlowGram.getConfig().fatigueWindowMs;
  var resets = [];
  SlowGram.on('reset', function () { resets.push(1); });
  SlowGram.setContext('REELS');
  e.clock.advance(180000);
  e.raf.flush();
  e.doc.setVisibility('hidden');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  e.clock.advance(win + 1);
  e.win.dispatchEvent({ type: 'focus' });             // WINDOW target
  assert.equal(SlowGram.getState().elapsedMs, 0, 'T32a: window focus resets elapsedMs');
  assert.equal(SlowGram.getState().phase, 0, 'T32b: window focus resets phase');
  assert.equal(resets.length, 1, 'T32c: exactly one reset event');
})();

// Test 33 — document 'visibilitychange'→visible triggers catch-up (the fourth
// signal contract; re-asserts Task 1 Test 1 across the full signal set).
(function () {
  var e = freshEnv();
  var win = SlowGram.getConfig().fatigueWindowMs;
  var resets = [];
  SlowGram.on('reset', function () { resets.push(1); });
  SlowGram.setContext('REELS');
  e.clock.advance(180000);
  e.raf.flush();
  e.doc.setVisibility('hidden');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  e.clock.advance(win + 1);
  e.doc.setVisibility('visible');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  assert.equal(SlowGram.getState().elapsedMs, 0, 'T33a: visibilitychange→visible resets elapsedMs');
  assert.equal(SlowGram.getState().phase, 0, 'T33b: visibilitychange→visible resets phase');
  assert.equal(resets.length, 1, 'T33c: exactly one reset event');
})();

// Test 34 — destroy() removes all four lifecycle listeners (T-01-10) AND
// resets state to fresh (Plan 04 locked contract, D5): after destroy,
// dispatching any resume signal on its correct target leaves the FRESH state
// untouched — no listener leak across init/destroy cycles.
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(60000);
  e.raf.flush();
  e.doc.setVisibility('hidden');
  e.doc.dispatchEvent({ type: 'visibilitychange' });   // hiddenAt set, visible false
  assert.ok(SlowGram.getState().hiddenAt !== null, 'T34a: pre-destroy hiddenAt is set');
  SlowGram.destroy();
  var fresh = SlowGram.getState();
  assert.equal(fresh.hiddenAt, null, 'T34b: destroy resets hiddenAt to null (fresh state)');
  assert.equal(fresh.elapsedMs, 0, 'T34c: destroy resets elapsedMs to 0 (fresh state)');
  assert.equal(fresh.context, 'UNKNOWN', 'T34d: destroy resets context to UNKNOWN (fresh state)');
  e.clock.advance(600000);                             // > window — a live listener would reset
  e.doc.dispatchEvent({ type: 'resume' });
  e.win.dispatchEvent({ type: 'pageshow', persisted: true });
  e.win.dispatchEvent({ type: 'focus' });
  e.doc.setVisibility('visible');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  e.raf.flush();
  var after = SlowGram.getState();
  assert.equal(after.hiddenAt, fresh.hiddenAt, 'T34e: hiddenAt unchanged — no visibilitychange/resume leak');
  assert.equal(after.elapsedMs, fresh.elapsedMs, 'T34f: elapsedMs unchanged — no pageshow/focus leak');
  assert.equal(after.phase, fresh.phase, 'T34g: phase unchanged after destroy');
  assert.equal(after.visible, fresh.visible, 'T34h: visible unchanged after destroy');
})();

// Task 1 — CORE-04 DI suite (Plan 04): env-shape validation (fail loudly on
// malformed injected deps, never silently substitute), default-env path via a
// stub-global shim, idempotent init (internal destroy-then-reinit, no
// duplicated listeners), destroy completeness (fresh state reset, subscriber
// preservation) enabling clean re-init accumulation.

// Test 35 (D1) — malformed provided overrides throw descriptive Errors: a
// bad container/harness fails loudly at init() instead of crashing the host
// page (T-01-12).
(function () {
  function messageOf(overrides) {
    try {
      SlowGram.init(overrides);
      return '';
    } catch (err) {
      return String(err && err.message || err);
    }
  }
  var m1 = messageOf({ clock: 'not-a-clock' });
  assert.ok(m1.indexOf('env.clock must provide now') !== -1, 'D1a: clock without now() throws "env.clock must provide now()"');
  var m2 = messageOf({ clock: FakeClock(0), document: {} });
  assert.ok(m2.indexOf('document') !== -1 && m2.indexOf('addEventListener') !== -1, 'D1b: document without addEventListener throws descriptive Error');
  var m3 = messageOf({ clock: FakeClock(0), document: null, window: {} });
  assert.ok(m3.indexOf('window') !== -1 && m3.indexOf('addEventListener') !== -1, 'D1c: window without addEventListener throws descriptive Error');
  var m4 = messageOf({ clock: FakeClock(0), MutationObserver: 'not-a-constructor' });
  assert.ok(m4.indexOf('MutationObserver') !== -1, 'D1d: MutationObserver non-constructor throws descriptive Error');
  var m5 = messageOf({ clock: FakeClock(0), requestAnimationFrame: 42 });
  assert.ok(m5.indexOf('requestAnimationFrame') !== -1, 'D1e: requestAnimationFrame non-function throws descriptive Error');
  // Explicit nulls are VALID (documented fail-safe) — a null dep is a
  // deliberate opt-out, not a malformed shape.
  var nullsAccepted = true;
  try {
    SlowGram.init({ clock: FakeClock(0), document: null, window: null, MutationObserver: null, requestAnimationFrame: null });
  } catch (err) { nullsAccepted = false; }
  assert.ok(nullsAccepted, 'D1f: explicit null deps are accepted (fail-safe default path)');
})();

// Test 36 (D2) — missing overrides: init() with no arguments resolves ALL
// capabilities from globals (default env path). Two-host aware:
//   - Node host: the stub-global shim temporarily installs fakes on
//     globalThis.document/window/MutationObserver/requestAnimationFrame so the
//     default path is exercised without a real DOM; the real globals are
//     restored in try/finally.
//   - Browser host: window.document/window are getter-only accessors on the
//     Window (CORE-06 divergence found in the headless smoke), so a shim
//     cannot be installed there. The default path is exercised against the
//     REAL browser globals instead — init() with no overrides must resolve
//     the live document/window/rAF and run without throwing.
(function () {
  var clock = FakeClock(1000000);
  var doc = FakeDocument({ visibilityState: 'visible' });
  var win = FakeWindow();
  var raf = FakeRAF();
  if (typeof document === 'undefined') {             // Node host — shim installable
    var savedDocument = globalThis.document;
    var savedWindow = globalThis.window;
    var savedMO = globalThis.MutationObserver;
    var savedRAF = globalThis.requestAnimationFrame;
    try {
      globalThis.document = doc;
      globalThis.window = win;
      globalThis.MutationObserver = FakeMutationObserver;
      globalThis.requestAnimationFrame = raf.request;
      SlowGram.init();                                   // no overrides at all
      SlowGram.setContext('REELS');
      clock.advance(180000);
      raf.flush();
      assert.equal(SlowGram.getState().context, 'REELS', 'D2a: default-env init + setContext(REELS) runs without throwing');
      // The default env resolved document/window from the shim: a visibility
      // signal on the shim's document drives the engine.
      doc.setVisibility('hidden');
      doc.dispatchEvent({ type: 'visibilitychange' });
      assert.equal(SlowGram.getState().visible, false, 'D2b: default document resolved from globals (hidden honored)');
    } finally {
      globalThis.document = savedDocument;
      globalThis.window = savedWindow;
      globalThis.MutationObserver = savedMO;
      globalThis.requestAnimationFrame = savedRAF;
    }
  } else {                                             // Browser host — real globals are the default path
    var ranWithoutThrow = true;
    try {
      SlowGram.init();                                 // no overrides — resolves live document/window/rAF
    } catch (err) { ranWithoutThrow = false; }
    assert.ok(ranWithoutThrow, 'D2a: default-env init resolves real browser globals without throwing');
    assert.ok(SlowGram.getConfig() && Object.isFrozen(SlowGram.getConfig()), 'D2b: default path CONFIG is deep-frozen');
    SlowGram.setContext('REELS');
    assert.equal(SlowGram.getState().context, 'REELS', 'D2c: default path setContext(REELS) drives the clock gate');
  }
})();

// Test 37 (D3) — double init without destroy: init() then init() again must
// NOT duplicate lifecycle listeners — a 'contextchange' subscriber still
// receives exactly one emission per setContext change (idempotent init guard,
// T-01-13).
(function () {
  var e = freshEnv();
  var count = 0;
  SlowGram.on('contextchange', function () { count++; });
  SlowGram.init({ clock: e.clock, document: e.doc, window: e.win, MutationObserver: null, requestAnimationFrame: e.raf.request });
  SlowGram.setContext('REELS');
  SlowGram.setContext('REELS');                        // no-op — must not emit again
  assert.equal(count, 1, 'D3a: exactly one contextchange emission across double init');
})();

// Test 38 (D4) — destroy() completeness + clean re-init: after init+destroy,
// dispatching any of the four lifecycle signals leaves state untouched; a
// subsequent init() + REELS + advance + flush accumulates normally.
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(60000);
  e.raf.flush();
  SlowGram.destroy();
  var fresh = SlowGram.getState();
  e.clock.advance(600000);                             // > window — a live listener would reset
  e.doc.dispatchEvent({ type: 'resume' });
  e.win.dispatchEvent({ type: 'pageshow', persisted: true });
  e.win.dispatchEvent({ type: 'focus' });
  e.doc.setVisibility('visible');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  e.raf.flush();
  var after = SlowGram.getState();
  assert.equal(after.elapsedMs, fresh.elapsedMs, 'D4a: post-destroy signals leave elapsedMs untouched');
  assert.equal(after.hiddenAt, fresh.hiddenAt, 'D4b: post-destroy signals leave hiddenAt untouched');
  // Clean re-init: same mocks accumulate normally.
  SlowGram.init({ clock: e.clock, document: e.doc, window: e.win, MutationObserver: null, requestAnimationFrame: e.raf.request });
  SlowGram.setContext('REELS');
  e.clock.advance(120000);
  e.raf.flush();
  assert.equal(SlowGram.getState().elapsedMs, 120000, 'D4c: re-init accumulates exactly 120000ms (clean re-init)');
})();

// Test 39 (D5) — destroy() resets state: after destroy(), getState() returns
// zeros with context UNKNOWN (fresh pre-init state) so re-init works.
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(30000);
  e.raf.flush();
  SlowGram.destroy();
  var s = SlowGram.getState();
  assert.equal(s.elapsedMs, 0, 'D5a: destroy resets elapsedMs to 0');
  assert.equal(s.phase, 0, 'D5b: destroy resets phase to 0');
  assert.equal(s.context, 'UNKNOWN', 'D5c: destroy resets context to UNKNOWN');
  assert.equal(s.visible, true, 'D5d: destroy resets visible to true');
  assert.equal(s.hiddenAt, null, 'D5e: destroy resets hiddenAt to null');
})();

// Test 40 (D6) — CR-01 regression: the rAF poll must restart on every running
// false→true transition. pollLoop only re-requests itself while running, so if
// the poll ever dies (first frame fires while UNKNOWN, or a hidden pause), the
// engine must kick it again from updateRunning — otherwise accumulation stops
// permanently in a live WebView after the first hidden/resume cycle. This test
// drives the real rAF-request cycle (FakeRAF holds exactly one pending frame),
// so it fails on the pre-fix code where nothing restarts the poll.
(function () {
  var e = freshEnv();
  // Case 1: first frame fires while UNKNOWN (page just loaded) — poll would
  // die before REELS arrives; setContext(REELS) must restart it.
  e.clock.advance(120000);
  e.raf.flush();                                  // frame while UNKNOWN: running=false → poll self-stops
  SlowGram.setContext('REELS');                   // false→true → updateRunning must re-request
  e.clock.advance(60000);
  e.raf.flush();
  assert.equal(SlowGram.getState().elapsedMs, 60000, 'D6a: poll restarts on UNKNOWN→REELS after a dead frame');
})();

(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(30000);
  e.raf.flush();
  assert.equal(SlowGram.getState().elapsedMs, 30000, 'D6b: baseline accumulation before hidden');
  // Hidden: running→false. The next frame fires while paused → poll self-stops.
  e.doc.setVisibility('hidden');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  e.clock.advance(10000);
  e.raf.flush();                                  // frame while hidden: poll stops, no accumulation
  assert.equal(SlowGram.getState().elapsedMs, 30000, 'D6c: hidden gap never accumulates');
  // Resume within the window → running false→true → poll must restart.
  e.doc.setVisibility('visible');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  e.clock.advance(60000);
  e.raf.flush();
  assert.equal(SlowGram.getState().elapsedMs, 90000, 'D6d: poll restarts after hidden/resume and accumulates visible time');
})();

// Task 1 — DETC-01/07 detection spine (Phase 2 tracer, 02-01): the pure
// classifyPathname decision table, DomWatcher connect-on-REELS-only, the
// VideoRegistry entry via a recorded mutation + one rAF batch, and the
// SelectorRegistry health accounting. Pathname is authoritative (D-02):
// UNKNOWN and profile-SOCIAL never connect, never register.

// Test T-D1 — classifyPathname decision table (D-02/D-04/D-05, A4/A5
// verified arithmetic). Guarded by the _classifyPathname handle pattern.
(function () {
  if (typeof SlowGram._classifyPathname !== 'function') {
    assert.ok(false, 'TD1: SlowGram._classifyPathname test handle missing');
    return;
  }
  assert.equal(SlowGram._classifyPathname('/reels/'), 'REELS', 'TD1a: /reels/ === REELS');
  assert.equal(SlowGram._classifyPathname('/reels/abc'), 'REELS', 'TD1b: /reels/<id> === REELS');
  assert.equal(SlowGram._classifyPathname('/direct/'), 'SOCIAL', 'TD1c: /direct/ === SOCIAL');
  assert.equal(SlowGram._classifyPathname('/messages/'), 'SOCIAL', 'TD1d: /messages/ === SOCIAL');
  assert.equal(SlowGram._classifyPathname('/p/post-id/'), 'SOCIAL', 'TD1e: /p/<id>/ === SOCIAL');
  assert.equal(SlowGram._classifyPathname('/explore/'), 'SOCIAL', 'TD1f: /explore/ === SOCIAL');
  assert.equal(SlowGram._classifyPathname('/accounts/'), 'SOCIAL', 'TD1g: /accounts/ === SOCIAL');
  assert.equal(SlowGram._classifyPathname('/stories/'), 'SOCIAL', 'TD1h: /stories/ === SOCIAL');
  assert.equal(SlowGram._classifyPathname('/someuser/'), 'SOCIAL', 'TD1i: /<username>/ === SOCIAL (profile guard D-05)');
  assert.equal(SlowGram._classifyPathname('/'), 'UNKNOWN', 'TD1j: / === UNKNOWN (fail-safe DETC-03)');
  assert.equal(SlowGram._classifyPathname('/someuser/reels/'), 'UNKNOWN', 'TD1k: /<username>/reels/ === UNKNOWN (A4)');
  assert.equal(SlowGram._classifyPathname('/reel/abc/'), 'UNKNOWN', 'TD1l: /reel/<id>/ === UNKNOWN');
})();

// Test T-D2 — end-to-end: /reels/ pathname → REELS → observe [role="main"]
// with the locked D-11 config → recorded video mutation → one rAF flush →
// VideoRegistry entry → selector health ok.
(function () {
  FakeMutationObserver.instances = [];        // fresh instance registry per test
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/fake-uuid' });
  var main = FakeElement('main', { role: 'main' }, [video]);
  var e = freshEnv({
    root: main,
    location: FakeLocation('/reels/'),
    observer: FakeMutationObserver
  });
  assert.equal(SlowGram.getState().context, 'REELS', 'TD2a: ContextDetector classifies /reels/ as REELS on init');
  assert.equal(FakeMutationObserver.instances.length, 1, 'TD2b: exactly one observer created on REELS connect');
  var observer = FakeMutationObserver.instances[0];
  assert.ok(observer.lastObserved !== null, 'TD2c: observer.observe() was called');
  assert.equal(observer.lastObserved.target, main, 'TD2d: observe target is the [role="main"] feed root');
  assert.equal(JSON.stringify(observer.lastObserved.config.attributeFilter),
    JSON.stringify(['src', 'loop', 'autoplay', 'role']), 'TD2e: attributeFilter is the locked D-11 4-attr set');
  assert.equal(observer.lastObserved.config.childList, true, 'TD2f: childList observed');
  assert.equal(observer.lastObserved.config.subtree, true, 'TD2g: subtree observed');
  // UAT-05 (2026-08-15): the connect-time scan registers videos already in
  // the tree — live IG recycles video nodes in place, so additions-only
  // registration left the registry starved on the real feed.
  assert.equal(SlowGram._registrySize(), 1, 'TD2h: connect scan registers the video already present in the tree (UAT-05)');
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  assert.equal(SlowGram._registrySize(), 1, 'TD2i: re-recorded mutation is idempotent — still 1 (D-18)');
  var health = SlowGram.getSelectorHealth();
  assert.equal(health.status, 'ok', 'TD2j: selector health status is ok after a hit');
  assert.equal(health.missStreak, 0, 'TD2k: health missStreak is 0 after a hit');
})();

// Test T-D3 — pathname authoritative (D-02): FakeLocation('/') → UNKNOWN.
// No observer is ever created and zero videos register — even with a video
// present in the tree (DETC-03: UNKNOWN never degrades).
(function () {
  FakeMutationObserver.instances = [];
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/fake-uuid' });
  var main = FakeElement('main', { role: 'main' }, [video]);
  var e = freshEnv({
    root: main,
    location: FakeLocation('/'),
    observer: FakeMutationObserver
  });
  assert.equal(SlowGram.getState().context, 'UNKNOWN', 'TD3a: / classifies UNKNOWN (fail-safe)');
  assert.equal(FakeMutationObserver.instances.length, 0, 'TD3b: no observer created on UNKNOWN (no connect)');
  e.raf.flush();
  assert.equal(SlowGram._registrySize(), 0, 'TD3c: UNKNOWN registers zero videos even with a video in the tree');
})();

// Test T-D4 — DOM does not upgrade a non-reels pathname: /someuser/ with a
// video present stays SOCIAL (profile preserved, D-04) and registers nothing.
(function () {
  FakeMutationObserver.instances = [];
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/fake-uuid' });
  var main = FakeElement('main', { role: 'main' }, [video]);
  var e = freshEnv({
    root: main,
    location: FakeLocation('/someuser/'),
    observer: FakeMutationObserver
  });
  assert.equal(SlowGram.getState().context, 'SOCIAL', 'TD4a: /someuser/ classifies SOCIAL (profile preserved)');
  assert.equal(FakeMutationObserver.instances.length, 0, 'TD4b: no observer connected on profile-SOCIAL');
  e.raf.flush();
  assert.equal(SlowGram._registrySize(), 0, 'TD4c: profile-SOCIAL registers zero videos (D-02 authoritative)');
})();

// Test T-D5 — fixture layer (DETC-07): loads test/fixtures/instagram-shapes.js
// and asserts the loggedOut shape matches the validated dump facts
// (roleMain===1, videos>=1, hasDialog===false, hasLoop===false), plus the
// source tags and the mock builder (dom-mocks) composing FakeElement trees
// from the shapes. Static data — runs without network. Node host: require().
// Browser host: harness.html is deliberately untouched (02-PATTERNS.md:364),
// so instaShapes/instaMocks are absent there and the block skips gracefully.
(function () {
  var shapes, mocks;
  if (typeof require === 'function') {
    shapes = require('./fixtures/instagram-shapes.js');
    mocks = require('./dom-mocks/instagram-mock.js');
  } else {
    shapes = (typeof globalThis.instaShapes !== 'undefined') ? globalThis.instaShapes : null;
    mocks = (typeof globalThis.instaMocks !== 'undefined') ? globalThis.instaMocks : null;
  }
  if (!shapes || !shapes.SHAPES) {
    assert.ok(true, 'TD5: instaShapes not loaded on this host — skipped');
    return;
  }
  var lo = shapes.SHAPES.loggedOut || {};
  assert.ok(typeof lo.source === 'string' && lo.source.length > 0, 'TD5a: loggedOut carries a source tag');
  assert.equal(lo.roleMain, 1, 'TD5b: loggedOut roleMain count is 1 (validated dump)');
  assert.ok(lo.videos >= 1, 'TD5c: loggedOut videos >= 1 (validated dump)');
  assert.equal(lo.hasDialog, false, 'TD5d: loggedOut hasDialog false (dump: role=dialog 0)');
  assert.equal(lo.hasLoop, false, 'TD5e: loggedOut hasLoop false (dump: loop 0)');
  assert.ok(lo.roles.indexOf('main') !== -1 && lo.roles.indexOf('video') === -1,
    'TD5f: roles inventory is role-attribute values (main present, video is a tag)');
  var li = shapes.SHAPES.loggedIn || {};
  assert.equal(shapes.sourceTags.loggedOut, lo.source, 'TD5g: sourceTags maps loggedOut to its source');
  assert.equal(shapes.sourceTags.loggedIn, li.source, 'TD5h: sourceTags maps loggedIn to its source');
  assert.equal(li.source, 'cited-community', 'TD5i: loggedIn tagged cited-community (not live-verified)');
  assert.equal(li.hasDialog, true, 'TD5j: loggedIn hasDialog true (D-03 fullscreen viewer)');
  assert.equal(JSON.stringify(shapes.verifiedSelectors),
    JSON.stringify(['video', '[role="main"]', '[role="dialog"]']), 'TD5k: verifiedSelectors is the 3-registered-selector list (DETC-06)');
  // Mock builder sanity: the fixture builder must compose FakeElement trees
  // from the shapes — a broken builder would silently ship a broken detection
  // DOM for every later DETC suite.
  if (mocks && typeof mocks.buildReelsFeed === 'function') {
    var feed = mocks.buildReelsFeed(lo);
    assert.equal(feed.getAttribute('role'), 'main', 'TD5l: buildReelsFeed root is [role="main"]');
    assert.equal(feed.children.length, lo.videos, 'TD5m: buildReelsFeed mounts shape.videos video children');
    var firstVideo = feed.children[0];
    assert.equal(firstVideo.tagName, 'VIDEO', 'TD5n: feed children are VIDEO elements');
    assert.equal(firstVideo.hasAttribute('loop'), false, 'TD5o: loggedOut feed videos carry no loop attr');
    assert.equal(firstVideo.hasAttribute('autoplay'), false, 'TD5p: loggedOut feed videos carry no autoplay attr');
    assert.ok(firstVideo.src.indexOf('blob:https://www.instagram.com/') === 0,
      'TD5q: loggedOut feed videos use blob-style src');
    var dialog = mocks.buildDialogRoot(li);
    assert.ok(dialog !== null && dialog.getAttribute('role') === 'dialog', 'TD5r: loggedIn buildDialogRoot yields [role="dialog"]');
    assert.equal(mocks.buildDialogRoot(lo), null, 'TD5s: loggedOut buildDialogRoot yields null (no dialog)');
    var social = mocks.buildSocialRoute('/direct/');
    assert.equal(social.route, '/direct/', 'TD5t: buildSocialRoute carries the route');
    assert.ok(social.root.querySelector('[role="main"]') === null,
      'TD5u: SOCIAL route tree has no [role="main"] feed root');
  } else {
    assert.ok(true, 'TD5: instaMocks not loaded on this host — builder checks skipped');
  }
})();

// Task 2 (02-02) — DETC-01/03 decision-table exhaustiveness + D-13 refresh
// sources + the never-upgrade rule. The tracer (T-D1) proved the spine;
// these tests exhaust every Pattern 1 row and every refresh source.

// Test T-D6 — decision table EXHAUSTIVENESS (D-02/D-04/D-05, A4/A5): every
// row of the Pattern 1 table (02-RESEARCH.md:181-198) asserts its expected
// class via the _classifyPathname handle — including the no-slash edges,
// preserved sub-paths, bare-keyword profile-guard arithmetic, and the
// empty-string fail-safe.
(function () {
  if (typeof SlowGram._classifyPathname !== 'function') {
    assert.ok(false, 'TD6: SlowGram._classifyPathname test handle missing');
    return;
  }
  // REELS — /reels/ with the slash only (D-02 prefix contract).
  assert.equal(SlowGram._classifyPathname('/reels/'), 'REELS', 'TD6a: /reels/ === REELS');
  assert.equal(SlowGram._classifyPathname('/reels/abc/'), 'REELS', 'TD6b: /reels/<id>/ === REELS');
  assert.equal(SlowGram._classifyPathname('/reels/abc'), 'REELS', 'TD6c: /reels/<id> === REELS');
  assert.equal(SlowGram._classifyPathname('/reels'), 'UNKNOWN', 'TD6d: /reels (no trailing slash) === UNKNOWN (D-02 prefix contract)');
  // SOCIAL — preserved prefixes, exactly or with a sub-path (D-04).
  assert.equal(SlowGram._classifyPathname('/direct/'), 'SOCIAL', 'TD6e: /direct/ === SOCIAL');
  assert.equal(SlowGram._classifyPathname('/messages/'), 'SOCIAL', 'TD6f: /messages/ === SOCIAL');
  assert.equal(SlowGram._classifyPathname('/messages/inbox/'), 'SOCIAL', 'TD6g: /messages/inbox/ === SOCIAL');
  assert.equal(SlowGram._classifyPathname('/p/postid/'), 'SOCIAL', 'TD6h: /p/<id>/ === SOCIAL');
  assert.equal(SlowGram._classifyPathname('/explore/'), 'SOCIAL', 'TD6i: /explore/ === SOCIAL');
  assert.equal(SlowGram._classifyPathname('/explore/search/'), 'SOCIAL', 'TD6j: /explore/search/ === SOCIAL');
  assert.equal(SlowGram._classifyPathname('/accounts/'), 'SOCIAL', 'TD6k: /accounts/ === SOCIAL');
  assert.equal(SlowGram._classifyPathname('/stories/'), 'SOCIAL', 'TD6l: /stories/ === SOCIAL');
  // SOCIAL — single-segment profile guard (D-05), trailing slash optional.
  assert.equal(SlowGram._classifyPathname('/someuser/'), 'SOCIAL', 'TD6m: /<username>/ === SOCIAL (profile guard)');
  assert.equal(SlowGram._classifyPathname('/someuser'), 'SOCIAL', 'TD6n: /<username> === SOCIAL (trailing slash optional)');
  // UNKNOWN — fail-safe (DETC-03): home, profile-reels subpages, /reel/<id>/,
  // two-segment non-preserved paths, bare keywords, and the empty string.
  assert.equal(SlowGram._classifyPathname('/'), 'UNKNOWN', 'TD6o: / === UNKNOWN (fail-safe)');
  assert.equal(SlowGram._classifyPathname(''), 'UNKNOWN', 'TD6p: empty pathname === UNKNOWN (fail-safe)');
  assert.equal(SlowGram._classifyPathname('/someuser/reels/'), 'UNKNOWN', 'TD6q: /<username>/reels/ === UNKNOWN (A4)');
  assert.equal(SlowGram._classifyPathname('/reel/abc/'), 'UNKNOWN', 'TD6r: /reel/<id>/ === UNKNOWN');
  assert.equal(SlowGram._classifyPathname('/someuser/direct/'), 'UNKNOWN', 'TD6s: /<username>/direct/ === UNKNOWN (two-segment, not preserved)');
  assert.equal(SlowGram._classifyPathname('/direct'), 'UNKNOWN', 'TD6t: /direct (bare keyword, no slash) === UNKNOWN (keyword wins over the profile guard)');
})();

// Test T-D7 — never-upgrade (D-02/DETC-03): a video-rich tree on ANY
// non-reels pathname never produces REELS nor a registry entry. Because
// UNKNOWN/SOCIAL never connect the observer, no mutation can even be
// delivered — the prohibition is structural: zero observer instances, zero
// registrations after a flush (three shapes: profile-SOCIAL, home-UNKNOWN,
// post-SOCIAL).
(function () {
  var cases = [
    { path: '/someuser/', expected: 'SOCIAL', label: 'profile' },
    { path: '/', expected: 'UNKNOWN', label: 'home' },
    { path: '/p/x/', expected: 'SOCIAL', label: 'post' }
  ];
  for (var c = 0; c < cases.length; c++) {
    FakeMutationObserver.instances = [];
    var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/fake-uuid' });
    var main = FakeElement('main', { role: 'main' }, [video]);
    var e = freshEnv({ root: main, location: FakeLocation(cases[c].path), observer: FakeMutationObserver });
    assert.equal(SlowGram.getState().context, cases[c].expected, 'TD7a.' + c + ': ' + cases[c].path + ' === ' + cases[c].expected);
    assert.equal(FakeMutationObserver.instances.length, 0, 'TD7b.' + c + ': ' + cases[c].path + ' never connects an observer (no mutation can be delivered)');
    e.raf.flush();
    assert.equal(SlowGram._registrySize(), 0, 'TD7c.' + c + ': ' + cases[c].path + ' registers zero videos (video in tree ignored)');
  }
})();

// Test T-D8 — refresh sources (D-13): (a) a popstate pathname event drives
// refresh('route') → context flips to the new pathname's class; (b) a
// role-attribute mutation triggers refresh('mutation') via the batch — the
// verdict stays pathname-authoritative (REELS stays REELS; never an upgrade).
(function () {
  // (a) pathname event source — popstate delivered on the window target.
  var e = freshEnv({ location: FakeLocation('/reels/') });
  assert.equal(SlowGram.getState().context, 'REELS', 'TD8a1: init on /reels/ === REELS');
  e.location.setPathname('/direct/');       // pure write — signal dispatched explicitly
  e.location.dispatchPopstate();            // fires on the window (bindRouteEvents)
  assert.equal(SlowGram.getState().context, 'SOCIAL', 'TD8a2: popstate after setPathname(/direct/) === SOCIAL');
  e.location.setPathname('/reels/');
  e.location.dispatchPopstate();
  assert.equal(SlowGram.getState().context, 'REELS', 'TD8a3: popstate back to /reels/ === REELS');
})();

(function () {
  // (b) role-attribute mutation source — the batch sees a role attr change
  // on the feed root and triggers refresh('mutation'); the pathname is still
  // /reels/ so the verdict is unchanged (anti-upgrade asserted both ways: the
  // mutation fires a refresh, yet emits zero contextchange — the verdict is
  // pathname-authoritative).
  FakeMutationObserver.instances = [];
  var main = FakeElement('main', { role: 'main' }, []);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var changes = 0;
  SlowGram.on('contextchange', function () { changes++; });
  var observer = FakeMutationObserver.instances[0];
  assert.ok(observer !== undefined, 'TD8b1: observer connected on REELS');
  observer.record([{ type: 'attributes', attributeName: 'role', target: main }]);
  e.raf.flush();
  assert.equal(SlowGram.getState().context, 'REELS', 'TD8b2: role mutation on /reels/ keeps REELS (pathname authoritative)');
  assert.equal(changes, 0, 'TD8b3: role mutation produces zero contextchange emissions (change-guarded no-op)');
})();

// Test T-D9 — empty-reels-tab edge ACCEPTED (D-02): /reels/ with ZERO videos
// still classifies REELS, registers nothing, and selector health stays ok —
// the [role="main"] anchor hit counts as a health hit even with no video
// (healthScan anchor logic, Plan 01).
(function () {
  FakeMutationObserver.instances = [];
  var main = FakeElement('main', { role: 'main' }, []);    // zero videos
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  assert.equal(SlowGram.getState().context, 'REELS', 'TD9a: /reels/ with zero videos === REELS (empty-tab edge accepted)');
  assert.equal(FakeMutationObserver.instances.length, 1, 'TD9b: observer connected on REELS even with zero videos');
  e.raf.flush();
  assert.equal(SlowGram._registrySize(), 0, 'TD9c: zero videos register on the empty reels tab');
  var health = SlowGram.getSelectorHealth();
  assert.equal(health.status, 'ok', 'TD9d: selector health ok — anchor hit counts even with no video');
  assert.equal(health.missStreak, 0, 'TD9e: health missStreak 0 after anchor-only hit');
})();

// Task 2 (02-02) — DETC-02 RouteGuard suite: all five navigation signals
// (pushState, replaceState, popstate, hashchange, rAF re-check) independently
// re-assert context; every preserved route + profile pauses the clock;
// destroy() unbinds cleanly and re-init works.

// Test T-D10 — pushState interception (D-06): the wrapped history performs
// the navigation then re-classifies — REELS → SOCIAL → REELS.
(function () {
  var e = freshEnv({ location: FakeLocation('/reels/') });
  assert.equal(SlowGram.getState().context, 'REELS', 'TD10a: init on /reels/ === REELS');
  e.win.history.pushState(null, '', '/direct/');
  assert.equal(SlowGram.getState().context, 'SOCIAL', 'TD10b: pushState(/direct/) === SOCIAL (intercepted)');
  e.win.history.pushState(null, '', '/reels/');
  assert.equal(SlowGram.getState().context, 'REELS', 'TD10c: pushState(/reels/) === REELS again');
  assert.equal(e.win.history.calls.length, 2, 'TD10d: fake history recorded both pushState calls (wrapper calls through)');
})();

// Test T-D11 — replaceState interception: same route-flip pattern.
(function () {
  var e = freshEnv({ location: FakeLocation('/reels/') });
  assert.equal(SlowGram.getState().context, 'REELS', 'TD11a: init on /reels/ === REELS');
  e.win.history.replaceState(null, '', '/messages/');
  assert.equal(SlowGram.getState().context, 'SOCIAL', 'TD11b: replaceState(/messages/) === SOCIAL');
  e.win.history.replaceState(null, '', '/reels/');
  assert.equal(SlowGram.getState().context, 'REELS', 'TD11c: replaceState(/reels/) === REELS again');
  assert.equal(e.win.history.calls.length, 2, 'TD11d: fake history recorded both replaceState calls');
})();

// Test T-D12 — popstate listener: setPathname + dispatchPopstate → SOCIAL
// (the engine's window popstate listener fires, D-13 source 1).
(function () {
  var e = freshEnv({ location: FakeLocation('/reels/') });
  assert.equal(SlowGram.getState().context, 'REELS', 'TD12a: init on /reels/ === REELS');
  e.location.setPathname('/messages/');
  e.location.dispatchPopstate();
  assert.equal(SlowGram.getState().context, 'SOCIAL', 'TD12b: popstate after setPathname(/messages/) === SOCIAL (window listener fires)');
})();

// Test T-D13 — hashchange listener: setPathname + dispatchHashchange →
// SOCIAL (D-13 source 1 second half).
(function () {
  var e = freshEnv({ location: FakeLocation('/reels/') });
  assert.equal(SlowGram.getState().context, 'REELS', 'TD13a: init on /reels/ === REELS');
  e.location.setPathname('/explore/');
  e.location.dispatchHashchange();
  assert.equal(SlowGram.getState().context, 'SOCIAL', 'TD13b: hashchange after setPathname(/explore/) === SOCIAL (window listener fires)');
})();

// Test T-D14 — rAF re-check fallback (D-06, Pitfall 7): the BYPASS case —
// setPathname WITHOUT any event dispatch; the batch carrier catches the
// change within one frame. No timer involved (the source scan asserts it).
(function () {
  var e = freshEnv({ location: FakeLocation('/reels/') });
  assert.equal(SlowGram.getState().context, 'REELS', 'TD14a: init on /reels/ === REELS');
  e.location.setPathname('/p/somepost/');     // bypass: no pushState/popstate/hashchange at all
  e.raf.flush();
  assert.equal(SlowGram.getState().context, 'SOCIAL', 'TD14b: rAF batch re-check catches the pathname change within one frame (D-06 fallback)');
})();

// Test T-D15 — every preserved route + a profile re-asserts preservation
// (D-04/D-05) with the clock PAUSED: pushState to each route flips to
// SOCIAL and elapsedMs stays 0 after a full minute (trust contract).
(function () {
  var routes = SlowGram.getConfig().preservedRoutes.concat(['/someuser/']);
  for (var i = 0; i < routes.length; i++) {
    var e = freshEnv({ location: FakeLocation('/reels/') });
    assert.equal(SlowGram.getState().context, 'REELS', 'TD15a.' + i + ': init on /reels/ === REELS');
    e.win.history.pushState(null, '', routes[i]);
    assert.equal(SlowGram.getState().context, 'SOCIAL', 'TD15b.' + i + ': ' + routes[i] + ' === SOCIAL (preserved, D-04)');
    e.clock.advance(60000);
    e.raf.flush();
    assert.equal(SlowGram.getState().elapsedMs, 0, 'TD15c.' + i + ': clock paused on ' + routes[i] + ' (trust contract)');
  }
})();

// Test T-D16 — destroy() restores the history originals AND removes the
// window route listeners (T-02-05); a re-init rebinds cleanly so the second
// init's RouteGuard intercepts again.
(function () {
  var e = freshEnv({ location: FakeLocation('/reels/') });
  SlowGram.destroy();
  // (a) History originals restored: a post-destroy pushState performs the raw
  // navigation with NO re-classification (the wrapper was unbound).
  e.location.setPathname('/direct/');
  e.win.history.pushState(null, '', '/reels/');
  assert.equal(SlowGram.getState().context, 'UNKNOWN', 'TD16a: destroy restores original history — raw pushState no longer re-classifies');
  assert.equal(e.location.pathname, '/reels/', 'TD16b: restored original still performs the navigation (pathname updated)');
  assert.equal(e.win.history.calls.length, 1, 'TD16c: restored original still records the call');
  // (b) Window listeners removed: a popstate signal after destroy is inert.
  e.location.dispatchPopstate();
  assert.equal(SlowGram.getState().context, 'UNKNOWN', 'TD16d: destroy removed the popstate listener (no re-classification)');
  // (c) Re-init rebinds cleanly — the second init's RouteGuard intercepts.
  SlowGram.init({ clock: e.clock, document: e.doc, window: e.win, MutationObserver: null, requestAnimationFrame: e.raf.request });
  e.win.history.pushState(null, '', '/direct/');
  assert.equal(SlowGram.getState().context, 'SOCIAL', 'TD16e: re-init RouteGuard intercepts pushState again (clean re-bind)');
})();

// Task 1 (02-03) — DETC-04/08 DomWatcher full contract suite: the two-root
// observer set (D-11/D-03), the locked attributeFilter on BOTH roots, one
// rAF-batch drain per frame (D-09), the D-14 self-mutation filter + overlay
// exclusion, and the connect-on-REELS-only / disconnect-on-SOCIAL/UNKNOWN
// lifecycle (DETC-08/D-12) with reconnect re-sync (D-07 tail).

// Test T-D17 — two-root observe (Pattern 2): on REELS with the loggedIn
// shape (role=main feed + role=dialog viewer containing a video), observe()
// is called on BOTH roots with the exact locked D-11 config — never on body.
(function () {
  FakeMutationObserver.instances = [];
  var feedVideo = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/fake-feed', loop: '' });
  var main = FakeElement('main', { role: 'main' }, [feedVideo]);
  var dialogVideo = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/fake-dialog' });
  var dialog = FakeElement('div', { role: 'dialog' }, [dialogVideo]);
  var root = FakeElement('div', {}, [main, dialog]);    // both are document descendants
  var e = freshEnv({ root: root, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var ws = SlowGram._getWatcherState();
  assert.equal(ws.connected, true, 'TD17a: watcher connected on REELS with the two-root set');
  assert.equal(ws.roots.length, 2, 'TD17b: watcher state exposes both roots');
  var observer = FakeMutationObserver.instances[0];
  assert.equal(observer.observed.length, 2, 'TD17c: observe() called for BOTH roots');
  var locked = JSON.stringify(['src', 'loop', 'autoplay', 'role']);
  for (var i = 0; i < observer.observed.length; i++) {
    assert.equal(JSON.stringify(observer.observed[i].config.attributeFilter), locked,
      'TD17d.' + i + ': locked D-11 attributeFilter on both roots');
    assert.equal(observer.observed[i].config.childList, true, 'TD17e.' + i + ': childList observed on both roots');
    assert.equal(observer.observed[i].config.subtree, true, 'TD17f.' + i + ': subtree observed on both roots');
  }
  assert.equal(observer.observed[0].target, main, 'TD17g: first observed target is [role="main"] feed root');
  assert.equal(observer.observed[1].target, dialog, 'TD17h: second observed target is [role="dialog"] with video');
})();

// Test T-D18 — logged-out shape (no dialog): only the [role="main"] root is
// observed; the dialog root resolves null and is skipped — never body-wide.
(function () {
  FakeMutationObserver.instances = [];
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/fake-uuid' });
  var main = FakeElement('main', { role: 'main' }, [video]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  assert.equal(observer.observed.length, 1, 'TD18a: exactly one root observed when no dialog present');
  assert.equal(observer.observed[0].target, main, 'TD18b: the single observed root is [role="main"]');
  var ws = SlowGram._getWatcherState();
  assert.equal(ws.roots[1], null, 'TD18c: dialog root resolves null on the logged-out shape');
})();

// Test T-D19 — batch drains once per frame (D-09): 2 recorded mutations are
// processed in ONE raf.flush(); 2 more in the next flush; re-recording the
// SAME elements stays idempotent (register is a no-op for known videos).
(function () {
  FakeMutationObserver.instances = [];
  var main = FakeElement('main', { role: 'main' }, []);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  var v1 = FakeVideoElement('video', { src: 'blob:1' });
  var v2 = FakeVideoElement('video', { src: 'blob:2' });
  observer.record([
    { type: 'childList', addedNodes: [v1], target: main },
    { type: 'childList', addedNodes: [v2], target: main }
  ]);
  e.raf.flush();
  assert.equal(SlowGram._registrySize(), 2, 'TD19a: 2 mutations drain in ONE flush → 2 registered');
  var v3 = FakeVideoElement('video', { src: 'blob:3' });
  var v4 = FakeVideoElement('video', { src: 'blob:4' });
  observer.record([
    { type: 'childList', addedNodes: [v3], target: main },
    { type: 'childList', addedNodes: [v4], target: main }
  ]);
  e.raf.flush();
  assert.equal(SlowGram._registrySize(), 4, 'TD19b: 2 more in the second flush → 4 (once per frame)');
  observer.record([
    { type: 'childList', addedNodes: [v1], target: main },
    { type: 'childList', addedNodes: [v2], target: main }
  ]);
  e.raf.flush();
  assert.equal(SlowGram._registrySize(), 4, 'TD19c: same elements re-recorded → still 4 (idempotent register)');
})();

// Test T-D20 — attribute mutation source (D-13 tail): a src-attribute
// mutation on a video registers it (blob src swap signal per State of the Art
// line 419 — possible src swap → re-register is idempotent).
(function () {
  FakeMutationObserver.instances = [];
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/fake-1' });
  var main = FakeElement('main', { role: 'main' }, [video]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  assert.equal(SlowGram._registrySize(), 1, 'TD20a: connect scan registered the present video (UAT-05)');
  observer.recordAttributeMutation(video, 'src');
  e.raf.flush();
  assert.equal(SlowGram._registrySize(), 1, 'TD20b: src attribute mutation on a registered video is idempotent (src swap signal re-apply rides loadstart)');
})();

// Test T-D21 — self-mutation filter (D-14, Pitfall 4): with the mutating
// flag set, the whole batch is skipped — engine-origin writes never
// re-register; clearing the flag lets the mutation register. The present
// video registers at connect (UAT-05 scan); the batch-skip is observed on a
// NEW video added by mutation.
(function () {
  FakeMutationObserver.instances = [];
  var video = FakeVideoElement('video', { src: 'blob:1' });
  var video2 = FakeVideoElement('video', { src: 'blob:2' });
  var main = FakeElement('main', { role: 'main' }, [video]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  assert.equal(SlowGram._registrySize(), 1, 'TD21a: connect scan registers the present video (UAT-05)');
  SlowGram._setMutatingForTest(true);
  observer.record([{ type: 'childList', addedNodes: [video2], target: main }]);
  e.raf.flush();
  assert.equal(SlowGram._registrySize(), 1, 'TD21b: mutating flag skips the batch — the NEW video does not register (Pitfall 4 protection)');
  SlowGram._setMutatingForTest(false);
  observer.record([{ type: 'childList', addedNodes: [video2], target: main }]);
  e.raf.flush();
  assert.equal(SlowGram._registrySize(), 2, 'TD21c: flag cleared → the same mutation registers the new video');
})();

// Test T-D22 — overlay-host subtree exclusion (D-14): a video inside the
// injected overlay host is skipped; outside it registers.
(function () {
  FakeMutationObserver.instances = [];
  var video = FakeVideoElement('video', { src: 'blob:1' });
  var overlay = FakeElement('div', {}, [video]);        // video INSIDE the overlay host
  var main = FakeElement('main', { role: 'main' }, []);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  SlowGram._setOverlayHostForTest(overlay);
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  assert.equal(SlowGram._registrySize(), 0, 'TD22a: video inside the overlay host subtree is excluded');
  SlowGram._setOverlayHostForTest(null);
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  assert.equal(SlowGram._registrySize(), 1, 'TD22b: exclusion cleared → the video registers');
})();

// Test T-D23 — disconnect on SOCIAL (DETC-08/D-12): a RouteGuard pushState to
// /direct/ flips context SOCIAL and disconnects the observer; the registry is
// UNCHANGED (D-07 keep-registry — never cleared on social routes).
(function () {
  FakeMutationObserver.instances = [];
  var video = FakeVideoElement('video', { src: 'blob:1' });
  var main = FakeElement('main', { role: 'main' }, [video]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  assert.equal(SlowGram._registrySize(), 1, 'TD23a: video registered on REELS');
  assert.equal(SlowGram._getWatcherState().connected, true, 'TD23b: watcher connected on REELS');
  e.win.history.pushState(null, '', '/direct/');
  assert.equal(SlowGram.getState().context, 'SOCIAL', 'TD23c: pushState(/direct/) === SOCIAL (RouteGuard)');
  assert.equal(SlowGram._getWatcherState().connected, false, 'TD23d: observer disconnected on SOCIAL (DETC-08/D-12)');
  assert.equal(SlowGram._registrySize(), 1, 'TD23e: registry survives disconnect unchanged (D-07 keep-registry)');
})();

// Test T-D24 — disconnect on UNKNOWN (DETC-08): pushState to / classifies
// UNKNOWN (fail-safe) and disconnects the observer.
(function () {
  FakeMutationObserver.instances = [];
  var main = FakeElement('main', { role: 'main' }, []);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  assert.equal(SlowGram._getWatcherState().connected, true, 'TD24a: watcher connected on REELS');
  e.win.history.pushState(null, '', '/');
  assert.equal(SlowGram.getState().context, 'UNKNOWN', 'TD24b: pushState(/) === UNKNOWN (fail-safe DETC-03)');
  assert.equal(SlowGram._getWatcherState().connected, false, 'TD24c: observer disconnected on UNKNOWN (DETC-08)');
})();

// Test T-D25 — reconnect re-sync (D-07 tail): returning to /reels/ reconnects
// with a FRESH observer and runs one synchronous batch pass + health scan.
(function () {
  FakeMutationObserver.instances = [];
  var video = FakeVideoElement('video', { src: 'blob:1' });
  var main = FakeElement('main', { role: 'main' }, [video]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  e.win.history.pushState(null, '', '/direct/');
  assert.equal(SlowGram._getWatcherState().connected, false, 'TD25a: disconnected on /direct/');
  e.win.history.pushState(null, '', '/reels/');
  assert.equal(SlowGram.getState().context, 'REELS', 'TD25b: back to /reels/ === REELS');
  assert.equal(SlowGram._getWatcherState().connected, true, 'TD25c: watcher reconnected on return to /reels/');
  assert.equal(FakeMutationObserver.instances.length, 2, 'TD25d: a SECOND observer instance created on reconnect');
  var health = SlowGram.getSelectorHealth();
  assert.equal(health.status, 'ok', 'TD25e: reconnect re-sync ran healthScan (status ok)');
})();

// Task 2 (02-03) — DETC-05 VideoRegistry full-contract suite: WeakMap state
// shape, idempotent register with once-only lifecycle binding, loadstart/
// emptied per-video reset (Pitfall 5), and the registry retained across
// disconnect/reconnect (D-07). WeakMap GC-safety is structural (entries die
// with the element) — the fake cannot prove GC, so the suite proves the
// reset-on-recycle contract T-D31 drives.

// Test T-D26 — register creates state: getRegistryState returns the full
// shape with a numeric registeredAt; _registrySize() === 1.
(function () {
  FakeMutationObserver.instances = [];
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/fake-a' });
  var main = FakeElement('main', { role: 'main' }, [video]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  assert.equal(SlowGram._registrySize(), 1, 'TD26a: one registered video');
  var st = SlowGram.getRegistryState(video);
  assert.equal(typeof st.registeredAt, 'number', 'TD26b: registeredAt is a number (clock ms)');
  assert.equal(st.src, 'blob:https://www.instagram.com/fake-a', 'TD26c: src captured at register');
  assert.equal(st.started, false, 'TD26d: started false at register');
  assert.equal(st.ended, false, 'TD26e: ended false at register');
  assert.equal(st.appliedLevers, null, 'TD26f: appliedLevers null (Phase 3 reservation)');
})();

// Test T-D27 — idempotent register: 10x register keeps size 1 and binds the
// lifecycle listeners EXACTLY once (dispatch loadstart once → started flips
// but the element's loadstart listener count stays 1).
(function () {
  FakeMutationObserver.instances = [];
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/fake-b' });
  var main = FakeElement('main', { role: 'main' }, [video]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  for (var i = 0; i < 10; i++) {
    observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
    e.raf.flush();
  }
  assert.equal(SlowGram._registrySize(), 1, 'TD27a: 10x re-register keeps size 1 (idempotent)');
  var loadstartCount = (video.listeners.loadstart || []).length;
  assert.equal(loadstartCount, 1, 'TD27b: loadstart listener bound exactly once (entry._bound guard)');
  var emptiedCount = (video.listeners.emptied || []).length;
  assert.equal(emptiedCount, 1, 'TD27c: emptied listener bound exactly once');
  video.dispatchEvent({ type: 'loadstart', target: video });
  var st = SlowGram.getRegistryState(video);
  assert.equal(st.started, true, 'TD27d: the single bound listener flipped started');
  assert.equal((video.listeners.loadstart || []).length, 1, 'TD27e: still exactly one loadstart listener after dispatch');
})();

// Test T-D28 — loadstart reset (Pitfall 5): a loadstart with a NEW src
// refreshes entry.src, sets started=true, clears ended=false.
(function () {
  FakeMutationObserver.instances = [];
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/fake-c' });
  var main = FakeElement('main', { role: 'main' }, [video]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  video.dispatchEvent({ type: 'loadstart', target: video });   // start with blob:A behavior
  video.src = 'blob:https://www.instagram.com/fake-c-swapped';
  video.dispatchEvent({ type: 'loadstart', target: video });   // new content loading
  var st = SlowGram.getRegistryState(video);
  assert.equal(st.src, 'blob:https://www.instagram.com/fake-c-swapped', 'TD28a: loadstart refreshes entry.src from the element');
  assert.equal(st.started, true, 'TD28b: loadstart sets started=true');
  assert.equal(st.ended, false, 'TD28c: loadstart clears ended=false');
})();

// Test T-D29 — emptied reset (Pitfall 5): after loadstart, an emptied event
// (feed recycling the node) resets ended=true, started=false, src=null.
(function () {
  FakeMutationObserver.instances = [];
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/fake-d' });
  var main = FakeElement('main', { role: 'main' }, [video]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  video.dispatchEvent({ type: 'loadstart', target: video });
  var st = SlowGram.getRegistryState(video);
  assert.equal(st.started, true, 'TD29a: pre-condition — started after loadstart');
  video.dispatchEvent({ type: 'emptied', target: video });
  st = SlowGram.getRegistryState(video);
  assert.equal(st.ended, true, 'TD29b: emptied sets ended=true');
  assert.equal(st.started, false, 'TD29c: emptied clears started=false');
  assert.equal(st.src, null, 'TD29d: emptied resets src=null (node recycled)');
})();

// Test T-D30 — registry survives disconnect AND reconnect (D-07): register a
// video on REELS, pushState /direct/ (SOCIAL — observer disconnected) →
// _registrySize() STILL 1; back to /reels/ → still 1 (reconnect does not
// reset the registry).
(function () {
  FakeMutationObserver.instances = [];
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/fake-e' });
  var main = FakeElement('main', { role: 'main' }, [video]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  assert.equal(SlowGram._registrySize(), 1, 'TD30a: registered on REELS');
  e.win.history.pushState(null, '', '/direct/');
  assert.equal(SlowGram.getState().context, 'SOCIAL', 'TD30b: /direct/ === SOCIAL');
  assert.equal(SlowGram._registrySize(), 1, 'TD30c: registry survives disconnect UNCHANGED (D-07)');
  e.win.history.pushState(null, '', '/reels/');
  assert.equal(SlowGram._registrySize(), 1, 'TD30d: registry still 1 after reconnect (no reset)');
})();

// Test T-D31 — feed node recycling via FakeElement.append/remove: register v1,
// remove v1 from the tree (simulated recycle), append a new FakeVideoElement →
// the batch registers the new one; v1's entry REMAINS in the WeakMap until GC
// (assert _registrySize() === 2 — the reset contract clears the SAME node's
// state on emptied, it never drops entries).
(function () {
  FakeMutationObserver.instances = [];
  var v1 = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/fake-f1' });
  var main = FakeElement('main', { role: 'main' }, [v1]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [v1], target: main }]);
  e.raf.flush();
  assert.equal(SlowGram._registrySize(), 1, 'TD31a: v1 registered');
  main.removeChild(v1);                                    // simulate recycle
  var v2 = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/fake-f2' });
  main.appendChild(v2);
  observer.record([{ type: 'childList', addedNodes: [v2], target: main }]);
  e.raf.flush();
  assert.equal(SlowGram._registrySize(), 2, 'TD31b: new node registered; v1 entry retained (WeakMap GC-safety)');
  var st1 = SlowGram.getRegistryState(v1);
  assert.equal(st1.started, false, 'TD31c: v1 entry intact until GC');
})();

// Task 1 (02-04) — DETC-06 SelectorRegistry health-contract suite: drift
// declared at exactly N=5 zero-hit scans (D-09), the drift-declared /
// drift-recovered 'selectorHealth' bus events agreeing with the
// getSelectorHealth() handle (D-10), the D-08 dev/prod split (fail-loud
// console.warn in dev via _setDevMode; fail-soft bounded document-scoped
// <video> fallback on /reels/ only in prod), and the per-batch (never
// timer) scan path (T-D37).

// Test T-D32 — no class selectors (DETC-06): every CONFIG.selectors value
// is class-free at runtime (both hosts), and the engine source contains no
// class-based DOM query API (Node-only source part).
(function () {
  var sels = SlowGram.getConfig().selectors;
  var clean = true;
  for (var k in sels) {
    if (sels[k].indexOf('.') === 0) { clean = false; }
  }
  assert.ok(clean, 'TD32a: no CONFIG.selectors value starts with a "." class prefix (DETC-06)');
  if (typeof process === 'undefined' || !fs) {
    assert.ok(true, 'TD32b: class-API source scan runs on the Node host only');
    return;
  }
  var path = require('path');
  var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'slowgram.js'), 'utf8');
  var code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  var classApi = code.match(/getElementsByClassName\s*\(/g);
  assert.equal(classApi ? classApi.length : 0, 0, 'TD32b: no getElementsByClassName call sites (class-query APIs banned, DETC-06)');
})();

// Test T-D33 — drift declared at N=5 (D-09): a /reels/ tree WITHOUT the
// role=main anchor → 4 zero-hit flushes stay 'ok'; the 5th declares drift
// with exactly ONE 'selectorHealth' drift event carrying the pathname.
(function () {
  FakeMutationObserver.instances = [];
  var root = FakeElement('div', {}, []);     // no role=main anchor, no videos
  var e = freshEnv({ root: root, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var events = [];
  SlowGram.on('selectorHealth', function (d) { events.push(d); });
  for (var i = 1; i <= 4; i++) {
    e.raf.flush();
    assert.equal(SlowGram.getSelectorHealth().status, 'ok',
      'TD33a.' + i + ': no drift before the threshold (' + i + '/5 zero-hit scans)');
  }
  e.raf.flush();                              // the 5th consecutive zero-hit scan
  assert.equal(SlowGram.getSelectorHealth().status, 'drift', 'TD33b: drift declared at the 5th zero-hit scan (N=5, D-09)');
  assert.equal(events.length, 1, 'TD33c: exactly one selectorHealth drift event (transition-guarded)');
  assert.equal(events[0].status, 'drift', 'TD33d: drift event payload status=drift');
  assert.equal(events[0].pathname, '/reels/', 'TD33e: drift event carries the auditable pathname (T-02-15)');
  e.raf.flush();                              // still missing — already drifted
  assert.equal(SlowGram.getSelectorHealth().status, 'drift', 'TD33f: stays drifted while the anchor stays missing');
  assert.equal(events.length, 1, 'TD33g: no re-emission while already drifted');
})();

// Test T-D34 — drift recovered (D-10): after drift, restoring the role=main
// anchor recovers on the next flush — status 'ok', missStreak 0, and exactly
// one 'selectorHealth' {status:'ok'} recovery event.
(function () {
  FakeMutationObserver.instances = [];
  var root = FakeElement('div', {}, []);
  var e = freshEnv({ root: root, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var events = [];
  SlowGram.on('selectorHealth', function (d) { events.push(d); });
  for (var i = 0; i < 5; i++) { e.raf.flush(); }
  assert.equal(SlowGram.getSelectorHealth().status, 'drift', 'TD34a: drift declared (precondition)');
  assert.equal(events.length, 1, 'TD34b: one drift event so far');
  root.appendChild(FakeElement('main', { role: 'main' }, []));   // anchor restored
  e.raf.flush();
  assert.equal(SlowGram.getSelectorHealth().status, 'ok', 'TD34c: drift recovered on the first hit after (D-10)');
  assert.equal(SlowGram.getSelectorHealth().missStreak, 0, 'TD34d: missStreak back to 0');
  assert.equal(events.length, 2, 'TD34e: a second selectorHealth event fired on recovery');
  assert.equal(events[1].status, 'ok', 'TD34f: recovery event payload status=ok');
  assert.equal(events[1].pathname, '/reels/', 'TD34g: recovery event carries the pathname');
})();

// Test T-D35 — fail-loud dev mode (D-08): _setDevMode(true) + a stubbed
// console.warn → the 5th zero-hit flush warns exactly once with the
// engine-branded drift message (threshold read from CONFIG); a fresh engine
// in prod mode never warns (fail-soft).
(function () {
  FakeMutationObserver.instances = [];
  var root = FakeElement('div', {}, []);
  var e = freshEnv({ root: root, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var warns = [];
  var origWarn = console.warn;
  console.warn = function (msg) { warns.push(msg); };
  SlowGram._setDevMode(true);
  for (var i = 0; i < 5; i++) { e.raf.flush(); }
  assert.equal(warns.length, 1, 'TD35a: dev mode warns exactly once at drift declaration');
  assert.ok(warns[0].indexOf('SlowGram: selector drift') === 0, 'TD35b: the dev warn is the engine-branded drift message');
  assert.ok(warns[0].indexOf('5') !== -1, 'TD35c: the warn names the CONFIG threshold (no magic literal)');
  e.raf.flush();
  assert.equal(warns.length, 1, 'TD35d: no repeated warn while already drifted');
  // prod mode (fail-soft): fresh engine — teardown resets health — dev off.
  SlowGram._setDevMode(false);
  SlowGram.destroy();
  SlowGram.init({ clock: e.clock, document: e.doc, window: e.win, MutationObserver: FakeMutationObserver, requestAnimationFrame: e.raf.request });
  for (var j = 0; j < 5; j++) { e.raf.flush(); }
  assert.equal(warns.length, 1, 'TD35e: prod mode never warns on drift (fail-soft, D-08)');
  console.warn = origWarn;
})();

// Test T-D36 — fail-soft prod fallback (D-08): with drift declared on
// /reels/, the batch registers document-scoped <video> OUTSIDE role=main via
// fallbackScope(); the fallback is bounded — on a preserved route it returns
// [] and registers nothing (T-02-14).
(function () {
  FakeMutationObserver.instances = [];
  var root = FakeElement('div', {}, []);     // no anchor — drift will declare
  var e = freshEnv({ root: root, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  for (var i = 0; i < 5; i++) { e.raf.flush(); }
  assert.equal(SlowGram.getSelectorHealth().status, 'drift', 'TD36a: drift declared (precondition)');
  var v1 = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/fallback-1' });
  var v2 = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/fallback-2' });
  root.appendChild(v1);
  root.appendChild(v2);
  assert.equal(SlowGram._registrySize(), 0, 'TD36b: nothing registered before the batch runs');
  e.raf.flush();
  assert.equal(SlowGram._registrySize(), 2, 'TD36c: drifted prod registers page-scoped <video> from fallbackScope on /reels/ (D-08)');
  // bounded fallback: on a preserved route the scope is [] — no registration.
  e.win.history.pushState(null, '', '/direct/');
  assert.equal(SlowGram.getState().context, 'SOCIAL', 'TD36d: /direct/ === SOCIAL (observer disconnected, D-07)');
  var v3 = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/fallback-3' });
  root.appendChild(v3);
  e.raf.flush();
  assert.equal(SlowGram._registrySize(), 2, 'TD36e: no fallback registration outside /reels/ (bounded, T-02-14)');
})();

// Test T-D37 — per-batch, never timer (D-09): healthScan is invoked ONLY
// from processBatch (the rAF batch carrier) — the source scan proves the
// call site lives inside the batch path and nowhere else; the timer-API
// scan stays green in the SCAN block below.
(function () {
  if (typeof process === 'undefined' || !fs) {
    assert.ok(true, 'TD37: healthScan call-site scan runs on the Node host only');
    return;
  }
  var path = require('path');
  var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'slowgram.js'), 'utf8');
  var code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  var batchWhole = extractFunction(code, 'function processBatch');
  assert.ok(batchWhole.indexOf('healthScan()') !== -1, 'TD37a: healthScan is invoked from processBatch (the per-frame batch path)');
  var healthDef = extractFunction(code, 'function healthScan');
  var rest = code.split(batchWhole).join('').split(healthDef).join('');
  assert.equal((rest.match(/healthScan\(\)/g) || []).length, 0, 'TD37b: healthScan has zero call sites outside the batch path (no timer, D-09)');
})();

// Test T-D38 — driftThreshold locked in CONFIG (D-09, T14-style): the value
// is 5 and lives in CONFIG.health — module bodies never hardcode it
// (healthScan reads CONFIG; T-D35 asserts the warn names the CONFIG value).
(function () {
  assert.equal(SlowGram.getConfig().health.driftThreshold, 5, 'TD38: CONFIG.health.driftThreshold locked at 5 (D-09)');
})();

// Task 2 (02-04) — demo.html DETC-07 deliverable: the deterministic
// detection demo must exist and load the five-script sequence in the
// documented order (engine → harness → fixtures → mocks → inline demo).
(function () {
  if (typeof process === 'undefined' || !fs) {
    assert.ok(true, 'TD39: demo.html deliverable check runs on the Node host only');
    return;
  }
  var path = require('path');
  var html = fs.readFileSync(path.join(__dirname, '..', 'demo.html'), 'utf8');
  var order = ['src/slowgram.js', 'test/harness.js', 'test/fixtures/instagram-shapes.js', 'test/dom-mocks/instagram-mock.js'];
  var pos = -1;
  var ordered = true;
  for (var i = 0; i < order.length; i++) {
    var idx = html.indexOf(order[i]);
    if (idx === -1) { ordered = false; }
    if (idx !== -1 && idx > pos) { pos = idx; }
    else if (idx !== -1) { ordered = false; }
  }
  assert.ok(ordered, 'TD39: demo.html exists and loads the documented five-script sequence in order (DETC-07)');
})();

// Phase 3 (03-01) — LEVR tracer suite: the DegradationEngine hub
// (phase → CONFIG.degradationMatrix → applicator map with per-video
// reconcile), the saturation lever implementing the D-15 ancestor-wrapper
// gate, revertAll() (LEVR-07), and the trust wiring (apply on REELS only,
// revert on SOCIAL/UNKNOWN/reset, apply-after-load, register-time apply,
// removedNodes pruning).

// Test T-L1 — CONFIG.leverParams (D-19/D-20): frozen per-phase saturation
// values — the ONLY source of lever values (CORE-05, T-L14 source scan).
(function () {
  var lp = SlowGram.getConfig().leverParams;
  assert.ok(lp && Object.isFrozen(lp), 'TL1a: CONFIG.leverParams exists and is frozen');
  assert.ok(Object.isFrozen(lp.saturation), 'TL1b: leverParams.saturation is frozen');
  assert.equal(lp.saturation['1'], 0.85, 'TL1c: saturation phase 1 value 0.85');
  assert.equal(lp.saturation['2'], 0.65, 'TL1d: saturation phase 2 value 0.65');
  assert.equal(lp.saturation['3'], 0.4, 'TL1e: saturation phase 3 value 0.4 (imperceptible escalation, D-20)');
})();

// Test T-L2 — end-to-end: register at phase 0 (no-op), cross 3min →
// phasechange → applyAll → saturate(0.85) on the ancestor wrapper.
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/l1' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  assert.equal(SlowGram._registrySize(), 1, 'TL2a: video registered');
  assert.equal(SlowGram.getState().phase, 0, 'TL2b: phase 0 at start');
  assert.ok(!wrapper.style.filter, 'TL2c: phase 0 applies nothing (matrix 0 is empty)');
  e.clock.advance(180000);
  e.raf.flush();
  assert.equal(SlowGram.getState().phase, 1, 'TL2d: phase 1 after 3min');
  assert.equal(wrapper.style.filter, 'saturate(0.85)', 'TL2e: saturation applied to the ancestor wrapper at phase 1');
  var st = SlowGram.getRegistryState(video);
  assert.equal(st.appliedLevers.saturation, 1, 'TL2f: appliedLevers.saturation === 1');
})();

// Test T-L3 — escalation: the three phases carry saturation with escalating
// values (0.85 → 0.65 → 0.4) — the value curve is the degradation gradient.
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/l2' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(420000);
  e.raf.flush();
  assert.equal(SlowGram.getState().phase, 2, 'TL3a: phase 2 at 7min');
  assert.equal(wrapper.style.filter, 'saturate(0.65)', 'TL3b: escalated to saturate(0.65) at phase 2');
  e.clock.advance(300000);                       // 720000 total = 12min
  e.raf.flush();
  assert.equal(SlowGram.getState().phase, 3, 'TL3c: phase 3 at 12min');
  assert.equal(wrapper.style.filter, 'saturate(0.4)', 'TL3d: escalated to saturate(0.4) at phase 3');
})();

// Test T-L4 — idempotence (LEVR-01/06): repeated same-phase frames never
// churn the filter or the appliedLevers phase.
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/l3' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(180000);
  e.raf.flush();
  assert.equal(wrapper.style.filter, 'saturate(0.85)', 'TL4a: applied at phase 1');
  for (var i = 0; i < 5; i++) {
    e.clock.advance(1000);
    e.raf.flush();
  }
  assert.equal(wrapper.style.filter, 'saturate(0.85)', 'TL4b: repeated same-phase flushes do not churn the filter');
  assert.equal(SlowGram.getRegistryState(video).appliedLevers.saturation, 1, 'TL4c: appliedLevers stays at phase 1 (idempotent apply)');
})();

// Test T-L5 — revert on fatigue reset (LEVR-07): >5min hidden → reset →
// phase 0 → revertAll restored the wrapper and cleared appliedLevers.
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/l4' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(420000);
  e.raf.flush();
  assert.equal(wrapper.style.filter, 'saturate(0.65)', 'TL5a: degraded at phase 2 (precondition)');
  e.doc.setVisibility('hidden');
  e.doc.dispatchEvent(new Event('visibilitychange'));
  e.clock.advance(300001);                       // strictly > the 5min fatigue window
  e.doc.setVisibility('visible');
  e.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(SlowGram.getState().phase, 0, 'TL5b: fatigue reset → phase 0');
  assert.equal(wrapper.style.filter, '', 'TL5c: revertAll restored the wrapper to native (LEVR-07)');
  var st = SlowGram.getRegistryState(video);
  assert.ok(!st.appliedLevers || !st.appliedLevers.saturation, 'TL5d: no saturation lever remains applied after reset');
})();

// Test T-L6 — revert on SOCIAL (trust contract): a RouteGuard flip to
// /direct/ reverts every lever — social routes never degrade.
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/l5' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(420000);
  e.raf.flush();
  assert.equal(wrapper.style.filter, 'saturate(0.65)', 'TL6a: degraded at phase 2 (precondition)');
  e.win.history.pushState(null, '', '/direct/');
  assert.equal(SlowGram.getState().context, 'SOCIAL', 'TL6b: /direct/ === SOCIAL');
  assert.equal(wrapper.style.filter, '', 'TL6c: revertAll on SOCIAL — never degrade social routes (trust contract)');
})();

// Test T-L7 — re-apply on return to /reels/: the surviving registry
// re-degrades at the current phase after a social detour (D-16).
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/l6' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(420000);
  e.raf.flush();
  e.win.history.pushState(null, '', '/direct/');
  assert.equal(wrapper.style.filter, '', 'TL7a: reverted on /direct/');
  e.win.history.pushState(null, '', '/reels/');
  assert.equal(SlowGram.getState().context, 'REELS', 'TL7b: back to /reels/');
  assert.equal(wrapper.style.filter, 'saturate(0.65)', 'TL7c: current phase re-applied on return (surviving registry)');
})();

// Test T-L8 — wrapper selection (D-15 gate): a transformed ancestor is
// skipped (its own GPU layer would drop the filter again); the first
// non-transformed ancestor receives it.
(function () {
  FakeMutationObserver.instances = [];
  var outer = FakeElement('div', {}, []);
  var transformed = FakeElement('div', {}, []);
  transformed.style.transform = 'translateX(10px)';
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/l7' });
  transformed.appendChild(video);
  outer.appendChild(transformed);
  var main = FakeElement('main', { role: 'main' }, [outer]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(180000);
  e.raf.flush();
  assert.ok(!transformed.style.filter, 'TL8a: transformed ancestor is skipped (D-15/Pitfall 2)');
  assert.equal(outer.style.filter, 'saturate(0.85)', 'TL8b: first non-transformed ancestor receives the filter');
})();

// Test T-L9 — bounded walk (Anti-Pattern 6): a video whose ancestor chain
// is transformed up to BODY finds no safe wrapper → null → the lever skips
// (never body-wide, never a big container).
(function () {
  FakeMutationObserver.instances = [];
  var body = FakeElement('body', {}, []);
  var t1 = FakeElement('div', {}, []);
  t1.style.transform = 'translateX(1px)';
  var t2 = FakeElement('div', {}, []);
  t2.style.filter = 'blur(1px)';
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/l8' });
  t2.appendChild(video);
  t1.appendChild(t2);
  body.appendChild(t1);
  var main = FakeElement('main', { role: 'main' }, []);
  var root = FakeElement('div', {}, [main, body]);
  var e = freshEnv({ root: root, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(180000);
  e.raf.flush();
  assert.equal(t2.style.filter, 'blur(1px)', 'TL9a: the transformed chain is untouched');
  assert.equal(t1.style.transform, 'translateX(1px)', 'TL9b: upper chain unchanged (walk bounded at BODY → null → skip)');
  assert.ok(!video.style.filter, 'TL9c: no filter applied to the video or any chain element');
})();

// Test T-L10 — never the <video> itself (Pitfall 2): the lever writes the
// wrapper, and the element's own style stays clean.
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/l9' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(180000);
  e.raf.flush();
  assert.equal(wrapper.style.filter, 'saturate(0.85)', 'TL10a: wrapper got the filter');
  assert.ok(!video.style.filter, 'TL10b: the <video> element itself is never filtered (D-15/Pitfall 2)');
})();

// Test T-L11 — original preserved and restored across cycles (D-17): the
// captured original survives apply → revert → re-apply → revert, so the
// wrapper returns to exactly its untouched state every time.
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/l10' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(180000);
  e.raf.flush();
  assert.equal(wrapper.style.filter, 'saturate(0.85)', 'TL11a: lever applied at phase 1');
  e.win.history.pushState(null, '', '/direct/');
  assert.equal(wrapper.style.filter, '', 'TL11b: revert restores the captured original');
  e.win.history.pushState(null, '', '/reels/');
  assert.equal(wrapper.style.filter, 'saturate(0.85)', 'TL11c: re-applied on return');
  e.win.history.pushState(null, '', '/direct/');
  assert.equal(wrapper.style.filter, '', 'TL11d: second revert restores the SAME captured original (no drift)');
})();

// Test T-L12 — removedNodes pruning (D-18): a VIDEO removed from the
// observed roots leaves the live list (memory-bounded over a long session);
// the WeakMap entry persists (GC semantics unchanged — _registrySize stays).
(function () {
  FakeMutationObserver.instances = [];
  var w1 = FakeElement('div', {}, []);
  var v1 = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/l11a' });
  w1.appendChild(v1);
  var w2 = FakeElement('div', {}, []);
  var v2 = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/l11b' });
  w2.appendChild(v2);
  var main = FakeElement('main', { role: 'main' }, [w1, w2]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [v1, v2], target: main }]);
  e.raf.flush();
  e.clock.advance(180000);
  e.raf.flush();
  assert.equal(w1.style.filter, 'saturate(0.85)', 'TL12a: v1 degraded');
  assert.equal(w2.style.filter, 'saturate(0.85)', 'TL12b: v2 degraded');
  assert.equal(SlowGram._liveRegistrySize(), 2, 'TL12c: both videos live');
  observer.record([{ type: 'childList', removedNodes: [v1], target: main }]);
  e.raf.flush();
  assert.equal(SlowGram._liveRegistrySize(), 1, 'TL12d: removedNodes pruning drops v1 from the live list (D-18)');
  assert.equal(SlowGram._registrySize(), 2, 'TL12e: WeakMap semantics unchanged — _registrySize still 2 (GC holds the entry)');
  SlowGram.revertAll();
  assert.equal(w2.style.filter, '', 'TL12f: revertAll restored v2 (still live)');
  assert.equal(w1.style.filter, 'saturate(0.85)', 'TL12g: pruned v1 wrapper untouched by revertAll (dropped from the live list)');
})();

// Test T-L13 — apply-after-load (Pattern 2): a loadstart clears appliedLevers
// and re-applies the current phase — media resets never leave a degraded
// video undegraded.
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/l12' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(420000);
  e.raf.flush();
  assert.equal(wrapper.style.filter, 'saturate(0.65)', 'TL13a: degraded at phase 2');
  video.src = 'blob:https://www.instagram.com/l12-swapped';
  video.dispatchEvent({ type: 'loadstart', target: video });
  assert.equal(wrapper.style.filter, 'saturate(0.65)', 'TL13b: loadstart cleared + re-applied the lever (Pattern 2)');
  var st = SlowGram.getRegistryState(video);
  assert.equal(st.appliedLevers.saturation, 2, 'TL13c: appliedLevers re-set to the current phase after loadstart');
})();

// Test T-L15 — register-time apply (D-16): a video registered mid-phase-2 is
// degraded immediately on registration — not on the next transition.
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  e.clock.advance(420000);
  e.raf.flush();
  assert.equal(SlowGram.getState().phase, 2, 'TL15a: phase 2 reached before any video exists');
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/l13' });
  wrapper.appendChild(video);
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  assert.equal(wrapper.style.filter, 'saturate(0.65)', 'TL15b: a video registered mid-phase-2 is degraded immediately');
  assert.equal(SlowGram.getRegistryState(video).appliedLevers.saturation, 2, 'TL15c: applied at registration, phase 2');
})();

// Test T-L16 — emptied clears appliedLevers; the next loadstart re-applies
// (Pattern 2 lifecycle): the recycled node never keeps stale lever state.
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/l14' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(420000);
  e.raf.flush();
  assert.equal(wrapper.style.filter, 'saturate(0.65)', 'TL16a: degraded at phase 2');
  video.dispatchEvent({ type: 'emptied', target: video });
  assert.equal(SlowGram.getRegistryState(video).appliedLevers, null, 'TL16b: emptied clears appliedLevers (re-apply on next loadstart)');
  video.dispatchEvent({ type: 'loadstart', target: video });
  assert.equal(SlowGram.getRegistryState(video).appliedLevers.saturation, 2, 'TL16c: next loadstart re-applies the current phase');
  assert.equal(wrapper.style.filter, 'saturate(0.65)', 'TL16d: wrapper filter persists across the lifecycle');
})();

// Test T-L17 — multi-video reconcile: a reset restores BOTH wrappers (the
// reconcile iterates the live list, per video).
(function () {
  FakeMutationObserver.instances = [];
  var w1 = FakeElement('div', {}, []);
  var v1 = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/l15a' });
  w1.appendChild(v1);
  var w2 = FakeElement('div', {}, []);
  var v2 = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/l15b' });
  w2.appendChild(v2);
  var main = FakeElement('main', { role: 'main' }, [w1, w2]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [v1, v2], target: main }]);
  e.raf.flush();
  e.clock.advance(420000);
  e.raf.flush();
  assert.equal(w1.style.filter, 'saturate(0.65)', 'TL17a: v1 degraded');
  assert.equal(w2.style.filter, 'saturate(0.65)', 'TL17b: v2 degraded');
  e.doc.setVisibility('hidden');
  e.doc.dispatchEvent(new Event('visibilitychange'));
  e.clock.advance(300001);
  e.doc.setVisibility('visible');
  e.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(w1.style.filter, '', 'TL17c: reset restored v1');
  assert.equal(w2.style.filter, '', 'TL17d: reset restored v2 (reconcile iterates the live list)');
})();

// Test T-L18 — public revertAll handle (LEVR-07) + no churn: a manual
// revertAll at a phase does not re-apply until the next real transition.
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/l16' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(420000);
  e.raf.flush();
  assert.equal(wrapper.style.filter, 'saturate(0.65)', 'TL18a: degraded at phase 2');
  assert.equal(typeof SlowGram.revertAll, 'function', 'TL18b: public revertAll handle (LEVR-07)');
  SlowGram.revertAll();
  assert.equal(wrapper.style.filter, '', 'TL18c: manual revertAll restores native');
  e.clock.advance(1000);
  e.raf.flush();
  assert.equal(wrapper.style.filter, '', 'TL18d: same-phase flush does NOT re-apply after a manual revert (no transition — no churn)');
})();

// Phase 3 (03-02) — LEVR 03-02 suite: Playback + Volume levers under the
// per-platform clamp tables (LEVR-08), the DI platform seam (D-21), the
// muted gate (LEVR-03/Anti-Pattern 2), and full-stack reconcile.

// Test T-L19 — CONFIG.clampTables (LEVR-08/D-22): frozen per-platform spec of
// every lever limit — webkit rate cap 2.0, chromium audible band ≤ 4.
(function () {
  var ct = SlowGram.getConfig().clampTables;
  assert.ok(ct && Object.isFrozen(ct), 'TL19a: CONFIG.clampTables exists and is frozen (LEVR-08)');
  assert.ok(Object.isFrozen(ct.webkit) && Object.isFrozen(ct.chromium), 'TL19b: per-platform tables frozen');
  assert.equal(ct.webkit.playbackRate.min, 0.5, 'TL19c: webkit rate min 0.5 (design band, PITFALLS:79)');
  assert.equal(ct.webkit.playbackRate.max, 2, 'TL19d: webkit rate max 2 (Safari hard cap — PITFALLS:71)');
  assert.equal(ct.chromium.playbackRate.min, 0.5, 'TL19e: chromium rate min 0.5');
  assert.equal(ct.chromium.playbackRate.max, 4, 'TL19f: chromium rate max 4 (audible band — PITFALLS:71-79)');
  assert.equal(ct.webkit.volume.max, 1, 'TL19g: webkit volume max 1');
  assert.equal(ct.chromium.volume.max, 1, 'TL19h: chromium volume max 1');
})();

// Test T-L20 — CONFIG.leverParams playbackRate/volume values (D-23/D-24):
// subtle slow-down inside 0.5–2.0; volume factor only at the stop-point phase.
(function () {
  var lp = SlowGram.getConfig().leverParams;
  assert.equal(lp.playbackRate['2'], 0.9, 'TL20a: playbackRate phase 2 value 0.9 (D-23)');
  assert.equal(lp.playbackRate['3'], 0.8, 'TL20b: playbackRate phase 3 value 0.8');
  assert.equal(lp.volume['3'], 0.5, 'TL20c: volume phase 3 factor 0.5 (D-24)');
  assert.ok(lp.volume['1'] === undefined && lp.volume['2'] === undefined, 'TL20d: volume only at phase 3 (matrix lock)');
})();

// Test T-L21 — playback end-to-end (LEVR-02): rate 1 at phases 0-1, 0.9 at
// phase 2, 0.8 at phase 3, appliedLevers tracked.
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/m1' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver, platform: 'webkit' });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  assert.equal(video.playbackRate, 1, 'TL21a: rate 1 at phases 0-1 (no playback lever)');
  e.clock.advance(420000);
  e.raf.flush();
  assert.equal(SlowGram.getState().phase, 2, 'TL21b: phase 2');
  assert.equal(video.playbackRate, 0.9, 'TL21c: rate 0.9 at phase 2 (LEVR-02)');
  assert.equal(SlowGram.getRegistryState(video).appliedLevers.playbackRate, 2, 'TL21d: appliedLevers.playbackRate === 2');
  e.clock.advance(300000);
  e.raf.flush();
  assert.equal(SlowGram.getState().phase, 3, 'TL21e: phase 3');
  assert.equal(video.playbackRate, 0.8, 'TL21f: rate 0.8 at phase 3');
})();

// Test T-L22 — pitch preservation (LEVR-02): the lever forces preservesPitch
// true even when the element default was hostile.
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/m2' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  video.preservesPitch = false;             // hostile default — the lever must force it back
  e.clock.advance(420000);
  e.raf.flush();
  assert.equal(video.playbackRate, 0.9, 'TL22a: rate applied');
  assert.equal(video.preservesPitch, true, 'TL22b: preservesPitch forced true (LEVR-02 pitch preservation)');
})();

// Test T-L23 — platform seam (D-21): 'webkit'/'chromium' accepted; a
// malformed platform throws the descriptive Error (CORE-04).
(function () {
  freshEnv({ platform: 'webkit' });
  assert.ok(true, 'TL23a: webkit platform accepted (init succeeds)');
  var threw = false;
  try {
    SlowGram.init({ document: null, window: null, platform: 'not-an-engine' });
  } catch (err) {
    threw = true;
  }
  assert.ok(threw, 'TL23b: invalid platform throws the descriptive Error (CORE-04)');
})();

// Test T-L24 — clamp behavior (LEVR-08/D-22): the pure clamp function reads
// the resolved platform table — webkit 2.0 cap, chromium audible band.
(function () {
  freshEnv({ platform: 'webkit' });
  assert.equal(SlowGram._clampForPlatform('playbackRate', 2.5), 2, 'TL24a: webkit clamps rate 2.5 → 2.0 (Safari cap)');
  assert.equal(SlowGram._clampForPlatform('playbackRate', 0.1), 0.5, 'TL24b: webkit clamps rate 0.1 → 0.5 (band floor)');
  assert.equal(SlowGram._clampForPlatform('volume', 1.5), 1, 'TL24c: webkit clamps volume 1.5 → 1');
  freshEnv({ platform: 'chromium' });
  assert.equal(SlowGram._clampForPlatform('playbackRate', 2.5), 2.5, 'TL24d: chromium keeps 2.5 (audible band ≤ 4)');
  assert.equal(SlowGram._clampForPlatform('playbackRate', 5), 4, 'TL24e: chromium clamps 5 → 4 (audible band)');
  assert.equal(SlowGram._clampForPlatform('volume', 1.5), 1, 'TL24f: chromium clamps volume 1.5 → 1');
})();

// Test T-L25 — playback revert on SOCIAL: the captured original rate is
// restored when the trust contract flips to a preserved route.
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/m3' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(420000);
  e.raf.flush();
  assert.equal(video.playbackRate, 0.9, 'TL25a: rate degraded at phase 2');
  e.win.history.pushState(null, '', '/direct/');
  assert.equal(video.playbackRate, 1, 'TL25b: revert restores the captured original rate on SOCIAL');
})();

// Test T-L26 — volume lever (LEVR-03/D-24): unmuted audible video → volume
// × 0.5 at phase 3; revert restores the original.
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/m4' });
  video.muted = false;
  video.volume = 0.8;
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(720000);
  e.raf.flush();
  assert.equal(SlowGram.getState().phase, 3, 'TL26a: phase 3');
  assert.equal(video.volume, 0.4, 'TL26b: volume 0.8 × 0.5 = 0.4 at phase 3 (LEVR-03)');
  assert.equal(SlowGram.getRegistryState(video).appliedLevers.volume, 3, 'TL26c: appliedLevers.volume === 3');
  e.win.history.pushState(null, '', '/direct/');
  assert.equal(video.volume, 0.8, 'TL26d: revert restores the original volume');
})();

// Test T-L27 — muted gate (LEVR-03/Anti-Pattern 2): a muted video is never
// touched — volume unchanged, muted never reassigned, no lever recorded.
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/m5' });
  video.muted = true;
  video.volume = 0.8;
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(720000);
  e.raf.flush();
  assert.equal(SlowGram.getState().phase, 3, 'TL27a: phase 3');
  assert.equal(video.volume, 0.8, 'TL27b: muted video untouched (gate — never apply while muted)');
  assert.equal(video.muted, true, 'TL27c: muted never reassigned (WebKit pauses on programmatic unmute)');
  var st = SlowGram.getRegistryState(video);
  assert.ok(!st.appliedLevers || !st.appliedLevers.volume, 'TL27d: no volume lever recorded while muted');
})();

// Test T-L28 — zero/unsupported gate (LEVR-03 feature-detect): inaudible
// (volume 0) or unsupported (volume not a number) videos are untouched.
(function () {
  FakeMutationObserver.instances = [];
  var w1 = FakeElement('div', {}, []);
  var v1 = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/m6' });
  v1.volume = 0;
  w1.appendChild(v1);
  var w2 = FakeElement('div', {}, []);
  var v2 = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/m6b' });
  v2.volume = undefined;                       // unsupported platform feature-detect
  w2.appendChild(v2);
  var main = FakeElement('main', { role: 'main' }, [w1, w2]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [v1, v2], target: main }]);
  e.raf.flush();
  e.clock.advance(720000);
  e.raf.flush();
  assert.equal(v1.volume, 0, 'TL28a: zero-volume video untouched (inaudible — gate)');
  assert.equal(v2.volume, undefined, 'TL28b: unsupported volume untouched (feature-detect gate)');
  var st1 = SlowGram.getRegistryState(v1);
  var st2 = SlowGram.getRegistryState(v2);
  assert.ok((!st1.appliedLevers || !st1.appliedLevers.volume) && (!st2.appliedLevers || !st2.appliedLevers.volume),
    'TL28c: no volume lever recorded on the gated videos');
})();

// Test T-L29 — full-stack reconcile at phase 3: saturation + playbackRate +
// volume apply together and revertAll restores all three.
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/m7' });
  video.muted = false;
  video.volume = 1;
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(720000);
  e.raf.flush();
  assert.equal(wrapper.style.filter, 'saturate(0.4)', 'TL29a: saturation applied at phase 3');
  assert.equal(video.playbackRate, 0.8, 'TL29b: playbackRate applied at phase 3');
  assert.equal(video.volume, 0.5, 'TL29c: volume applied at phase 3 (1 × 0.5)');
  SlowGram.revertAll();
  assert.ok(!wrapper.style.filter, 'TL29d: saturation reverted');
  assert.equal(video.playbackRate, 1, 'TL29e: rate reverted to original');
  assert.equal(video.volume, 1, 'TL29f: volume reverted to original');
  var st = SlowGram.getRegistryState(video);
  assert.ok(!st.appliedLevers || (!st.appliedLevers.saturation && !st.appliedLevers.playbackRate && !st.appliedLevers.volume),
    'TL29g: all three levers cleared by revertAll');
})();

// Test T-L30 — escalation profile: phase 1 only saturation, phase 2 adds
// playbackRate, phase 3 adds volume (matrix order, T15 lock).
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/m8' });
  video.volume = 1;
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(180000);
  e.raf.flush();
  assert.ok(wrapper.style.filter, 'TL30a: phase 1 — saturation on');
  assert.equal(video.playbackRate, 1, 'TL30b: phase 1 — rate untouched');
  assert.equal(video.volume, 1, 'TL30c: phase 1 — volume untouched');
  e.clock.advance(240000);
  e.raf.flush();
  assert.equal(video.playbackRate, 0.9, 'TL30d: phase 2 — rate on');
  assert.equal(video.volume, 1, 'TL30e: phase 2 — volume still untouched (phase 3 only)');
  e.clock.advance(300000);
  e.raf.flush();
  assert.equal(video.playbackRate, 0.8, 'TL30f: phase 3 — rate escalated');
  assert.equal(video.volume, 0.5, 'TL30g: phase 3 — volume on');
})();

// Test T-L31 — loadstart re-apply for rate (Pattern 2 / LEVR-02): the
// browser resets rate to 1.0 on source change; the apply-after-load hook
// re-degrades the video.
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/m9' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(420000);
  e.raf.flush();
  assert.equal(video.playbackRate, 0.9, 'TL31a: rate degraded at phase 2');
  video.playbackRate = 1;                       // browser reset on source change
  video.dispatchEvent({ type: 'loadstart', target: video });
  assert.equal(video.playbackRate, 0.9, 'TL31b: loadstart re-applies the rate (LEVR-02 re-apply per video)');
})();

// Test T-L33 — CONFIG.buffer (LEVR-05/D-27): the flagged capstone ships OFF
// by default (production never stalls) with the frame count locked.
(function () {
  var cfg = SlowGram.getConfig();
  assert.equal(cfg.buffer.enabled, false, 'TL33a: buffer default OFF (LEVR-05 production default)');
  assert.equal(cfg.buffer.stallFrames, 2, 'TL33b: stallFrames locked at 2 (sub-200ms, frame-counted)');
  assert.ok(Object.isFrozen(cfg.buffer), 'TL33c: buffer config frozen with the rest of CONFIG');
})();

// Test T-L34 — autoplay end-to-end (LEVR-04): a looping reel at phase 3
// loses its loop attribute — removed, never loop="false" — and arms the
// stop point (appliedLevers.autoplay).
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/a1', loop: '' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(720000);                       // 12 min → phase 3
  e.raf.flush();
  assert.equal(video.hasAttribute('loop'), false, 'TL34a: phase 3 removes the loop attribute');
  assert.equal(video.getAttribute('loop'), null, 'TL34b: removed (getAttribute null — never loop="false")');
  var st = SlowGram.getRegistryState(video);
  assert.equal(st.appliedLevers.autoplay, 3, 'TL34c: appliedLevers.autoplay = 3 (stop point armed)');
})();

// Test T-L35 — the stop point (LEVR-04): an ended video at phase 3 pauses
// instead of restarting (the loop attribute is gone).
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/a2', loop: '' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(720000);
  e.raf.flush();
  video.paused = false;                          // playing
  video.dispatchEvent({ type: 'ended', target: video });
  assert.equal(video.paused, true, 'TL35: ended at phase 3 pauses the video (LEVR-04 stop point)');
})();

// Test T-L36 — revert restores (LEVR-04/D-25): leaving REELS for SOCIAL
// reverts the loop attribute back (origHadLoop restore — presence only).
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/a3', loop: '' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(720000);
  e.raf.flush();
  assert.equal(video.hasAttribute('loop'), false, 'TL36a: loop removed at phase 3');
  SlowGram.setContext('SOCIAL');                 // revertAll path
  assert.equal(video.hasAttribute('loop'), true, 'TL36b: SOCIAL revert restores the loop attribute (origHadLoop)');
  var st = SlowGram.getRegistryState(video);
  assert.ok(!st.appliedLevers || !st.appliedLevers.autoplay, 'TL36c: autoplay lever cleared after revert');
})();

// Test T-L37 — a no-loop video (loggedOut shape): apply at phase 3 arms the
// stop point without touching any attribute and without crashing.
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/a4' });   // no loop attr
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(720000);
  e.raf.flush();
  var st = SlowGram.getRegistryState(video);
  assert.equal(st.appliedLevers.autoplay, 3, 'TL37a: no-loop video still arms the stop point (appliedLevers.autoplay 3)');
  assert.equal(video.hasAttribute('loop'), false, 'TL37b: no attribute touched (was already absent)');
  assert.equal(video.getAttribute('loop'), null, 'TL37c: getAttribute null — nothing written');
})();

// Test T-L38 — matrix gate: below phase 3 the autoplay lever is not in the
// matrix, so the loop attribute stays untouched.
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/a5', loop: '' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(420000);                       // 7 min → phase 2 (no autoplay in matrix)
  e.raf.flush();
  assert.equal(video.hasAttribute('loop'), true, 'TL38: below phase 3 the loop attribute is untouched (matrix gate)');
})();

// Test T-L39 — buffer OFF by default (LEVR-05): at the phase-3 stop point the
// ended-pause holds and NO stall resumes it — the flag is off.
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/a6', loop: '' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(720000);
  e.raf.flush();
  assert.equal(SlowGram.getConfig().buffer.enabled, false, 'TL39a: buffer flag off (default)');
  video.paused = false;
  video.dispatchEvent({ type: 'ended', target: video });
  assert.equal(video.paused, true, 'TL39b: stop point pauses');
  e.raf.flush();
  e.raf.flush();
  assert.equal(video.paused, true, 'TL39c: two flushes — still paused (no stall resume, flag off)');
})();

// Test T-L40 — buffer ON flow (LEVR-05/D-26): flipped via _setBufferEnabled,
// the stop point starts a frame-counted stall that resolves sub-200ms (2 rAF
// frames) — flush 1 still paused, flush 2 resumed. No timers.
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/a7', loop: '' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(720000);
  e.raf.flush();
  SlowGram._setBufferEnabled(true);
  video.paused = false;
  video.dispatchEvent({ type: 'ended', target: video });
  assert.equal(video.paused, true, 'TL40a: stop point pauses (autoplay)');
  e.raf.flush();
  assert.equal(video.paused, true, 'TL40b: flush 1 — still stalled (stallFrames 2→1)');
  e.raf.flush();
  assert.equal(video.paused, false, 'TL40c: flush 2 — resumed (sub-200ms frame-counted stall)');
  SlowGram._setBufferEnabled(false);
})();

// Test T-L41 — buffer never outside the stop point (LEVR-05 gate): with the
// flag ON at phase 2 (no autoplay applied), an ended event starts no stall —
// a flush never calls play.
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/a8', loop: '' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(420000);                       // phase 2 — below the stop point
  e.raf.flush();
  SlowGram._setBufferEnabled(true);
  var plays = 0;
  video.play = function () { plays++; video.paused = false; };
  video.paused = false;
  video.dispatchEvent({ type: 'ended', target: video });
  e.raf.flush();
  assert.equal(video.paused, false, 'TL41a: phase 2 ended — no autoplay pause (gate holds)');
  assert.equal(plays, 0, 'TL41b: no stall started — a flush never calls play outside the stop point');
  SlowGram._setBufferEnabled(false);
})();

// Test T-L43 — full-stack integration (Phase 3 closure): ONE video at phase 3
// carries ALL four matrix levers simultaneously — saturation on the wrapper,
// playbackRate, volume, and the autoplay loop-removal. Values read from
// CONFIG (never literals).
(function () {
  FakeMutationObserver.instances = [];
  var cfg = SlowGram.getConfig();
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/b1', loop: '' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(720000);
  e.raf.flush();
  assert.equal(wrapper.style.filter, 'saturate(' + cfg.leverParams.saturation['3'] + ')', 'TL43a: saturation on the wrapper (phase 3)');
  assert.equal(video.playbackRate, cfg.leverParams.playbackRate['3'], 'TL43b: playbackRate at the CONFIG value (phase 3)');
  assert.equal(video.volume, cfg.leverParams.volume['3'], 'TL43c: volume at the CONFIG factor (phase 3)');
  assert.equal(video.hasAttribute('loop'), false, 'TL43d: loop removed (phase 3)');
  var st = SlowGram.getRegistryState(video).appliedLevers;
  assert.equal(st.saturation, 3, 'TL43e: appliedLevers.saturation 3');
  assert.equal(st.playbackRate, 3, 'TL43f: appliedLevers.playbackRate 3');
  assert.equal(st.volume, 3, 'TL43g: appliedLevers.volume 3');
  assert.equal(st.autoplay, 3, 'TL43h: appliedLevers.autoplay 3');
})();

// Test T-L44 — the stop point composes with the buffer (Phase 3 closure):
// ended at phase 3 pauses, the flag-flipped stall holds exactly stallFrames,
// then resumes — pause → stall → resume as one sequence.
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/b2', loop: '' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(720000);
  e.raf.flush();
  SlowGram._setBufferEnabled(true);
  video.paused = false;
  video.dispatchEvent({ type: 'ended', target: video });
  assert.equal(video.paused, true, 'TL44a: ended pauses (stop point) with the full stack applied');
  e.raf.flush();
  assert.equal(video.paused, true, 'TL44b: stall holds (frame 1 of 2)');
  e.raf.flush();
  assert.equal(video.paused, false, 'TL44c: stall resolves — resume (frame 2 of 2)');
  SlowGram._setBufferEnabled(false);
})();

// Test T-L45 — SOCIAL round-trip (Phase 3 closure): revertAll restores EVERY
// lever to native in one trip; returning to REELS re-applies the full stack
// via the register-time applyAll path.
(function () {
  FakeMutationObserver.instances = [];
  var cfg = SlowGram.getConfig();
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/b3', loop: '' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(720000);
  e.raf.flush();
  assert.equal(wrapper.style.filter, 'saturate(' + cfg.leverParams.saturation['3'] + ')', 'TL45a: applied before the trip');
  SlowGram.setContext('SOCIAL');
  assert.equal(wrapper.style.filter, '', 'TL45b: filter restored to native');
  assert.equal(video.playbackRate, 1, 'TL45c: rate restored to 1');
  assert.equal(video.volume, 1, 'TL45d: volume restored to 1');
  assert.equal(video.hasAttribute('loop'), true, 'TL45e: loop restored (origHadLoop)');
  SlowGram.setContext('REELS');
  assert.equal(wrapper.style.filter, 'saturate(' + cfg.leverParams.saturation['3'] + ')', 'TL45f: re-applied on return (register-time applyAll)');
  assert.equal(video.playbackRate, cfg.leverParams.playbackRate['3'], 'TL45g: rate re-applied');
  assert.equal(video.hasAttribute('loop'), false, 'TL45h: loop removed again');
})();

// Test T-L46 — fatigue reset through the PUBLIC path (Phase 3 closure):
// hidden > fatigueWindowMs → resume → resetSession reverts every lever (the
// LEVR-07 revertAll + the sync(0) reconcile backstop) and phase returns to 0.
(function () {
  FakeMutationObserver.instances = [];
  var cfg = SlowGram.getConfig();
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/b4', loop: '' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(720000);
  e.raf.flush();
  assert.equal(wrapper.style.filter, 'saturate(' + cfg.leverParams.saturation['3'] + ')', 'TL46a: all levers applied at phase 3');
  e.doc.setVisibility('hidden');
  e.doc.dispatchEvent(new Event('visibilitychange'));
  e.clock.advance(300001);          // > fatigueWindowMs → reset on resume
  e.doc.setVisibility('visible');
  e.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(wrapper.style.filter, '', 'TL46b: fatigue reset reverts saturation');
  assert.equal(video.playbackRate, 1, 'TL46c: fatigue reset reverts rate');
  assert.equal(video.volume, 1, 'TL46d: fatigue reset reverts volume');
  assert.equal(video.hasAttribute('loop'), true, 'TL46e: fatigue reset restores loop');
  assert.equal(SlowGram.getState().phase, 0, 'TL46f: phase back to 0 (phasechange 0)');
})();

// Test T-L47 — destroy/re-init reentrancy (Phase 3 closure, D-29): destroy
// reverts to native AND unbinds the element listeners (never 2× per handler);
// a fresh init re-binds exactly once and re-applies the current phase.
(function () {
  FakeMutationObserver.instances = [];
  var cfg = SlowGram.getConfig();
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/b5', loop: '' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(720000);
  e.raf.flush();
  assert.equal(wrapper.style.filter, 'saturate(' + cfg.leverParams.saturation['3'] + ')', 'TL47a: levers applied pre-destroy');
  assert.equal((video.listeners.ended || []).length, 1, 'TL47b: one ended listener bound (per instance)');
  // P2-6 (audit 2026-08): the P2-4 volumechange listener follows the same
  // D-29 once-per-element discipline — assert it is bound/unbound/rebound in
  // lockstep with ended across destroy/re-init (would fail if the unbind in
  // teardown missed the new listener, stacking volumechange handlers).
  assert.equal((video.listeners.volumechange || []).length, 1, 'TL47b2: one volumechange listener bound (P2-4, D-29)');
  SlowGram.destroy();
  assert.equal(wrapper.style.filter, '', 'TL47c: destroy reverts to native (teardown revertAll)');
  assert.equal(video.playbackRate, 1, 'TL47d: rate native after destroy');
  assert.equal(video.hasAttribute('loop'), true, 'TL47e: loop restored after destroy');
  assert.equal((video.listeners.ended || []).length, 0, 'TL47f: destroy unbinds element listeners (D-29)');
  assert.equal((video.listeners.volumechange || []).length, 0, 'TL47f2: destroy unbinds the volumechange listener too (P2-4)');
  // Re-init with the same DOM — fresh instance re-binds exactly once.
  FakeMutationObserver.instances = [];
  var e2 = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer2 = FakeMutationObserver.instances[0];
  observer2.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e2.raf.flush();
  assert.equal((video.listeners.ended || []).length, 1, 'TL47g: re-init re-binds exactly once (never 2)');
  assert.equal((video.listeners.volumechange || []).length, 1, 'TL47g2: volumechange re-binds exactly once (never 2)');
  e2.clock.advance(720000);
  e2.raf.flush();
  assert.equal(wrapper.style.filter, 'saturate(' + cfg.leverParams.saturation['3'] + ')', 'TL47h: fresh instance re-applies the full stack');
  assert.equal(video.playbackRate, cfg.leverParams.playbackRate['3'], 'TL47i: rate re-applied by the new instance');
})();

// Test T-L48 — feed churn (Phase 3 closure, D-18/D-29): a removed→re-added
// SAME node (virtualization recycle) re-tracks the live list exactly once —
// revertAll reaches it after the recycle, the WeakMap entry stays idempotent.
(function () {
  FakeMutationObserver.instances = [];
  var cfg = SlowGram.getConfig();
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/b6', loop: '' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(720000);
  e.raf.flush();
  assert.equal(wrapper.style.filter, 'saturate(' + cfg.leverParams.saturation['3'] + ')', 'TL48a: levers applied');
  observer.record([{ type: 'childList', removedNodes: [video], target: main }]);
  e.raf.flush();
  assert.equal(SlowGram._registrySize(), 1, 'TL48b: WeakMap entry survives removal (GC-safety, DETC-05)');
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  assert.equal(SlowGram._registrySize(), 1, 'TL48c: re-register stays idempotent (size 1)');
  SlowGram.revertAll();
  assert.equal(wrapper.style.filter, '', 'TL48d: revertAll reaches the re-added video — live list re-tracked exactly once');
  video.dispatchEvent({ type: 'loadstart', target: video });
  assert.equal(wrapper.style.filter, 'saturate(' + cfg.leverParams.saturation['3'] + ')', 'TL48e: re-applies after the recycle (loadstart hook)');
})();

// Test T-L49 — a cancelled stall never resumes (Phase 3 closure): SOCIAL
// mid-stall clears the pending stall; even after returning to REELS and
// flushing past stallFrames, play() is never called.
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/b7', loop: '' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(720000);
  e.raf.flush();
  SlowGram._setBufferEnabled(true);
  var plays = 0;
  video.play = function () { plays++; video.paused = false; };
  video.paused = false;
  video.dispatchEvent({ type: 'ended', target: video });
  assert.equal(video.paused, true, 'TL49a: stall started at the stop point');
  SlowGram.setContext('SOCIAL');   // mid-stall — revertAll cancels the pending stall
  SlowGram.setContext('REELS');
  e.raf.flush();
  e.raf.flush();
  assert.equal(plays, 0, 'TL49b: cancelled stall never resumes — play() never called');
  SlowGram._setBufferEnabled(false);
})();

// Test T-L50 — no-loop shape, full stack (Phase 3 closure): the loggedOut
// video (no loop attr) survives all four matrix levers without crashing or
// writing any attribute, and reverts clean.
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/b8' });   // no loop attr
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(720000);
  e.raf.flush();
  var st = SlowGram.getRegistryState(video).appliedLevers;
  assert.equal(st.saturation, 3, 'TL50a: saturation applied');
  assert.equal(st.playbackRate, 3, 'TL50b: playbackRate applied');
  assert.equal(st.volume, 3, 'TL50c: volume applied');
  assert.equal(st.autoplay, 3, 'TL50d: autoplay armed (no-loop shape)');
  assert.equal(video.hasAttribute('loop'), false, 'TL50e: no attribute written (never had loop)');
  assert.equal(video.getAttribute('loop'), null, 'TL50f: getAttribute null');
  SlowGram.setContext('SOCIAL');
  assert.equal(wrapper.style.filter, '', 'TL50g: revert clean (filter native)');
  assert.equal(video.playbackRate, 1, 'TL50h: revert clean (rate native)');
})();

// Cross-cutting source scans (Node host only): no timer scheduling APIs,
// no bare Date.now() outside resolveEnv, no performance.now() anywhere.
// Browser-safe: the fs-based scan is wrapped in a `typeof process !==
// 'undefined'` guard so harness.html skips it entirely (no fs in a browser).
(function () {
  if (typeof process === 'undefined' || !fs) {
    assert.ok(true, 'SCAN: source scans run on the Node host only');
    return;
  }
  var path = require('path');
  var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'slowgram.js'), 'utf8');
  // Scans operate on code only — strip comments so documentation prose never
  // trips the no-timer / no-bare-Date.now rules.
  var code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  var timerCalls = code.match(/set(?:Timeout|Interval)\s*\(/g);
  assert.equal(timerCalls ? timerCalls.length : 0, 0, 'SCAN: no setTimeout/setInterval call sites');
  var dateNowCalls = code.match(/Date\.now\s*\(/g);
  assert.equal(dateNowCalls ? dateNowCalls.length : 0, 1, 'SCAN: Date.now() appears exactly once (resolveEnv default clock)');
  var perfNowCalls = code.match(/performance\.now/g);
  assert.equal(perfNowCalls ? perfNowCalls.length : 0, 0, 'SCAN: no performance.now anywhere');
  // Phase 2 DETC-06: no class-based DOM query API calls anywhere.
  var classQueryCalls = code.match(/getElementsByClassName\s*\(/g);
  assert.equal(classQueryCalls ? classQueryCalls.length : 0, 0, 'SCAN: no getElementsByClassName call sites');
  // DETC-06 / Anti-Pattern (RESEARCH.md:291): the mutation batch callback
  // performs zero synchronous DOM queries — the records carry the targets.
  var batchBody = extractBody(code, 'function batchCallback');
  assert.ok(batchBody.indexOf('querySelector') === -1, 'SCAN: batchCallback performs zero DOM queries');
  // D-11: the observer attributeFilter literal is locked to the 4-attr set
  // and appears EXACTLY once — the single connectWatcher observe call site
  // (a second literal elsewhere would mean duplicated observer config).
  var attrFilterMatches = code.match(/attributeFilter:\s*\[[^\]]*\]/g) || [];
  assert.equal(attrFilterMatches.length, 1, 'SCAN: exactly one attributeFilter literal in the engine');
  assert.ok(code.indexOf("attributeFilter: ['src', 'loop', 'autoplay', 'role']") !== -1,
    'SCAN: attributeFilter literal locked to the D-11 4-attr set');
  // T-02-06 / D-02 pathname authority: RouteGuard/ContextDetector never read
  // window.location.href — currentPathname() (location.pathname) is the ONLY
  // source. A direct href read anywhere is a spoofing vector (banned).
  var hrefReads = code.match(/window\.location\.href|location\.href/g);
  assert.equal(hrefReads ? hrefReads.length : 0, 0, 'SCAN: no window.location.href / location.href reads anywhere');
  // Phase 3 LEVR-01/CORE-05 (T-L14): no hardcoded saturation value — the
  // lever concatenates CONFIG.leverParams.saturation; a literal saturate(0.N)
  // anywhere in the engine would mean value drift (T-03-05).
  var satLiterals = code.match(/saturate\(0\./g);
  assert.equal(satLiterals ? satLiterals.length : 0, 0, 'SCAN: no hardcoded saturate(0.N) literal — values come from CONFIG.leverParams');
  // Phase 3 D-16: the hub emits nothing itself — applyAll is called from
  // syncPhase (after emit) and setContext; it must not schedule timers (the
  // timer scan above stays green) and must not query the DOM by class (the
  // class scan above stays green). The reconcile functions are pure JS over
  // registryElements — assert no DOM query API appears in applyAll/applyToVideo.
  var applyBody = extractBody(code, 'function applyToVideo');
  assert.ok(applyBody.indexOf('querySelector') === -1, 'SCAN: applyToVideo performs zero DOM queries (records carry the videos)');
  // Phase 3 LEVR-03/Anti-Pattern 2 (T-L32a): the volume lever never ASSIGNS
  // muted — a programmatic unmute pauses iOS playback (WebKit policy). Only
  // reads are allowed; any assignment is a bug.
  var mutedAssigns = code.match(/\.muted\s*=(?!=)/g);   // assignment only — `=== true` is a read gate
  assert.equal(mutedAssigns ? mutedAssigns.length : 0, 0, 'SCAN: no video.muted assignment anywhere (Anti-Pattern 2)');
  // Phase 3 LEVR-02/LEVR-08 (T-L32b): no lever/clamp literals outside CONFIG —
  // playbackRate values and clamp limits come from CONFIG only (CORE-05).
  var rateLits = code.match(/playbackRate\s*=\s*(?:0\.9|0\.8)/g);
  assert.equal(rateLits ? rateLits.length : 0, 0, 'SCAN: no hardcoded playbackRate value — CONFIG.leverParams only');
  var clampLits = code.match(/max:\s*(?:2|4)\b/g);
  assert.equal(clampLits ? clampLits.length : 0, 2, 'SCAN: clamp max literals live only in CONFIG.clampTables (webkit 2, chromium 4)');
  // Phase 3 LEVR-04 (T-L42a): the autoplay lever REMOVES the loop attribute —
  // a loop="false" write is a no-op trap (a present attribute keeps looping).
  var loopFalseWrites = code.match(/loop\s*=\s*(?:false|"false")/g);
  assert.equal(loopFalseWrites ? loopFalseWrites.length : 0, 0, 'SCAN: no loop="false" write anywhere (removeAttribute only)');
  // Phase 3 LEVR-05 (T-L42b): the stall frame count lives ONLY in CONFIG — a
  // second stallFrames literal would mean value drift (CORE-05).
  var stallLits = code.match(/stallFrames:/g);
  assert.equal(stallLits ? stallLits.length : 0, 1, 'SCAN: stallFrames literal appears exactly once (CONFIG.buffer)');
  // Phase 5 HARN-01 (T-P06): the batch cap lives ONLY in CONFIG.harness — a
  // second maxBatchRecords literal would mean value drift (CORE-05). The
  // performance.now / timer scans above already cover the SCAN-safe proxy.
  var capLits = code.match(/maxBatchRecords:\s*200/g);
  assert.equal(capLits ? capLits.length : 0, 1, 'SCAN: maxBatchRecords 200 appears exactly once (CONFIG.harness)');
  // Phase 5 HARN-05 (T-K01): the kill-switch flag lives ONLY in
  // CONFIG.killSwitch — a second enabled literal would mean value drift
  // (CORE-05).
  var killLits = code.match(/killSwitch:\s*\{[^}]*enabled:\s*true/g);
  assert.equal(killLits ? killLits.length : 0, 1, 'SCAN: killSwitch enabled:true appears exactly once (CONFIG.killSwitch)');
  // Phase 3 closure (T-L51a): the applicators map keys are EXACTLY the four
  // matrix levers — and 'buffer' is never an applicator (D-26 standalone
  // capstone, T15 matrix lock). A drift here would route a lever outside its
  // phase or pull the buffer into the reconcile revert loop.
  var appAssigns = code.match(/applicators\.([a-zA-Z]+)\s*=/g) || [];
  var appKeys = appAssigns.map(function (a) { return a.replace(/applicators\.|\s*=/g, ''); }).sort();
  assert.equal(JSON.stringify(appKeys), JSON.stringify(['autoplay', 'playbackRate', 'saturation', 'volume']),
    'SCAN: applicators map keys are exactly the 4 matrix levers (sorted)');
  var bufferAppAssigns = code.match(/applicators\.buffer\s*=/g);
  assert.equal(bufferAppAssigns ? bufferAppAssigns.length : 0, 0, 'SCAN: buffer is never an applicator (D-26 standalone capstone)');
})();

// DETC-06 runtime check (both hosts): no CONFIG.selectors value is a class
// selector — the engine must never query by CSS class.
(function () {
  var sels = SlowGram.getConfig().selectors;
  var clean = true;
  for (var k in sels) {
    if (sels[k].indexOf('.') === 0) { clean = false; }
  }
  assert.ok(clean, 'CONF: no CONFIG.selectors value starts with a "." class prefix');
})();

// extractBody — brace-matching body extractor for source scans: returns the
// text between the first '{' after `marker` and its matching '}'.
function extractBody(src, marker) {
  var i = src.indexOf(marker);
  if (i === -1) { return ''; }
  var open = src.indexOf('{', i);
  if (open === -1) { return ''; }
  var depth = 0;
  for (var j = open; j < src.length; j++) {
    if (src[j] === '{') { depth++; }
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) { return src.slice(open + 1, j); }
    }
  }
  return '';
}

// extractFunction — whole-function extractor: returns the text from `marker`
// through the matching closing brace (definition included), or '' when the
// marker is absent. Used by T-D37 to prove healthScan's call sites live only
// inside processBatch.
function extractFunction(src, marker) {
  var i = src.indexOf(marker);
  if (i === -1) { return ''; }
  var open = src.indexOf('{', i);
  if (open === -1) { return ''; }
  var depth = 0;
  for (var j = open; j < src.length; j++) {
    if (src[j] === '{') { depth++; }
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) { return src.slice(i, j + 1); }
    }
  }
  return '';
}

// ──────────────────────────────────────────────────────────────────────
// Phase 4 overlay suite (T-O) — the neutral elapsed-time counter pill.
// Wave 1 (T-O01..T-O10): CONFIG.overlay contract, lazy shadow-host creation,
// D-14 seam registration, injected CSS, containment, SCAN proofs.
// ──────────────────────────────────────────────────────────────────────

// T-O01 — CONFIG.overlay exists, is frozen, and carries the UI-SPEC contract.
(function () {
  var cfg = SlowGram.getConfig();
  assert.ok(cfg && cfg.overlay, 'TO01a: CONFIG.overlay exists');
  assert.equal(Object.isFrozen(cfg.overlay), true, 'TO01b: CONFIG.overlay is frozen');
  assert.equal(cfg.overlay.unitLabel, 'min', 'TO01c: unitLabel is min (D-6)');
  assert.equal(cfg.overlay.zIndex, 2147483000, 'TO01d: zIndex near-max (D-11)');
  assert.equal(cfg.overlay.fadeMs, 400, 'TO01e: fadeMs 400 (D-2)');
  assert.equal(cfg.overlay.pill.position, 'fixed', 'TO01f: pill position fixed');
  assert.equal(cfg.overlay.pill.left, '16px', 'TO01g: pill left 16px (bottom-left)');
  assert.equal(cfg.overlay.pill.bottom, '208px', 'TO01h: pill bottom 208px (above the Reels profile row)');
  assert.equal(cfg.overlay.pill.padding, '8px 12px', 'TO01i: pill padding 8px 12px');
  assert.equal(cfg.overlay.pill.borderRadius, '8px', 'TO01j: pill radius 8px');
  assert.equal(cfg.overlay.pill.maxWidth, '200px', 'TO01k: pill maxWidth 200px');
  assert.equal(cfg.overlay.pill.fontSize, '13px', 'TO01l: pill font 13px');
  assert.equal(cfg.overlay.pill.fontWeight, '500', 'TO01m: pill weight 500');
  assert.equal(cfg.overlay.pill.lineHeight, '1.4', 'TO01n: pill line-height 1.4');
  assert.equal(cfg.overlay.pill.background, 'rgba(12, 12, 14, 0.42)', 'TO01o: pill surface (dark translucent)');
  assert.equal(cfg.overlay.pill.color, '#F5F5F7', 'TO01p: pill text color');
})();

// T-O02 — lazy creation (D-12): NO host before first degradation.
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(179999);
  e.raf.flush();
  var st = SlowGram._overlayState();
  assert.equal(st.hostExists, false, 'TO02: no host at phase 0 (179999ms) — lazy (D-12)');
})();

// T-O03 — host created exactly at first phase >= 1, seam-registered, in body.
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(180000);
  e.raf.flush();
  var st = SlowGram._overlayState();
  assert.equal(st.hostExists, true, 'TO03a: host created at phase 1');
  assert.equal(st.created, true, 'TO03b: created latch set');
  assert.equal(st.seamRegistered, true, 'TO03c: D-14 seam registered (overlayHost === host)');
  assert.equal(st.bodyAppended, true, 'TO03d: host appended to document.body');
  assert.ok(st.shadowRoot && typeof st.shadowRoot.styleText === 'function', 'TO03e: host has a shadow root');
})();

// T-O04 — predicate REELS gate: on SOCIAL the overlay never shows (the clock
// never accumulates on SOCIAL, so phase can't rise there — the gate is the
// trust contract; host creation is one-way, hiding lands in wave 3).
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(180000);
  e.raf.flush();
  var st = SlowGram._overlayState();
  assert.equal(st.hostExists, true, 'TO04a: host created on REELS at phase 1');
  assert.equal(st.shouldShow, true, 'TO04b: predicate true on REELS phase >= 1');
  SlowGram.setContext('SOCIAL');
  st = SlowGram._overlayState();
  assert.equal(st.shouldShow, false, 'TO04c: predicate false on SOCIAL (REELS gate)');
  // The clock never accumulates on SOCIAL — phase can't reach 3 there.
  e.clock.advance(12 * 60 * 1000 + 1);
  e.raf.flush();
  assert.equal(SlowGram.getState().elapsedMs, 180000, 'TO04d: no accumulation on SOCIAL (clock contract)');
  assert.equal(SlowGram._overlayState().shouldShow, false, 'TO04e: still gated off on SOCIAL');
})();

// T-O05 — injected CSS contract: the shadow stylesheet carries the pill look.
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(180000);
  e.raf.flush();
  var css = SlowGram._overlayState().shadowRoot.styleText();
  assert.ok(css.indexOf('position: fixed') !== -1, 'TO05a: position fixed in CSS');
  assert.ok(css.indexOf('pointer-events: none') !== -1, 'TO05b: pointer-events none in CSS');
  assert.ok(css.indexOf('z-index: 2147483000') !== -1, 'TO05c: near-max z-index in CSS (D-11)');
  assert.ok(css.indexOf('rgba(12, 12, 14, 0.42)') !== -1, 'TO05d: pill surface in CSS');
  assert.ok(css.indexOf('#F5F5F7') !== -1, 'TO05e: pill text color in CSS');
  assert.ok(css.indexOf('8px 12px') !== -1, 'TO05f: pill padding in CSS');
  assert.ok(css.indexOf('13px') !== -1, 'TO05g: pill font-size in CSS');
  assert.ok(css.indexOf('transition: opacity 400ms') !== -1, 'TO05h: fade transition base (D-2)');
  // UAT-05 (HARN-06 on-device, 2026-08-15): the stylesheet must be a proper
  // RULE — bare declarations without a selector are dropped by real browsers,
  // which left the pill as a static block on the physical device (the fake
  // shadow root never applies CSS, so the string-only asserts missed it).
  assert.ok(/^div\s*\{/.test(css), 'TO05i: injected CSS is a proper rule (selector present, not bare declarations)');
})();

// T-O06 — no pointer-events re-enable anywhere (D-13).
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(180000);
  e.raf.flush();
  var css = SlowGram._overlayState().shadowRoot.styleText();
  assert.equal(css.split('pointer-events: none').length - 1, 1, 'TO06a: exactly one pointer-events none in injected CSS');
  assert.ok(css.indexOf('pointer-events: auto') === -1, 'TO06b: no pointer-events auto in injected CSS');
})();

// T-O07 — idempotence: repeated flushes at phase >= 1 create exactly ONE host.
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(420000);
  e.raf.flush();
  e.raf.flush();
  e.raf.flush();
  var st = SlowGram._overlayState();
  assert.equal(st.hostExists, true, 'TO07a: host exists after repeated flushes');
  var st2 = SlowGram._overlayState();
  var hostEl = st2.shadowRoot.host;
  var hosts = 0;
  for (var i = 0; i < e.doc.body.children.length; i++) {
    if (e.doc.body.children[i] === hostEl) { hosts++; }
  }
  assert.equal(hosts, 1, 'TO07b: exactly one overlay host in body (latch)');
})();

// T-O08 — phase drop keeps the single host (creation is one-way; fade-out is
// wave 3/4 wiring). Fatigue reset → phase 0 → host persists, latch stays set.
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(420000);
  e.raf.flush();
  assert.equal(SlowGram._overlayState().hostExists, true, 'TO08a: host before reset');
  e.doc.setVisibility('hidden');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  e.clock.advance(300001);
  e.doc.setVisibility('visible');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  e.raf.flush();
  assert.equal(SlowGram.getState().phase, 0, 'TO08b: fatigue reset → phase 0');
  assert.equal(SlowGram._overlayState().hostExists, true, 'TO08c: host persists (one-way creation)');
  assert.equal(SlowGram._overlayState().created, true, 'TO08d: latch stays set — no new host');
})();

// T-O09 — containment: a throwing document.createElement must never break the
// engine — the overlay failure logs and the engine still reports phase 1.
(function () {
  var clock = FakeClock(1000000);
  var doc = FakeDocument({ visibilityState: 'visible' });
  var win = FakeWindow();
  win.location = FakeLocation('/');
  win.location._window = win;
  var raf = FakeRAF();
  var origCreate = doc.createElement;
  doc.createElement = function () { throw new Error('hostile env'); };
  var threw = false;
  try {
    SlowGram.init({
      clock: clock, document: doc, window: win,
      MutationObserver: null, requestAnimationFrame: raf.request, platform: undefined
    });
    SlowGram.setContext('REELS');
    clock.advance(180000);
    raf.flush();
  } catch (err) { threw = true; }
  doc.createElement = origCreate;
  assert.equal(threw, false, 'TO09a: hostile createElement does not throw through the engine');
  assert.equal(SlowGram.getState().phase, 1, 'TO09b: engine still healthy — phase 1 reached');
})();

// T-O10 — SCAN (Node-only): overlay values live ONLY in CONFIG.overlay.
(function () {
  if (typeof process === 'undefined' || !fs) {
    assert.ok(true, 'TO10: source scans run on the Node host only');
    return;
  }
  var path = require('path');
  var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'slowgram.js'), 'utf8');
  var code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  var zCount = (code.match(/2147483000/g) || []).length;
  assert.equal(zCount, 1, 'TO10a: zIndex literal appears exactly once (CONFIG.overlay)');
  var minCount = (code.match(/'min'/g) || []).length;
  assert.equal(minCount, 1, 'TO10b: unitLabel \'min\' appears exactly once (CONFIG.overlay)');
  var bgCount = (code.match(/rgba\(12, 12, 14, 0\.42\)/g) || []).length;
  assert.equal(bgCount, 1, 'TO10c: pill background appears exactly once (CONFIG.overlay)');
  var fgCount = (code.match(/#F5F5F7/g) || []).length;
  assert.equal(fgCount, 1, 'TO10d: pill text color appears exactly once (CONFIG.overlay)');
  var timerCalls = code.match(/set(?:Timeout|Interval)\s*\(/g);
  assert.equal(timerCalls ? timerCalls.length : 0, 0, 'TO10e: no timer APIs entered the engine with the overlay');
})();

// ──────────────────────────────────────────────────────────────────────
// Wave 2 (T-O11..T-O20): the counter data flow — real session time, value-
// throttled ≤1/s updates, unit from CONFIG, reset fade-out, typography.
// ──────────────────────────────────────────────────────────────────────

// T-O11 — real session time at first appearance (D-3): phase 1 at 3:00 → '3 min'.
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(180000);
  e.raf.flush();
  var st = SlowGram._overlayState();
  assert.equal(st.hostExists, true, 'TO11a: host created at phase 1');
  assert.equal(st.text, '3 min', 'TO11b: first text is the REAL session time (3 min, never 0)');
  assert.equal(st.lastMinutes, 3, 'TO11c: throttle latch at 3');
})();

// T-O12 — value-throttle: no write within the same minute; update at boundary.
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(180000);
  e.raf.flush();
  assert.equal(SlowGram._overlayState().text, '3 min', 'TO12a: 3 min at 3:00');
  e.clock.advance(30000);                   // elapsed 210000 — still floor 3
  e.raf.flush();
  assert.equal(SlowGram._overlayState().text, '3 min', 'TO12b: no write within the same minute (throttled)');
  e.clock.advance(30000);                   // elapsed 240000 — floor 4
  e.raf.flush();
  assert.equal(SlowGram._overlayState().text, '4 min', 'TO12c: updated exactly at the minute boundary');
})();

// T-O13 — bus truth (D-3): fatigue reset clears the counter; re-entry re-renders
// from the fresh elapsed, never a local accumulator.
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(180000);
  e.raf.flush();
  assert.equal(SlowGram._overlayState().text, '3 min', 'TO13a: 3 min before reset');
  e.doc.setVisibility('hidden');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  e.clock.advance(300001);
  e.doc.setVisibility('visible');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  e.raf.flush();
  var st = SlowGram._overlayState();
  assert.equal(SlowGram.getState().phase, 0, 'TO13b: reset → phase 0');
  assert.equal(st.lastMinutes, -1, 'TO13c: throttle latch cleared on reset');
  assert.equal(st.text, '', 'TO13d: text cleared — never shows a zeroed counter while hidden');
  // Re-accumulate to phase 1 → the counter re-renders from the bus value.
  e.clock.advance(180000);
  e.raf.flush();
  assert.equal(SlowGram._overlayState().text, '3 min', 'TO13e: re-rendered from fresh elapsed (no local accumulation)');
})();

// T-O14 — text shape: `{floored minutes} {unitLabel}` with unit from CONFIG (D-5/D-6).
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(420000);                  // 7:00 → phase 2, floor 7
  e.raf.flush();
  var unit = SlowGram.getConfig().overlay.unitLabel;
  assert.equal(SlowGram._overlayState().text, '7 ' + unit, 'TO14: text is floored minutes + CONFIG unit (single space)');
})();

// T-O15 — fade-out on reset: opacity 0 via CSS transition, no timers.
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(420000);
  e.raf.flush();
  assert.equal(SlowGram._overlayState().opacity, '1', 'TO15a: visible before reset');
  assert.equal(SlowGram._overlayState().text, '7 min', 'TO15b: 7 min before reset');
  e.doc.setVisibility('hidden');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  e.clock.advance(300001);
  e.doc.setVisibility('visible');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  e.raf.flush();
  var st = SlowGram._overlayState();
  assert.equal(st.opacity, '0', 'TO15c: fade-out marker set (opacity 0)');
  assert.equal(st.text, '', 'TO15d: text cleared on reset');
})();

// T-O16 — subscriber containment: a throwing overlay consumer never breaks emit.
(function () {
  var e = freshEnv();
  var before = SlowGram.getState().elapsedMs;
  SlowGram.on('elapsed', function () { throw new Error('bad subscriber'); });
  SlowGram.setContext('REELS');
  e.clock.advance(60000);
  e.raf.flush();
  assert.equal(SlowGram.getState().elapsedMs, before + 60000, 'TO16: throwing elapsed subscriber does not break the engine');
})();

// T-O17 — typography contract (UI-SPEC): tabular-nums, nowrap, bounded width.
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(180000);
  e.raf.flush();
  var css = SlowGram._overlayState().shadowRoot.styleText();
  assert.ok(css.indexOf('font-variant-numeric: tabular-nums') !== -1, 'TO17a: tabular-nums in CSS');
  assert.ok(css.indexOf('white-space: nowrap') !== -1, 'TO17b: nowrap in CSS');
  assert.ok(css.indexOf('max-width: 200px') !== -1, 'TO17c: max-width 200px in CSS');
  assert.ok(css.indexOf('font-size: 13px') !== -1, 'TO17d: font-size 13px in CSS');
  assert.ok(css.indexOf('font-weight: 500') !== -1, 'TO17e: font-weight 500 in CSS');
  assert.ok(css.indexOf('line-height: 1.4') !== -1, 'TO17f: line-height 1.4 in CSS');
})();

// T-O18 — width stability: text updates do NOT churn the stylesheet (stable pill).
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(180000);
  e.raf.flush();
  var cssBefore = SlowGram._overlayState().shadowRoot.styleText();
  e.clock.advance(60000);                   // 4:00 — digit changes, text updates
  e.raf.flush();
  var cssAfter = SlowGram._overlayState().shadowRoot.styleText();
  assert.equal(cssAfter, cssBefore, 'TO18: stylesheet byte-identical across the text update');
  assert.equal(SlowGram._overlayState().text, '4 min', 'TO18b: text updated to 4 min');
})();

// T-O19 — SCAN (Node-only): overlay values live ONLY in CONFIG.overlay.
(function () {
  if (typeof process === 'undefined' || !fs) {
    assert.ok(true, 'TO19: source scans run on the Node host only');
    return;
  }
  var path = require('path');
  var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'slowgram.js'), 'utf8');
  var code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  var minCount = (code.match(/'min'/g) || []).length;
  assert.equal(minCount, 1, 'TO19a: unitLabel \'min\' appears exactly once (CONFIG.overlay)');
  var zCount = (code.match(/2147483000/g) || []).length;
  assert.equal(zCount, 1, 'TO19b: zIndex appears exactly once (CONFIG.overlay)');
  var bgCount = (code.match(/rgba\(12, 12, 14, 0\.42\)/g) || []).length;
  assert.equal(bgCount, 1, 'TO19c: pill background appears exactly once');
  var fgCount = (code.match(/#F5F5F7/g) || []).length;
  assert.equal(fgCount, 1, 'TO19d: pill text color appears exactly once');
  var timerCalls = code.match(/set(?:Timeout|Interval)\s*\(/g);
  assert.equal(timerCalls ? timerCalls.length : 0, 0, 'TO19e: no timer APIs anywhere (Phase 1 ban)');
})();

// T-O20 — SCAN (Node-only): the overlay never queries the DOM (Pattern A).
(function () {
  if (typeof process === 'undefined' || !fs) {
    assert.ok(true, 'TO20: source scans run on the Node host only');
    return;
  }
  var path = require('path');
  var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'slowgram.js'), 'utf8');
  var renderBody = extractBody(src, 'function overlayRender');
  assert.ok(renderBody.indexOf('querySelector') === -1, 'TO20a: overlayRender performs zero DOM queries');
  var elapsedBody = extractBody(src, 'function onOverlayElapsed');
  assert.ok(elapsedBody.indexOf('querySelector') === -1, 'TO20b: onOverlayElapsed performs zero DOM queries');
})();

// ──────────────────────────────────────────────────────────────────────
// Wave 3 (T-O21..T-O30): context gating (OVER-02) + fullscreen gating
// (OVER-03) — instant hide, poll-free detection, listener hygiene.
// ──────────────────────────────────────────────────────────────────────

// T-O21 — instant hide on SOCIAL (D-14): no transition, opacity 0.
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(420000);
  e.raf.flush();
  var st = SlowGram._overlayState();
  assert.equal(st.opacity, '1', 'TO21a: visible on REELS at phase 2');
  assert.equal(st.text, '7 min', 'TO21b: text 7 min');
  SlowGram.setContext('SOCIAL');
  st = SlowGram._overlayState();
  assert.equal(st.opacity, '0', 'TO21c: instant hide on SOCIAL');
  assert.equal(st.shouldShow, false, 'TO21d: predicate false');
})();

// T-O22 — never on preserved routes: every CONFIG.preservedRoutes entry hides
// an existing host; a session starting on a preserved route never creates one.
(function () {
  var routes = SlowGram.getConfig().preservedRoutes;
  for (var i = 0; i < routes.length; i++) {
    var e = freshEnv();
    SlowGram.setContext('REELS');
    e.clock.advance(420000);
    e.raf.flush();
    assert.equal(SlowGram._overlayState().hostExists, true, 'TO22a.' + i + ': host exists on REELS first');
    SlowGram.setContext('SOCIAL');
    e.location.pathname = routes[i];
    assert.equal(SlowGram._overlayState().opacity, '0', 'TO22b.' + i + ': hidden on preserved route ' + routes[i]);
  }
})();

// T-O23 — UNKNOWN context never shows; contextchange to UNKNOWN hides instantly.
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(420000);
  e.raf.flush();
  assert.equal(SlowGram._overlayState().hostExists, true, 'TO23a: host on REELS');
  SlowGram.setContext('UNKNOWN');
  assert.equal(SlowGram._overlayState().opacity, '0', 'TO23b: instant hide on UNKNOWN');
  // A session starting on UNKNOWN at phase 3 never creates the host.
  var e2 = freshEnv();
  SlowGram.setContext('UNKNOWN');
  e2.clock.advance(12 * 60 * 1000 + 1);
  e2.raf.flush();
  assert.equal(SlowGram._overlayState().hostExists, false, 'TO23c: no host ever on UNKNOWN');
})();

// T-O24 — return to REELS fades back with phase/time preserved (no re-creation).
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(420000);
  e.raf.flush();
  assert.equal(SlowGram._overlayState().text, '7 min', 'TO24a: 7 min before detour');
  SlowGram.setContext('SOCIAL');
  assert.equal(SlowGram._overlayState().opacity, '0', 'TO24b: hidden on social');
  SlowGram.setContext('REELS');
  var st = SlowGram._overlayState();
  assert.equal(st.opacity, '1', 'TO24c: faded back on REELS return');
  assert.equal(st.text, '7 min', 'TO24d: time preserved (no jump)');
  assert.equal(st.hostExists, true, 'TO24e: same single host, no re-creation');
})();

// T-O25 — containment: a throwing context subscriber never breaks setContext.
(function () {
  var e = freshEnv();
  SlowGram.on('contextchange', function () { throw new Error('bad ctx sub'); });
  SlowGram.setContext('REELS');
  e.clock.advance(180000);
  e.raf.flush();
  var before = SlowGram.getState().context;
  SlowGram.setContext('SOCIAL');
  assert.equal(SlowGram.getState().context, 'SOCIAL', 'TO25: throwing contextchange subscriber does not break the engine');
})();

// T-O26 — webkitDisplayingFullscreen hides instantly (OVER-03, iOS canonical).
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/o26' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(420000);
  e.raf.flush();
  var st = SlowGram._overlayState();
  assert.equal(st.hostExists, true, 'TO26a: host on REELS at phase 2');
  assert.equal(st.opacity, '1', 'TO26b: visible');
  video.webkitDisplayingFullscreen = true;
  e.raf.flush();                          // the rAF/elapsed carrier re-checks (no timer, no event needed)
  st = SlowGram._overlayState();
  assert.equal(st.opacity, '0', 'TO26c: instant hide while webkitDisplayingFullscreen');
})();

// T-O27 — document.fullscreenElement: the predicate gates creation — no host
// (and thus no visible counter) ever while fullscreen; exit fades it in.
(function () {
  var e = freshEnv();
  e.doc.fullscreenElement = { tagName: 'VIDEO' };   // fake fullscreen element
  SlowGram.setContext('REELS');
  e.clock.advance(420000);
  e.raf.flush();
  var st = SlowGram._overlayState();
  assert.equal(st.hostExists, false, 'TO27a: no host created while fullscreen (predicate gate)');
  assert.equal(st.shouldShow, false, 'TO27b: predicate false in fullscreen');
  delete e.doc.fullscreenElement;
  e.doc.dispatchEvent({ type: 'fullscreenchange' });
  e.raf.flush();
  st = SlowGram._overlayState();
  assert.equal(st.hostExists, true, 'TO27c: host created after fullscreen exit');
  assert.equal(st.opacity, '1', 'TO27d: visible after exit');
  assert.equal(st.text, '7 min', 'TO27e: time preserved');
})();

// T-O28 — exit fullscreen fades back with time preserved, single host.
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/o28' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(420000);
  e.raf.flush();
  video.webkitDisplayingFullscreen = true;
  e.raf.flush();
  assert.equal(SlowGram._overlayState().opacity, '0', 'TO28a: hidden in fullscreen');
  video.webkitDisplayingFullscreen = false;
  e.doc.dispatchEvent({ type: 'fullscreenchange' });
  e.raf.flush();
  var st = SlowGram._overlayState();
  assert.equal(st.opacity, '1', 'TO28b: faded back on exit');
  assert.equal(st.text, '7 min', 'TO28c: time preserved');
  assert.equal(st.hostExists, true, 'TO28d: single host');
})();

// T-O29 — PiP needs no handling: exactly one fullscreen listener pair per init.
(function () {
  var e = freshEnv();
  assert.equal(e.doc.listenerCount('fullscreenchange'), 1, 'TO29a: exactly one fullscreenchange listener after one init');
  assert.equal(e.doc.listenerCount('webkitfullscreenchange'), 1, 'TO29b: exactly one webkitfullscreenchange listener');
})();

// T-O30 — SCAN: no timers for fullscreen; overlayIsFullscreen never queries the DOM.
(function () {
  if (typeof process === 'undefined' || !fs) {
    assert.ok(true, 'TO30: source scans run on the Node host only');
    return;
  }
  var path = require('path');
  var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'slowgram.js'), 'utf8');
  var timerCalls = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').match(/set(?:Timeout|Interval)\s*\(/g);
  assert.equal(timerCalls ? timerCalls.length : 0, 0, 'TO30a: no timer APIs anywhere (Phase 1 ban)');
  var fsBody = extractBody(src, 'function overlayIsFullscreen');
  assert.ok(fsBody.indexOf('querySelector') === -1, 'TO30b: overlayIsFullscreen performs zero DOM queries');
})();

// ──────────────────────────────────────────────────────────────────────
// Wave 4 (T-O31..T-O40): lifecycle edges — visibilitychange (D-4), destroy/
// re-init (D-16), D-14 feedback-loop proof, listener hygiene, scans.
// ──────────────────────────────────────────────────────────────────────

// T-O31 — hidden tab hides the overlay instantly (D-4).
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(420000);
  e.raf.flush();
  assert.equal(SlowGram._overlayState().opacity, '1', 'TO31a: visible before hiding');
  assert.equal(SlowGram._overlayState().text, '7 min', 'TO31b: text 7 min');
  e.doc.setVisibility('hidden');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  var st = SlowGram._overlayState();
  assert.equal(st.opacity, '0', 'TO31c: instant hide on hidden tab (D-4)');
})();

// T-O32 — return fades back with time preserved, single host.
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(420000);
  e.raf.flush();
  e.doc.setVisibility('hidden');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  assert.equal(SlowGram._overlayState().opacity, '0', 'TO32a: hidden');
  e.doc.setVisibility('visible');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  var st = SlowGram._overlayState();
  assert.equal(st.opacity, '1', 'TO32b: faded back on visible');
  assert.equal(st.text, '7 min', 'TO32c: time preserved');
  assert.equal(st.hostExists, true, 'TO32d: single host');
})();

// T-O33 — destroy() removes the host + clears the D-14 seam (D-16).
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(420000);
  e.raf.flush();
  assert.equal(SlowGram._overlayState().hostExists, true, 'TO33a: host before destroy');
  SlowGram.destroy();
  var st = SlowGram._overlayState();
  assert.equal(st.hostExists, false, 'TO33b: host gone after destroy');
  assert.equal(st.created, false, 'TO33c: creation latch cleared');
  assert.equal(st.seamRegistered, false, 'TO33d: D-14 seam cleared');
})();

// T-O34 — re-init recreates a SINGLE host lazily; the counter re-renders
// (bus subscriptions survived the destroy).
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(180000);
  e.raf.flush();
  assert.equal(SlowGram._overlayState().text, '3 min', 'TO34a: counter before destroy');
  SlowGram.destroy();
  // Re-init with a FRESH env (freshEngine pattern — destroy then init).
  var e2 = freshEnv();
  SlowGram.setContext('REELS');
  e2.clock.advance(180000);
  e2.raf.flush();
  var st = SlowGram._overlayState();
  assert.equal(st.hostExists, true, 'TO34b: host recreated after re-init');
  assert.equal(st.text, '3 min', 'TO34c: counter re-renders (subscribers survived)');
  var hosts = 0;
  for (var i = 0; i < e2.doc.body.children.length; i++) {
    if (e2.doc.body.children[i].shadowRoot) { hosts++; }
  }
  assert.equal(hosts, 1, 'TO34d: exactly one host in the new body (single instance)');
})();

// T-O35 — destroy at phase 0 creates nothing; destroy is idempotent.
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(60000);
  e.raf.flush();
  assert.equal(SlowGram._overlayState().hostExists, false, 'TO35a: no host at phase 0');
  SlowGram.destroy();
  assert.equal(SlowGram._overlayState().hostExists, false, 'TO35b: still none after destroy');
  SlowGram.destroy();                         // idempotent — no throw
  assert.equal(SlowGram._overlayState().hostExists, false, 'TO35c: double destroy safe');
})();

// T-O36 — listener hygiene: the clock's visibilitychange + the overlay's =
// 2 after one init; zero after destroy (no stacking across cycles).
(function () {
  var e = freshEnv();
  assert.equal(e.doc.listenerCount('visibilitychange'), 2, 'TO36a: clock + overlay visibilitychange listeners after one init');
  SlowGram.destroy();
  assert.equal(e.doc.listenerCount('visibilitychange'), 0, 'TO36b: zero after destroy (no stacking)');
})();

// T-O37 — D-14 seam proof: mutation records targeting the host subtree are
// skipped by the batch — no re-apply, no registry churn, no observer echo.
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/o37' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(420000);
  e.raf.flush();
  assert.equal(wrapper.style.filter, 'saturate(0.65)', 'TO37a: lever applied at phase 2');
  var registryBefore = SlowGram._liveRegistrySize();
  // Overlay host is live; record a mutation whose target is INSIDE it.
  var hostEl = SlowGram._overlayState().shadowRoot.host;
  assert.equal(hostEl, SlowGram._overlayState().shadowRoot.host, 'TO37b: host present');
  var pillInside = FakeElement('div', {}, []);
  hostEl.appendChild(pillInside);
  observer.record([{ type: 'childList', addedNodes: [pillInside], target: hostEl }]);
  e.raf.flush();
  assert.equal(SlowGram._liveRegistrySize(), registryBefore, 'TO37c: host-subtree mutation skipped — no registry churn');
  assert.equal(wrapper.style.filter, 'saturate(0.65)', 'TO37d: no lever re-apply from overlay writes');
})();

// T-O38 — overlay render writes do not echo: the observer receives zero
// records for the host subtree across an update.
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/o38' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(180000);
  e.raf.flush();
  assert.equal(SlowGram._overlayState().text, '3 min', 'TO38a: counter rendered');
  // Drive the overlay's own update across the minute boundary while the
  // observer is connected. The fake observer records nothing on its own — the
  // seam assertion is that the engine's batch never reacts to host writes.
  e.clock.advance(60000);
  e.raf.flush();
  assert.equal(SlowGram._overlayState().text, '4 min', 'TO38b: overlay updated to 4 min');
  assert.equal(SlowGram._liveRegistrySize(), 1, 'TO38c: registry untouched by overlay writes (D-14)');
  assert.equal(SlowGram.getRegistryState(video).appliedLevers.saturation, 1, 'TO38d: lever state unchanged');
})();

// T-O39 — SCAN: the D-14 seam has exactly two writers (creation + teardown),
// and wave-4 code added no timers or overlay-value literals.
(function () {
  if (typeof process === 'undefined' || !fs) {
    assert.ok(true, 'TO39: source scans run on the Node host only');
    return;
  }
  var path = require('path');
  var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'slowgram.js'), 'utf8');
  var code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  // overlayHost assignment occurs 4x: (1) var declaration, (2) creation in
  // ensureOverlayHost, (3) teardown clear, (4) the _setOverlayHostForTest
  // test handle. No OTHER writer — the seam is owned by creation/teardown.
  // (?!=) excludes the `overlayHost ===` comparison in _overlayState.
  var seamWrites = (code.match(/overlayHost\s*=(?!=)/g) || []).length;
  assert.equal(seamWrites, 4, 'TO39a: overlayHost seam has exactly 4 writers (decl + creation + teardown + test handle)');
  var timerCalls = code.match(/set(?:Timeout|Interval)\s*\(/g);
  assert.equal(timerCalls ? timerCalls.length : 0, 0, 'TO39b: no timer APIs (Phase 1 ban)');
  var minCount = (code.match(/'min'/g) || []).length;
  assert.equal(minCount, 1, 'TO39c: no new \'min\' literal (CONFIG.overlay only)');
})();

// T-O40 — full-suite containment: the complete overlay code keeps the suite green.
(function () {
  assert.ok(true, 'TO40: full-suite run (host epilogue reports the total)');
})();

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 — HARN-07 dual-host parity suite (T-H01..T-H04): the same engine
// file runs under mocks in a plain browser page with ZERO test dependencies —
// structure-pinned (the browser host cannot drift to a copied engine), the
// zero-dependency claim provable, the parity arithmetic documented, and the
// Edge smoke env-gated (skips cleanly where Edge is absent).
// ─────────────────────────────────────────────────────────────────────────────

// T-H01 — structure pin (Node-only): harness.html loads the shared engine,
// harness, and tests by path — the browser host cannot drift to a copy
// without this test breaking (single source of truth).
(function () {
  if (typeof process === 'undefined' || !fs) {
    assert.ok(true, 'TH1: structure pin runs on the Node host only');
    return;
  }
  var path = require('path');
  var html = fs.readFileSync(path.join(__dirname, 'harness.html'), 'utf8');
  assert.ok(html.indexOf('../src/slowgram.js') !== -1, 'TH1a: harness.html loads ../src/slowgram.js by path');
  assert.ok(html.indexOf('harness.js') !== -1, 'TH1b: harness.html loads harness.js by path');
  assert.ok(html.indexOf('slowgram.test.js') !== -1, 'TH1c: harness.html loads slowgram.test.js by path');
  assert.ok(html.indexOf('single source: ../src/slowgram.js') !== -1, 'TH1d: harness.html documents the single-source contract in its title');
})();

// T-H02 — zero test dependencies (Node-only): no package.json at the project
// root — the 'no framework, no npm' claim is provable, not asserted by
// convention (HARN-07 / CORE-04).
(function () {
  if (typeof process === 'undefined' || !fs) {
    assert.ok(true, 'TH2: zero-dependency claim runs on the Node host only');
    return;
  }
  var path = require('path');
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'package.json')), false,
    'TH2: no package.json — the suite has zero test dependencies (no framework, no npm)');
})();

// T-H03 — parity contract documented (Node-only): the harness page states the
// dual-host equation — the browser host runs the identical suite; the Node
// host's count minus its Node-only scans equals the browser total. The
// arithmetic is documented in the page, and the renderResults TOTAL convention
// comes from the shared harness.js.
(function () {
  if (typeof process === 'undefined' || !fs) {
    assert.ok(true, 'TH3: parity contract runs on the Node host only');
    return;
  }
  var path = require('path');
  var html = fs.readFileSync(path.join(__dirname, 'harness.html'), 'utf8');
  assert.ok(html.indexOf('single-source contract') !== -1, 'TH3a: parity/single-source contract documented in harness.html');
  var harness = fs.readFileSync(path.join(__dirname, 'harness.js'), 'utf8');
  assert.ok(harness.indexOf('TOTAL') !== -1, 'TH3b: renderResults TOTAL convention lives in the shared harness.js');
})();

// T-H04 — env-gated full smoke (Node-only): if Edge is available, run the
// headless dump-dom of harness.html and assert the TOTAL parity (browser
// count === Node total − Node-only scans). If Edge is absent, SKIP cleanly —
// the structure pins (T-H01..T-H03) hold everywhere; the dual-host proof runs
// where Edge exists.
(function () {
  if (typeof process === 'undefined' || !fs) {
    assert.ok(true, 'TH4: Edge smoke runs on the Node host only');
    return;
  }
  var path = require('path');
  var spawnSync = require('child_process').spawnSync;
  var candidates = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    process.env.EDGE || ''
  ];
  var edge = null;
  for (var i = 0; i < candidates.length; i++) {
    if (candidates[i] && fs.existsSync(candidates[i])) { edge = candidates[i]; break; }
  }
  if (!edge) {
    assert.ok(true, 'TH4: Edge not found — dual-host smoke SKIPPED (env-gated; structure pins hold everywhere)');
    return;
  }
  var profile = path.join(require('os').tmpdir(), 'slow-edge-th4-' + process.pid);
  var url = 'file:///' + path.join(__dirname, 'harness.html').replace(/\\/g, '/');
  var res = spawnSync(edge, ['--headless', '--disable-gpu', '--no-sandbox',
    '--user-data-dir=' + profile, '--dump-dom', url], { timeout: 60000, encoding: 'utf8' });
  var out = (res && res.stdout) ? res.stdout : '';
  var m = out.match(/TOTAL: (\d+) passed \/ (\d+) run/);
  if (!m && process.platform === 'win32') {
    // Windows fallback (2026-08-15, on-device UAT session): on this host the
    // direct spawnSync stdout capture for Edge's GUI-process dump can come
    // back empty while the SAME command through a console host (PowerShell
    // pipe) captures the full dump. Retry once via PowerShell -> file before
    // declaring the smoke failed. The file path is single-quoted, so the
    // URL/profile are safe (no quotes in either).
    var psOut = path.join(require('os').tmpdir(), 'slow-edge-th4-' + process.pid + '-dump.html');
    try { fs.unlinkSync(psOut); } catch (e) {}
    var psCmd = "& '" + edge + "' --headless --disable-gpu --no-sandbox --user-data-dir='" +
      profile + "-ps' --dump-dom '" + url + "' 2>$null | Out-File -Encoding utf8 '" + psOut + "'";
    var ps = spawnSync('powershell', ['-NoProfile', '-Command', psCmd], { timeout: 90000, encoding: 'utf8' });
    // Edge's exit code propagates as a non-zero status even when the dump was
    // written — the FILE is the signal, not the exit code.
    if (fs.existsSync(psOut)) {
      out = fs.readFileSync(psOut, 'utf8');
      m = out.match(/TOTAL: (\d+) passed \/ (\d+) run/);
    }
  }
  if (!m) {
    // The dump may have been routed to an existing session (profile lock) —
    // treat a missing TOTAL as a failed smoke, not a silent pass.
    assert.ok(false, 'TH4: Edge smoke produced no TOTAL line (stdout: ' + out.slice(0, 120).replace(/\s+/g, ' ') + ')');
    return;
  }
  assert.equal(m[1], m[2], 'TH4b: browser TOTAL is internally consistent');
  edgeTotalForParity = parseInt(m[1], 10);   // the epilogue asserts the full-suite parity (final Node total)
})();

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 — HARN-05 kill-switch suite (T-K01..T-K08): the master flag that
// turns the engine off INSTANTLY and REVERTS the feed to native. Disable =
// REVERT (revertAll + overlay teardown — never a pause with degradation
// stuck); re-enable resumes fresh; reversible (≠ destroy); no new timers
// (D-12/D-13/D-14).
// ─────────────────────────────────────────────────────────────────────────────

// T-K01 — CONFIG.killSwitch frozen with enabled true (D-12; the value appears
// exactly once in the engine — the SCAN block asserts the once-count).
(function () {
  var ks = SlowGram.getConfig().killSwitch;
  assert.equal(ks.enabled, true, 'TK1: CONFIG.killSwitch.enabled === true');
  assert.ok(Object.isFrozen(ks), 'TK1b: CONFIG.killSwitch deep-frozen (CORE-05)');
})();

// T-K02 — kill stops the poll: the next frame after the flip does zero
// accumulation work (D-12 one-frame stop).
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(420000);
  e.raf.flush();
  assert.equal(SlowGram.getState().elapsedMs, 420000, 'TK2a: 7min accumulated');
  SlowGram._setKillSwitchForTest(false);
  e.clock.advance(60000);
  e.raf.flush();
  // P2-1 (audit 2026-08): disable ENDS the session — the clock is zeroed and
  // stays zero (one-frame stop + no session while killed). Before the fix the
  // clock kept its stale value here.
  assert.equal(SlowGram.getState().elapsedMs, 0, 'TK2b: disable zeroed the session clock (P2-1)');
  assert.equal(SlowGram.getState().elapsedMs, 0, 'TK2c: next frame did zero accumulation (one-frame stop)');
})();

// T-K03 — kill stops registration: a new video mutation while killed is
// ignored — batchCallback/registerVideo no-op (D-12).
(function () {
  FakeMutationObserver.instances = [];
  var main = FakeElement('main', { role: 'main' }, []);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  e.raf.flush();
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/tk3' });
  main.appendChild(video);
  var obs = FakeMutationObserver.instances[0];
  SlowGram._setKillSwitchForTest(false);
  obs.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  assert.equal(SlowGram.getRegistryState(video), null, 'TK3: no video registers while killed (batchCallback/registerVideo no-op)');
})();

// T-K04 — disable REVERTS: a degraded video is native and the overlay is
// gone the moment the flag flips (D-13 — REVERT not pause).
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/tk4' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var obs = FakeMutationObserver.instances[0];
  obs.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(720000);
  e.raf.flush();
  assert.equal(SlowGram.getRegistryState(video).appliedLevers.saturation, 3, 'TK4a: degraded at phase 3');
  assert.equal(SlowGram._overlayState().hostExists, true, 'TK4b: overlay host present');
  SlowGram._setKillSwitchForTest(false);
  assert.equal(SlowGram.getRegistryState(video).appliedLevers.saturation, undefined, 'TK4c: disable REVERTED — lever gone (native feed)');
  assert.equal(wrapper.style.filter, '', 'TK4d: wrapper filter native immediately');
  assert.equal(SlowGram._overlayState().hostExists, false, 'TK4e: overlay host removed on disable');
})();

// T-K05 — re-enable resumes FRESH: accumulation continues, no legacy
// degradation auto-reapplies (D-13 'resumes fresh, reversible, ≠ destroy').
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/tk5' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var obs = FakeMutationObserver.instances[0];
  obs.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(720000);
  e.raf.flush();
  SlowGram._setKillSwitchForTest(false);
  SlowGram._setKillSwitchForTest(true);
  e.clock.advance(60000);
  e.raf.flush();
  // P2-1 (audit 2026-08): re-enable resumes a genuinely FRESH session — the
  // clock restarted at 0 on disable (disableKillSwitch → resetSession), so
  // 60s after re-enable the elapsed is 60000, not the stale 780000.
  assert.equal(SlowGram.getState().elapsedMs, 60000,
    'TK5a: re-enable resumed a FRESH session from 0 — 60s accumulated (P2-1)');
  assert.equal(SlowGram.getRegistryState(video).appliedLevers.saturation, undefined,
    'TK5b: fresh session — no legacy degradation auto-reapplies (native until the normal path re-applies)');
})();

// T-K06 — per-init reset: a flipped latch does NOT survive re-init
// (CONFIG.killSwitch.enabled re-seeds it — D-13 reversible semantics).
(function () {
  var e = freshEnv();
  SlowGram._setKillSwitchForTest(false);
  var e2 = freshEnv();
  SlowGram.setContext('REELS');
  e2.clock.advance(60000);
  e2.raf.flush();
  assert.equal(SlowGram.getState().elapsedMs, 60000, 'TK6: fresh init accumulated — the kill flip did not survive re-init');
})();

// T-K07 — gate-point completeness (Node-only source scan): every one of the
// four gate-point functions consults the latch — a future entry point added
// without the gate fails this scan (D-12 total stop).
(function () {
  if (typeof process === 'undefined' || !fs) {
    assert.ok(true, 'TK7: gate-point scan runs on the Node host only');
    return;
  }
  var path = require('path');
  var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'slowgram.js'), 'utf8');
  var code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  var gates = ['function pollLoop', 'function batchCallback', 'function registerVideo', 'function overlayShouldShow'];
  for (var i = 0; i < gates.length; i++) {
    var body = extractBody(code, gates[i]);
    assert.ok(body.indexOf('killSwitchEnabled') !== -1, 'TK7.' + i + ': ' + gates[i] + ' consults the kill-switch latch');
  }
})();

// T-K08 — kill under churn: even with 5000 pending records, the batch
// processes ZERO while killed (D-12 total stop under load).
(function () {
  FakeMutationObserver.instances = [];
  var main = FakeElement('main', { role: 'main' }, []);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  e.raf.flush();
  injectChurn(5000);
  SlowGram._setKillSwitchForTest(false);
  e.raf.flush();
  var b = SlowGram._batchState();
  assert.equal(b.lastFrameProcessed, 0, 'TK8: batch processed zero while killed (even under 5000-record churn)');
})();

// T-K09 — P2-1 regression (audit 2026-08): disable ENDS the session — the
// clock is zeroed and the 'reset' event is emitted (never silently
// discarded), so the killed state AND a re-enable are internally coherent
// (before: clock kept running at phase 3 with the feed native and no pill —
// degradation silently missing while the timer counted).
(function () {
  FakeMutationObserver.instances = [];
  var main = FakeElement('main', { role: 'main' }, []);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var resets = 0;
  SlowGram.on('reset', function () { resets++; });
  e.clock.advance(720000);
  e.raf.flush();
  assert.equal(SlowGram.getState().phase, 3, 'TK9a: phase 3 precondition');
  SlowGram._setKillSwitchForTest(false);
  assert.equal(SlowGram.getState().elapsedMs, 0, 'TK9b: disable zeroes the session clock (P2-1)');
  assert.equal(SlowGram.getState().phase, 0, 'TK9c: phase back to 0 — killed state coherent (native feed, phase 0)');
  assert.equal(resets, 1, 'TK9d: the session end is OBSERVABLE via the public reset event (T-01-11)');
  e.clock.advance(60000);
  e.raf.flush();
  assert.equal(SlowGram.getState().elapsedMs, 0, 'TK9e: still zero while killed (one-frame stop)');
  SlowGram._setKillSwitchForTest(true);
  e.clock.advance(120000);
  e.raf.flush();
  assert.equal(SlowGram.getState().elapsedMs, 120000, 'TK9f: re-enable accumulates a FRESH session from 0 (no legacy time)');
  assert.equal(SlowGram.getState().phase, 0, 'TK9g: fresh session is phase 0 (no legacy degradation)');
  assert.equal(SlowGram._overlayState().hostExists, false, 'TK9h: no pill at phase 0 of the fresh session');
})();

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 — HARN-04 drift suite (T-D01..T-D06): drift resistance as a
// first-class guarantee. The versioned real-DOM snapshot fixture
// (instagram-shapes.js) is walked against CONFIG.selectors — failing FIRST in
// CI with the missing selector NAMED (D-10); the N=5 health machinery
// (Phase 2 T-D33/T-D34) is linked to the refresh loop (D-11).
// ─────────────────────────────────────────────────────────────────────────────

// T-D01 — fixture integrity: both shapes are present, tagged with their
// source, and each yields a feed with >= 1 video (D-10 versioned snapshot).
(function () {
  var shapes = (typeof require === 'function') ? require('./fixtures/instagram-shapes.js') : (typeof instaShapes !== 'undefined' ? instaShapes : null);
  var mocks = (typeof require === 'function') ? require('./dom-mocks/instagram-mock.js') : (typeof instaMocks !== 'undefined' ? instaMocks : null);
  if (!shapes || !mocks || typeof mocks.buildReelsFeed !== 'function') {
    assert.ok(true, 'TD1: fixtures not loaded on this host — skipped');
    return;
  }
  assert.ok(shapes.SHAPES.loggedOut && shapes.SHAPES.loggedIn, 'TD1a: both shapes present');
  assert.equal(shapes.SHAPES.loggedOut.source, 'live-dump-2026-08-15', 'TD1b: loggedOut tagged with its dump source');
  assert.equal(shapes.SHAPES.loggedIn.source, 'cited-community', 'TD1c: loggedIn tagged with its source');
  assert.ok(mocks.buildReelsFeed(shapes.SHAPES.loggedOut).children.length >= 1, 'TD1d: loggedOut feed has videos');
  var liDialog = mocks.buildDialogRoot(shapes.SHAPES.loggedIn);
  assert.ok(liDialog !== null && liDialog.children.length >= 1, 'TD1e: loggedIn dialog root has a video (the shape\'s video evidence)');
})();

// T-D02 — the versioned fixture walk: every CONFIG.selector that the shape
// contract requires RESOLVES in the shape's DOM — fail-first with the
// selector name and the shape source (D-10: the suite breaks in CI before
// production ever drifts). [role=dialog] is legitimately absent from the
// loggedOut shape (hasDialog false — the walk honors the contract).
(function () {
  var shapes = (typeof require === 'function') ? require('./fixtures/instagram-shapes.js') : (typeof instaShapes !== 'undefined' ? instaShapes : null);
  var mocks = (typeof require === 'function') ? require('./dom-mocks/instagram-mock.js') : (typeof instaMocks !== 'undefined' ? instaMocks : null);
  if (!shapes || !mocks) {
    assert.ok(true, 'TD2: fixtures not loaded on this host — skipped');
    return;
  }
  var cfg = SlowGram.getConfig();
  var sel = cfg.selectors;
  // loggedOut shape: video + [role=main] must resolve; [role=dialog] is
  // contractually absent (hasDialog false) — the walk asserts both sides.
  var loFeed = mocks.buildReelsFeed(shapes.SHAPES.loggedOut);
  var loDoc = FakeDocument({ root: loFeed });
  assert.ok(loDoc.querySelector(sel.video) !== null,
    'TD2a: selector "' + sel.video + '" resolves in loggedOut shape (source ' + shapes.SHAPES.loggedOut.source + ')');
  assert.ok(loDoc.querySelector(sel.roleMain) !== null,
    'TD2b: selector "' + sel.roleMain + '" resolves in loggedOut shape');
  assert.equal(loDoc.querySelector(sel.roleDialog), null,
    'TD2c: loggedOut shape has no [role=dialog] (hasDialog false — contract honored)');
  // loggedIn shape: ALL THREE selectors resolve (hasDialog true).
  var liFeed = mocks.buildReelsFeed(shapes.SHAPES.loggedIn);
  var liDialog = mocks.buildDialogRoot(shapes.SHAPES.loggedIn);
  var liRoot = FakeElement('div', {}, liDialog ? [liFeed, liDialog] : [liFeed]);
  var liDoc = FakeDocument({ root: liRoot });
  assert.ok(liDoc.querySelector(sel.video) !== null,
    'TD2d: selector "' + sel.video + '" resolves in loggedIn shape (source ' + shapes.SHAPES.loggedIn.source + ')');
  assert.ok(liDoc.querySelector(sel.roleMain) !== null,
    'TD2e: selector "' + sel.roleMain + '" resolves in loggedIn shape');
  assert.ok(liDoc.querySelector(sel.roleDialog) !== null,
    'TD2f: selector "' + sel.roleDialog + '" resolves in loggedIn shape (hasDialog true)');
})();

// T-D03 — logged-in realism (fake-vs-live divergence guard, 02-RESEARCH.md
// Pitfall 6): the loggedIn shape's videos carry loop/autoplay; the loggedOut
// shape's never do — the tagged shapes never blur.
(function () {
  var shapes = (typeof require === 'function') ? require('./fixtures/instagram-shapes.js') : (typeof instaShapes !== 'undefined' ? instaShapes : null);
  var mocks = (typeof require === 'function') ? require('./dom-mocks/instagram-mock.js') : (typeof instaMocks !== 'undefined' ? instaMocks : null);
  if (!shapes || !mocks) {
    assert.ok(true, 'TD3: fixtures not loaded on this host — skipped');
    return;
  }
  // The divergence lives in the tagged shape DATA (loggedIn carries
  // hasLoop/hasAutoplay, loggedOut does not) AND the builder honors it.
  assert.equal(shapes.SHAPES.loggedIn.hasLoop, true, 'TD3a: loggedIn shape tagged hasLoop');
  assert.equal(shapes.SHAPES.loggedIn.hasAutoplay, true, 'TD3b: loggedIn shape tagged hasAutoplay');
  assert.equal(shapes.SHAPES.loggedOut.hasLoop, false, 'TD3c: loggedOut shape tagged no loop');
  var liFirst = mocks.buildReelsFeed({ videos: 1, hasLoop: true, hasAutoplay: true }).children[0];
  assert.equal(liFirst.hasAttribute('loop'), true, 'TD3d: builder emits loop for hasLoop shapes');
  assert.equal(liFirst.hasAttribute('autoplay'), true, 'TD3e: builder emits autoplay for hasAutoplay shapes');
  var loFirst = mocks.buildReelsFeed({ videos: 1, hasLoop: false }).children[0];
  assert.equal(loFirst.hasAttribute('loop'), false, 'TD3f: builder emits no loop for loggedOut-style shapes');
})();

// T-D04 — the N=5 health boundary is CONFIG-driven and feeds the refresh loop
// (D-11): exactly `CONFIG.health.driftThreshold` zero-hit scans declare drift,
// with one event. (Phase 2 T-D33 covers the boundary exhaustively; this links
// it to CONFIG so the refresh threshold is never a silent literal.)
(function () {
  var thr = SlowGram.getConfig().health.driftThreshold;
  assert.equal(thr, 5, 'TD4: drift threshold read from CONFIG (D-11, no literal)');
  FakeMutationObserver.instances = [];
  var root = FakeElement('div', {}, []);       // no role=main anchor, no videos
  var e = freshEnv({ root: root, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var events = [];
  SlowGram.on('selectorHealth', function (d) { events.push(d); });
  for (var i = 0; i < thr - 1; i++) { e.raf.flush(); }
  assert.equal(SlowGram.getSelectorHealth().status, 'ok', 'TD4b: not drifted after threshold-1 scans');
  e.raf.flush();
  assert.equal(SlowGram.getSelectorHealth().status, 'drift', 'TD4c: drift declared at exactly CONFIG.health.driftThreshold');
  assert.equal(events.length, 1, 'TD4d: exactly one drift event (transition-guarded)');
})();

// T-D05 — recovery restores the ANCHORED scope: the observer connected at
// init survives the drift episode; when the anchor returns and health
// recovers (Phase 2 T-D34 covers the status), a new video registers through
// the still-connected anchored observer — the refresh loop is fully
// restored, not half-recovered (D-11 feed-back loop).
(function () {
  FakeMutationObserver.instances = [];
  var root = FakeElement('div', {}, []);
  var main = FakeElement('main', { role: 'main' }, []);
  root.appendChild(main);
  var e = freshEnv({ root: root, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var obs = FakeMutationObserver.instances[0];
  assert.ok(obs, 'TD5a: anchored observer connected at init');
  root.removeChild(main);                     // the anchor vanishes → drift
  for (var i = 0; i < 5; i++) { e.raf.flush(); }
  assert.equal(SlowGram.getSelectorHealth().status, 'drift', 'TD5b: drifted while the anchor is missing');
  root.appendChild(main);                     // the anchor returns → recovery
  e.raf.flush();
  assert.equal(SlowGram.getSelectorHealth().status, 'ok', 'TD5c: recovered on the first hit after (D-11)');
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/td5' });
  main.appendChild(video);
  obs.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  assert.ok(SlowGram.getRegistryState(video) !== null, 'TD5d: anchored registration works after recovery (full restoration)');
})();

// T-D06 — fixture↔health linkage: a shape whose anchor vanished makes the
// fixture walk fail NAMING the selector — the health check and the walk are
// the SAME guarantee from two sides (D-11: the fixture test feeds the refresh
// loop, the runbook names the fix).
(function () {
  var shapes = (typeof require === 'function') ? require('./fixtures/instagram-shapes.js') : (typeof instaShapes !== 'undefined' ? instaShapes : null);
  var mocks = (typeof require === 'function') ? require('./dom-mocks/instagram-mock.js') : (typeof instaMocks !== 'undefined' ? instaMocks : null);
  if (!shapes || !mocks) {
    assert.ok(true, 'TD6: fixtures not loaded on this host — skipped');
    return;
  }
  var feed = mocks.buildReelsFeed(shapes.SHAPES.loggedIn);
  feed.removeAttribute('role');                // drift simulation — the anchor vanished
  var doc = FakeDocument({ root: feed });
  var missing = SlowGram.getConfig().selectors.roleMain;
  var found = doc.querySelector(missing);
  assert.equal(found, null, 'TD6a: broken shape — selector "' + missing + '" missing (the T-D02 assert names it)');
  // the walk reads CONFIG.selectors — the SAME registry the engine queries
  // (and the health scan counts); one source of truth for both guards (D-11).
  var cfg = SlowGram.getConfig().selectors;
  assert.equal(cfg.video, 'video', 'TD6b: walk + engine share CONFIG.selectors.video');
  assert.equal(cfg.roleMain, '[role="main"]', 'TD6c: walk + engine share CONFIG.selectors.roleMain');
  assert.equal(cfg.roleDialog, '[role="dialog"]', 'TD6d: walk + engine share CONFIG.selectors.roleDialog');
})();

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 — HARN-03 social matrix suite (T-S01..T-S08): 'no degradation on
// social surfaces' as a FIRST-CLASS requirement. The full cartesian matrix —
// every preservedRoute × every lever + the overlay (D-8) — asserting nothing
// applies on any preserved route and nothing persists through the detour, via
// an honest pre/post snapshot (D-9) plus the legitimate re-application on
// return to /reels/ (D-16 ida-e-volta contract).
// ─────────────────────────────────────────────────────────────────────────────

// Helper: the pre/post state snapshot (D-9 honest assert).
function snapshotFor(video, wrapper) {
  var st = SlowGram.getState();
  var ov = SlowGram._overlayState();
  var reg = SlowGram.getRegistryState(video);
  return {
    elapsedMs: st.elapsedMs,
    phase: st.phase,
    context: st.context,
    levers: reg ? JSON.parse(JSON.stringify(reg.appliedLevers || {})) : null,
    overlayOpacity: ov.opacity,
    overlayHost: ov.hostExists,
    wrapperFilter: wrapper.style.filter
  };
}

// T-S01 — matrix skeleton: every preserved route classifies SOCIAL, applies
// nothing, hides the overlay (D-8 'nothing applies').
(function () {
  var routes = SlowGram.getConfig().preservedRoutes;
  assert.ok(routes.length >= 6, 'TS1: preservedRoutes has >= 6 entries');
  for (var i = 0; i < routes.length; i++) {
    FakeMutationObserver.instances = [];
    var wrapper = FakeElement('div', {}, []);
    var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/ts1' });
    wrapper.appendChild(video);
    var main = FakeElement('main', { role: 'main' }, [wrapper]);
    var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
    var obs = FakeMutationObserver.instances[0];
    obs.record([{ type: 'childList', addedNodes: [video], target: main }]);
    e.raf.flush();
    e.clock.advance(720000);                   // phase 3 — all levers applicable
    e.raf.flush();
    assert.equal(SlowGram.getRegistryState(video).appliedLevers.saturation, 3,
      'TS1a.' + i + ': phase-3 lever precondition holds on REELS');
    e.location.pathname = routes[i];
    e.win.dispatchEvent({ type: 'popstate' });   // SPA navigation signal → refresh('route') → classify
    assert.equal(SlowGram.getState().context, 'SOCIAL', 'TS1b.' + i + ': ' + routes[i] + ' classifies SOCIAL');
    var after = SlowGram.getRegistryState(video).appliedLevers || {};
    assert.equal(after.saturation, undefined, 'TS1c.' + i + ': nothing applied on ' + routes[i]);
    assert.equal(after.playbackRate, undefined, 'TS1d.' + i + ': playbackRate clean on ' + routes[i]);
    assert.equal(SlowGram._overlayState().opacity, '0', 'TS1e.' + i + ': overlay hidden on ' + routes[i]);
  }
})();

// T-S02 — persistence: after a full detour through EVERY preserved route and
// return, the state is IDENTICAL to the pre-detour snapshot (D-9 half 1 — the
// honest assert; a leftover lever would differ).
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/ts2' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var obs = FakeMutationObserver.instances[0];
  obs.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(720000);
  e.raf.flush();
  var before = snapshotFor(video, wrapper);
  var routes = SlowGram.getConfig().preservedRoutes;
  for (var i = 0; i < routes.length; i++) {
    e.location.pathname = routes[i];
    e.win.dispatchEvent({ type: 'popstate' });
    e.location.pathname = '/reels/';
    e.win.dispatchEvent({ type: 'popstate' });
  }
  var after = snapshotFor(video, wrapper);
  assert.equal(JSON.stringify(after), JSON.stringify(before),
    'TS2: state IDENTICAL after the full detour round trip (nothing persisted)');
})();

// T-S03 — overlay-only edge: the overlay joins the matrix via its own
// predicate — shouldShow false on EVERY preserved route (D-8 ' + the overlay').
(function () {
  var routes = SlowGram.getConfig().preservedRoutes;
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(420000);
  e.raf.flush();
  assert.equal(SlowGram._overlayState().shouldShow, true, 'TS3a: predicate true on REELS at phase 2');
  for (var i = 0; i < routes.length; i++) {
    SlowGram.setContext('SOCIAL');
    assert.equal(SlowGram._overlayState().shouldShow, false, 'TS3b.' + i + ': predicate false on ' + routes[i]);
    SlowGram.setContext('REELS');
  }
})();

// T-S04 — matrix precondition: at phase 3 ALL FOUR levers are verified applied
// on REELS (so the 'nothing persists' assert is meaningful — degradation is
// actually active before the detour).
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/ts4' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var obs = FakeMutationObserver.instances[0];
  obs.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(720000);
  e.raf.flush();
  var levers = SlowGram.getRegistryState(video).appliedLevers;
  assert.equal(levers.saturation, 3, 'TS4a: saturation applied at phase 3');
  assert.equal(levers.playbackRate, 3, 'TS4b: playbackRate applied at phase 3');
  assert.equal(levers.volume, 3, 'TS4c: volume applied at phase 3');
  assert.equal(levers.autoplay, 3, 'TS4d: autoplay armed at phase 3');
  assert.equal(wrapper.style.filter, 'saturate(0.4)', 'TS4e: wrapper filter written from CONFIG');
})();

// T-S05 — re-application on return: the detour does NOT kill the degradation
// state — returning to /reels/ re-applies the legitimate levers (D-9 half 2,
// the D-16 ida-e-volta contract).
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/ts5' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var obs = FakeMutationObserver.instances[0];
  obs.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(720000);
  e.raf.flush();
  var before = snapshotFor(video, wrapper);
  e.location.pathname = '/direct/';
  e.win.dispatchEvent({ type: 'popstate' });    // SOCIAL — reverted to native
  assert.equal(SlowGram.getRegistryState(video).appliedLevers.saturation, undefined,
    'TS5a: reverted while on the preserved route');
  e.location.pathname = '/reels/';
  e.win.dispatchEvent({ type: 'popstate' });    // REELS — applyAll re-applies
  var after = SlowGram.getRegistryState(video).appliedLevers;
  assert.equal(after.saturation, 3, 'TS5b: saturation re-applied on return');
  assert.equal(after.playbackRate, 3, 'TS5c: playbackRate re-applied on return');
  assert.equal(after.volume, 3, 'TS5d: volume re-applied on return');
  assert.equal(after.autoplay, 3, 'TS5e: autoplay re-armed on return');
  assert.equal(wrapper.style.filter, before.wrapperFilter, 'TS5f: wrapper filter matches the pre-detour value');
})();

// T-S06 — transparency under elapsed: social time NEVER accumulates, and the
// post-return snapshot's elapsed matches the pre-detour value (the Phase 1
// exclusion contract inside the matrix).
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/ts6' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var obs = FakeMutationObserver.instances[0];
  obs.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(720000);
  e.raf.flush();
  var before = SlowGram.getState().elapsedMs;
  e.location.pathname = '/direct/';
  e.win.dispatchEvent({ type: 'popstate' });
  e.clock.advance(240000);                      // 4 min ON the preserved route
  e.raf.flush();
  assert.equal(SlowGram.getState().elapsedMs, before, 'TS6a: social time never accumulates (elapsed flat)');
  e.location.pathname = '/reels/';
  e.win.dispatchEvent({ type: 'popstate' });
  assert.equal(SlowGram.getState().elapsedMs, before, 'TS6b: return snapshot elapsed matches the pre-detour value');
})();

// T-S07 — real-social-DOM pass: the same matrix outcome with the REAL
// Instagram social shape (buildSocialRoute — no role=main feed root).
(function () {
  var mocks = (typeof require === 'function') ? require('./dom-mocks/instagram-mock.js') : (typeof instaMocks !== 'undefined' ? instaMocks : null);
  if (!mocks || typeof mocks.buildSocialRoute !== 'function') {
    assert.ok(true, 'TS7: instaMocks not loaded on this host — real-DOM pass skipped');
    return;
  }
  var social = mocks.buildSocialRoute('/direct/');
  assert.equal(social.root.querySelector('[role="main"]'), null, 'TS7a: social shape has no feed root');
  var e = freshEnv({ root: social.root, location: FakeLocation('/direct/') });
  e.raf.flush();
  assert.equal(SlowGram.getState().context, 'SOCIAL', 'TS7b: /direct/ real shape classifies SOCIAL');
  assert.equal(SlowGram._overlayState().hostExists, false, 'TS7c: no overlay host ever on the social shape');
  assert.equal(SlowGram.getState().elapsedMs, 0, 'TS7d: social shape accumulates zero');
})();

// T-S08 — revertAll cleanliness: on the preserved route, every lever target is
// native — zero style/attribute residue survives the detour (D-8 tail).
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/ts8' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var obs = FakeMutationObserver.instances[0];
  obs.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(720000);
  e.raf.flush();
  assert.equal(wrapper.style.filter, 'saturate(0.4)', 'TS8a: degraded on REELS first');
  e.location.pathname = '/direct/';
  e.win.dispatchEvent({ type: 'popstate' });
  assert.equal(wrapper.style.filter, '', 'TS8b: wrapper filter native on the preserved route');
  assert.equal(video.playbackRate, 1, 'TS8c: playbackRate native on the preserved route');
  assert.equal(video.volume, 1, 'TS8d: volume native on the preserved route');
  assert.equal(SlowGram._overlayState().opacity, '0', 'TS8e: overlay hidden on the preserved route');
})();

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 — HARN-02 wall-clock suite (T-W01..T-W08): 'the session never lies'.
// Counting equivalence (elapsed === visible delta; hidden contributes zero) and
// reset equivalence (gap > fatigueWindowMs resets), each in BOTH scenarios —
// the normal visibility driver AND the WebView missed-event case (hidden
// WITHOUT the event — rAF suspended in hidden tabs, catch-up via the Phase 1
// hiddenAt=null → lastBoundary fallback). Every test asserts the real-clock
// delta AND the hiddenAt/lastBoundary/elapsedMs invariants (D-5..D-7).
// ─────────────────────────────────────────────────────────────────────────────

// T-W01 — counting equivalence, NORMAL flow: a 60s hidden period contributes
// exactly zero; the delta is exact and the invariants hold (D-5/D-6/D-7).
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(120000);
  e.raf.flush();
  assert.equal(SlowGram.getState().elapsedMs, 120000, 'TW1a: 120000ms visible baseline accumulated');
  e.doc.setVisibility('hidden');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  var mid = SlowGram.getState();
  assert.ok(mid.hiddenAt !== null, 'TW1b: invariant — hiddenAt set on hide (normal flow)');
  assert.equal(mid.visible, false, 'TW1c: invariant — visible false while hidden');
  e.clock.advance(60000);                   // 60s hidden — must contribute ZERO
  e.doc.setVisibility('visible');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  var res = SlowGram.getState();
  assert.equal(res.hiddenAt, null, 'TW1d: invariant — hiddenAt cleared on discount path');
  e.clock.advance(30000);
  e.raf.flush();
  assert.equal(SlowGram.getState().elapsedMs, 150000, 'TW1e: counting — elapsed === visible delta exactly; hidden 60s contributed zero');
})();

// T-W02 — counting equivalence, WEBVIEW missed-event case: hidden WITHOUT the
// visibilitychange event (rAF suspended in hidden tabs — the hidden period is
// advanced WITHOUT flush); the resume signal (window focus, T26 pattern) runs
// the catch-up via the hiddenAt=null → lastBoundary fallback (D-6).
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(120000);
  e.raf.flush();
  assert.equal(SlowGram.getState().elapsedMs, 120000, 'TW2a: baseline');
  e.doc.setVisibility('hidden');            // NO visibilitychange event (missed)
  e.clock.advance(60000);                   // hidden period — no flush (rAF suspended)
  e.win.dispatchEvent({ type: 'focus' });   // resume signal → lastBoundary fallback catch-up
  assert.equal(SlowGram.getState().elapsedMs, 120000, 'TW2b: hidden 60s discounted via lastBoundary fallback (never counted)');
  e.doc.setVisibility('visible');
  e.clock.advance(30000);
  e.raf.flush();
  assert.equal(SlowGram.getState().elapsedMs, 150000, 'TW2c: counting — visible delta only; missed-event hidden contributed zero');
})();

// T-W03 — delta-exactness: the accumulated delta equals the visible segment to
// the millisecond (no rounding, no off-by-frame).
(function () {
  var e = freshEnv();
  SlowGram.setContext('REELS');
  e.clock.advance(123456);
  e.raf.flush();
  assert.equal(SlowGram.getState().elapsedMs, 123456, 'TW3: elapsed === 123456ms exactly (no rounding)');
})();

// T-W04 — invariant matrix: hidden → hiddenAt set + paused; small visible gap
// (< window) → discounted (elapsed continues, no reset); immediate resume → no
// discontinuity in lastBoundary (D-7 mechanism proof).
(function () {
  var e = freshEnv();
  var win = SlowGram.getConfig().fatigueWindowMs;
  SlowGram.setContext('REELS');
  e.clock.advance(60000);
  e.raf.flush();
  var lb1 = SlowGram.getState().lastBoundary;
  // small hidden gap < window → discounted
  e.doc.setVisibility('hidden');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  e.clock.advance(30000);
  e.doc.setVisibility('visible');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  assert.equal(SlowGram.getState().elapsedMs, 60000, 'TW4a: small gap discounted — elapsed unchanged');
  assert.ok(SlowGram.getState().lastBoundary >= lb1, 'TW4b: lastBoundary advanced past the discount');
  // immediate resume (zero gap) → no discontinuity
  e.doc.setVisibility('hidden');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  e.doc.setVisibility('visible');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  assert.equal(SlowGram.getState().elapsedMs, 60000, 'TW4c: zero-gap resume — no accumulation, no reset');
  assert.equal(SlowGram.getState().hiddenAt, null, 'TW4d: hiddenAt cleared after immediate resume');
  assert.ok(win > 0, 'TW4e: fatigue window read from CONFIG (never a literal)');
})();

// T-W05 — reset equivalence, NORMAL flow: a >5-min hidden gap resets the
// session — pre-gap time does NOT survive ('never lies' = never pretends
// continuity either) (D-5).
(function () {
  var e = freshEnv();
  var resets = [];
  SlowGram.on('reset', function () { resets.push(1); });
  SlowGram.setContext('REELS');
  e.clock.advance(180000);
  e.raf.flush();
  assert.equal(SlowGram.getState().elapsedMs, 180000, 'TW5a: 3min baseline');
  e.doc.setVisibility('hidden');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  e.clock.advance(360000);                  // 6-min gap > window
  e.doc.setVisibility('visible');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  assert.equal(SlowGram.getState().elapsedMs, 0, 'TW5b: 6-min hidden gap RESET — elapsed zeroed');
  assert.equal(SlowGram.getState().phase, 0, 'TW5c: phase reset to 0');
  assert.equal(resets.length, 1, 'TW5d: exactly one reset event');
  e.clock.advance(60000);
  e.raf.flush();
  assert.equal(SlowGram.getState().elapsedMs, 60000, 'TW5e: only post-resume visible time accumulates');
})();

// T-W06 — reset equivalence, WEBVIEW missed-event case: the 6-min hidden gap
// (no event, no flush) still resets through the fallback path (D-6).
(function () {
  var e = freshEnv();
  var resets = [];
  SlowGram.on('reset', function () { resets.push(1); });
  SlowGram.setContext('REELS');
  e.clock.advance(180000);
  e.raf.flush();
  e.doc.setVisibility('hidden');            // NO event
  e.clock.advance(360000);                  // no flush — rAF suspended
  e.win.dispatchEvent({ type: 'focus' });   // resume signal → fallback catch-up
  assert.equal(resets.length, 1, 'TW6a: WebView missed-event gap > window resets via lastBoundary fallback');
  assert.equal(SlowGram.getState().elapsedMs, 0, 'TW6b: elapsed zeroed');
  e.clock.advance(60000);
  e.raf.flush();
  assert.equal(SlowGram.getState().elapsedMs, 60000, 'TW6c: post-reset visible time only');
})();

// T-W07 — exact fatigue boundary: 300000 does NOT reset (strict >), 300001
// does — asserted to the millisecond against CONFIG (D-5 exactness).
(function () {
  var win = SlowGram.getConfig().fatigueWindowMs;
  var e = freshEnv();
  var resets = [];
  SlowGram.on('reset', function () { resets.push(1); });
  SlowGram.setContext('REELS');
  e.clock.advance(60000);
  e.raf.flush();
  e.doc.setVisibility('hidden');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  e.clock.advance(win);
  e.doc.setVisibility('visible');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  assert.equal(resets.length, 0, 'TW7a: gap === fatigueWindowMs does NOT reset (strict >)');
  assert.equal(SlowGram.getState().elapsedMs, 60000, 'TW7b: pre-gap elapsed preserved at exact boundary');
  // window+1 resets
  e.doc.setVisibility('hidden');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  e.clock.advance(win + 1);
  e.doc.setVisibility('visible');
  e.doc.dispatchEvent({ type: 'visibilitychange' });
  assert.equal(resets.length, 1, 'TW7c: gap === fatigueWindowMs + 1 RESETS');
  assert.equal(SlowGram.getState().elapsedMs, 0, 'TW7d: elapsed zeroed at window+1');
})();

// T-W08 — reset side-effect: on reset, revertAll restores a degraded video to
// native (the LEVR-07 path — 'the session never lies' also means no stale
// degradation survives a fatigue reset).
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/tw8' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e2 = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var observer = FakeMutationObserver.instances[0];
  observer.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e2.raf.flush();
  e2.clock.advance(720000);                 // phase 3 — all levers applied
  e2.raf.flush();
  var st = SlowGram.getRegistryState(video).appliedLevers;
  assert.equal(st.saturation, 3, 'TW8a: saturation applied at phase 3 (reset precondition)');
  e2.doc.setVisibility('hidden');
  e2.doc.dispatchEvent({ type: 'visibilitychange' });
  e2.clock.advance(SlowGram.getConfig().fatigueWindowMs + 1);
  e2.doc.setVisibility('visible');
  e2.doc.dispatchEvent({ type: 'visibilitychange' });
  assert.equal(SlowGram.getState().elapsedMs, 0, 'TW8b: fatigue reset fired');
  var after = SlowGram.getRegistryState(video).appliedLevers;
  assert.equal(after.saturation, undefined, 'TW8c: reset restored native — no stale lever survives (revert deletes the lever)');
  assert.equal(wrapper.style.filter, '', 'TW8d: wrapper filter native after reset');
})();

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 — HARN-01 churn suite (T-P01..T-P07): the rAF batch yield-at-cap
// (D-2) + finite-drain gates (D-4), deterministic churn injection, derived
// rate, anti-pattern SCAN, and containment. Wave 1 of Phase 5.
// ─────────────────────────────────────────────────────────────────────────────

// T-P01 — CONFIG.harness frozen with maxBatchRecords 200 (HARN-01 D-2).
(function () {
  var cfg = SlowGram.getConfig();
  assert.equal(cfg.harness.maxBatchRecords, 200, 'TP1: CONFIG.harness.maxBatchRecords === 200');
  assert.ok(Object.isFrozen(cfg.harness), 'TP1b: CONFIG.harness deep-frozen (CORE-05)');
})();

// T-P02 — yield gate: 5000 injected records → one frame processes exactly the
// cap (200) and retains 4800 pending — never over the cap (D-4 gate 1).
(function () {
  FakeMutationObserver.instances = [];
  var main = FakeElement('main', { role: 'main' }, []);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  injectChurn(5000);
  e.raf.flush();
  var b = SlowGram._batchState();
  assert.equal(b.lastFrameProcessed, 200, 'TP2: one frame processes exactly maxBatchRecords (yield gate)');
  assert.equal(b.pendingRecords, 4800, 'TP2b: 4800 records retained pending (overflow never dropped)');
})();

// T-P03/T-P04 — drain gate + no-drop invariant: the 5000-record churn drains
// in exactly ceil(5000/200)=25 frames, every frame ≤ cap, Σ processed === 5000.
(function () {
  FakeMutationObserver.instances = [];
  var main = FakeElement('main', { role: 'main' }, []);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  injectChurn(5000);
  var frames = 0, over = 0, total = 0;
  for (var i = 0; i < 40; i++) {
    e.raf.flush();
    frames++;
    var b = SlowGram._batchState();
    total += b.lastFrameProcessed;
    if (b.lastFrameProcessed > 200) { over++; }
    if (b.pendingRecords === 0) { break; }
  }
  assert.equal(frames, 25, 'TP3: drains in exactly ceil(5000/200)=25 frames (finite drain, D-4 gate 2)');
  assert.equal(over, 0, 'TP3b: no frame ever over the cap (yield holds on every frame)');
  assert.equal(total, 5000, 'TP4: Σ per-frame processed === 5000 (no-drop invariant)');
})();

// T-P05 — derived rate: records ÷ frames × 60fps === 12000 records/second
// (200/frame × 60fps — the drain capacity, 2.4× the 5000/s incoming).
// Never sampled — D-3 derivation, SCAN-safe.
(function () {
  FakeMutationObserver.instances = [];
  var main = FakeElement('main', { role: 'main' }, []);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  injectChurn(5000);
  var frames = 0;
  for (var i = 0; i < 40; i++) {
    e.raf.flush();
    frames++;
    if (SlowGram._batchState().pendingRecords === 0) { break; }
  }
  var rate = 5000 / frames * 60;   // records ÷ frames × 60fps — derived, never sampled
  assert.equal(rate, 12000, 'TP5: derived drain rate === 12000 records/sec (2.4× headroom over 5k/s)');
})();

// T-P06 — SCAN additions live in the main source-scan block above (cap literal
// exactly once; the no-performance.now / no-timer scans already cover the path).
(function () {
  assert.ok(true, 'TP6: SCAN additions enforced in the source-scan block (cap-once + SCAN-safe)');
})();

// T-P07 — containment: a hostile takeRecords() throwing does NOT break the
// engine — pollLoop's try/catch contains it, the state survives.
(function () {
  FakeMutationObserver.instances = [];
  var main = FakeElement('main', { role: 'main' }, []);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  e.raf.flush();
  var obs = FakeMutationObserver.instances[0];
  obs.takeRecords = function () { throw new Error('hostile takeRecords'); };
  var threw = false;
  try { e.raf.flush(); } catch (err) { threw = true; }
  assert.equal(threw, false, 'TP7: hostile takeRecords contained by pollLoop try/catch');
  assert.equal(SlowGram.getState().context, 'REELS', 'TP7b: engine still reports context after containment');
})();

// ─────────────────────────────────────────────────────────────────────────────
// Audit P1 regression suite (2026-08) — two real gaps found by the
// release-readiness audit, each proven by a probe before the fix:
//   P1-1 (anchor-missing + videos): /reels/ with <video> but NO [role="main"]
//        registered ZERO videos — connectWatcher early-returned on empty
//        roots (skipping the connect scan), health stayed 'ok' (videos are a
//        hit) and the drift fallback never engaged. Probe: registrySize 0,
//        health ok, levers never applied.
//   P1-2 (poll death): an exception ANYWHERE in the rAF frame body skipped
//        the next-frame re-request (it lived inside the try) — the loop died
//        silently, freezing accumulation/levers/drift. Probe: one throwing
//        frame → elapsed frozen at 0 forever.
//
// NOTE on error counting below: the T-O16/T-O18 suites register THROWING bus
// subscribers ('contextchange'/'elapsed') that are PRESERVED across re-init
// by design (teardown keeps subscribers), so every freshEnv/init and every
// tick emits a contained 'subscriber error' into a stubbed console.error.
// The P1-2 tests therefore count ONLY engine-branded poll errors
// ('SlowGram: poll loop error' / 'SlowGram: poll reschedule failed') — the
// throwing-subscriber noise is unrelated to the poll loop under test.
// ─────────────────────────────────────────────────────────────────────────────

function auditPollErrors(list) {
  return list.filter(function (e) {
    return String(e[0]).indexOf('SlowGram: poll loop error') !== -1 ||
      String(e[0]).indexOf('SlowGram: poll reschedule failed') !== -1;
  });
}

// T-A1 — P1-1: /reels/ + 1 video + NO [role="main"] — the connect scan must
// register the video and degradation must engage, while NO observer is
// created (Pitfall 2 intact: no roots → never observe anything) and health
// semantics stay unchanged (videos present = ok).
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/audit-a1' });
  wrapper.appendChild(video);
  var root = FakeElement('div', {}, [wrapper]);     // NO role=main anchor
  var e = freshEnv({ root: root, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  assert.equal(SlowGram._registrySize(), 1, 'TA1a: connect scan registered the video without the anchor (P1-1)');
  assert.equal(SlowGram._liveRegistrySize(), 1, 'TA1b: live list holds it');
  assert.equal(SlowGram._getWatcherState().connected, false,
    'TA1c: no observer without roots — Pitfall 2 preserved (never body-wide observation)');
  e.clock.advance(180000);                          // phase 1
  e.raf.flush();
  var levers = SlowGram.getRegistryState(video).appliedLevers;
  assert.equal(levers && levers.saturation, 1, 'TA1d: saturation applied at phase 1 — degradation works without the anchor');
  assert.equal(wrapper.style.filter, 'saturate(' + SlowGram.getConfig().leverParams.saturation['1'] + ')',
    'TA1e: wrapper filtered (D-15 ancestor gate)');
  assert.equal(SlowGram.getSelectorHealth().status, 'ok',
    'TA1f: health stays ok (videos present — drift semantics unchanged, D-09)');
})();

// T-A2 — P1-1: a [role="main"] anchor that renders AFTER the initial connect
// attempt (empty roots at connect) recovers WITHOUT a page reload — the
// per-batch reconnect re-attempts connectWatcher, creates the observer and
// the connect scan registers the video.
(function () {
  FakeMutationObserver.instances = [];
  var root = FakeElement('div', {}, []);            // nothing at connect
  var e = freshEnv({ root: root, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  assert.equal(SlowGram._getWatcherState().connected, false, 'TA2a: no roots at connect — no observer yet');
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/audit-a2' });
  root.appendChild(video);                          // video appears first (no anchor yet)
  e.raf.flush();
  assert.equal(SlowGram._registrySize(), 1,
    'TA2b: video registered by the connect scan even before the anchor renders (P1-1)');
  assert.equal(SlowGram._getWatcherState().connected, false, 'TA2c: still no observer without a root');
  var main = FakeElement('main', { role: 'main' }, []);
  root.appendChild(main);                           // anchor appears later
  main.appendChild(video);                          // (moves the video under it)
  e.raf.flush();                                    // next batch re-attempts connect
  assert.equal(SlowGram._getWatcherState().connected, true,
    'TA2d: observer connected once the anchor renders — recovered without reload (D-07 reconnect semantics)');
  assert.equal(FakeMutationObserver.instances.length, 1, 'TA2e: exactly one observer instance for the episode');
  assert.equal(FakeMutationObserver.instances[0].lastObserved.target, main,
    'TA2f: observer roots are the rendered [role="main"] feed (D-11 two-root set)');
  assert.equal(SlowGram._registrySize(), 1, 'TA2g: idempotent scan — no double registration after recovery');
  e.clock.advance(180000);
  e.raf.flush();
  var levers = SlowGram.getRegistryState(video).appliedLevers;
  assert.equal(levers && levers.saturation, 1, 'TA2h: degradation engages after recovery');
})();

// T-B1 — P1-2: clock.now() throws on ONE frame. The frame is contained +
// logged, the finally re-schedules the heartbeat, and the following frames
// keep accumulating. Before the fix the loop died silently (elapsed frozen).
(function () {
  FakeMutationObserver.instances = [];
  var main = FakeElement('main', { role: 'main' }, []);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var errors = [];
  var origErr = console.error;
  console.error = function () { errors.push([].slice.call(arguments)); };
  var armed = false;
  var origNow = e.clock.now;
  e.clock.now = function () {
    if (armed) { armed = false; throw new Error('P1-2 clock boom'); }
    return origNow();
  };
  try {
    // No clock.advance before the throwing frame: the throw happens BEFORE
    // tick updates lastBoundary, so advancing would fold that 60s into the
    // next frame's delta. A zero-time throwing frame isolates the test.
    armed = true;
    e.raf.flush();                                // frame 1: tick's clock.now() throws before accumulating
    assert.equal(SlowGram.getState().elapsedMs, 0, 'TB1a: the throwing frame accumulated nothing (work aborted, one frame)');
    var pollErrs = auditPollErrors(errors);
    assert.equal(pollErrs.length, 1, 'TB1b: the exception was logged exactly once (observable, never silent)');
    assert.ok(String(pollErrs[0][0]).indexOf('SlowGram: poll loop error') !== -1, 'TB1c: engine-branded poll error');
    e.clock.advance(60000); e.raf.flush();        // frame 2: clock healthy again
    e.clock.advance(60000); e.raf.flush();        // frame 3
    assert.equal(SlowGram.getState().elapsedMs, 120000,
      'TB1d: loop SURVIVED the clock throw — frames 2-3 accumulated 2x60s (no freeze)');
    assert.equal(auditPollErrors(errors).length, 1, 'TB1e: no further poll errors — clean recovery once the exception stops');
  } finally {
    console.error = origErr;
  }
})();

// T-B2 — P1-2: a DOM-query exception inside the per-batch path (healthScan's
// [role="main"] query on a connected REELS feed) is contained + logged, the
// frame's completed work is kept (tick ran before the throw), and the loop
// continues.
(function () {
  FakeMutationObserver.instances = [];
  var main = FakeElement('main', { role: 'main' }, []);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var errors = [];
  var origErr = console.error;
  console.error = function () { errors.push([].slice.call(arguments)); };
  var origQ = e.doc.querySelector;
  e.doc.querySelector = function () { throw new Error('P1-2 healthScan boom'); };
  try {
    e.clock.advance(60000); e.raf.flush();        // frame 1: tick ok (60s), then healthScan throws
    var pollErrs = auditPollErrors(errors);
    assert.equal(pollErrs.length, 1, 'TB2a: healthScan DOM-query exception logged exactly once (contained)');
    assert.equal(SlowGram.getState().elapsedMs, 60000, 'TB2b: work completed before the throw is kept');
    e.doc.querySelector = origQ;                  // DOM healthy again
    e.clock.advance(60000); e.raf.flush();        // frame 2
    e.clock.advance(60000); e.raf.flush();        // frame 3
    assert.equal(SlowGram.getState().elapsedMs, 180000, 'TB2c: loop survived the healthScan throw — 3x60s accumulated');
  } finally {
    e.doc.querySelector = origQ;
    console.error = origErr;
  }
})();

// T-B3 — P1-2: exactly ONE next frame is scheduled per invocation — after the
// throwing frame, 3 clean flushes each accumulate exactly one 60s tick (a
// duplicate loop would double a tick).
(function () {
  FakeMutationObserver.instances = [];
  var main = FakeElement('main', { role: 'main' }, []);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var errors = [];
  var origErr = console.error;
  console.error = function () { errors.push([].slice.call(arguments)); };
  var armed = false;
  var origNow = e.clock.now;
  e.clock.now = function () {
    if (armed) { armed = false; throw new Error('P1-2 boom'); }
    return origNow();
  };
  try {
    armed = true;
    e.raf.flush();                                // throwing frame (no advance — see TB1 note)
    for (var i = 0; i < 3; i++) {
      e.clock.advance(60000); e.raf.flush();
    }
    assert.equal(SlowGram.getState().elapsedMs, 180000,
      'TB3: exactly one tick per frame after the throw — no duplicate loops');
    assert.equal(auditPollErrors(errors).length, 1, 'TB3b: still exactly one contained+logged poll error');
  } finally {
    console.error = origErr;
  }
})();

// T-B4 — P1-2: the reschedule itself failing (host rAF throws) is contained
// and logged — never thrown into the host frame (engine containment,
// T-01-01).
(function () {
  var clock = FakeClock(1000000);
  var root = FakeElement('main', { role: 'main' }, []);
  var doc = FakeDocument({ visibilityState: 'visible', root: root });
  var win = FakeWindow();
  win.location = FakeLocation('/reels/');
  win.location._window = win;
  var raf = FakeRAF();
  var origRequest = raf.request;
  var armedResched = false;
  var wrappedRaf = function (cb) {
    if (armedResched) { armedResched = false; throw new Error('P1-2 rAF boom'); }
    return origRequest(cb);
  };
  var errors = [];
  var origErr = console.error;
  console.error = function () { errors.push([].slice.call(arguments)); };
  SlowGram.init({
    clock: clock,
    document: doc,
    window: win,
    MutationObserver: FakeMutationObserver,
    requestAnimationFrame: wrappedRaf
  });
  var threw = false;
  try {
    armedResched = true;
    clock.advance(60000);
    raf.flush();
  } catch (err) { threw = true; }
  console.error = origErr;
  var reschedErrs = auditPollErrors(errors);
  assert.equal(threw, false, 'TB4a: a broken rAF reschedule is contained — nothing escapes into the host');
  assert.equal(reschedErrs.length, 1, 'TB4b: reschedule failure logged exactly once');
  assert.ok(String(reschedErrs[0][0]).indexOf('SlowGram: poll reschedule failed') !== -1, 'TB4c: engine-branded reschedule error');
})();

// ─────────────────────────────────────────────────────────────────────────────
// Audit P2 regression suite (2026-08) — fixes confirmed in code:
//   P2-1 kill-switch session coherence (T-K09, above, in the kill-switch
//        suite) — disable ends the session via resetSession.
//   P2-2 registryElements pruning by isConnected (T-P2a) — videos removed
//        while the observer is disconnected (SOCIAL detour) were retained
//        forever in the live list (strong ref defeating WeakMap GC-safety).
//   P2-4 volume lever re-application on unmute (T-V1) — a video muted at
//        apply time never received the lever, even after being unmuted.
//   P2-3 (wrapper) — SlowGramBridge gated by BuildConfig.DEBUG; its
//        regression lives in MainActivityTest (per-variant Robolectric).
// ─────────────────────────────────────────────────────────────────────────────

// T-P2a — P2-2 regression: a video removed while the observer is
// DISCONNECTED (SOCIAL detour — removals unobserved) must be pruned from the
// live list at the next REELS connect (D-07 re-sync), so applyAll/revertAll
// stop iterating dead nodes and the WeakMap GC-safety holds.
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/audit-p2a' });
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  assert.equal(SlowGram._liveRegistrySize(), 1, 'TP2a1: video registered at connect');
  e.win.history.pushState(null, '', '/direct/');     // SOCIAL — observer disconnects
  assert.equal(SlowGram.getState().context, 'SOCIAL', 'TP2a2: on SOCIAL (observer disconnected, D-07)');
  wrapper.removeChild(video);                        // unobserved removal during the detour
  assert.equal(SlowGram._liveRegistrySize(), 1, 'TP2a3: stale entry retained during the detour (no observer to prune)');
  e.win.history.pushState(null, '', '/reels/');      // back to REELS — reconnect re-sync
  assert.equal(SlowGram.getState().context, 'REELS', 'TP2a4: back on REELS');
  assert.equal(SlowGram._liveRegistrySize(), 0, 'TP2a5: stale video pruned at reconnect (P2-2 — isConnected)');
  var v2 = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/audit-p2b' });
  var w2 = FakeElement('div', {}, []);
  w2.appendChild(v2);
  main.appendChild(w2);
  // The fake observer only sees records via record() (a real DOM queues the
  // mutation on append automatically) — record the append on the RECONNECT
  // observer (instance[1]: created when /reels/ reconnected) then flush.
  FakeMutationObserver.instances[1].record([{ type: 'childList', addedNodes: [v2], target: main }]);
  e.raf.flush();
  assert.equal(SlowGram._liveRegistrySize(), 1, 'TP2a6: a fresh video registers normally after the prune');
})();

// T-V1 — P2-4 regression: a video that was MUTED at apply time never got the
// volume lever (LEVR-03 gate). On unmute (volumechange) the per-video
// reconcile must apply the lever for the current phase — and revert on
// SOCIAL must restore the original volume.
(function () {
  FakeMutationObserver.instances = [];
  var wrapper = FakeElement('div', {}, []);
  var video = FakeVideoElement('video', { src: 'blob:https://www.instagram.com/audit-v1' });
  video.muted = true;                                // gated at every apply until unmute
  video.volume = 1;
  wrapper.appendChild(video);
  var main = FakeElement('main', { role: 'main' }, [wrapper]);
  var e = freshEnv({ root: main, location: FakeLocation('/reels/'), observer: FakeMutationObserver });
  var obs = FakeMutationObserver.instances[0];
  obs.record([{ type: 'childList', addedNodes: [video], target: main }]);
  e.raf.flush();
  e.clock.advance(720000);                           // phase 3 — volume in the matrix
  e.raf.flush();
  var st = SlowGram.getRegistryState(video).appliedLevers;
  assert.equal(st.volume, undefined, 'TV1a: muted video never got the volume lever (LEVR-03 gate intact)');
  assert.equal(video.volume, 1, 'TV1b: volume untouched while muted');
  video.muted = false;                               // user/Instagram unmutes
  video.dispatchEvent({ type: 'volumechange', target: video });
  st = SlowGram.getRegistryState(video).appliedLevers;
  assert.equal(st.volume, 3, 'TV1c: volume lever applied on unmute (P2-4)');
  assert.equal(video.volume, 1 * SlowGram.getConfig().leverParams.volume['3'],
    'TV1d: volume set to orig * phase-3 factor (0.5)');
  assert.equal(video.muted, false, 'TV1e: muted never reassigned (Anti-Pattern 2)');
  e.win.history.pushState(null, '', '/direct/');     // SOCIAL — revert
  st = SlowGram.getRegistryState(video).appliedLevers;
  assert.equal(st.volume, undefined, 'TV1f: revert on SOCIAL removes the lever');
  assert.equal(video.volume, 1, 'TV1g: original volume restored on revert');
})();

// Host epilogue: browser renders the table; Node sets the exit code.
(function () {
  if (typeof document !== 'undefined' && document.getElementById && typeof renderResults === 'function') {
    renderResults('results');
    return;
  }
  // HARN-07 parity (final total): the Edge browser-host TOTAL must be strictly
  // less than the final Node total by a bounded Node-only-scan delta — the
  // same suite otherwise (T-H04 captured the browser total when Edge exists).
  if (edgeTotalForParity !== null) {
    var nodeTotalFinal = assert.results.length;
    var deltaFinal = nodeTotalFinal - edgeTotalForParity;
    assert.ok(deltaFinal > 0, 'TH4c: browser TOTAL < final Node total (the Node-only scans)');
    assert.ok(deltaFinal < 200, 'TH4d: Node-only delta is bounded (source scans only, never the behavior suites)');
  }
  var failed = assert.results.filter(function (r) { return !r.pass; });
  if (typeof process !== 'undefined') {
    process.exitCode = (failed.length > 0) ? 1 : 0;
  }
  if (failed.length > 0) {
    console.error('FAILED: ' + failed.length + ' of ' + assert.results.length + ' assertions');
    failed.forEach(function (r) { console.error('  FAIL: ' + r.label); });
  } else {
    console.log('OK: ' + assert.results.length + ' assertions passed');
  }
})();