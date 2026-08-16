---
phase: 02-dom-detection-scoping
plan: 01
subsystem: testing
tags: [dom-detection, mutation-observer, weakmap, decision-table, fixtures, fake-element, source-scan]

# Dependency graph
requires:
  - phase: 01-motor-core-lifecycle
    provides: "SlowGram engine IIFE, DI seam (resolveEnv), deep-frozen CONFIG, setContext bus, lifecycle wiring (init/bindLifecycle/teardown)"
provides:
  - "Detection spine: classifyPathname decision table, ContextDetector, DomWatcher (MutationObserver on [role=main]), VideoRegistry (WeakMap), SelectorRegistry with health"
  - "FakeElement/FakeMutationObserver/FakeVideoElement/FakeLocation mini-DOM in the shared browser/Node harness"
  - "Source-tagged Instagram fixtures (loggedOut from verified live dump, loggedIn from cited community evidence) + mock DOM builder"
affects: [02-dom-detection-scoping (02-02 RouteGuard, 02-03 expansion, 02-04 health+demo driver), 03-levers]

# Actuals (#2632) — pairs with the plan's estimate (estimateTokens: 32000).
actuals:
  tokens: 9092    # chars/4 over the realized diff (36,371 chars across 5 files)
  tasks: 2        # tasks completed
  commits: 2      # commits made

# Tech tracking
tech-stack:
  added: []       # zero new packages — hand-rolled fakes on Node 18 assert + harness.html
  patterns:
    - "Decision-table classifier (classifyPathname): route keywords + preserved routes from frozen CONFIG, direct prefix match"
    - "Two-root observer: DomWatcher watches [role=main] feed root; dialog checked via SelectorRegistry (observer never attaches to [role=dialog])"
    - "WeakMap-based VideoRegistry with WeakMap.size fallback counter; _registrySize() handle"
    - "Source-scan enforcement in the test file: for the whole test file, no timer scheduling APIs, no getElementsByClassName, batchCallback body free of querySelector (brace-matching extractBody)"
    - "Fresh-constructor DI (freshEnv) returning clock/doc/win/raf/location/elem per test"

key-files:
  created:
    - test/fixtures/instagram-shapes.js
    - test/dom-mocks/instagram-mock.js
  modified:
    - src/slowgram.js
    - test/harness.js
    - test/slowgram.test.js

key-decisions:
  - "classifyPathname uses direct prefix match — CONFIG prefixes carry trailing slashes, so the plan's literal `prefix + '/'` double-slashed ('/reels//') and missed '/reels/abc' and '/p/post-id/'; fixed with a NOTE comment in the engine"
  - "teardown() resets the VideoRegistry WeakMap + registryCount for engine-instance isolation so freshEnv T-D3/T-D4 see _registrySize()===0; D-07 keep-registry is preserved on the disconnect-on-SOCIAL path, which never clears"
  - "Fresh headless capture of /reels/ returned a zero-video page shell (819,255 bytes, videos=0) — headless feed hydration blocked; per the plan's documented fallback, the verified on-disk dump remains the loggedOut shape source, and the divergence is recorded in the fixture comment"
  - "detectContext() calls SlowGram.setContext(...) — bare setContext() is not in scope (it is a property on the returned object), so the plan's literal call would have thrown ReferenceError"
  - "Browser host: T-D5 block skips gracefully (instaShapes/instaMocks absent) because harness.html is deliberately untouched (02-PATTERNS.md:364); Node host is the deterministic T-D5 host"

patterns-established:
  - "Pattern 1: the engine's detection surface stays declarative — selectors/route keywords live in CONFIG and are read through getConfig() by both engine and tests"
  - "Pattern 2: everything the engine can do with a DOM node it can also do with a FakeElement (matches/querySelector/querySelectorAll/closest/contains) — the harness mirrors only the query subset the engine actually uses"
  - "Pattern 3: source tags on fixture shapes ('live-dump-2026-08-15' vs 'cited-community') distinguish verified data from community-sourced evidence"
  - "Pattern 4: class-based selectors and timer APIs are banned by in-test source scans, not by convention"

