---
phase: 02-dom-detection-scoping
plan: 02
subsystem: testing
tags: [dom-detection, routeguard, history-api, popstate, hashchange, decision-table, refresh, never-upgrade, source-scan]

# Dependency graph
requires:
  - phase: 02-dom-detection-scoping (02-01)
    provides: "classifyPathname decision table, ContextDetector, DomWatcher, VideoRegistry, SelectorRegistry health, FakeElement/FakeLocation harness, D-11 attributeFilter"
provides:
  - "Full ContextDetector contract: refresh(source) over all D-13 sources (pathname events, role/attr mutations, rAF batch) + the never-upgrade refineFromDOM gate"
  - "Full RouteGuard contract (D-06): pushState/replaceState wrapping + popstate/hashchange window listeners + the per-frame rAF pathname re-check fallback, with destroy()-restore hygiene"
  - "Exhaustive Pattern 1 decision table coverage (T-D6) and the five-signal navigation matrix (T-D10..T-D14)"
affects: [02-dom-detection-scoping (02-03 watcher/registry expansion, 02-04 health + demo driver), 03-levers]

# Actuals (#2632) — pairs with the plan's estimate (estimateTokens: 28000).
actuals:
  tokens: 7744    # chars/4 over the realized diff (30,977 chars across 3 files, 413 insertions / 14 deletions)
  tasks: 2        # tasks completed
  commits: 3      # 2 task commits + 1 docs commit

# Tech tracking
tech-stack:
  added: []       # zero new packages — hand-rolled fakes on Node 18 assert + harness.html
  patterns:
    - "Single funnel refresh(source): every route/DOM signal (popstate, hashchange, pushState, replaceState, rAF re-check, role mutation) flows through ContextDetector.refresh → setContext; DomWatcher reacts to context change, never to signals directly"
    - "Never-upgrade gate (refineFromDOM): a DOM signal returns 'REELS' only when the pathname classifies REELS — anti-upgrade is the load-bearing behavior"
    - "Pathname-diffed rAF batch refresh: one classifyPathname per frame, diffed against lastPathname so manual setContext suites are never clobbered"
    - "History-API interception with bound originals + teardown restore: wrapper calls orig.apply(h, arguments) first (URL really changes), then re-classifies; unbindRouteGuard restores exactly"
    - "Explicit-dispatch harness: FakeLocation.setPathname is a pure write; tests choose which signal to fire (dispatchPopstate/dispatchHashchange on the window)"

key-files:
  created: []
  modified:
    - src/slowgram.js
    - test/harness.js
    - test/slowgram.test.js

key-decisions:
  - "Task 1 binds the window popstate/hashchange listeners (D-13 source 1, needed by T-D8a) and Task 2 adds the history pushState/replaceState wrapping — the D-06 interception contract is split across the two commits so each is atomic and independently green"
  - "FakeWindow.history updates win.location.pathname for root-relative urls (mirroring real pushState/replaceState semantics) in addition to recording calls — the plan's literal record-only shape would make T-D10/T-D11 assert against a stale pathname"
  - "T-D7 asserts the never-upgrade prohibition structurally: UNKNOWN/SOCIAL never connect an observer, so zero observer instances exist and zero registrations occur after a flush — stronger than the plan's 'record then flush' phrasing, which is impossible on a non-REELS context (no observer to record on)"
  - "The classifyPathname formula stays the direct prefix match fixed in 02-01 (CONFIG prefixes carry trailing slashes; the plan's literal `prefix + '/'` double-slashes) — the plan's own T-D6 edges (/reels → UNKNOWN) match the existing implementation"

patterns-established:
  - "Pattern 1: refresh(source) is the single re-classification entry — the source argument keeps call sites explicit and testable, and is logged nowhere"
  - "Pattern 2: route signals are untrusted inputs (threat model T-02-05/T-02-06): they only ever drive re-classification, never expand scope — enforced by the href-read source scan"
  - "Pattern 3: containment at every signal boundary — onRouteSignalSafe wraps refresh in try/catch (T-01-01); history wrappers call the original FIRST so host navigation errors propagate, then fire the contained signal"

