# Phase 5: Harness Hardening & Device Validation - Research

> Consumed by gsd-planner. Answers: "What do I need to know to PLAN this phase well?"

## Summary

Phase 5 validates the complete SlowGram engine end-to-end — performance under synthetic churn (<1% CPU observer budget), wall-clock truth across hidden periods, social-surface preservation as a first-class requirement, drift resistance via versioned real-DOM snapshots, an instant kill-switch, and a human-executable on-device checklist. All 15 implementation decisions were locked in `05-CONTEXT.md` (D-1..D-15) and the visual/structural contracts in the existing engine. This research answers the remaining *how*: the structural proxy for "no perceptible jank", the wall-clock equivalence methodology, the social matrix driver, the drift snapshot process, the kill-switch gate points, and the on-device validation reality (WebView variance, iOS filter rendering).

## User Constraints

> Copied verbatim from 05-CONTEXT.md `<decisions>` — locked, do not re-ask.

- **D-1:** CPU budget = deterministic work-count in the rAF batch (records/frame), no real profiler, no `performance.now()` (SCAN ban stays green).
- **D-2:** `CONFIG.harness.maxBatchRecords = 200` (frozen); `processBatch` yields at the cap (5k÷60≈83/frame → ~2.4× headroom).
- **D-3:** Churn injected batch-style into FakeMutationObserver; drain via `raf.flush()`; rate = records÷frames×60fps; zero timers.
- **D-4:** Two acceptance gates — (1) no frame over the cap (yields), (2) finite-frame drain.
- **D-5:** TWO wall-clock tests — counting equivalence (elapsedMs == visible delta; hidden = 0) AND reset equivalence (gap > window resets), each with a hidden-period fixture.
- **D-6:** Each test runs BOTH scenarios — normal visibility driver AND WebView missed-event (hidden without event → `hiddenAt=null → lastBoundary` fallback).
- **D-7:** Dual assert — real-clock delta vs. accumulation AND state invariants (hiddenAt/lastBoundary/elapsedMs).
- **D-8:** Full cartesian matrix — every preservedRoute × every lever + overlay; nothing applies, nothing persists.
- **D-9:** Pre/post state snapshot identical across the detour AND legitimate degradation re-applied on return (D-16 intact).
- **D-10:** Versioned real-DOM snapshot fixture + refresh runbook; selector test fails first in CI.
- **D-11:** Health check (N=5 → drift) becomes a first-class test feeding the refresh loop (names the missing selector).
- **D-12:** Kill-switch = single frozen `CONFIG.killSwitch.enabled` + module latch; every entry point no-ops; off within one frame; no new timers.
- **D-13:** Disable = REVERT (revertAll + overlay removed + accumulation stops) → native feed immediately; re-enable resumes fresh; ≠ destroy.
- **D-14:** Test: flip → next flush does zero work; re-enable → accumulates again.
- **D-15:** On-device deliverable = markdown checklist per platform (iOS Safari / Android Chrome / Android WebView) + `device-check.html` running REAL DOM; items map 1:1 to existing guarantees.

## Phase Requirements (HARN-01..07)

- **HARN-01:** Teste de performance com churn sintético de 5k mutations/s sem jank perceptível (<1% CPU)
- **HARN-02:** Teste de equivalência wall-clock com período oculto (a sessão nunca "mente")
- **HARN-03:** Testes "sem degradação em superfícies sociais" como requisito de primeira classe
- **HARN-04:** Drift tests: refresh de snapshot real-DOM + health checks de seletores
- **HARN-05:** Kill-switch: flag mestre desliga o motor instantaneamente
- **HARN-06:** Checklist de validação on-device iOS/Android (clamps, filter iOS, volume, reset 6min, preservação social)
- **HARN-07:** Suite roda o mesmo arquivo do motor sob mocks, em página browser pura, sem framework — zero dependências de teste

## Architecture Patterns (from engine + research, applied)

