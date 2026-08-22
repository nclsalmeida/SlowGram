# Phase 4: Overlay & Polish - Research

> Consumed by gsd-planner. Answers: "What do I need to know to PLAN this phase well?"

## Summary

Phase 4 renders the product's visible face: a neutral, non-judgmental elapsed-time counter ("12 min") in a translucent dark pill, bottom-left above the caption, Shadow DOM, `pointer-events: none`, z-index above Instagram's click catchers, updated ≤1/s. It is **pure presentation** — it adds zero new capability to the degradation engine; it reflects the existing session/fatigue clock via the bus. All behavior was locked in `04-CONTEXT.md` (16 decisions, D-1..D-16) and the visual contract in `04-UI-SPEC.md` (approved). This research answers the remaining *how*: Shadow DOM construction, the no-timer 1/s update, visibility/context/fullscreen gating wiring, and the `CONFIG.overlay` shape.

## User Constraints

> Copied verbatim from 04-CONTEXT.md `<decisions>` — locked, do not re-ask.

- **D-1:** Counter appears ONLY at `phase >= 1` (after ~3 min grace). Never during innocent early minutes.
- **D-2:** Appear/disappear via CSS opacity fade (~400ms) — no timers.
- **D-3:** First appearance shows the REAL session time (e.g. "3 min"). Never restarts.
- **D-4:** Hides when the tab is hidden; reappears (fade) on return. Aligns with the `REELS && visible` clock gate.
- **D-5:** Minutes only — "12 min". No seconds.
- **D-6:** Bare number + unit — no label prefix.
- **D-7:** Purely factual — NO explanation text about degradation.
- **D-8:** All overlay strings/values in frozen `CONFIG.overlay` (CORE-05), trivially localizable.
- **D-9:** Bottom-left of the viewport, above the caption zone.
- **D-10:** Translucent dark pill (~40% black) + light text.
- **D-11:** Near-max CONFIG-driven z-index (`CONFIG.overlay.zIndex`, e.g. 2147483000).
- **D-12:** Overlay host created LAZILY on first `phase >= 1`; registered with the D-14 `overlayHost` seam.
- **D-13:** No dismissal — strictly non-interactive (`pointer-events: none` everywhere).
- **D-14:** Instant hide (no fade) on SOCIAL/UNKNOWN; fade back in on REELS return.
- **D-15:** Instant hide on fullscreen entry (`webkitDisplayingFullscreen`), fade in on exit. PiP needs no handling.
- **D-16:** `destroy()` removes the overlay host; re-init recreates lazily. Single instance ever.

## Phase Requirements (OVER-01..03)

- **OVER-01:** Neutral elapsed-time counter (no guilt), Shadow DOM, `pointer-events: none`, z-index above Instagram's click catchers, updated ≤1/s.
- **OVER-02:** Overlay hidden on social routes.
- **OVER-03:** Overlay hidden during video fullscreen (`webkitDisplayingFullscreen`).

## Architecture Patterns (from engine + research docs, applied)

### Pattern A: The overlay rides the bus, never the DOM scan
The counter's data source is `emit('elapsed', state.elapsedMs)` (src/slowgram.js:425) — the bus event that has existed since Phase 1. The overlay subscribes and re-renders from the value. It must NOT re-derive elapsed from DOM/state inspection — the engine owns the truth. Phase trigger: `emit('phasechange', next)` (:142). Reset: `emit('reset')` (:483). Context: `emit('contextchange', context)` (:1673).

### Pattern B: No-timer 1/s update (Phase 1 ban)
`setInterval`/`setTimeout` are banned engine-wide (Phase 1, enforced by source scan T-L42). The ≤1/s update constraint (OVER-01) is satisfied by **value-throttling on the rAF/elapsed stream**: re-render only when the displayed value (floored minutes) changes. `emit('elapsed')` fires on accumulation; the overlay updates the text node at most when the minute digit changes — which is inherently ≤1/s. The fade is a CSS `transition` (opacity), not JS timing. **No timer APIs anywhere in the overlay.**

### Pattern C: Gating state is a single predicate
The overlay's visibility is one boolean function of engine state:
`visible := context === 'REELS' && phase >= 1 && document visible && !fullscreen`
- SOCIAL/UNKNOWN → instant hide (no transition) — D-14.
- phase < 1 (including fatigue reset → `emit('reset')`) → fade out — D-2.
- tab hidden (`visibilitychange`) → hide; return → fade in — D-4.
- fullscreen → instant hide; exit → fade in — D-15.

The overlay subscribes to `phasechange`/`reset`/`contextchange`/`elapsed` + `visibilitychange` + fullscreen events. `overlayHost` (the D-14 seam, src/slowgram.js:98) is set when the host is created so the engine's self-mutation filter excludes its subtree.

### Pattern D: Fullscreen detection (OVER-03)
`video.webkitDisplayingFullscreen` is a read-only property on the video element — true while the video is in native iOS/WebKit fullscreen. `document.webkitFullscreenElement` / `document.fullscreenElement` is **not** supported on iOS for this purpose (WebKit bug 149386); the video-element property is the canonical check. Desktop uses `document.fullscreenElement` + `fullscreenchange`. Implementation: check the registered live video(s) — if any is `webkitDisplayingFullscreen === true`, or `document.fullscreenElement` is set — hide. Wire `fullscreenchange`/`webkitfullscreenchange` listeners + poll-free checks at the rAF batch (no extra timers).

