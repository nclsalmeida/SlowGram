# Roadmap: SlowGram

## Overview

Milestone **v1.0 Motor Anti-Vício** delivers a single-file vanilla-JS IIFE (zero dependencies, injection-ready for WKWebView/WebView) that silently degrades passive Reels consumption over session time — color saturation, playbackRate, relative volume, autoplay-loop blocking, and a gated simulated-buffer stop point — while keeping scroll 100% native and social routes (DMs, profiles, search) completely untouched. The journey follows the architecture dependency DAG: first the deterministic state spine (CONFIG, session clock, phase machine, fatigue reset) with the harness DI seam wired in from day one; then DOM detection and scoping (the trust contract: never degrade outside the Reels surface); then the five degradation levers under per-platform clamps; then the neutral counter overlay; and finally harness hardening and on-device validation so the milestone ships a *validated* motor, not just a working one.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Motor Core & Lifecycle** - IIFE skeleton, frozen CONFIG, session clock, phase machine, fatigue reset + DI seam/fake clock scaffold (completed 2026-08-15)
- [x] **Phase 2: DOM Detection & Scoping** - ContextDetector, RouteGuard, DomWatcher, VideoRegistry, selector registry, Instagram DOM mocks (completed 2026-08-15)
- [x] **Phase 3: Degradation Levers** - Five idempotent applicators + DegradationEngine hub with per-platform clamp tables (completed 2026-08-15)
- [x] **Phase 4: Overlay & Polish** - Neutral elapsed-time counter (Shadow DOM, pointer-events none), social/fullscreen hiding (completed 2026-08-15)
- [x] **Phase 5: Harness Hardening & Device Validation** - Perf/drift/wall-clock/social-preservation tests, kill-switch, on-device checklist (completed 2026-08-15)

## Phase Details

### Phase 1: Motor Core & Lifecycle

**Goal**: The engine's state spine — IIFE skeleton, frozen CONFIG, session clock, phase machine, and fatigue reset — is deterministic and testable from day one, with the harness DI seam wired in as a first-class citizen.
**Depends on**: Nothing (first phase)
**Requirements**: CORE-01, CORE-02, CORE-03, CORE-04, CORE-05, CORE-06
**Success Criteria** (what must be TRUE):

  1. Session clock accumulates only Reels-visible time via `Date.now()` wall-clock deltas at event boundaries — verified with the fake clock: advancing time while context==REELS && visible increases elapsed; SOCIAL/UNKNOWN or hidden time does not; no timer ticks anywhere
  2. PhaseMachine maps `elapsedMs → phase 0..3` (0–3 / 3–7 / 7–12 / 15+ min) and emits `phasechange` only on real transitions
  3. Fatigue reset: backgrounding >5 min (via `visibilitychange`/`pageshow`/`focus` with wall-clock catch-up) resets the session; a shorter background period does not reset
  4. The same engine file runs under mocks (fake clock `advance(ms)`) and in a plain browser via the DI seam — zero dependencies, injectable `clock`/`MutationObserver`/`document`/`window`
  5. CONFIG is a single frozen object holding phases, degradation matrix, selectors, preserved routes, and fatigue window — no magic numbers scattered in the code

**Plans**: 4/4 plans executed
**UI hint**: no

```
Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Tracer: engine skeleton + harness scaffold, fake-clock accumulation end-to-end (CORE-01/04/06)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Frozen CONFIG + pure PhaseMachine with transition-guarded phasechange (CORE-02/05)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03-PLAN.md — FatigueManager: 4-signal wall-clock catch-up, strict >5min reset, gap discount (CORE-03)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-04-PLAN.md — DI seam completeness (env validation, destroy, re-init) + two-host browser smoke (CORE-04/06)

```

### Phase 2: DOM Detection & Scoping

**Goal**: The engine correctly classifies REELS/SOCIAL/UNKNOWN and scopes all degradation to the Reels surface only — the trust contract that social routes never degrade is established before any lever exists.
**Depends on**: Phase 1
**Requirements**: DETC-01, DETC-02, DETC-03, DETC-04, DETC-05, DETC-06, DETC-07, DETC-08
**Success Criteria** (what must be TRUE):

  1. ContextDetector classifies the context as REELS/SOCIAL/UNKNOWN with pathname authoritative for preserved routes and role/attribute/`<video>` signals for Reels
  2. RouteGuard preserves `/direct/`, `/messages`, profiles, and search — those routes never degrade, and preservation re-asserts on every route change
  3. UNKNOWN context never degrades (fail-safe by design)
  4. DomWatcher uses a narrow MutationObserver with rAF batching and self-mutation filtering (no feedback loops), and disconnects observers on social routes to cut overhead
  5. VideoRegistry maintains per-video state in a WeakMap with `loadstart`/`emptied` lifecycle reset (virtualized feed recycling); selectors live in a registry with a health check (never hashed CSS classes); Instagram DOM mocks + demo.html enable deterministic validation

**Plans**: 4/4 plans executed
**UI hint**: no

