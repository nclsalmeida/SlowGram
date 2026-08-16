---
phase: 02-dom-detection-scoping
plan: 04
subsystem: dom-detection
tags: [selector-registry, health-check, drift, demo, browser-smoke, detc-06, detc-07]
requires:
  - phase: 02-dom-detection-scoping
    provides: "02-03 DomWatcher two-root observer + VideoRegistry full contract (healthScan accounting + getSelectorHealth, processBatch batch carrier, connect-on-REELS lifecycle)"
provides:
  - "Full SelectorRegistry health contract (DETC-06): drift declared at exactly N=5 zero-hit scans per rAF batch (D-09, no timer), drift-declared/drift-recovered 'selectorHealth' bus events agreeing with getSelectorHealth() (D-10), D-08 dev/prod split (_setDevMode fail-loud console.warn vs fail-soft bounded fallbackScope on /reels/ only)"
  - "demo.html DETC-07 deliverable: deterministic detection demo (five-script load order, live verdict panel, route-flip to /direct/ showing SOCIAL + observer disconnect)"
  - "Phase 2 closed: all 8 DETC requirements implemented and verified in both hosts (Node 359 assertions, Edge headless 332)"
affects: [03-degradation-levers, 04-overlay-polish, verify-work]
actuals:
  tokens: 15400
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns:
    - "Transition-guarded health events: drift/ok emitted exactly once per episode via the !health.drifted gate and recover() — repeated scans with no state change emit nothing (bus discipline, Pattern 3)"
    - "Function-level scope fallback (D-08): while drifted, processBatch swaps the scope SOURCE to fallbackScope() (document-scoped <video> on /reels/ only) and keeps the registration path (batchCallback) — bounded by construction, never body-wide"
    - "CONFIG-driven warn message: the drift console.warn names CONFIG.health.driftThreshold — no magic literal 5 in module bodies (T-D38)"
    - "Fresh-engine health per init: teardown resets health so each re-init behaves as a brand-new engine (extends the established destroy/re-init contract)"
    - "Per-batch scan without an observer: the rAF batch carrier runs on REELS regardless of observer presence — the drift path stays loud even when the anchor is missing (no roots → no observer)"
key-files:
  created:
    - demo.html
  modified:
    - src/slowgram.js
    - test/slowgram.test.js
key-decisions:
  - "Relaxed the pollLoop batch condition from `context === 'REELS' && watcher.observer` to `context === 'REELS'`: the health scan must run per rAF batch even when the [role=main] anchor is missing — with no anchor, connectWatcher finds zero roots and never creates an observer, so the old condition would silence the entire drift path (T-D33 requires healthScan on every flush of an anchor-less tree)"
  - "health is reset in teardown() alongside state/videoStates/lastPathname: per-engine-instance health is required now that the batch runs without an observer — Phase 1 suites flush REELS frames with no DOM, and stale missStreak across freshEnv() re-inits would falsely declare drift in unrelated tests (extends the documented init-resets-accumulation-state contract)"
  - "The drift console.warn message reads the threshold from CONFIG ('feed anchor missing for ' + driftThreshold + ' scans') instead of the plan's literal '5 scans' — keeps the no-magic-literal rule (T-D38) while preserving the plan's message shape"
  - "Drift fallback wires at the processBatch level: when drifted, the scope source swaps to fallbackScope() results (synthesized childList records fed through the same batchCallback) — the registration path and D-14 filters stay untouched"
