---
phase: 04-overlay-polish
plan: 02
subsystem: overlay
tags: [overlay, counter, value-throttle, no-timers, bus, c-05, tabular-nums, d-3]
requires:
  - phase: 04-overlay-polish
    provides: "CONFIG.overlay block, ensureOverlayHost (host + shadow + pill), overlayShouldShow predicate core, overlaySync creation point, _overlayState handle"
provides:
  - "Bus-fed counter data flow: overlay subscribes ONCE (module load) to 'elapsed'/'phasechange'/'reset' via SlowGram.on — subscribers preserved across destroy/re-init (teardown contract)"
  - "overlayMinutes(ms): pure floor(ms/60000) — the ONLY place session ms become minutes (D-5, no literal drift)"
  - "Value-throttled re-render (OVER-01 ≤1/s, Pattern B): overlayRender writes the text node only when the floored minute changes — structurally ≤1/s, ZERO timer APIs (Phase 1 ban)"
  - "Real session time at first appearance (D-3): phase 1 at 3:00 renders '3 min', never '0 min'; re-renders from the bus value, never a local accumulator"
  - "Text contract (D-5/D-6/D-7): exactly `{floored} {unitLabel}` — bare number + CONFIG.overlay.unitLabel, no seconds, no label, no explanation"
  - "Reset fade-out (D-2): fatigue reset → opacity 0 via CSS transition + throttle latch cleared + text cleared — never a zeroed counter while hidden"
  - "Typography contract (UI-SPEC): tabular-nums + nowrap + overflow clip + max-width 200px — stable pill width across digit changes (populated/overflow UI-consideration resolutions)"
affects: [04-03-context-fullscreen-gating, 04-04-lifecycle-edges, verify-work]
actuals:
  tokens: 9800
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns:
    - "Value-throttle: compare floored minutes, not time — the write is skipped unless the DISPLAYED value changes, satisfying ≤1/s structurally without any timer"
    - "Ride the bus, never scan the DOM (Pattern A): overlayRender/onOverlayElapsed perform zero querySelector calls (source-scan proven)"
    - "Latch reset on reset: overlayLastMinutes = -1 so a re-entry re-renders even at the same minute value"
    - "Text node created with the host (createTextNode or a minimal text-like fallback) — first overlayRender sets the real value"
key-files:
  created: []
  modified:
    - src/slowgram.js
    - test/harness.js
    - test/slowgram.test.js
key-decisions:
  - "Subscriptions happen at module load, before any init() — the teardown contract preserves subscribers, so the counter survives destroy/re-init without re-subscribing"
  - "The bus 'elapsed' arg is ignored by onOverlayElapsed — it reads state.elapsedMs directly (single source of truth; the arg exists for other consumers)"
  - "Fade-out on reset uses the FADED path (CSS transition on); the INSTANT path is reserved for context/fullscreen (wave 3) — the two hide semantics are distinct functions"
requirements-completed: [OVER-01]
coverage:
  - id: OV-03
    description: "Counter updates ≤1/s with zero timers — value-throttled on the rAF/elapsed stream; no setTimeout/setInterval anywhere (source scan); bus-fed truth (D-3)"
    requirement: OVER-01
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#T-O12 no write within the same minute; update at boundary"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-O13 reset clears latch + text; re-entry re-renders from fresh elapsed"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-O16 throwing elapsed subscriber never breaks the engine"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-O19 scan: no timer APIs, overlay values once in CONFIG"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-O20 scan: overlayRender/onOverlayElapsed zero DOM queries"
        status: pass
    human_judgment: false
  - id: OV-04
    description: "Text = floored minutes + CONFIG.overlay.unitLabel ('N min'), real session time at first appearance, tabular-nums stable-width pill, fade-out on reset"
    requirement: OVER-01
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#T-O11 first text is the real session time (3 min)"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-O14 text shape = floored minutes + CONFIG unit"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-O15 reset fade-out (opacity 0) + text cleared"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-O17 typography contract (tabular-nums, nowrap, max-width)"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-O18 stylesheet byte-identical across text updates"
        status: pass
    human_judgment: false
---

# Phase 04 Plan 02: Counter Data Flow — Value-Throttled ≤1/s Summary

**Deliver the counter's data flow — bus subscriptions, floored-minutes rendering, value-throttling — so the invisible clock becomes the visible "N min" without a single timer API**

## Performance

- **Duration:** —
- **Started:** 2026-08-15
- **Completed:** 2026-08-15
- **Tasks:** 2
- **Files modified:** 3

## Purpose

Wave 2. Prove the data half of OVER-01: the text is a faithful, throttled reflection of the fatigue clock — real session minutes (never a local accumulator), structurally ≤1/s via minute-boundary value-throttling, unit from CONFIG, stable-width pill.

## Outcome

- **Node host:** 642 assertions green (was 610)
- **Edge headless:** 597 passed — parity holds
- **Commits:** `4c8933d` (feat 04-02)
