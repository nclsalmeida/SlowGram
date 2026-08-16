---
phase: 04-overlay-polish
plan: 04
subsystem: overlay
tags: [overlay, visibilitychange, destroy, re-init, d-16, d-4, d-14, feedback-loop, two-host]
requires:
  - phase: 04-overlay-polish
    provides: "CONFIG.overlay, host + pill (wave 1), bus-fed counter (wave 2), context + fullscreen gating (wave 3), overlayShow/overlayHideInstant/overlaySync/overlayShouldShow, fullscreen listeners via lifecycleHandlers"
provides:
  - "Tab-visibility alignment (D-4): onOverlayVisibilityChange — document hidden → instant hide; visible → overlaySync (fade back in, predicate re-evaluated)"
  - "Full destroy lifecycle (D-16): overlayTeardown called from teardown() — removes the host from the DOM entirely, clears overlayCreated/overlayHostEl/overlayHost/overlayText/overlayLastMinutes; re-init recreates a SINGLE host lazily on the next phase >= 1"
  - "Bus subscriptions preserved across destroy/re-init (teardown contract) — the counter re-renders correctly after a destroy→init cycle"
  - "D-14 feedback-loop PROVEN: mutation records whose target is inside the host subtree are skipped by the batch (isOverlayHost) — no re-apply, no registry churn, no observer echo (T-O37/T-O38)"
  - "Listener hygiene: fullscreenchange/webkitfullscreenchange/visibilitychange registered in lifecycleHandlers — exactly the right count per init, zero after destroy (no stacking)"
  - "Phase closure: two-host smoke green — Node 715 / Edge 667 (parity: Node − NodeOnly scans == Edge)"
affects: [verify-work, 05-harness-hardening]
actuals:
  tokens: 9800
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns:
    - "Overlay DOM listeners ride lifecycleHandlers (the engine's existing registry) — teardown removes them, so init/destroy cycles never stack"
    - "The D-14 seam is the ONLY feedback-loop defense — overlay code never touches the mutating flag; isOverlayHost() excludes the whole subtree"
    - "Latch reset in teardown (not in resetSession): fatigue reset keeps the host for fade-out wiring; only a full destroy/re-init clears the creation latch"
    - "destroy() is idempotent — double destroy no-ops (overlayTeardown guards on null refs)"
key-files:
  created: []
  modified:
    - src/slowgram.js
    - test/slowgram.test.js
key-decisions:
  - "overlayTeardown is a dedicated function (not inline teardown code) so the DOM removal + reference clearing is one atomic unit — re-init starts from a provably clean slate"
  - "The visibility listener mirrors the clock gate directly on the document (no new engine event) — hidden → instant hide (a frozen counter is noise), visible → fade back"
  - "T-O39 scan locks the seam to exactly 4 assignment sites (var decl, creation, teardown, test handle) — no third production writer can appear without failing the scan"
requirements-completed: [OVER-01, OVER-02, OVER-03]
coverage:
  - id: OV-07
    description: "Lifecycle edges (OVER-01): hidden tab hides instantly + fade-back on return (D-4); destroy() removes the host and clears the seam; re-init recreates a single instance lazily (D-16); listener hygiene across cycles"
    requirement: OVER-01
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#T-O31 hidden tab instant hide"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-O32 return fades back, time preserved, single host"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-O33 destroy removes host + clears seam"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-O34 re-init recreates single host; counter re-renders"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-O35 destroy at phase 0; double destroy idempotent"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-O36 listener counts per init and after destroy"
        status: pass
    human_judgment: false
  - id: OV-08
    description: "D-14 feedback-loop proof (OVER-01/02/03): overlay DOM writes never re-trigger the MutationObserver — host-subtree records skipped, no registry churn, no lever re-apply, no echo; seam writer scan; two-host smoke parity"
    requirement: OVER-01
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#T-O37 host-subtree mutation skipped by the batch"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-O38 overlay update leaves registry + lever state untouched"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-O39 seam writer scan + no new timers/literals"
        status: pass
      - kind: unit
        ref: "harness.html two-host smoke — Node 715 / Edge 667"
        status: pass
    human_judgment: false
---

# Phase 04 Plan 04: Lifecycle Edges — Visibility, Destroy/Re-init, D-14 Proof Summary

**Deliver the end-state guarantees — tab-visibility alignment, clean destroy/re-init, and the proven D-14 feedback-loop exclusion — and close the phase with the two-host smoke**

## Performance

- **Duration:** —
- **Started:** 2026-08-15
- **Completed:** 2026-08-15
- **Tasks:** 2
- **Files modified:** 2

## Purpose

Wave 4. Prove the overlay never lingers in a background tab, never survives teardown, never duplicates on re-init, and never talks back to the engine that hosts it (the D-14 seam proven with real mutation records — no re-apply, no observer echo).

## Outcome

- **Node host:** 715 assertions green (was 683)
- **Edge headless:** 667 passed — parity holds
- **Commits:** `54c0437` (feat 04-04)