requirements-completed: [DETC-01, DETC-02, DETC-03]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "Decision table exhaustiveness — every Pattern 1 route shape asserts its class: REELS only for /reels/+suffix, SOCIAL for all preserved prefixes + single-segment profiles (trailing slash optional), UNKNOWN fail-safe for home/profile-reels//reel/<id>//bare-keyword/two-segment/empty"
    requirement: DETC-01
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#TD6"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#TD1"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-13 refresh sources — pathname events (popstate), role/attr mutations via the batch, and the rAF batch carrier each re-assert context; mutation can trigger refresh but never changes a pathname-authoritative verdict"
    requirement: DETC-01
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#TD8"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#TD14"
        status: pass
    human_judgment: false
  - id: D3
    description: "Never-upgrade + UNKNOWN never degrades (DETC-03) — a video-rich tree on /someuser/, /, /p/x/ never produces REELS nor a registry entry (no observer ever connects); /reels/ with zero videos stays REELS (empty-tab edge accepted) with health ok"
    requirement: DETC-03
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#TD7"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#TD9"
        status: pass
    human_judgment: false
  - id: D4
    description: "RouteGuard five-signal matrix (D-06) — pushState, replaceState, popstate, hashchange, and the rAF re-check fallback each independently re-assert context on a route flip and back"
    requirement: DETC-02
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#TD10"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#TD11"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#TD12"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#TD13"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#TD14"
        status: pass
    human_judgment: false
  - id: D5
    description: "Preservation trust contract + destroy restore — every preserved route and a profile classifies SOCIAL with the clock paused (elapsedMs unchanged after a minute); destroy() restores history originals, removes window listeners, and re-init rebinds cleanly"
    requirement: DETC-02
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#TD15"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#TD16"
        status: pass
    human_judgment: false
  - id: D6
    description: "Source-scan enforcement — zero timer scheduling APIs, zero window.location.href / location.href reads anywhere (T-02-06 pathname authority), batchCallback body free of DOM queries, attributeFilter locked to the D-11 4-attr set"
    requirement: DETC-02
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#SCAN"
        status: pass
    human_judgment: false

# Metrics
duration: 10min
completed: 2026-08-15
status: complete
---

# Phase 02 Plan 02: ContextDetector + RouteGuard Full Contract Summary

**Complete ContextDetector refresh contract (D-13: pathname events, role/attr mutations, rAF batch, with the never-upgrade refineFromDOM gate) and RouteGuard interception (D-06: pushState/replaceState wrapping + popstate/hashchange + per-frame rAF re-check, destroy-restorable) — green on both Node (264) and headless Edge (239)**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-08-15T13:07:00-03:00
- **Completed:** 2026-08-15T13:17:40-03:00
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Full ContextDetector contract: `refresh(source)` reclassifies through the single `classifyPathname` decision table and pushes via the change-guarded `setContext` bus; all four sources wired — `'pathname'` (init), `'route'` (every navigation signal), `'mutation'` (role-attr in the batch), `'batch'` (per-frame rAF re-check, pathname-diffed).
- Never-upgrade gate: `refineFromDOM()` returns `'REELS'` only when the pathname classifies REELS — a DOM signal confirms but never upgrades a non-reels pathname (Anti-Pattern RESEARCH.md:294, D-02 pathname authority).
- Full RouteGuard contract (D-06): `bindRouteGuard()` wraps `window.history.pushState/replaceState` with bound originals (real navigation first, then re-classification); window `popstate`/`hashchange` listeners funnel through the same contained handler; `unbindRouteGuard()` restores originals on teardown (T-02-05). The rAF batch carrier is the bypass-proof fallback (Pitfall 7) — SPA links/back-forward/WebView navigations that skip pushState are caught within one frame.
- Exhaustive tests: T-D6 covers every Pattern 1 decision-table row (including the no-slash, bare-keyword, two-segment, and empty-string edges); T-D10..T-D14 prove each of the five navigation signals independently; T-D15 ties every preserved route + a profile to the clock-paused trust contract; T-D16 proves destroy()/re-init hygiene.
- Zero new packages; harness.html untouched; all growth in the engine, harness, and test file.

## Task Commits

Each task was committed atomically:

