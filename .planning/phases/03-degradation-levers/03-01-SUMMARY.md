---
phase: 03-degradation-levers
plan: 01
subsystem: degradation-engine
tags: [degradation-engine, saturation, filter, ancestor-wrapper, d-15, lever, revertall]
requires:
  - phase: 02-dom-detection-scoping
    provides: "VideoRegistry WeakMap per-video state (appliedLevers reservation, loadstart/emptied lifecycle), setContext REELS/SOCIAL/UNKNOWN hooks, syncPhase transition guard, batchCallback, CONFIG.degradationMatrix frozen"
provides:
  - "DegradationEngine hub (LEVR-06): state.phase → CONFIG.degradationMatrix → applicator map with per-video reconcile (apply in-matrix, revert out-of-matrix — de-escalation/reset automatic), REELS-guarded apply, context-agnostic revertAll (LEVR-07)"
  - "Saturation lever (LEVR-01) implementing the D-15 gate: filter on a static non-transformed ancestor wrapper — never the video itself, never transformed elements, bounded at BODY/HTML, static values, plain functions"
  - "CONFIG.leverParams (D-19/D-20): frozen per-phase saturation values (0.85/0.65/0.4) — the only lever-value source (CORE-05)"
  - "registryElements[] pruned live list (D-18): WeakMap non-iterable → iteration for applyAll/revertAll; pruned on batch removedNodes (memory-bounded over long sessions)"
  - "Trust wiring: apply on register-time (mid-phase videos), apply-after-load on loadstart, revert on SOCIAL/UNKNOWN + fatigue reset, re-apply on return to /reels/ (D-16)"
affects: [03-02-lever-appliers, 03-03-autoplay-buffer, 04-overlay-polish, verify-work]
actuals:
  tokens: 18600
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns:
    - "Per-video reconcile: apply every applicator in matrix[phase], revert every applicator out of it — phase 0 (fatigue reset) reverts everything by construction"
    - "Stored filter target + walk exemption: the lever remembers the wrapper it filtered (entry.filterTarget) and exempts it from the isTransformed skip — otherwise OUR OWN saturate write reads as 'transformed' and the next walk climbs to the feed root (the self-reference bug found this plan)"
    - "Stored-target revert: revert writes to entry.filterTarget directly, never re-walks — same self-reference avoidance, plus React-wrapper-replacement safety (re-capture on target change)"
    - "WeakMap-non-iterable companion: registryElements live array pushed on register, pruned on batch removedNodes — iteration without breaking WeakMap GC semantics (T-D31 green)"
    - "All lever values read from CONFIG.leverParams; the engine has zero saturate(0.N) literals (source-scan proven)"
key-files:
  created: []
  modified:
    - src/slowgram.js
    - test/slowgram.test.js
key-decisions:
  - "filterTarget(video, exempt): the D-15 walk exempts the element the lever already applied to — once OUR filter is on the wrapper, isTransformed(wrapper) is true and a plain walk would skip our own target and climb to [role=main] (found live: phase-3 escalation and every revert silently targeted the feed root)"
  - "Revert writes to entry.filterTarget (the stored element), never re-walks — restores exactly the wrapper we filtered; React-wrapper-replacement (Pitfall 7) is handled by re-capturing origFilter when the re-detected target differs"
  - "entry.appliedLevers ends as {} after revert (the lever key is deleted) rather than null — reset/emptied paths that set null explicitly still clear everything; tests assert 'no lever remains applied' rather than a specific object identity"
  - "Test hygiene: resume signals require setVisibility('visible') BEFORE the visibilitychange dispatch (the engine branches on visibilityState, not the event) — TL5/TL17 originally dispatched visible without flipping the state (test bug, not engine bug)"
  - "FakeElement.style reads as undefined for never-written props — 'not applied' assertions use ok(!...) instead of equal('')"