### Pattern E: CONFIG.overlay block (CORE-05)
All overlay values live in the frozen `CONFIG` object (CORE-05 — source-scan discipline from Phases 1-3, e.g. T-L14/T-L42a): shape is `CONFIG.overlay = { unitLabel: 'min', zIndex: 2147483000, fadeMs: 400, pill: {...} }`. Frozen with the rest of CONFIG at init; the overlay reads, never mutates.

## Common Pitfalls (verbatim, the anti-patterns to avoid)

- **Timer-based updates** — a `setInterval` in the overlay violates the Phase 1 ban; value-throttle the stream instead (Pattern B). Source scan must stay green (T-L42 pattern).
- **Magic literals** — "min", 400, 2147483000, colors, offsets all belong in `CONFIG.overlay` (CORE-05 / D-8). A literal trips the project's own source-scan discipline.
- **Pointer-events leakage** — the host must carry `pointer-events: none` AND the pill must not re-enable it (D-13). Note: `pointer-events: none` on a parent makes fixed children non-interactive too (Cypress#6675) — here that's exactly the desired outcome, not a bug.
- **z-index with no positioned element** — z-index only applies to positioned elements; the pill is `position: fixed` (verified pattern from research). Near-max value is safe ONLY because the surface is non-interactive.
- **Overlay subtree re-triggering the observer** — the overlay's own DOM mutations must not feed back into the engine's MutationObserver; the `overlayHost` D-14 seam exists for exactly this. Register the host when created (D-12).
- **Stale minute display** — re-render must use the floored session minutes from the bus value; never format from a locally accumulated counter (diverges from the fatigue clock — D-3).

## State of the Art

- **Shadow DOM**: host element with `attachShadow({ mode: 'open' })`, styles injected as a `<style>` inside the shadow root — full encapsulation, immune to Instagram's CSS, zero dependency. Matches OVER-01's explicit Shadow DOM requirement.
- **Non-blocking overlay**: `position: fixed; pointer-events: none; z-index: <near-max>` is the standard "informational HUD" pattern (searchable web consensus; freecodecamp/CSS-Tricks on stacking). Near-max z-index carries no cost precisely because the element never captures input.
- **Fullscreen on iOS**: `video.webkitDisplayingFullscreen` — read-only, true while native fullscreen; `document.webkitFullscreenElement` unsupported on iOS (WebKit bug 149386). OVER-03's specified mechanism is the correct one. [VERIFIED: WebKit bug 149386 + MDN Fullscreen API]

## Runtime State Inventory (Phase 4 additions)

| State | Source | Overlay reaction |
|-------|--------|------------------|
| context | `emit('contextchange')` / `state.context` | instant hide on SOCIAL/UNKNOWN (D-14) |
| phase | `emit('phasechange')` / `emit('reset')` | create+fade in at ≥1; fade out at 0 (D-1/D-2) |
| elapsedMs | `emit('elapsed')` | re-render floor minutes (D-5) |
| visibility | `visibilitychange` | hide/reappear (D-4) |
| fullscreen | `webkitDisplayingFullscreen` / `document.fullscreenElement` | instant hide/ fade in (D-15) |
| destroy/re-init | `destroy()` / `init()` | remove host / recreate lazily (D-16) |

## Validation Architecture

The overlay is behavioral + DOM-state. Validation strategy (nyquist):

1. **Unit (deterministic, harness)**: fake elements + the existing test harness assert the visibility predicate — create at phase 1, absent at phase 0; hide on SOCIAL/UNKNOWN; hide on hidden; fullscreen flag hides; `destroy()` removes; re-init does not duplicate; text = floored minutes + unitLabel; no timer APIs (source scan).
2. **Integration**: `emit('elapsed')` stream drives re-render (throttle-by-value); `overlayHost` registered and excluded from the self-mutation filter (no feedback loop — observer does not re-fire from overlay DOM writes).
3. **Human (visual)**: pill legibility over real video frames and coexistence with Instagram Web chrome — end-of-phase manual checkpoint (user acceptance), matching Phase 1-3 precedent of a two-host smoke (Node + headless Edge).

## Verified Facts (load-bearing numbers)

- `CONFIG.overlay.zIndex` = 2147483000 (near-max; safe because non-interactive) [ASSUMED default — value lives in CONFIG, D-11].
- fade 400ms — CSS `transition: opacity 400ms` (D-2) [ASSUMED within 300-500ms — agent discretion].
- Pill: `left: 16px; bottom: 208px; padding: 8px 12px; border-radius: 8px; background: rgba(12,12,14,0.42); color: #F5F5F7; font-size: 13px; font-weight: 500;` (from 04-UI-SPEC.md). Reconciled 2026-08: this line previously carried the stale draft value `bottom: 16px` — a transcription slip that copied the spacing-scale `lg = 16px` (viewport SIDE distance) into the bottom slot. The approved UI-SPEC fixes `left: 16px; bottom: 208px` (xl — above the Reels profile row), and src/slowgram.js CONFIG.overlay plus test TO01h already implement/assert exactly that.
- The engine's `overlayHost` seam exists at src/slowgram.js:98 — Phase 4 fills it [VERIFIED: src/slowgram.js:98].
- Bus events: `elapsed` (:425), `phasechange` (:142), `reset` (:483), `contextchange` (:1673) [VERIFIED: src/slowgram.js lines cited].
