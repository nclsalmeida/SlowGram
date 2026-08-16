---
phase: 03-degradation-levers
plan: 03
subsystem: degradation-engine
tags: [autoplay, loop-block, stop-point, buffer, levr-04, levr-05]
requires:
  - phase: 03-degradation-levers
    provides: "03-02 Playback + Volume levers, clamp tables, FakeVideoElement media stubs (loop/paused/play/pause/ended), freshEnv platform passthrough, the T15-locked matrix with the 'autoplay' key at phase 3"
provides:
  - "Autoplay lever (LEVR-04): at phase 3 REMOVES the loop attribute via removeAttribute('loop') (NEVER loop=\"false\" — a present attribute keeps looping, T-03-10), captures origHadLoop (first touch only), restores PRESENCE via setAttribute('loop','') on revert; an ended listener bound once per element (entry._bound block, T-D27 discipline) pauses the video while the lever is applied = the stop point"
  - "Buffer capstone (LEVR-05): CONFIG.buffer { enabled: false, stallFrames: 2 } frozen (D-27) — OFF by default; frame-counted sub-200ms stall (~33ms) on the rAF carrier (processStalls inside processBatch, no timers); standalone applicator-shaped helper driven ONLY from onEnded at the autoplay stop point (NOT matrix-driven — T15 lock + the reconcile revert loop would cancel it); revertAll cancels pending stalls (a cancelled stall never resumes later)"
  - "Test handles/wiring: SlowGram._setBufferEnabled (precedent _setDevMode); init reseeds bufferEnabled from CONFIG (a flipped flag does not survive re-init); removeAttribute added to FakeElement (the lever's write surface)"
affects: [03-04-closure, 04-overlay-polish, verify-work]
actuals:
  tokens: 14000
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns:
    - "Remove-don't-false: loop blocking removes the attribute (removeAttribute) — the only reversible, honest write; loop=\"false\" is a no-op trap because attribute PRESENCE is what loops"
    - "Stop point: the ended listener acts only while appliedLevers.autoplay holds — the pause is a phase-gated behavior, never a global media override (T-03-11)"
    - "Frame-counted stall: the buffer hold decrements per rAF batch on the existing poll loop — the Phase 1 timer ban stays intact (timer scan green)"
    - "Standalone capstone: the buffer is applicator-SHAPED but never matrix-ROUTED — the reconcile revert loop would cancel a matrix-driven stall; a dedicated onEnded gate keeps it stop-point-only"
key-files:
  created: []
  modified:
    - src/slowgram.js
    - test/harness.js
    - test/slowgram.test.js
key-decisions:
  - "Autoplay contract (D-25): removeAttribute('loop') at phase 3 (matrix key 'autoplay'), origHadLoop captured first-touch, revert restores presence only; ended pauses gated on appliedLevers.autoplay"
  - "Buffer contract (D-26): the buffer is a standalone applicator-shaped helper driven from onEnded at the stop point — NOT in the applicators map, so the T15 matrix lock and the reconcile revert loop never cancel it"
  - "Buffer defaults (D-27): CONFIG.buffer { enabled: false, stallFrames: 2 } frozen; a module var seeded at init from CONFIG with a _setBufferEnabled test handle (precedent _setDevMode); production never stalls"
requirements-completed: [LEVR-04, LEVR-05]
coverage:
  - id: L8
    description: "Autoplay lever (LEVR-04): the loop attribute is REMOVED at phase 3 (removeAttribute, never loop=\"false\") and restored on revert; an ended video pauses at the stop point while the lever is applied; a no-loop video (loggedOut shape) still arms the stop point without touching any attribute"
    requirement: LEVR-04
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#T-L34 loop removed end-to-end (getAttribute null)"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-L35 ended pauses (stop point)"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-L36 SOCIAL revert restores loop"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-L37 no-loop video arms stop point, no attribute touched"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-L38 below phase 3 the matrix gate holds"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#SCAN no loop=false write (T-L42a)"
        status: pass
    human_judgment: false
  - id: L9
    description: "Buffer capstone (LEVR-05): gated behind CONFIG.buffer.enabled (default false), stalls sub-200ms (stallFrames 2 ≈ 33ms) via frame counting on the rAF carrier — no timers; applicable ONLY at the phase-3 autoplay stop point; revertAll cancels pending stalls"
    requirement: LEVR-05
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#T-L33 CONFIG.buffer frozen, off by default, stallFrames 2"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-L39 buffer OFF — no stall resume"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-L40 buffer ON — flush 1 stalled, flush 2 resumed (frame-counted)"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-L41 never outside the stop point (play never called at phase 2)"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#SCAN stallFrames literal only in CONFIG (T-L42b)"
        status: pass
    human_judgment: false
duration: 45min
completed: 2026-08-15
status: complete
---