### Pattern A: Work-count as the jank proxy (HARN-01)
The MutationObserver callback cost scales with RECORDS, not wall time — a batch of 5k childList mutations is one drain, and the drain cost is dominated by per-record processing. The established mitigation across the web (SO/MDN consensus) is per-frame batching: process what fits the frame, defer the rest. SlowGram's `processBatch` already drains records on the rAF carrier — the phase adds the YIELD: a `maxBatchRecords` cap that defers overflow to the next frame. "No perceptible jank (<1% CPU)" is therefore asserted STRUCTURALLY (no frame over the cap + finite drain), never sampled. [VERIFIED: SO #31659567, MDN MutationObserver — cost scales per record; batching is the standard mitigation]

### Pattern B: Fake-clock wall equivalence (HARN-02)
The engine's clock is DI-injected (`env.clock.now()`); the fake clock is the "real clock" for the test. The methodology: advance the fake clock by a known visible delta → assert `elapsedMs` equals exactly that delta (hidden segments advance the fake clock but must contribute zero). The WebView missed-event case drives the engine without the visibility event, relying on the Phase 1 `hiddenAt=null → lastBoundary` fallback — where "the session lies" would hide. State invariants (hiddenAt/lastBoundary/elapsedMs) are asserted alongside the delta so the test proves the MECHANISM, not just the number.

### Pattern C: Cartesian social matrix (HARN-03)
The matrix is a nested loop over `CONFIG.preservedRoutes` × lever keys, driven by the existing per-video machinery: register a video, advance to phase 3 (all levers active), snapshot state, navigate to each preserved route, assert state unchanged + nothing applied, return to /reels/, assert legitimate degradation re-applied. `buildSocialRoute` (Phase 2 fixture) provides the DOM shape. The overlay joins via its own visibility predicate (`_overlayState`).

### Pattern D: Versioned snapshot + health feedback (HARN-04)
The Instagram real-DOM dump (captured 2026-08-15, logged-out + logged-in shapes in `instagram-shapes.js`) is the versioned fixture. A test walks `CONFIG.selectors` against the fixture and fails with the MISSING SELECTOR NAME when drift occurs — fail-first in CI. The existing `selectorHealth` N=5 drift detection is promoted to a first-class test that reports which selector missed and links the refresh runbook. No runtime re-scan: cost/network for a 3-selector dependency (D-10).

### Pattern E: Kill-switch gate points (HARN-05)
The latch is consulted at the cheapest, highest-leverage points: `pollLoop` (stops accumulation within one frame), `batchCallback` (no processing), `registerVideo` (no tracking), `overlaySync`/overlay handlers (no render). Disable calls `revertAll()` + overlay teardown → native feed immediately. Because CONFIG is frozen and the latch is module state, the flag is read once at init; the TEST flips it via a `_setKillSwitchForTest` handle (precedent: `_setMutatingForTest`/`_setBufferEnabled`).

