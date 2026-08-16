---
phase: 04-overlay-polish
plan: 03
subsystem: overlay
tags: [overlay, trust-contract, contextchange, fullscreen, webkitdisplayingfullscreen, over-02, over-03, d-14, d-15]
requires:
  - phase: 04-overlay-polish
    provides: "CONFIG.overlay, host + pill (wave 1), bus subscriptions + value-throttled render (wave 2), overlayShouldShow predicate, overlayShow/overlayHideFade"
provides:
  - "Instant hide on SOCIAL/UNKNOWN (D-14/OVER-02): onOverlayContext — contextchange → overlayHideInstant() (transition disabled for the write, restored after) so the counter never lingers even one frame on a social route"
  - "Fade-back on REELS return (D-14): contextchange REELS → overlayShow + overlayRender — phase/time preserved, same single host, no time jump"
  - "Fullscreen gating (D-15/OVER-03): overlayIsFullscreen() — document.fullscreenElement/webkitFullscreenElement OR any live registered video with webkitDisplayingFullscreen === true (canonical iOS check, WebKit bug 149386)"
  - "Poll-free, timer-free detection: fullscreenchange/webkitfullscreenchange listeners registered in lifecycleHandlers (removed by teardown — no stacking) + the rAF/elapsed carrier re-checks the predicate (catches WebView event misses, entry hides / exit shows)"
  - "Fullscreen exit path via overlaySync — creates the host if the predicate was false during fullscreen (never created while fullscreen), renders, fades in"
  - "PiP needs NO handling: the PiP window is a separate DOM; zero PiP code, zero extra listeners (T-O29)"
affects: [04-04-lifecycle-edges, verify-work]
actuals:
  tokens: 9200
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns:
    - "Instant vs faded hide are distinct functions: overlayHideInstant() disables the CSS transition for the write then restores it; overlayHideFade() leaves the transition on — context/fullscreen use instant, phase-drop/reset use fade"
    - "Fullscreen predicate is a pure state read over the registry — checked on the carrier and the event, never a polling loop"
    - "Fullscreen listeners go through lifecycleHandlers so teardown removes them — exactly one pair per init (T-O29/T-O36)"
    - "Host creation remains predicate-gated: while fullscreen at first phase >= 1 no host is created; the exit path's overlaySync creates it (stronger than create-hidden)"
key-files:
  created: []
  modified:
    - src/slowgram.js
    - test/slowgram.test.js
key-decisions:
  - "The fullscreen clause lives INSIDE overlayShouldShow (single boolean) — creation, re-show, and render all re-evaluate one predicate"
  - "document.fullscreenElement is checked FIRST (cheap), then the registry walk — the walk iterates the pruned live list (bounded, same list Phase 3 uses)"
  - "onOverlayFullscreenChange exit uses overlaySync (create-if-needed) rather than overlayShow — covers the fullscreen-at-first-phase case where no host exists yet"
requirements-completed: [OVER-02, OVER-03]
coverage:
  - id: OV-05
    description: "Overlay hidden on social routes (OVER-02) — instant hide (no fade) on SOCIAL/UNKNOWN contextchange, never on preservedRoutes, fade-back on REELS return with time preserved"
    requirement: OVER-02
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#T-O21 instant hide on SOCIAL (opacity 0, transition disabled)"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-O22 every preservedRoute hides an existing host"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-O23 UNKNOWN never shows; hides instantly on change"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-O24 REELS return fades back, time preserved, single host"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-O25 throwing contextchange subscriber contained"
        status: pass
    human_judgment: false
  - id: OV-06
    description: "Overlay hidden during video fullscreen (OVER-03) — webkitDisplayingFullscreen or document.fullscreenElement hides instantly; exit fades back with time preserved; poll-free/timer-free; PiP needs nothing"
    requirement: OVER-03
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#T-O26 webkitDisplayingFullscreen instant hide via carrier"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-O27 document.fullscreenElement gates creation; exit creates + shows"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-O28 exit fullscreen fades back, time preserved, single host"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-O29 exactly one fullscreen listener pair per init (PiP no-op)"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-O30 scan: no timers; overlayIsFullscreen zero DOM queries"
        status: pass
    human_judgment: false
---

# Phase 04 Plan 03: Trust Gates — Social + Fullscreen Hiding Summary

**Deliver OVER-02 (hidden on social routes) and OVER-03 (hidden during fullscreen) — instant-hide semantics, poll-free detection, fade-back on return**

## Performance

- **Duration:** —
- **Started:** 2026-08-15
- **Completed:** 2026-08-15
- **Tasks:** 2
- **Files modified:** 2

## Purpose

Wave 3. Prove the two hiding requirements that make the overlay trustworthy: the "never on social" promise from Phase 2 (instant hide, no lingering frame) and the immersive-fullscreen cleanliness from OVER-03 (webkitDisplayingFullscreen / document.fullscreenElement, instant on entry, fade on exit). PiP needs no handling.

## Outcome

- **Node host:** 683 assertions green (was 642)
- **Edge headless:** 637 passed — parity holds
- **Commits:** `0946046` (feat 04-03)
