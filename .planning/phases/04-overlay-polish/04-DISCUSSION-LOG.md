# Phase 4: Overlay & Polish - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-15
**Phase:** 4-overlay-polish
**Areas discussed:** Show/hide timing, Counter format & tone, Placement & visuals, Dismissal & edge cases

---

## Show/Hide Timing

| Option | Description | Selected |
|--------|-------------|----------|
| A — Only when degradation is active | Appear at phase >= 1, after the ~3 min grace period; no timer during innocent early minutes | ✓ |
| B — From REELS detection | Show even at 0:00 during phase 0; transparent from second one | |
| C — Hybrid | Phase >= 1, but immediate if a boundary was crossed before | |

**User's choice:** A — only when degradation is active (phase >= 1)
**Notes:** Strongest fit for the "imperceptível, sem frustração" core promise.

| Option | Description | Selected |
|--------|-------------|----------|
| A — Fade | ~400ms CSS opacity transition for appear and disappear; no timers | ✓ |
| B — Instant | Simplest; no half-visible state | |

**User's choice:** A — fade (~400ms) both ways.
**Notes:** Cheap (CSS transition riding the style write), keeps the "invisible hand" character.

| Option | Description | Selected |
|--------|-------------|----------|
| A — Real session time | Shows "3 min" when phase 1 starts; stays an elapsed-time counter | ✓ |
| B — Restart from 0:00 | Softer, but breaks the elapsed-time semantic | |

**User's choice:** A — real session time.

| Option | Description | Selected |
|--------|-------------|----------|
| A — Hide when tab hidden | Overlay present only while the user is looking; aligns with the REELS+visible clock gate | ✓ |
| B — Stay visible always | Reflects session state regardless of gaze | |

**User's choice:** A — hide on hidden, reappear on return.

---

## Counter Format & Tone

| Option | Description | Selected |
|--------|-------------|----------|
| A — mm:ss | Precise, clinical | |
| B — Minutes only | "12 min"; softer, less stopwatch-like | ✓ |
| C — Phrase + time | "Tempo na sessão: 12 min" — friendlier, more chrome | |

**User's choice:** B — minutes only ("12 min").

| Option | Description | Selected |
|--------|-------------|----------|
| A — Bare "12 min" | No prefix, minimal chrome, most neutral | ✓ |
| B — Short label | "Sessão: 12 min" — self-explaining, more presence | |

**User's choice:** A — bare, no label.

| Option | Description | Selected |
|--------|-------------|----------|
| A — Pure time | No explanation; time beside the visible degradation is the implied answer | ✓ |
| B — One-line explanation | "O feed fica mais leve com o tempo" — first step toward guilt framing | |
| C — Silent glyph | Non-text indicator while degrading | |

**User's choice:** A — pure time, no explanation.

| Option | Description | Selected |
|--------|-------------|----------|
| A — CONFIG.overlay block | Frozen config holds unitLabel etc.; CORE-05 compliant, localizable | ✓ |
| B — Hardcoded literal | Simplest, but first magic literal; trips source-scan discipline | |

**User's choice:** A — CONFIG.overlay block.

---

## Placement & Visuals

| Option | Description | Selected |
|--------|-------------|----------|
| A — Bottom-left above caption | Opposite the action rail, out of the way; status-line reading | ✓ |
| B — Top-center | Highest visibility, away from IG top chrome | |
| C — Top-right below ellipsis | Out of the way, adjacent to IG menu cluster | |

**User's choice:** A — bottom-left, above the caption.

| Option | Description | Selected |
|--------|-------------|----------|
| A — Translucent dark pill | ~40% black background + light text; legible on any scene | ✓ |
| B — No background | Bare text + drop-shadow; lighter, contrast varies | |

**User's choice:** A — translucent dark pill + light text.

| Option | Description | Selected |
|--------|-------------|----------|
| A — Near-max CONFIG z-index | ~2147483000 in CONFIG; pointer-events none makes top-of-stack free | ✓ |
| B — Modest fixed (9999) | Enough today; future IG layer could bury it | |

**User's choice:** A — near-max, CONFIG-driven.

| Option | Description | Selected |
|--------|-------------|----------|
| A — Lazy creation | Host created on first phase >= 1; nothing inert in the DOM | ✓ |
| B — At engine init | Created hidden from the start; simpler lifecycle, dead node | |

**User's choice:** A — lazy on first degradation.

---

## Dismissal & Edge Cases

| Option | Description | Selected |
|--------|-------------|----------|
| A — No dismissal | Strictly non-interactive; leaves on its own; honors never-blocks-taps | ✓ |
| B — Tap-to-hide for session | Pointer-events island; user can silence it | |

**User's choice:** A — no dismissal.
**Notes:** A dismiss affordance implies the counter is something to escape — breaks neutrality.

| Option | Description | Selected |
|--------|-------------|----------|
| A — Instant hide on SOCIAL/UNKNOWN | Never lingers even one frame on a social route; fade in on REELS return | ✓ |
| B — Fade both ways | Visually uniform, but visible briefly on social | |

**User's choice:** A — instant hide, fade in on return.

| Option | Description | Selected |
|--------|-------------|----------|
| A — Instant hide on fullscreen entry | Clean video takeover; fade in on exit; PiP needs nothing | ✓ |
| B — Fade out on fullscreen too | Uniform with every other hide path | |

**User's choice:** A — instant on entry, fade on exit.

| Option | Description | Selected |
|--------|-------------|----------|
| A — destroy removes, re-init recreates | Clean teardown, single instance ever | ✓ |
| B — destroy hides, re-init reuses | Cheaper re-init, dead node after teardown | |

**User's choice:** A — destroy removes the overlay; re-init recreates lazily.

---

## Agent's Discretion

- Exact fade duration (within ~300–500ms), pill padding/typography/size, `position: fixed` anchoring, CONFIG.overlay block shape, and the ≤1/s throttled update mechanism (no timers — ride the rAF/`emit('elapsed')` stream).

## Deferred Ideas

None.