### Pattern F: On-device reality (HARN-06)
Confirmed WebView/browser variance: iOS Chrome is WKWebView (same engine as Safari but not identical rendering); Android WebView ≠ Chrome Android (separate embedding with its own feature flags); CSS `filter` on video elements renders inconsistently across WebKit surfaces (backdrop-filter and video-element filter quirks are documented WebKit issues). Consequences: the checklist must be HUMAN-VISUAL on real devices (D-15 — device-check.html with REAL DOM), the clamp tables (webkit 2.0 cap) are the safety net for iOS variance, and version variance is annotated, not a hard gate. [VERIFIED: WebKit blog Safari 18.4 WKWebView improvements; SO #42479045 UIWebView vs Safari; emuluxe 12 rendering gaps]

## Common Pitfalls (verbatim, the anti-patterns to avoid)

- **Sampled %CPU in CI** — a real profiler/performance.now gate is flaky headless and violates the Phase 1 SCAN (no performance.now). The structural work-count gate is the only honest proxy (D-1).
- **Single-frame drain as success** — a "drains fine" test that processes 5k records in one frame would PASS while being exactly the perceptible jank we forbid. Both gates (yield + drain) are required (D-4).
- **Wall-clock test with real timers** — any setTimeout/Date.now in the test path reintroduces the timer ban and flakiness. Fake clock + rAF flush only (Pattern B).
- **Social test that only checks revertAll** — a dirty pre-detour state would pass. The pre/post snapshot is the honest assert (D-9).
- **Drift that fails silently in prod** — health checks without the fixture test leave drift undetected until users complain. Fail-first in CI with the missing selector named (D-11).
- **Kill-switch that pauses instead of reverting** — a paused engine leaves degradation applied (stuck feed). Disable must REVERT (D-13).
- **On-device checklist without real DOM** — a fake-DOM page cannot validate iOS filter rendering or WebView variance. device-check.html must run REAL DOM (D-15).

## State of the Art

- **MutationObserver batching**: per-frame batch processing is the established web performance mitigation for high-mutation-rate observers; cost scales per record (MDN, SO consensus). SlowGram's rAF-carrier batch + yield cap implements this.
- **WebView matrix**: iOS Chrome = WKWebView (WebKit engine, not Chromium); Android WebView = Chromium-based embedding distinct from Chrome Android. Rendering (esp. CSS filter on video, backdrop-filter) differs across all three surfaces — real-device visual checks required (WebKit blog, SO).
- **CSS filter on video (iOS)**: documented WebKit quirks with filters on video elements and backdrop-filter — the Phase 3 D-15 decision (filter on a non-transformed ancestor wrapper, not the video) already mitigates the worst of this; the checklist confirms it visually on-device.
- **Background tab throttling**: iOS Safari aggressively throttles/pauses background tabs — the engine's visibilitychange-driven clock pause (Phase 1) is the correct response, and the wall-clock test (D-6) proves the session never counts unverifiable hidden time.

## Runtime State Inventory (Phase 5 additions)

| State | Source | Phase 5 reaction |
|-------|--------|------------------|
| batch records | `FakeMutationObserver.record()` / processBatch | churn injection + yield-at-cap (D-2/D-3/D-4) |
| hiddenAt/lastBoundary/elapsedMs | clock + lifecycle | wall-clock equivalence asserts (D-5..D-7) |
| appliedLevers per video | getRegistryState | social matrix snapshot (D-8/D-9) |
| selectorHealth | health scan | drift first-class test + fixture (D-10/D-11) |
| killSwitch latch | CONFIG + module | gate every entry point (D-12..D-14) |
| platform | env.platform (D-21) | device-check.html clamp display + checklist items (D-15) |

## Validation Architecture

1. **Unit (deterministic, dual-host)**: churn gates (D-4), wall-clock dual tests (D-5..D-7), social matrix (D-8/D-9), drift fixture test (D-10/D-11), kill-switch flip test (D-14) — all in the existing `test/slowgram.test.js`, both hosts.
2. **Human (on-device)**: `device-check.html` + per-platform checklist (D-15) — real device, real DOM, visual judgment (iOS filter rendering, volume audibility, 6-min background reset). Matches the Phase 4 precedent of a human checkpoint.
3. **HARN-07**: the plain `harness.html` dual-host page already exists and is the seed — formalized as a first-class claim (Node 715 / Edge 667 parity).

## Verified Facts (load-bearing numbers)

- `CONFIG.harness.maxBatchRecords = 200` — 5k/s ÷ 60fps ≈ 83 records/frame → ~2.4× headroom [D-2, ASSUMED value — lives in CONFIG, CORE-05]
- Churn rate derivation: records ÷ frames × 60fps [D-3, deterministic]
- Existing suite: Node 715 / Edge 667 (post-rename, pre-Phase-5) — the baseline every new test must keep green
- The engine's kill-switch gate points: pollLoop (:517-ish), batchCallback, registerVideo, overlay module [src/slowgram.js, Phase 1-4 code]
- `_setKillSwitchForTest` precedent: `_setMutatingForTest`/`_setBufferEnabled`/`_setOverlayHostForTest` [src/slowgram.js test-handle pattern]
- Real-DOM fixtures: `instagram-shapes.js` (loggedOut/loggedIn shapes) + `instagram-mock.js` (buildSocialRoute) [test/, Phase 2]
- iOS Chrome = WKWebView ≠ Android Chrome ≠ Android WebView — three distinct surfaces [VERIFIED: WebKit blog, SO #42479045]