# Phase 03 Plan 03: Autoplay Stop Point + Gated Buffer Capstone Summary

**Deliver the Autoplay lever (loop-removal + pause-on-ended = the stop point) and the flagged Buffer capstone — the last two levers of the five-lever matrix, proving the stop point works end-to-end and the gated hiccup stays off by default and behaves when flipped** — validated in both hosts.

## Performance

- **Duration:** 45 min
- **Started:** 2026-08-15T19:10:00Z
- **Completed:** 2026-08-15T19:55:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Autoplay lever (LEVR-04): at phase 3 the loop attribute is REMOVED (`removeAttribute('loop')` — never `loop="false"`, a no-op trap because attribute presence is what loops); `origHadLoop` captured first-touch; revert restores PRESENCE via `setAttribute('loop', '')`. The ended listener binds once per element inside the existing `entry._bound` block (loadstart/emptied siblings — T-D27 counts stay green) and pauses the video only while `appliedLevers.autoplay` holds = the stop point. Matrix key 'autoplay' routes it at phase 3 and the reconcile reverts it below (T-L38).
- Buffer capstone (LEVR-05): frozen `CONFIG.buffer { enabled: false, stallFrames: 2 }` (D-27) — production never stalls. The stall is frame-counted on the rAF carrier (`processStalls()` inside `processBatch`, decrement → 0 → `v.play()`), never a timer (the Phase 1 timer scan stays green). It is a standalone applicator-shaped helper driven ONLY from `onEnded` at the stop point (D-26) — NOT in the applicators map, so the T15 matrix lock and the reconcile revert loop cannot cancel it. `revertAll()` clears pending stalls so a cancelled stall never resumes a video later (social/reset cleanliness). `SlowGram._setBufferEnabled` test handle (precedent `_setDevMode`); init reseeds the flag from CONFIG.
- Harness: `removeAttribute` added to FakeElement (the lever's write surface — additive, everything else untouched).
- Two-host smoke: Node 509 assertions (up from 485), Edge headless harness.html 475/475 (34 Node-only source-scan asserts — parity contract holds); demo.html unaffected.

## Task Commits

Both tasks land in one feat commit plus the docs commit (the LEVR suite is one contiguous test insertion and the two tasks' engine work interleaves — the 03-01/02-04/03-02 precedent):

1. **Tasks 1+2: Autoplay stop point + gated Buffer capstone** - `feat(03-03): Autoplay loop-block + gated Buffer capstone (LEVR-04/05)`
2. **Plan metadata / phase docs** - `docs(03-03): complete Phase 3 plan 03 — summary, state, roadmap, requirements`

## Files Created/Modified
- `src/slowgram.js` - `CONFIG.buffer`; module `bufferEnabled` + init seeding; `onEnded` (stop point + stall start); `autoplayApp` (apply/revert); `bufferApp` (apply/revert, standalone); `processStalls()`; processBatch tail call; revertAll stall-clearing; `SlowGram._setBufferEnabled`; ended listener in the `_bound` block
- `test/harness.js` - FakeElement `removeAttribute`
- `test/slowgram.test.js` - T-L33..T-L41 (LEVR 03-03 suite) + SCAN additions (no loop=false write, stallFrames literal count)

## Decisions Made
- Autoplay contract (D-25): removeAttribute-only, origHadLoop restore, phase-gated ended pause.
- Buffer standalone (D-26): applicator-shaped but never matrix-driven — the reconcile revert loop would cancel it.
- Buffer defaults (D-27): CONFIG.buffer enabled false / stallFrames 2, frozen; module flag seeded at init, `_setBufferEnabled` test handle.

## Deviations from Plan

None - plan executed exactly as written (first run green: 509/509 on the Node host, including the new suite).

## Issues Encountered

None - the LEVR 03-03 suite passed on first run; the only harness gap was the missing FakeElement `removeAttribute` (additive stub, no engine change).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The five-lever matrix is COMPLETE: saturation + playbackRate + volume + autoplay (stop point) + gated buffer, all reconciled by the 03-01 hub. Phase 3 needs only the 03-04 closure plan (integration edge cases + final two-host smoke).
- The stop point is proven end-to-end (T-L34/T-L35/T-L36); the buffer gate by T-L39/T-L40/T-L41; source scans by T-L42.
- Phase 4 (Overlay & Polish) consumes the unchanged engine — the neutral elapsed-time counter rides `emit('elapsed')` which has been on the bus since Phase 1.

## Self-Check: PASSED
- FOUND: src/slowgram.js, test/harness.js, test/slowgram.test.js, 03-03-SUMMARY.md
- FOUND: Node 509 assertions green (exit 0); Edge headless harness.html 475/475
- FOUND: feat commit (Tasks 1+2) + docs commit

---
*Phase: 03-degradation-levers*
*Completed: 2026-08-15*
