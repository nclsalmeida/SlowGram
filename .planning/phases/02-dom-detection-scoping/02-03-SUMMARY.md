---
phase: 02-dom-detection-scoping
plan: 03
subsystem: dom-detection
tags: [mutation-observer, weakmap, video-registry, lifecycle, dom-watcher]
requires:
  - phase: 02-dom-detection-scoping
    provides: "02-01 DomWatcher skeleton (watcher.connected, healthScan, connect/disconnect), 02-02 ContextDetector + RouteGuard (setContext connect-on-REELS, pathname seams, observer driving via setContext only)"
provides:
  - "Two-root MutationObserver set ([role=main] feed + [role=dialog] with video) with the locked D-11 config; never body-wide"
  - "Once-per-frame takeRecords() drain with a zero-DOM-query batch callback (D-09)"
  - "D-14 self-mutation filter (mutating flag) + overlay-host subtree exclusion"
  - "connect-on-REELS / disconnect-on-SOCIAL/UNKNOWN lifecycle (DETC-08) with synchronous reconnect re-sync (D-07)"
  - "Full VideoRegistry: WeakMap per-video state {registeredAt, src, started, ended, appliedLevers}, idempotent register, loadstart/emptied lifecycle reset, getRegistryState(video) consumer handle"
  - "Test handles: _getWatcherState, _setMutatingForTest, _setOverlayHostForTest, getRegistryState"
affects: [03-lever-appliers, 04-post-interactions, 02-04, verify-work]
actuals:
  tokens: 8242
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns:
    - "Two-root observer set: feed root + dialog root (Pattern 2), each with the identical locked config — no body-wide observation"
    - "records-as-truth batch callback: targets/addedNodes come from mutation records only, zero synchronous DOM queries (Pitfall 2)"
    - "WeakMap-value lifecycle flag (entry._bound) — listeners bind exactly once per element"
    - "WeakMap GC-safety: registry entries die with the element; virtualized feed recycling cannot leak"
key-files:
  created: []
  modified:
    - src/slowgram.js
    - test/harness.js
    - test/slowgram.test.js
key-decisions:
  - "Kept the D-13 role-attribute refresh (roleTouched -> refresh('mutation')) inside batchCallback — T-D8b asserts it and refineFromDOM performs zero DOM queries, so it is compatible with the D-09 zero-query prohibition"
  - "Moved healthScan OUT of batchCallback into processBatch (one scan per rAF batch, not per record) to preserve the zero-DOM-query callback contract"
  - "connectWatcher performs a synchronous processBatch() re-sync after observing (reconnect re-sync per D-07) — proves healthScan ran on reconnect (T-D25e)"
  - "FakeMutationObserver gains an `observed` array alongside `lastObserved` (kept for T-D2 back-compat) so two-root observe assertions can check both roots"
  - "FakeVideoElement.src mirrors into attributes (getAttribute('src') reads the property) so readSrc works identically on fake and real elements"
patterns-established:
  - "Two-root observer: feed + dialog roots, identical locked config, never body-wide"
  - "Records-as-truth batch callback: zero synchronous DOM queries"
  - "entry._bound WeakMap-value lifecycle flag: once-only listener binding"
  - "processBatch owns the takeRecords drain + healthScan; batchCallback owns only record handling"
requirements-completed: [DETC-04, DETC-05, DETC-08]
coverage:
  - id: D1
    description: "DomWatcher observes exactly the two roots ([role=main] feed + [role=dialog] containing a video) with the locked D-11 config {childList:true, subtree:true, attributeFilter:['src','loop','autoplay','role']} — never on body; logged-out shape observes only the feed root"
    requirement: DETC-04
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#T-D17 two-root observe"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-D18 logged-out single root"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#SCAN attributeFilter literal exactly once"
        status: pass
    human_judgment: false
  - id: D2
    description: "Mutation records drain once per rAF frame via takeRecords(); the batch callback performs zero synchronous DOM queries (region-scoped source scan proves batchCallback body has no querySelector/querySelectorAll)"
    requirement: DETC-04
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#T-D19 batch drains once per frame"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#SCAN batchCallback zero DOM queries"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-14 self-mutation filter: the mutating flag skips the whole batch; videos inside the injected overlay-host subtree are excluded via isOverlayHost; external mutations register normally"
    requirement: DETC-04
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#T-D21 self-mutation filter"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-D22 overlay-host exclusion"
        status: pass
    human_judgment: false
  - id: D4
    description: "Observer lifecycle: connects only when context is REELS, disconnects on SOCIAL and UNKNOWN (RouteGuard-driven), and reconnects with one synchronous batch re-sync + healthScan on return to /reels/; the registry survives disconnect and reconnect unchanged (D-07)"
    requirement: DETC-08
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#T-D23 disconnect on SOCIAL"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-D24 disconnect on UNKNOWN"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-D25 reconnect re-sync"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-D30 registry survives disconnect"
        status: pass
    human_judgment: false
  - id: D5
    description: "VideoRegistry full contract: WeakMap per-video state {registeredAt, src, started, ended, appliedLevers}; idempotent register with loadstart/emptied listeners bound exactly once (entry._bound); loadstart refreshes src + sets started, emptied resets ended=true/started=false/src=null; getRegistryState returns a copy or null"
    requirement: DETC-05
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#T-D26 register creates state"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-D27 idempotent + once-only binding"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-D28 loadstart reset"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-D29 emptied reset"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-D31 feed node recycling"
        status: pass
    human_judgment: false
