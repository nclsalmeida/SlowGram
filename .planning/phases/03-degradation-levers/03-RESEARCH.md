# Phase 3: Degradation Levers - Research

**Gathered:** 2026-08-15
**Sources:** .planning/research/ARCHITECTURE.md, PITFALLS.md, STACK.md, FEATURES.md, SUMMARY.md (all re-read for this phase)

## Summary

Five degradation levers map 1:1 onto native Baseline web-platform APIs (CSS `filter: saturate()`, `playbackRate`, `volume`/`muted`, `loop`-attribute removal, pause-on-ended). The three biggest risks are all **silent failures**: (1) iOS drops CSS filters applied directly to `<video>` — the flagship lever must target a static non-transformed ancestor wrapper (Pitfall 2); (2) playbackRate/volume silently no-op under platform clamps and muted autoplay — per-platform clamp tables are the spec (Pitfall 3); (3) scope leakage — the hub must never apply outside REELS (Pitfall 1, already solved by Phase 2's context contract). The DegradationEngine hub routes `phase → CONFIG.degradationMatrix → applicators` with idempotent apply/revert; `revertAll()` restores native on social routes and fatigue reset.

## Phase Requirements (LEVR-01..09)

| Req | Text (abridged) | Phase 3 plan |
|-----|-----------------|--------------|
| LEVR-01 | Filter applies saturate() on non-transformed ancestor wrapper, idempotent + revertible | 03-01 (with the D-15 gate) |
| LEVR-02 | Playback sets playbackRate 0.5–2.0 preserving pitch, re-applied per video | 03-02 |
| LEVR-03 | Volume feature-detects; only video.volume (never muted); only when !muted && volume>0 | 03-02 |
| LEVR-04 | Autoplay removes loop (not loop="false") via attributeFilter; pause on ended = stop point | 03-03 |
| LEVR-05 | Buffer gated behind flag, default off, sub-200ms stalls, stop point only | 03-03 |
| LEVR-06 | DegradationEngine hub routes phase → applicability matrix; applicator = {key, apply(phase, video), revert(video)} | 03-01 (hub spine) |
| LEVR-07 | revertAll() restores all videos to native (fatigue reset) | 03-01 (reconcile makes it automatic) |
| LEVR-08 | Per-platform clamp tables (WebKit vs Chromium) are the spec of every lever limit | 03-02 (rate/volume clamps) |
| LEVR-09 | Degradation never affects scroll (100% native) and never blocks abruptly | 03-01 (design constraint; no scroll/block APIs anywhere) |

## The D-15 Decision Gate (verbatim resolution)

Filter application point — **ancestor wrapper wins over video-direct** (PITFALLS over STACK). Full rationale in 03-CONTEXT.md D-15. Load-bearing evidence:
- PITFALLS.md Pitfall 2 (lines 44-63): iOS gives accelerated `<video>` its own GPU layer and drops direct filters — SferaDev production evidence, WordPress core #59104, WebKit bug 184601 (SVG url() never works on WebKit video).
- STACK.md:19: "apply to the video element itself — same-origin media without CORS is safe" — addresses a *different* failure mode (CORS/filter combos), does not rebut the iOS layer drop.
- ARCHITECTURE.md Anti-Pattern 6: cheap per-pixel ops on the video or a small wrapper; never blur, never big ancestors → the wrapper walk is **bounded** (never BODY/HTML).
- STATE.md roadmap decision (pre-locked): "resolved toward PITFALLS" with the on-device pixel check as the Phase 3/5 gate.

## Architecture Patterns (from research docs, applied)

### Pattern A: Applicator interface (ARCHITECTURE Pattern 3)
```javascript
{ key, apply(phase, video), revert(video) }   // idempotent apply; revert restores originals
```
Our variant (D-17): state lives in the VideoRegistry WeakMap entry (appliedLevers + per-lever originals), key matches CONFIG.degradationMatrix lever names.

### Pattern B: WeakMap state + apply-after-load (ARCHITECTURE Pattern 2)
Per-video state is discarded on `loadstart`/`emptied` (React recycles nodes) and re-applied by the apply-after-load hook. Our hook: onLoadStart clears appliedLevers and calls applyToVideo(video) when context is REELS.

### Pattern C: Guarded MutationObserver (ARCHITECTURE Pattern 4 + D-14)
Engine DOM writes (wrapper style.filter) are wrapped in the `mutating` flag; batchCallback already skips self-mutations and overlay-host nodes. style.filter is not in the attributeFilter, but the discipline is kept.

## Common Pitfalls (verbatim, the anti-patterns to avoid)

- **Pitfall 2** — never apply filter to `<video>` directly on iOS; never to a transformed/filtered element; plain functions only; static values.
- **Pitfall 3** — playbackRate outside 0.5–2.0 silently no-ops on Safari (cap 2.0) or mutes audio (Chrome outside 0.5–4.0); volume is inert under muted autoplay; programmatic unmute pauses iOS playback → volume only when `!muted && volume > 0`, never touch `muted`.
- **Pitfall 1 / scope leakage** — never degrade outside `/reels/` (Phase 2 solved: context gating; the hub guards REELS).
- **Anti-Pattern 6** — never blur; never filter big ancestors; cheap per-pixel ops (saturate/brightness/contrast) on a small wrapper.
- **Performance Traps** — animated filter values force continuous GPU re-composite → static values only.
- **Feedback loop (Anti-Pattern 4)** — engine writes must not retrigger the observer → `mutating` flag.

## Clamp Tables (LEVR-08 — spec for 03-02)

| Lever | WebKit (Safari/iOS) | Chromium (Chrome/Android) | Source |
|-------|--------------------|--------------------------|--------|
| playbackRate | caps at 2.0 | clamps [1/16, 16]; mutes audio outside ~0.5–4.0 | PITFALLS:71, STACK:20, danieljwilson.me |
| volume | never programmatic unmute (pauses playback); volume inert while muted | volume works when unmuted | PITFALLS:72, WebKit iOS policy |
| filter | drops on video-direct (layer); ancestor wrapper required | works on video-direct | PITFALLS:44-56 |

Design rule (PITFALLS:79): keep degradation values inside 0.5–2.0 for rate; saturation needs no clamp (universal).

## State of the Art

| Old approach | Current approach | Why changed |
|--------------|------------------|-------------|
| Filter on `<video>` direct (STACK-era) | Static non-transformed ancestor wrapper | iOS drops direct filters silently (Pitfall 2) |
| Per-element `__ecoOrig` state on the element | VideoRegistry WeakMap entry (appliedLevers + originals) | Consistent with Phase 2's WeakMap contract; no element property pollution |
| Timer/interval-driven re-apply | Transition-guarded phasechange + apply-after-load + register-time apply | Phase 1 timer ban; event-driven only |
| Matrix iteration over an id-map | Pruned live-element array alongside WeakMap | WeakMap is non-iterable; pruning on batch removedNodes keeps it memory-bounded |

## Runtime State Inventory (Phase 3 additions)

- `applicators` — object map lever-key → {key, apply, revert} (starts with 'saturation'; 03-02/03 add playbackRate/volume/autoplay/buffer)
- `registryElements` — parallel live-element array (pushed on register, pruned on batch removedNodes VIDEO)
- Per-entry: `appliedLevers` (null | {leverKey: phase}) + `origFilter` (original wrapper style.filter, for revert)
- `CONFIG.leverParams` — frozen per-phase lever values (saturation {1:0.85, 2:0.65, 3:0.40})

## Validation Architecture

- Node host: full suite `node test/slowgram.test.js` (359 assertions entering Phase 3; new LEVR suites appended)
- Browser host: same file via harness.html (source scans are Node-only; parity contract: Node − NodeOnly == Edge count)
- Demo host: demo.html extends naturally (Phase 3 can add a lever-status line to the verdict panel in a later plan)
- Phase 5: device matrix, WebKit clamp model, iOS filter pixel check, <1% CPU observer budget, social-preservation checklist

## Verified Facts (load-bearing numbers)

- playbackRate safe degradation band: 0.85–0.95 (subtle) / 1.05–1.15 (fast-forward); hard limits 0.5–2.0 (PITFALLS:79, FEATURES:29)
- Saturation escalation values chosen: 0.85 → 0.65 → 0.40 (per-phase, imperceptible gradient; D-20)
- Fatigue window (5 min) and segment cap (15 min) already locked in CONFIG (Phase 1) — the hub consumes state.phase, never time math
- No new packages; no build step; same single-file IIFE (STACK verdict)

---

*Phase: 3-Degradation Levers*
*Research gathered: 2026-08-15*