requirements-completed: [DETC-06, DETC-07]
coverage:
  - id: D6
    description: "SelectorRegistry health full contract — drift declared at exactly the 5th consecutive zero-hit scan (CONFIG.health.driftThreshold, counted per rAF batch, never on a timer); drift-declared and drift-recovered 'selectorHealth' events agree with getSelectorHealth(); dev mode warns once per episode via _setDevMode; prod mode fails soft through the bounded document-scoped <video> fallbackScope on /reels/ only"
    requirement: DETC-06
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#T-D32 no class selectors (runtime + source scan)"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-D33 drift declared at N=5 + event once"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-D34 drift recovered + ok event once"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-D35 fail-loud dev warn once, prod never warns"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-D36 fail-soft prod fallback bounded to /reels/"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-D37 healthScan call sites live only in processBatch (source scan)"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-D38 driftThreshold locked in CONFIG"
        status: pass
    human_judgment: false
  - id: D7
    description: "demo.html deterministic detection demo — five-script load order (engine → harness → fixtures → mocks → inline driver), live verdict panel (Context / Registered videos / Selector health / Drift threshold read from the engine), route-flip to /direct/ showing SOCIAL + observer disconnect + registry retention; Edge headless dump renders Context: REELS"
    requirement: DETC-07
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#T-D39 demo.html script order (Node)"
        status: pass
      - kind: smoke
        ref: "Edge headless --dump-dom demo.html → verdict div 'Context: REELS / Registered videos: 1 / Selector health: ok'"
        status: pass
    human_judgment: false
duration: 40min
completed: 2026-08-15
status: complete
---

# Phase 02 Plan 04: SelectorRegistry Health + demo.html + Final Two-Host Smoke Summary

**Complete the SelectorRegistry health contract (N=5 drift, selectorHealth events, fail-loud dev / fail-soft prod bounded fallback) and ship demo.html (DETC-07), closing Phase 2 with the full two-host smoke (Node + Edge headless)**

## Performance

- **Duration:** 40 min
- **Started:** 2026-08-15T16:40:00Z
- **Completed:** 2026-08-15T17:20:00Z
- **Tasks:** 2
- **Files modified:** 3 (2 modified, 1 created)