duration: 75min
completed: 2026-08-15
status: complete
---

# Phase 02 Plan 03: DomWatcher Two-Root Observer + VideoRegistry Full Contract Summary

**Complete DomWatcher contract (two-root observer set with the locked 4-attribute config, once-per-frame zero-query batch drain, D-14 self-mutation + overlay filtering, connect-on-REELS/disconnect-on-SOCIAL/UNKNOWN lifecycle with reconnect re-sync) and the full VideoRegistry contract (WeakMap per-video state, idempotent register, loadstart/emptied lifecycle reset, getRegistryState consumer handle)**

## Performance

- **Duration:** 75 min
- **Started:** 2026-08-15T13:10:00Z
- **Completed:** 2026-08-15T14:25:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- DomWatcher now observes exactly two roots — `[role=main]` feed and any `[role=dialog]` containing a video — with the locked D-11 config `{childList:true, subtree:true, attributeFilter:['src','loop','autoplay','role']}`; the config literal appears exactly once in the engine (source-scan proven), never body-wide
- Mutation records drain once per rAF frame via `processBatch()` → `takeRecords()`; the batch callback performs zero synchronous DOM queries (region-scoped negative gate asserts `querySelector` absent from the batchCallback body)
- D-14 feedback-loop protection: the `mutating` flag skips the whole batch, and videos inside the injected overlay-host subtree are excluded via `isOverlayHost`
- Lifecycle per DETC-08/D-12: observer connects only on REELS, disconnects on SOCIAL and UNKNOWN, and reconnect runs a synchronous `processBatch()` re-sync + healthScan
- VideoRegistry complete per DETC-05: WeakMap per-video state `{registeredAt, src, started, ended, appliedLevers}`, idempotent register with `entry._bound`-guarded once-only loadstart/emptied listener binding, per-video lifecycle reset on both events (Pitfall 5), registry retained across disconnect/reconnect (D-07), `getRegistryState(video)` Phase 3 consumer handle
- Both hosts green: Node 326 assertions, Edge headless 300 (source scans are Node-only)

## Task Commits

Each task was committed atomically:

1. **Task 1: DomWatcher full two-root observer contract** - `ab52679` (feat)
2. **Task 2: VideoRegistry full contract** - `6a863a7` (feat)

**Plan metadata:** (final docs commit created by the orchestrator)

## Files Created/Modified
- `src/slowgram.js` - `dialogRoot()`, `isOverlayHost()`, rewritten `connectWatcher()` (two-root observe + synchronous processBatch re-sync), `processBatch()`, rewritten `batchCallback()` (records-as-truth, D-14 filter, zero DOM queries, roleTouched refresh), expanded `registerVideo()` (full state + lifecycle binding), `readSrc()`, `onLoadStart()`, `onEmptied()`, `getRegistryState()`; handles `_getWatcherState`, `_setMutatingForTest`, `_setOverlayHostForTest`, `getRegistryState`
- `test/harness.js` - FakeMutationObserver `observed` array + `recordAttributeMutation()`; FakeElement `appendChild`/`removeChild`; FakeVideoElement `src` mirroring into attributes
- `test/slowgram.test.js` - T-D17..T-D25 (DomWatcher suite) + T-D26..T-D31 (VideoRegistry suite) + strengthened source scans (attributeFilter literal exactly once)

## Decisions Made
- Kept the D-13 role-attribute refresh (`roleTouched` → `refresh('mutation')`) inside batchCallback — T-D8b asserts it and refineFromDOM performs zero DOM queries, so it is compatible with the D-09 zero-query prohibition
- Moved healthScan OUT of batchCallback into processBatch — one health scan per rAF batch instead of per record, preserving the zero-DOM-query callback contract
- connectWatcher performs a synchronous processBatch() after observing (D-07 reconnect re-sync) — T-D25e proves healthScan ran on reconnect
- FakeMutationObserver keeps `lastObserved` (T-D2 back-compat) and adds the `observed` array for two-root assertions
- New tests reset `FakeMutationObserver.instances = []` at block start (established prior-test pattern) — stale instances from earlier suites would otherwise pollute `instances[0]`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- T-D26 initially failed with `getRegistryState(video)` returning null while `_registrySize() === 1` passed. Root cause: the new test blocks omitted the `FakeMutationObserver.instances = []` reset that every prior observer test performs at its start, so `instances[0]` referenced a stale observer from an earlier suite. Fixed by adding the reset to all six new blocks (T-D26..T-D31) — the established pattern. Not a plan deviation; a test-hygiene fix.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 3 (lever appliers) can consume `getRegistryState(video)` + the register/lifecycle semantics unchanged: the registry holds `{registeredAt, src, started, ended, appliedLevers:null}` per video, and `appliedLevers` is reserved for Phase 3 to populate (CONTEXT.md:39)
- The D-09 zero-DOM-query batch callback contract is proven by source scan — future phases must not add DOM queries to the mutation-callback region
- Test handles `_setMutatingForTest`/`_setOverlayHostForTest` give Phase 3 suites control over the D-14 feedback-loop filter

## Self-Check: PASSED
- FOUND: src/slowgram.js, test/harness.js, test/slowgram.test.js, 02-03-SUMMARY.md
- FOUND: commit ab52679 (Task 1), commit 6a863a7 (Task 2)

---
*Phase: 02-dom-detection-scoping*
*Completed: 2026-08-15*