requirements-completed: [LEVR-01, LEVR-06, LEVR-07, LEVR-09]
coverage:
  - id: L1
    description: "Saturation lever (LEVR-01 + D-15 gate): saturate() applied to the first static non-transformed ancestor wrapper of the video — never the video itself, never a transformed element, bounded at BODY/HTML (null → skip); idempotent (same phase no-op); revert restores the captured original"
    requirement: LEVR-01
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#T-L2 end-to-end phase 0→1 apply"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-L8 transformed ancestor skipped"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-L9 bounded walk (null on body)"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-L10 never the video itself"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-L11 original preserved across cycles"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-L4 idempotent applies"
        status: pass
    human_judgment: false
  - id: L2
    description: "DegradationEngine hub (LEVR-06): routes state.phase → CONFIG.degradationMatrix → applicator map; per-video reconcile (apply in-matrix / revert out-of-matrix); applyAll/applyToVideo guard REELS; hooks: phasechange, register-time, loadstart, return-to-REELS, SOCIAL/UNKNOWN revert"
    requirement: LEVR-06
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#T-L2 phasechange drives apply"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-L3 escalation 0.85→0.65→0.4"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-L7 re-apply on return to /reels/"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-L15 register-time apply (mid-phase)"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-L13 apply-after-load"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-L17 multi-video reconcile"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#SCAN applyToVideo zero DOM queries"
        status: pass
    human_judgment: false
  - id: L3
    description: "revertAll() (LEVR-07): restores every live video to native; context-agnostic; used on fatigue reset, SOCIAL/UNKNOWN, destroy; the phase-0 reconcile is the automatic backstop"
    requirement: LEVR-07
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#T-L5 fatigue reset reverts"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-L6 SOCIAL reverts (trust contract)"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-L12 pruning + revertAll scope"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-L18 public handle + no churn"
        status: pass
    human_judgment: false
  - id: L4
    description: "LEVR-09 constraint: degradation never touches scroll or blocks abruptly — the hub/levers write only style.filter on wrappers; no scroll/block APIs anywhere (source scan + design)"
    requirement: LEVR-09
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#SCAN no timers/no class queries (extended)"
        status: pass
    human_judgment: false
duration: 45min
completed: 2026-08-15
status: complete
---

# Phase 03 Plan 01: DegradationEngine Hub + Saturation Lever (D-15 Gate) Summary

**Deliver the DegradationEngine hub (phase → matrix → applicator reconcile, revertAll) and the flagship saturation lever implementing the D-15 ancestor-wrapper gate — the thinnest end-to-end slice of the Phase 3 degradation spine, validated in both hosts**

## Performance

- **Duration:** 45 min
- **Started:** 2026-08-15T17:25:00Z
- **Completed:** 2026-08-15T18:10:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- DegradationEngine hub (LEVR-06): `syncPhase` hooks `applyAll` after emit('phasechange') — one reconcile pass per real transition, never per frame; the per-video reconcile (apply levers in `CONFIG.degradationMatrix[phase]`, revert levers out of it) makes de-escalation and fatigue reset automatic (matrix['0'] is empty)
- Saturation lever (LEVR-01 + D-15): `filterTarget(video, exempt)` walks `parentNode` to the first static non-transformed ancestor — never the video, never a transformed element, bounded at BODY/HTML (null → skip), plain `saturate()` with static per-phase values from CONFIG.leverParams
- CONFIG.leverParams (D-19/D-20): `{ saturation: { '1': 0.85, '2': 0.65, '3': 0.4 } }` frozen — the ONLY lever-value source; the engine has zero hardcoded `saturate(0.N)` literals (source-scan proven)
- revertAll() (LEVR-07) public handle + internal wiring: SOCIAL/UNKNOWN context and fatigue reset restore every wrapper to native; destroy() also reverts (teardown hygiene); re-apply on return to /reels/ re-degrades the surviving registry
- Trust wiring (D-16): apply at register-time (a video appearing mid-phase-2 is degraded immediately), apply-after-load on loadstart (media reset never leaves a video undegraded), emptied clears appliedLevers
- registryElements[] (D-18): the pruned live-element list enables applyAll/revertAll iteration over the non-iterable WeakMap; batch removedNodes pruning keeps it memory-bounded over long sessions; WeakMap semantics unchanged (T-D31 green)
- Both hosts green: Node 425 assertions (up from 359), Edge headless 396 (29 Node-only source-scan asserts — parity contract holds)

## Task Commits

Both tasks land in one feat commit plus the docs commit — the LEVR suite (T-L1..T-L18) is one contiguous block in test/slowgram.test.js and the two tasks' engine work is interleaved (the tracer's wiring and Task 2's edge coverage were implemented as one coherent pass; the plan's 2-task split is preserved for review but not for commit splitting):