requirements-completed: [DETC-01, DETC-07]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "classifyPathname decision table — routeKeywords reels/feed/stories/direct/p + preservedRoutes, UNKNOWN for unrecognized paths"
    requirement: DETC-01
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#TD1"
        status: pass
    human_judgment: false
  - id: D2
    description: "Detection spine end-to-end — REELS context classifies, DomWatcher attaches to [role=main], MutationObserver records register VideoElements, feedRoot null-safe on detach"
    requirement: DETC-01
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#TD2"
        status: pass
    human_judgment: false
  - id: D3
    description: "Pathname-authoritative never-degrade — currentPathname() always reads window.location.pathname, setContext rejects unknown targets, teardown clears registry for instance isolation"
    requirement: DETC-07
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#TD3"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#TD4"
        status: pass
    human_judgment: false
  - id: D4
    description: "Harness growth — FakeDocument.root delegation, record-producing FakeMutationObserver (instances/lastObserved/takeRecords/record), FakeVideoElement with writable src, FakeLocation with history + fire()"
    requirement: DETC-07
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#TD2"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#TD3"
        status: pass
    human_judgment: false
  - id: D5
    description: "Fixture data — source-tagged loggedOut (verified dump: roleMain 1, videos 4, no dialog/loop, roles/aria inventory) and loggedIn (cited-community, hasDialog) shapes + verifiedSelectors"
    requirement: DETC-07
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#TD5"
        status: pass
    human_judgment: false
  - id: D6
    description: "Mock DOM builder — buildReelsFeed/buildDialogRoot/buildSocialRoute compose FakeElement trees from shapes (no [role=main] on SOCIAL routes, null dialog for loggedOut)"
    requirement: DETC-07
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#TD5"
        status: pass
    human_judgment: false
  - id: D7
    description: "Real-DOM verification — fresh headless capture of /reels/ ran and was validated; zero-video page shell (headless hydration blocked) documented as divergence; verified on-disk dump remains the shape source; fixture matches dump facts"
    requirement: DETC-07
    verification:
      - kind: manual_procedural
        ref: "msedge --headless --dump-dom https://www.instagram.com/reels/ → Select-String role-main/video/role-dialog counts; fallback verified dump C:/Users/Usuario/AppData/Local/Temp/eco-ig-dump.html"
        status: pass
    human_judgment: true
    rationale: "Network/headless-dependent: the fresh capture returned zero videos because headless Chrome cannot complete the logged-out feed hydration, so the fallback to the verified on-disk dump was exercised — a human should confirm the divergence note in test/fixtures/instagram-shapes.js records this accurately"

# Metrics
duration: 10min
completed: 2026-08-15
status: complete
---

# Phase 02 Plan 01: Detection Spine Tracer Summary

**Detection spine tracer: classifyPathname decision table, DomWatcher (MutationObserver on [role=main]) with WeakMap VideoRegistry + SelectorRegistry health, backed by a FakeElement mini-DOM harness and source-tagged Instagram fixtures — green on both Node (183) and headless Edge (159)**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-08-15T12:55:09-03:00
- **Completed:** 2026-08-15T13:05:02-03:00
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Wire detection spine: `classifyPathname()` decision table (routeKeywords + preservedRoutes from frozen CONFIG), `detectContext()` on init, `connectWatcher()`/`disconnectWatcher()` (keep-registry), `batchCallback()` draining MutationObserver records without DOM queries, `healthScan()` drift detection, `recover()`.
- Harness grown to a working mini-DOM: `FakeElement` (matches/querySelector/querySelectorAll/closest/contains), record-producing `FakeMutationObserver`, `FakeVideoElement` (writable src), `FakeLocation` (history + fire), `FakeDocument` root delegation.
- Source-tagged fixtures: `instagram-shapes.js` (loggedOut from verified live dump, loggedIn from cited community evidence) + `instagram-mock.js` DOM builder, pinned as `window.instaShapes` / `window.instaMocks` for the Plan 04 demo driver.
- Real-DOM verification ran: fresh headless capture validated, zero-video page shell documented as divergence; fixture matches the verified dump facts.
- Zero new packages, no harness.html changes — all growth is in test files and the engine.

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire detection spine (classify, observe, register, health)** - `208922c` (feat)
2. **Task 2: Instagram DOM fixtures + mock builder + real-DOM verification** - `063713a` (test)

**Plan metadata:** pending docs commit (`docs(02-01): complete detection spine tracer plan`)

