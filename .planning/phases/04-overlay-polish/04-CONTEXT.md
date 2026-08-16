# Phase 4: Overlay & Polish - Context

**Gathered:** 2026-08-15
**Status:** Ready for planning

<domain>
## Phase Boundary

The visible face of the product: a neutral, non-judgmental elapsed-time counter overlay that answers "why does the feed look/sound off?" — without guilt, without blocking taps, never on social routes, never in fullscreen. Delivered as engine-injected vanilla JS in a Shadow DOM, `pointer-events: none`, z-index above Instagram's click catchers, updated ≤1/s. It is a pure reflection of the existing session/fatigue clock — it adds no new capability to the degradation engine, only visibility.

</domain>

<decisions>
## Implementation Decisions

### Show/Hide Timing
- **D-1:** The counter appears ONLY when degradation is active (`phase >= 1`, after the ~3 min grace period). Never shown during the innocent early minutes — the "no anxiety / no frustration in the first minutes" core value. (reversible — changing the trigger later is a small edit)
- **D-2:** Appear and disappear via a CSS opacity fade (~400ms) — no timers, the transition rides the style write.
- **D-3:** At first appearance the counter shows the REAL session time (e.g. "3 min" at phase 1) — it is an elapsed-time counter and must stay aligned with the fatigue clock; it never restarts.
- **D-4:** When the document/tab is hidden (`visibilitychange`), the overlay hides; it reappears (fade) when the tab is visible again. Aligns overlay presence with the same `REELS && visible` gate the clock already uses.

### Counter Format & Tone
- **D-5:** Display is minutes only — "12 min". No seconds, no mm:ss. A rough number is softer and less stopwatch-like.
- **D-6:** Bare number + unit — no label prefix, no tooltip (impossible anyway: `pointer-events: none`). Minimal chrome, most neutral rendering.
- **D-7:** Purely factual time — NO explanation text about degradation ("o feed fica mais leve" etc.). The visible time beside the visible degradation is the implied answer; any explanation risks the guilt framing the product avoids.
- **D-8:** All overlay strings/values live in a frozen `CONFIG.overlay` block (e.g. `unitLabel: 'min'`) — CORE-05 no-magic-literals discipline, trivially localizable. (reversible — additive block in frozen CONFIG before ship)

### Placement & Visuals
- **D-9:** Position: bottom-left of the viewport, above the caption zone — opposite the action rail, far from the top chrome (back button / ellipsis).
- **D-10:** Translucent dark pill (small rounded background ~40% black) + light text — legible over any video frame.
- **D-11:** z-index near-max, CONFIG-driven (`CONFIG.overlay.zIndex`, e.g. 2147483000) — "above Instagram's click catchers" (OVER-01); `pointer-events: none` makes top-of-stack interaction-free.
- **D-12:** The overlay host is created LAZILY on first degradation (first `phase >= 1`) — nothing inert in the DOM before that; registered with the D-14 `overlayHost` seam.

### Dismissal & Edge Cases
- **D-13:** No dismissal — strictly non-interactive (`pointer-events: none` everywhere). The counter leaves on its own: phase drop / fatigue reset, SOCIAL/UNKNOWN, tab hidden, fullscreen. A dismiss affordance would break the neutral "invisible hand" character.
- **D-14:** Instant hide (no fade) on SOCIAL/UNKNOWN context change — the counter must never linger on a social route (trust contract); fades back in on REELS return.
- **D-15:** Instant hide on fullscreen entry (`webkitDisplayingFullscreen`), fade in on exit (OVER-03). Picture-in-Picture needs no handling — the PiP window is a separate DOM the page can't render into.
- **D-16:** `destroy()` removes the overlay host from the DOM entirely; a later `init()` recreates it lazily on the next `phase >= 1`. Single instance ever, no dead nodes after teardown (matches the Phase 1 destroy contract).

### Agent's Discretion
- Exact fade duration within ~300–500ms, pill padding/typography/size, `position: fixed` anchoring details, CONFIG.overlay block shape, and the ≤1/s update mechanism (throttle the rAF/`emit('elapsed')` stream — must respect the no-timers ban). No "you decide" items were left open by the user.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase / Requirements Definition
- `.planning/ROADMAP.md` §Phase 4 — goal, success criteria, OVER requirements
- `.planning/REQUIREMENTS.md` §Overlay & Polish (OVER) — OVER-01..03 requirement texts (pt-BR)

### Research (constrains the overlay)
- `.planning/research/ARCHITECTURE.md` §line 119 (bus event `elapsed`) — the elapsed event the counter rides; §Pattern 4 (mutating flag) and the D-14 overlay-host exclusion design
- `.planning/research/PITFALLS.md` — performance traps (no animated/expensive rendering), visibility-handling pitfalls that shaped Phase 1's `REELS && visible` gate
- `.planning/research/FEATURES.md` — counter feature rationale and the no-guilt framing
- `.planning/research/STACK.md` — zero-new-technology verdict (overlay stays vanilla JS)

### Engine Seams (already in code — Phase 4 fills them)
- `src/slowgram.js` — `emit('elapsed', state.elapsedMs)` (:425), `emit('phasechange', next)` (:142), `emit('reset')` (:483), `emit('contextchange', context)` (:1673), `overlayHost` D-14 seam (:98), `state.visible` gate (:436/:464), frozen `CONFIG` pattern

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Events bus** (`emit`/`listeners`, :81/:1401): the overlay subscribes to `elapsed`, `phasechange`, `reset`, `contextchange` — no new plumbing needed.
- **`overlayHost` seam** (D-14, :98): the reserved host reference the overlay sets; the self-mutation filter already excludes it.
- **`classifyContext` + `preservedRoutes`** (Phase 2): the SOCIAL/UNKNOWN gate for hiding (OVER-02) — reuse, don't re-derive.

### Established Patterns
- **No timers ban** (Phase 1): the ≤1/s update MUST ride the rAF/`emit('elapsed')` stream (throttled), never `setInterval`.
- **No magic literals (CORE-05):** all overlay values in the frozen `CONFIG.overlay` block; source-scan discipline like T-L14/T-L42a.
- **Frozen CONFIG**: `CONFIG.overlay` must be added to the frozen object, not a runtime mutation.
- **Zero-dependency single-file IIFE**: Shadow DOM, styles, and text are engine-injected — no external CSS.

### Integration Points
- `emit('elapsed', state.elapsedMs)` (:425) — the counter's data source.
- `emit('phasechange', next)` (:142) — appear trigger (`phase >= 1`).
- `emit('reset')` (:483) — fade-out trigger (fatigue reset → phase 0).
- `emit('contextchange', context)` (:1673) — instant-hide trigger (SOCIAL/UNKNOWN).
- `state.visible` transitions (:436/:464) — hide/reappear on tab hidden.
- `destroy()` / `init()` lifecycle — host removal / lazy recreation.
- Fullscreen: `webkitDisplayingFullscreen` on the video element (OVER-03).

</code_context>

<specifics>
## Specific Ideas

- The counter is "the visible face of the whole product" — but must read as a neutral status line, not a judge. The user consistently chose the least-present, least-judging option at every decision point (bare minutes, no label, no explanation, no dismissal).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 4-Overlay & Polish*
*Context gathered: 2026-08-15*