```
Plans:
**Wave 1**

- [x] 02-01-PLAN.md — Tracer: detection spine (classify→observe→register→health) + Instagram DOM fixtures/mocks + real-DOM verification (DETC-01/07)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-02-PLAN.md — ContextDetector full decision table + RouteGuard interception/rAF re-check (DETC-01/02/03)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-03-PLAN.md — DomWatcher two-root observer + self-mutation filter + VideoRegistry WeakMap lifecycle (DETC-04/05/08)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 02-04-PLAN.md — SelectorRegistry health check (N=5 drift, fail-loud/soft) + demo.html + two-host smoke (DETC-06/07)

```

### Phase 3: Degradation Levers

**Goal**: Five idempotent, revertible degradation levers — Filter, Playback, Volume, Autoplay-loop block, and gated Buffer — apply per phase under per-platform clamp tables, routed by the DegradationEngine hub, without ever touching scroll or blocking abruptly.
**Depends on**: Phase 2
**Requirements**: LEVR-01, LEVR-02, LEVR-03, LEVR-04, LEVR-05, LEVR-06, LEVR-07, LEVR-08, LEVR-09
**Success Criteria** (what must be TRUE):

  1. Filter lever applies `saturate()` to a non-transformed ancestor wrapper (iOS-safe), idempotent and revertible
  2. Playback lever sets `playbackRate` within 0.5–2.0 preserving pitch, re-applied per video; Volume lever feature-detects and touches only `video.volume` (never `muted`), and only when `!muted && volume > 0`
  3. Autoplay lever removes the `loop` attribute (not `loop="false"`) and pauses on `ended` — the stop point; Buffer lever is gated behind a flag, default off, sub-200ms stalls, applicable only at the stop point
  4. DegradationEngine hub routes `phase → applicability matrix` with each applicator as `{key, apply(phase, video), revert(video)}`; `revertAll()` restores all videos to native condition (used by fatigue reset)
  5. Per-platform clamp tables (WebKit vs Chromium) define every lever limit; degradation never affects scroll (100% native) and never blocks abruptly

**Plans**: 4/4 plans executed
**UI hint**: no

```
Plans:
**Wave 1**

- [x] 03-01-PLAN.md — Tracer: DegradationEngine hub + saturation lever with the D-15 ancestor-wrapper gate + revertAll (LEVR-01/06/07/09)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 03-02-PLAN.md — Playback + Volume levers + per-platform clamp tables (LEVR-02/03/08)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 03-03-PLAN.md — Autoplay loop-block (stop point) + gated Buffer capstone (LEVR-04/05)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 03-04-PLAN.md — Phase closure: lever integration edge cases + full two-host smoke (all LEVR)

```

### Phase 4: Overlay & Polish

**Goal**: A neutral, non-judgmental elapsed-time counter overlay answers "why does the feed look/sound off?" without guilt, without blocking taps, and without appearing on social routes or in fullscreen — the visible face of the whole product.
**Depends on**: Phase 3
**Requirements**: OVER-01, OVER-02, OVER-03
**Success Criteria** (what must be TRUE):

  1. Neutral elapsed-time counter renders in Shadow DOM with `pointer-events: none`, z-index above Instagram's click catchers, updated ≤1/s, and no guilt-shaming copy
  2. Overlay is hidden on social routes (never visible in DMs, profiles, or search)
  3. Overlay is hidden during fullscreen video playback (`webkitDisplayingFullscreen`)

**Plans**: 4/4 plans executed

- [x] 04-01-PLAN.md
- [x] 04-02-PLAN.md
- [x] 04-03-PLAN.md
- [x] 04-04-PLAN.md

**UI hint**: yes

### Phase 5: Harness Hardening & Device Validation

**Goal**: The complete engine is validated end-to-end — performance under synthetic churn, wall-clock truth across hidden periods, drift resistance, social-surface preservation, kill-switch, and on-device behavior — so the milestone ships a *validated* motor.
**Depends on**: Phase 4
**Requirements**: HARN-01, HARN-02, HARN-03, HARN-04, HARN-05, HARN-06, HARN-07
**Success Criteria** (what must be TRUE):

  1. The suite runs the same engine file under mocks in a plain browser harness.html with zero test dependencies (no framework, no npm)
  2. Synthetic 5k mutations/s churn test passes without perceptible jank (<1% CPU observer budget)
  3. Wall-clock equivalence test with a hidden period passes — the session never "lies" across backgrounding/resume
  4. "No degradation on social surfaces" tests are first-class and pass; real-DOM snapshot refresh + selector health checks catch drift before it ships
  5. Kill-switch master flag turns the engine off instantly; the on-device iOS/Android validation checklist (platform clamps, iOS filter rendering, volume, 6-min background reset, social preservation) passes

**Plans**: 7/7 plans complete

- [x] 05-01-PLAN.md
- [x] 05-02-PLAN.md
- [x] 05-03-PLAN.md
- [x] 05-04-PLAN.md
- [x] 05-05-PLAN.md
- [x] 05-06-PLAN.md
- [x] 05-07-PLAN.md

**UI hint**: no

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Motor Core & Lifecycle | 4/4 | Complete    | 2026-08-15 |
| 2. DOM Detection & Scoping | 4/4 | Complete    | 2026-08-15 |
| 3. Degradation Levers | 4/4 | Complete    | 2026-08-15 |
| 4. Overlay & Polish | 4/4 | Complete    | 2026-08-15 |
| 5. Harness Hardening & Device Validation | 7/7 | Complete    | 2026-08-15 |