1. **Task 1: ContextDetector full contract — decision table completeness, D-13 refresh sources, never-upgrade rule** - `0cff3bb` (feat)
2. **Task 2: RouteGuard full contract — interception + rAF re-check fallback, re-assert on every navigation signal** - `fc8d92b` (feat)

**Plan metadata:** `docs(02-02): complete ...` (pending docs commit)

## Files Created/Modified
- `src/slowgram.js` - `refresh(source)` + `refineFromDOM()` + `detectContext()` (pathname source); pollLoop pathname-diff `refresh('batch')` before the batch drain; batchCallback role-attr detection → `refresh('mutation')`; `onRouteSignal`/`bindRouteEvents` (window popstate/hashchange, D-13 source 1); `bindRouteGuard()`/`unbindRouteGuard()` (pushState/replaceState wrapping with bound originals); `lastPathname` diff base + `routeGuard` state; init/teardown wiring; header Wave 6 note
- `test/harness.js` - FakeLocation `setPathname` (pure write, explicit-dispatch design documented) + `dispatchPopstate`/`dispatchHashchange` (deliver on the window via `loc._window`); FakeWindow recordable AND pathname-updating `history` (calls + root-relative url handling)
- `test/slowgram.test.js` - freshEnv `_window` wiring; T-D6..T-D9 (decision-table exhaustiveness, never-upgrade ×3 shapes, refresh sources both ways, empty-reels-tab edge); T-D10..T-D16 (five-signal matrix, preserved-route clock-pause loop, destroy restore + re-init); href-read source scan

## Decisions Made
- D-06 interception split across the two task commits: Task 1 binds the popstate/hashchange listeners (required by T-D8a, D-13 source 1), Task 2 adds the history wrapping + unbind — each commit is atomic and independently green.
- FakeWindow.history mirrors real browser semantics (updates `location.pathname` for root-relative urls) so T-D10/T-D11 assert against the post-navigation pathname, exactly as the plan describes.
- T-D7 asserts never-upgrade structurally (zero observer instances on non-REELS — no mutation can be delivered), which is stronger than the plan's record-then-flush phrasing and the only formulation possible without an observer.
- classifyPathname keeps the direct prefix match fixed in 02-01; the plan's Task 1 literal `prefix + '/'` formula double-slashes (already documented in 02-01) and its own T-D6 edges match the existing implementation — no re-litigation.
- Harness dispatch design: `setPathname` never dispatches — tests pick the explicit signal, keeping the signal type under test unambiguous.

## Deviations from Plan

None - plan executed exactly as written. The implementation decisions above (listener/history split across commits, pathname-updating fake history, structural T-D7) are documented choices consistent with the plan's stated intent and acceptance criteria — no deviation rules triggered (no bugs, no missing critical functionality, no blocking issues, no architectural changes).

## Issues Encountered
- None. All suites stayed green across both tasks; the only non-failure output is the expected console.error noise from the D1 malformed-override test.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- ContextDetector and RouteGuard are fully contracted — 02-03 (watcher/registry expansion) extends `batchCallback`/`VideoRegistry` on top of the proven refresh plumbing; the role-attr `refresh('mutation')` hook is already in place for the [role="dialog"] viewer root work.
- 02-04 (health + demo driver) can consume `getSelectorHealth` and the route signals; the RRouteGuard interception means a real SPA navigation demo (pushState) re-asserts preservation deterministically.
- Known constraints to carry forward: refresh sources must keep funneling through `setContext` (never bypass the change-guard); the source scans (no timers, no href reads, batchCallback query-free, D-11 attributeFilter) must stay green; the pathname-diff batch refresh must not be replaced with an unconditional per-frame refresh (it would clobber manual-setContext suites).

---
*Phase: 02-dom-detection-scoping*
*Completed: 2026-08-15*

## Self-Check: PASSED

- FOUND: src/slowgram.js, test/harness.js, test/slowgram.test.js, .planning/phases/02-dom-detection-scoping/02-02-SUMMARY.md
- FOUND: commits 0cff3bb1 (Task 1), fc8d92b (Task 2)
- Both hosts green at commit time: Node 264 assertions (exit 0), Edge 239/239