## Accomplishments
- SelectorRegistry health is now the full D-09/D-10 contract: drift declares at exactly the 5th consecutive zero-hit scan (per rAF batch — healthScan rides processBatch, the no-timer batch carrier, proven by T-D37's call-site scan), and the transition-guarded 'selectorHealth' event fires exactly once per drift episode and once on recovery, each carrying the auditable pathname; getSelectorHealth() reads the same closure health object (single source of truth)
- D-08 dev/prod split: `_setDevMode(true)` (fail-loud) console.warn's the engine-branded drift message once per episode with the threshold read from CONFIG; prod (default, fail-soft) never warns and instead swaps the registration scope to `fallbackScope()` — document-scoped `<video>` ONLY while the pathname says /reels/, never body-wide, never on other routes (T-02-14 bounded)
- The per-batch scan now runs on REELS even without an observer: with the anchor missing, connectWatcher creates no roots and no observer, so the batch carrier had to run regardless — the drift path stays loud instead of silently dying (this is what makes T-D33's anchor-less drift test meaningful)
- Health state is reset in teardown() so every freshEnv() re-init is a brand-new engine instance — the relaxed batch condition would otherwise let Phase 1 no-DOM suites accumulate stale missStreak across tests
- demo.html (DETC-07): deterministic detection demo at the project root with the documented five-script load order, an Instagram-shaped loggedIn feed + dialog built from the fixtures/mocks, a live verdict panel read from the engine (Context / Registered videos / Selector health / Drift threshold), and a route-flip button simulating /direct/ (context → SOCIAL, observer disconnects, registry retained)
- Both hosts green: Node 359 assertions, Edge headless 332 (the 27-assert gap is the Node-only source-scan suite — the established dual-host parity contract; 02-03 was 326/300)

## Task Commits

Both tasks land in one feat commit plus the docs commit — the T-D32..T-D39 test block is a single contiguous insertion in test/slowgram.test.js that cannot be split atomically while keeping each commit green (T-D39 asserts demo.html, which lives with Task 2):

1. **Tasks 1+2: SelectorRegistry health + demo.html** - `feat(02-04): SelectorRegistry health contract + demo.html detection demo (DETC-06/07)`
2. **Plan metadata / phase docs** - `docs(02-04): complete Phase 2 — summary, state, roadmap, requirements`

## Files Created/Modified
- `src/slowgram.js` - `dev` module flag; full `healthScan()` (hit/miss accounting + transition-guarded drift declaration + event emission + dev warn); `recover()` now emits the ok event; `fallbackScope()` bounded document-scoped <video>; `processBatch()` drift branch (scope source swaps to fallbackScope while drifted); `pollLoop` batch condition relaxed to `context === 'REELS'`; teardown health reset; `_setDevMode` handle; getSelectorHealth doc updated
- `test/slowgram.test.js` - T-D32..T-D39 (health contract suite + demo deliverable guard) + `extractFunction` source-scan helper
- `demo.html` - new DETC-07 deliverable (five-script order, verdict panel, route-flip button, containment error handlers)

## Decisions Made
- Relaxed the pollLoop batch condition to run on REELS regardless of observer presence — without the [role=main] anchor, connectWatcher has zero roots and never creates an observer, so the old `&& watcher.observer` gate would have silenced the entire drift path (the anchor-missing case is exactly when health matters)
- Reset health in teardown() — per-engine-instance health is now load-bearing because the batch runs without an observer; Phase 1 suites flush REELS frames against a DOM-less FakeDocument (missStreak++ per flush), and without the reset stale misses would cross freshEnv() boundaries and falsely declare drift
- The dev warn message names the CONFIG threshold rather than a literal '5 scans' — preserves the plan's message shape while honoring the no-magic-literal rule (T-D38)
- Drift fallback stays at the registration-path level: fallbackScope() results are synthesized into childList records and fed through the same batchCallback, so the D-14 self-mutation/overlay filters and idempotent register are untouched

## Deviations from Plan
- The `console.warn` message text reads the threshold from CONFIG instead of the plan's literal 'feed anchor missing for 5 scans' — same message shape, no magic literal (documented decision)
- demo.html builds the feed shape by merging the loggedIn fixture evidence (loop/autoplay/dialog) with the live-dump video count (4), because `SHAPES.loggedIn` carries no `videos` field and `buildReelsFeed` defaults to 0 children — the plan's parenthetical '(role=main + videos with loop)' intent is honored

## Issues Encountered
- The Freebuff HTML preview server serves only the registered single HTML file (sibling scripts 404), so demo.html cannot run inside the preview tab; the browser-host verification therefore used Edge headless `--dump-dom` under `file://` (the same context the Phase 1/2 smokes use) — rendered verdict confirmed. Not a demo bug; a preview-hosting limitation
- The `DEMO ERROR:` grep hits in the headless dump are the literal strings inside the inline script source, not rendered errors — confirmed by extracting only the `#verdict` div content (clean REELS verdict)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 3 (Degradation Levers) can consume the health contract directly: `getSelectorHealth()` + the 'selectorHealth' event (D-10) give levers a loud drift signal, `fallbackScope()` is the bounded prod fallback, and the relaxed per-batch carrier keeps health scans running every frame on REELS
- The `appliedLevers` per-video registry field (null today) is the Phase 3 write target; `_setMutatingForTest`/`_setOverlayHostForTest` already give Phase 3 suites control over the D-14 feedback-loop filter
- DETC-07's demo.html proves the full spine (classify → observe → register → health → route-flip) in a plain browser — Phase 4's overlay can extend the same demo page

## Self-Check: PASSED
- FOUND: src/slowgram.js, test/slowgram.test.js, demo.html, 02-04-SUMMARY.md
- FOUND: Node 359 assertions green (exit 0); Edge headless harness.html 332/332; Edge headless demo.html verdict 'Context: REELS'
- FOUND: feat commit (Tasks 1+2) + docs commit

---
*Phase: 02-dom-detection-scoping*
*Completed: 2026-08-15*
