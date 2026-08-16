---
phase: 04-overlay-polish
plan: 01
subsystem: overlay
tags: [overlay, shadow-dom, overlay-host, d-14, d-12, config-overlay, c-05, ui-spec]
requires:
  - phase: 03-degradation-levers
    provides: "syncPhase phasechange emitter (the overlay's appear trigger), overlayHost D-14 seam var, isOverlayHost batch exclusion, state.phase/context, frozen CONFIG pattern, test-handle precedent (_getWatcherState/_registrySize)"
provides:
  - "CONFIG.overlay (D-8/D-10/D-11): frozen block with unitLabel 'min', zIndex 2147483000, fadeMs 400, and the full UI-SPEC pill geometry/typography/colors — every user-facing overlay value lives here (CORE-05)"
  - "ensureOverlayHost (D-12): lazy shadow-DOM host creation — attachShadow({mode:'open'}), injected <style> from buildOverlayCss (all values concatenated from CONFIG), text node reserved, appended to document.body"
  - "D-14 seam registration at creation: overlayHost = host so isOverlayHost() excludes the subtree from the MutationObserver batch (feedback-loop prevention, fully proven in wave 4)"
  - "overlayShouldShow() predicate core: state.context === 'REELS' && state.phase >= 1 (D-1) — extended by fullscreen clause in wave 3"
  - "overlaySync wired into syncPhase after emit('phasechange') — the single creation point, idempotent (overlayCreated latch)"
  - "SlowGram._overlayState() test handle (precedent: _getWatcherState): hostExists/created/seamRegistered/bodyAppended/opacity/shadowRoot/shouldShow/text/lastMinutes"
  - "test/harness.js additive fakes: FakeDocument.createElement/body/createTextNode/listenerCount, FakeElement.attachShadow → FakeShadowRoot with styleText() — the real construction path runs deterministically on both hosts"
affects: [04-02-counter-data-flow, 04-03-context-fullscreen-gating, 04-04-lifecycle-edges, verify-work]
actuals:
  tokens: 13200
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns:
    - "Lazy creation latch: overlayCreated one-way flag reset only by teardown — repeated syncPhase calls at phase >= 1 never duplicate the host"
    - "CONFIG-built CSS: buildOverlayCss concatenates every value from CONFIG.overlay (position/padding/colors/zIndex/fadeMs); CSS property NAMES are structural (same discipline as Phase 3's style.filter writes)"
    - "D-14 seam at creation: overlayHost assigned inside ensureOverlayHost so the batch filter (isOverlayHost) can exclude the subtree from the very first write"
    - "Graceful degradation: missing attachShadow/createElement logs and returns null — the engine never breaks on a hostile DOM (T-O09)"
key-files:
  created: []
  modified:
    - src/slowgram.js
    - test/harness.js
    - test/slowgram.test.js
key-decisions:
  - "Host creation is gated by the FULL predicate (REELS && phase >= 1), not just phase — a video reaching phase 3 while the user navigated to /direct/ never produces a host (T-O04 gate)"
  - "Teardown resets overlayCreated + overlayHostEl + overlayHost (instance isolation across tests/re-init); full DOM removal lands in wave 4's overlayTeardown"
  - "The host carries pointer-events:none + z-index as inline styles; the pill's full look lives in the shadow <style> — host stays minimal, pill stays encapsulated"
requirements-completed: [OVER-01]
coverage:
  - id: OV-01
    description: "Overlay host exists ONLY on REELS at phase >= 1, created lazily (D-12/D-1) — no host before first degradation, never on SOCIAL/UNKNOWN, registered with the D-14 seam"
    requirement: OVER-01
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#T-O02 lazy creation (no host at 179999ms)"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-O03 host at phase 1, seam-registered, in body"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-O04 predicate REELS gate (shouldShow false on SOCIAL)"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-O07 single host across repeated flushes"
        status: pass
    human_judgment: false
  - id: OV-02
    description: "Shadow DOM pill shell: injected <style> carries position:fixed, pointer-events:none, near-max z-index from CONFIG, and the full UI-SPEC pill look; strictly non-interactive (D-13)"
    requirement: OVER-01
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#T-O05 injected CSS contract (pill look, z-index, fade base)"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-O06 exactly one pointer-events:none, zero pointer-events:auto"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-O10 scan: overlay values appear once, in CONFIG.overlay only"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-O09 containment (hostile createElement never breaks the engine)"
        status: pass
    human_judgment: false
---

# Phase 04 Plan 01: Overlay Spine — Lazy Shadow DOM Host Summary

**Deliver the frozen CONFIG.overlay block, the lazy shadow-DOM host factory, the D-14 seam registration, and the UI-SPEC pill shell — the thinnest end-to-end slice of the Phase 4 overlay, validated in both hosts**

## Performance

- **Duration:** —
- **Started:** 2026-08-15
- **Completed:** 2026-08-15
- **Tasks:** 2
- **Files modified:** 3

## Purpose

Wave 1 tracer. Prove the architectural spine — CONFIG → lazy host creation at first phase ≥ 1 on REELS → shadow pill injection → seam registration — before the data flow (wave 2), context/fullscreen gating (wave 3), and lifecycle edges (wave 4) layered on top. The wave-1 latch, containment, and two-host determinism locked the foundation the rest of the phase builds on.

## Outcome

- **Node host:** 610 assertions green (was 560) — wave-1 T-O suite added
- **Edge headless:** 570 passed — parity holds (Node − NodeOnly scans)
- **Commits:** `fac638b` (feat 04-01)
