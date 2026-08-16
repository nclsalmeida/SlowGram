---
phase: 5
slug: harness-hardening-device-validation
created: 2026-08-15
---

# Phase 5 — Pattern Map

> Consumed by gsd-planner. For each file Phase 5 creates or modifies: role + data flow, closest existing analog, and the concrete code excerpt to replicate.

## Files Phase 5 touches

| File | Role | Action | Analog (existing) |
|------|------|--------|-------------------|
| `src/slowgram.js` | Engine: `CONFIG.harness.maxBatchRecords` yield in `processBatch` + kill-switch latch & gate points | modify | Phase 1 `processBatch`/`pollLoop` (no-timer rAF carrier); Phase 4 latch pattern (`overlayCreated`) |
| `test/slowgram.test.js` | All new suites: churn gates, wall-clock dual tests, social matrix, drift fixture test, kill-switch flip, HARN-07 parity | modify | Phase 1-4 T-* / T-O* suites (same assert runner, same host pattern) |
| `test/harness.js` | Additive fakes: churn injection on FakeMutationObserver, listener-count helper | modify | `record(mutations)` (:136-158) + `FakeDocument.addEventListener` helper precedent (T-O29) |
| `test/fixtures/instagram-shapes.js` | Versioned real-DOM snapshot (loggedOut/loggedIn) — HARN-04 fixture test target | read (reference) | already the DETC-07 fixture |
| `test/fixtures/instagram-mock.js` | `buildSocialRoute` — HARN-03 social matrix DOM shape | read (reference) | Phase 2 fixture |
| `device-check.html` | NEW standalone real-DOM validation page (HARN-06) | create | `demo.html` (browser page driving the engine, zero deps) |
| `test/harness.html` | Dual-host page — HARN-07 first-class parity claim | read (reference) | already exists (Phase 1) |

## 1. src/slowgram.js — yield + kill-switch gates

**Role:** the two engine changes of the phase: (a) the rAF batch yields at `CONFIG.harness.maxBatchRecords` (D-2/D-4), (b) the master kill-switch latch consulted at the cheapest entry points (D-12/D-13/D-14).

**Analog:** the existing no-timer rAF carrier — `processBatch` (src/slowgram.js:775-797) already drains per frame and runs `healthScan()` + `processStalls()` inside the batch. The yield inserts BETWEEN the drain and the callback; the health/stall tails stay (they are per-frame, not per-record). The kill-switch mirrors the Phase 4 `overlayCreated`/`bufferEnabled` latch pattern (closure var + test handle).

**Excerpts to replicate:**

```js
// processBatch — the rAF-batch carrier (D-09). Current shape (775-797):
function processBatch() {
  var records = watcher.observer ? watcher.observer.takeRecords() : [];
  if (health.drifted) { /* fallbackScope() path */ }
  else if (records.length) { batchCallback(records); }
  healthScan();
  processStalls();
}
```

Yield insertion point: after `takeRecords()`, slice to the cap — `records = records.slice(0, CONFIG.harness.maxBatchRecords)` before `batchCallback(records)` (overflow is dropped for the NEXT frame's takeRecords — records already drained are lost if discarded; the engine must keep overflow pending, i.e. `takeRecords` drains all, batchCallback consumes ≤ cap, the remainder must be re-queued — **the plan must specify the pending-queue mechanics**, the D-4 finite-drain gate proves it).

```js
// Latch precedent — Phase 4 overlay (src/slowgram.js:103):
var bufferEnabled = false; // OFF unless _setBufferEnabled flips it
// Gate-point precedent — Phase 1 pollLoop (515-534):
if (state.destroyed) { return; }   // consulted every frame
```

Kill-switch gate points (D-12): `pollLoop` (returns before accumulation), `batchCallback` (returns before registration), `registerVideo` (returns before tracking), `overlaySync` + overlay handlers (no render). The latch resets per init (precedent: `bufferEnabled = CONFIG.buffer.enabled;` at :1803 — "a flipped _setBufferEnabled flag does not survive re-init").

```js
// Test-handle precedent (src/slowgram.js:1903-1921):
SlowGram._setMutatingForTest = function (v) { mutating = !!v; return SlowGram; };
SlowGram._setOverlayHostForTest = function (node) { overlayHost = node || null; return SlowGram; };
// Phase 5 adds: SlowGram._setKillSwitchForTest(v) → flips the module latch (D-14).
```

## 2. test/slowgram.test.js — the six suites

**Role:** the phase's core deliverable — HARN-01..05, 07 as first-class deterministic tests, appended to the existing file (715 assertions baseline).

**Analog:** every prior suite (T-*, T-O*) — same `assert` helpers, same `freshEnv`/`advance`/`flush` driver pattern, same append-at-end convention, same two-host determinism.

**Excerpts to replicate:**

```js
// Churn injection — FakeMutationObserver already exposes record() (test/harness.js:136-158):
obs.record(mutations);           // inject N records
// drain driven exactly like time: FakeRAF.flush() = one frame = one tick (harness.js:357-362)
env.rAF.flush();                 // one batch
// Derivation (D-3): rate = records ÷ frames × 60fps; gates (D-4): no frame over cap + finite drain.

// Wall-clock (D-5..D-7): fake clock advance + visibility driver:
env.clock.advance(visibleDelta);                 // "real clock" for the test
doc.setVisibility('hidden');                     // + dispatch 'visibilitychange' (normal flow)
// WebView missed-event (D-6): setVisibility WITHOUT the event — engine recovers via hiddenAt=null → lastBoundary fallback (Phase 1).
// Dual assert (D-7): elapsedMs === visibleDelta AND hiddenAt/lastBoundary/elapsedMs invariants.

// Social matrix (D-8/D-9): nested loop over CONFIG.preservedRoutes × lever keys;
// buildSocialRoute (test/fixtures/instagram-mock.js) provides the DOM; snapshot via getRegistryState
// (src/slowgram.js:1885-1890) before/after; return to '/reels/' and assert re-application.

// Drift (D-10/D-11): walk CONFIG.selectors against instagram-shapes.js; the failing assert NAMES the
// missing selector; selectorHealth N=5 (CONFIG.health.driftThreshold :344) promoted to first-class test.
```

## 3. test/harness.js — additive fakes

**Role:** churn injection support + the listener-count helper (T-O29 precedent).

**Analog:** the `record()`/`recordAttributeMutation()` methods on FakeMutationObserver (136-158) and the Phase 3 addition of `getListenerCount`-style helpers (FakeDocument listeners are closure-private — a test helper was added for T-O29).

## 4. device-check.html — NEW standalone on-device page (HARN-06)

**Role:** a REAL-DOM page (no fakes) the human opens on iOS Safari / Android Chrome / Android WebView. Displays the engine's live verdict + clamp tables from `CONFIG` (webkit/chromium — src/slowgram.js:344-363) and drives the checklist items (filter visual, volume, 6-min reset, social preservation, overlay pill).

**Analog:** `demo.html` — a zero-dependency standalone page loading `src/slowgram.js` + fixtures, with a small driver (the Phase 4 preview precedent). No framework, no npm — same constraint as HARN-07.

## 5. test/harness.html — HARN-07 reference

**Role:** formalize the existing dual-host claim (Node 715 / Edge 667 parity) as a first-class test — the harness page already exists; the phase adds the assertion that the SAME engine file runs under mocks in a plain browser page with zero test dependencies.