1. **Tasks 1+2: DegradationEngine hub + saturation lever** - `feat(03-01): DegradationEngine hub + saturation lever (D-15 ancestor wrapper) + revertAll`
2. **Plan metadata / phase docs** - `docs(03-01): complete Phase 3 plan 01 — summary, state, roadmap, requirements`

## Files Created/Modified
- `src/slowgram.js` - CONFIG.leverParams; module vars `applicators`/`registryElements`; `isTransformed()`, `filterTarget(video, exempt)` (D-15 walk with stored-target exemption); `saturationApp` {key, apply, revert}; `applyToVideo()` (reconcile), `applyAll()`, `revertAll()`, `dropFromRegistry()`; hooks in syncPhase/registerVideo/onLoadStart/onEmptied/setContext/resetSession/teardown/batchCallback(removedNodes); handles `revertAll` (public) + `_liveRegistrySize` (test)
- `test/slowgram.test.js` - T-L1..T-L18 LEVR suite (values, end-to-end, escalation, idempotence, reset/social revert, re-apply, wrapper selection, bounded walk, never-video, original-preserved, pruning, apply-after-load, register-time apply, emptied-clear, multi-video, public handle) + SCAN additions (no saturate literal, applyToVideo zero DOM queries)

## Decisions Made
- **filterTarget exemption (the plan's key fix):** the D-15 walk must not skip the element the lever already filtered — once OUR saturate write is on the wrapper, `isTransformed(wrapper)` is true and a plain walk would climb to `[role=main]`. Found live: phase-3 escalation and every revert silently targeted the feed root (TL3d/TL6c/TL7a failures). Fix: the lever stores `entry.filterTarget` and the walk exempts it; revert writes to the stored target directly.
- Re-capture on target change: if React replaces the wrapper (Pitfall 7), the re-detected target differs from entry.filterTarget → origFilter is re-captured from the NEW wrapper.
- `entry.appliedLevers` is `{}` after revert (key deleted), null only on register/emptied/reset paths that set it explicitly — tests assert "no lever applied" not object identity.
- Test hygiene fixes (test bugs, not engine bugs): resume signals need `setVisibility('visible')` before the dispatch (the engine branches on visibilityState, not the event); FakeElement.style reads undefined for unwritten props → `ok(!...)` assertions.

## Deviations from Plan

None of substance. The plan's T-L14 source scan and the tasks' edge coverage (T-L15..T-L18) were implemented in the same pass as the tracer suite — the 2-task split was preserved in the summary/coverage but not in commit boundaries (one feat commit, one docs commit), matching the 02-04 precedent where contiguous test insertions cannot be split atomically.

## Issues Encountered

- **Self-reference bug (engine, fixed):** the wrapper walk treated our own filter write as "transformed", so the next apply/revert climbed to the feed root. This is exactly the class of silent failure the D-15 gate exists to prevent — the fix (stored target + exemption) is now locked by T-L3d/T-L6c/T-L7a/T-L11.
- **Test bugs (fixed):** missing `setVisibility('visible')` before resume dispatches (TL5/TL17) — the engine's visibility handler branches on `document.visibilityState`, not the event type; `''` vs `undefined` style reads on never-written FakeElement.style.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- 03-02 (Playback + Volume + clamp tables) consumes the hub unchanged: register `applicators.playbackRate`/`applicators.volume` with the same {key, apply, revert} shape and matrix keys 'playbackRate'/'volume' already present in CONFIG.degradationMatrix; the per-video reconcile and appliedLevers lifecycle handle them identically
- The clamp-table spec (LEVR-08) is documented in 03-RESEARCH.md (WebKit 2.0 rate cap, 0.5–4.0 mute range, muted-autoplay volume rules) — 03-02 consumes it as CONFIG.clampTables
- 03-03 (Autoplay loop-block + Buffer) adds 'autoplay' to the matrix and needs `loop`/`ended` handling on FakeVideoElement (STACK.md:40 stub list)
- Phase 5 device gate: on-device iOS pixel check for the ancestor-wrapper filter rendering + computed-style transform detection (D-15 rule 5)

## Self-Check: PASSED
- FOUND: src/slowgram.js, test/slowgram.test.js, 03-01-SUMMARY.md
- FOUND: Node 425 assertions green (exit 0); Edge headless harness.html 396/396; demo.html verdict intact
- FOUND: feat commit (Tasks 1+2) + docs commit

---
*Phase: 03-degradation-levers*
*Completed: 2026-08-15*