_Note: plan-level TDD gate — RED commit not applicable: the plan is an iterative single-RED/GREEN flow where the engine-only commit (208922c) landed green after T-D1..T-D4 existed, and the fixture/verification commit (063713a) added T-D5 green. T-D1..T-D4 were authored with the engine change in the same commit because T-D1's spy DI requires the engine's setContext seam to exist (one RED-to-GREEN cycle per the plan's "needs engine seams first" note)._

## Files Created/Modified
- `src/slowgram.js` - detection spine: CONFIG selectors/reelsPrefix/health, classifyPathname/detectContext/registerVideo/feedRoot/connectWatcher/disconnectWatcher/batchCallback/healthScan/recover, pollLoop drain, setContext hook, teardown registry reset, `_classifyPathname`/`_registrySize`/`getSelectorHealth` handles
- `test/harness.js` - FakeElement/FakeVideoElement/FakeMutationObserver/FakeLocation, FakeDocument root delegation, module.exports growth
- `test/slowgram.test.js` - freshEnv(opts) extension, T11f/g + T14d-h + T15d/e config locks, T-D1..T-D5, source scans (no timers, no getElementsByClassName, batchCallback body query-free via extractBody, attributeFilter literal, no '.'-prefixed CONFIG selectors)
- `test/fixtures/instagram-shapes.js` - source-tagged SHAPES.loggedOut/loggedIn, sourceTags, verifiedSelectors (created)
- `test/dom-mocks/instagram-mock.js` - buildReelsFeed/buildDialogRoot/buildSocialRoute (created)

## Decisions Made
- classifyPathname direct prefix match instead of the plan's literal `prefix + '/'` (double-slash bug — see deviations).
- teardown() clears the VideoRegistry WeakMap for engine-instance isolation; keep-registry semantics preserved on the disconnect path (D-07).
- Verified on-disk dump remains the loggedOut shape source after the fresh headless capture returned zero videos (documented fallback).
- detectContext() calls `SlowGram.setContext(...)` (property, not bare closure).
- Browser host skips T-D5 gracefully; Node is the deterministic host.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] classifyPathname prefix formula double-slashed**
- **Found during:** Task 1 (Wire detection spine)
- **Issue:** The plan's literal `CONFIG.reelsPrefix + '/'` and `p + '/'` produced `'/reels//'` and `'/direct//'` — matching nothing, and missing `/reels/abc` and `/p/post-id/` (CONFIG prefixes already carry trailing slashes).
- **Fix:** Direct prefix match `pathname.indexOf(CONFIG.reelsPrefix) === 0` / `pathname.indexOf(p) === 0`, with a NOTE comment in the engine. Matches the plan's own TD1b/TD1e expectations and intent.
- **Files modified:** src/slowgram.js
- **Verification:** TD1b/TD1e pass (REELS and direct-message classification).
- **Committed in:** 208922c (Task 1 commit)

**2. [Rule 1 - Bug] detectContext() called bare `setContext()`**
- **Found during:** Task 1 (Wire detection spine)
- **Issue:** The plan's literal `setContext(...)` would throw ReferenceError — `setContext` is a property on the object returned by the engine IIFE, not a closure in detectContext's scope.
- **Fix:** `SlowGram.setContext(...)`.
- **Files modified:** src/slowgram.js
- **Verification:** TD1a passes; init path exercised in TD2.
- **Committed in:** 208922c (Task 1 commit)

**3. [Rule 2 - Missing Critical] teardown() must reset the VideoRegistry for test isolation**
- **Found during:** Task 1 (Wire detection spine)
- **Issue:** T-D3/T-D4 require `_registrySize() === 0` across fresh engine instances; without a registry reset, state would leak between tests and the invariant was untestable.
- **Fix:** teardown() calls `disconnectWatcher()` and resets `videoStates = new WeakMap()` + `registryCount = 0`. D-07 keep-registry is preserved: the disconnect-on-SOCIAL path never clears.
- **Files modified:** src/slowgram.js
- **Verification:** TD3/TD4 pass; TD2b/D-07 keep-registry still passes.
- **Committed in:** 208922c (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 1 bugs, 1 Rule 2 missing critical)
**Impact on plan:** All auto-fixes were necessary for correctness/testability. No scope creep.

## Issues Encountered
- **Real-DOM verification (planned, resolved):** fresh headless capture of `/reels/` produced a page shell with zero videos (819,255 bytes; roles=button,img,link,main; ariaLabels=Comment,Instagram,Like,More,Share) — headless Chrome cannot complete the logged-out feed hydration. Per the plan's documented fallback, the verified on-disk dump (860,727 bytes: roleMain=1, videos=4, blobSrc=4, playsinline=4, roleDialog=0, loop=0, autoplay=0) remains the loggedOut shape source. Divergence noted in the fixture comment (test/fixtures/instagram-shapes.js) and verified selectors spot-checked against the fresh dump (video present, role=main x1, role=dialog x0, no class-based selectors).
- Browser host count (159) < Node host count (183): T-D5's two host-guard branches collapse into a single skip assert on the browser — expected, harness.html untouched.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Detection spine proven end-to-end on both hosts; RouteGuard (02-02) can build `isRedirectPath`/`openRoute` on top of `classifyPathname` + `preservedRoutes`.
- 02-03 (watcher/registry expansion) can extend `batchCallback`/`VideoRegistry` without touching the harness — fakes now produce real mutation records.
- 02-04 (health + demo driver) can consume `instaShapes`/`instaMocks` and `getSelectorHealth`.
- Known constraint to carry forward: the engine makes no `[role=dialog]` DOM queries outside the SelectorRegistry's pre-recorded values, and no class-based selectors — enforced by source scans that later plans must keep green.

---
*Phase: 02-dom-detection-scoping*
*Completed: 2026-08-15*

## Self-Check: PASSED

- FOUND: src/slowgram.js, test/harness.js, test/slowgram.test.js, test/fixtures/instagram-shapes.js, test/dom-mocks/instagram-mock.js
- FOUND: commits 208922cd (Task 1), 063713ad (Task 2)
- Both hosts green at commit time: Node 183 assertions (exit 0), Edge 159/159