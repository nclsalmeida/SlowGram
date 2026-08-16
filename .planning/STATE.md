---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 5
status: complete
stopped_at: Milestone v1.0 complete — UAT on-device passed, milestone closed
last_updated: "2026-08-16T12:00:00.000Z"
last_activity: 2026-08-16
last_activity_desc: Milestone v1.0 COMPLETE — 5/5 phases, 23/23 plans, UAT passed (harness.html 851/851 desktop re-sync; on-device checklist 6/6 no Pixel 7 Pro; 2 bugs reais encontrados e corrigidos: overlay CSS selector + connect-scan registration). Auditoria de hardening pós-milestone P1/P2: engine 930 asserts (Node) / 851 (browser), host-inject 10/10, wrapper JVM 16 debug+release — docs re-sincronizados
progress:
  total_phases: 5
  completed_phases: 5
  total_plans: 23
  completed_plans: 23
current_phase_name: Harness Hardening & Device Validation
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-15)

**Core value:** Degradar de forma imperceptível e gradual o consumo de Reels para quebrar o hábito compulsivo, SEM nunca comprometer a utilidade social do Instagram (DMs, perfis, busca) nem frustrar o usuário nos primeiros minutos.
**Current focus:** Milestone v1.0 complete — deploy strategy decision pending (v1.1/v2): wrapper nativo vs bookmarklet vs extensão

## Current Position

Phase: 5 — COMPLETE (5/5)
Plans: 23 of 23 executed across 5 phases (1: motor core, 2: detection/scoping, 3: levers, 4: overlay, 5: harness hardening & device validation)
Last activity: 2026-08-15 — Milestone v1.0 closed: UAT passed (Teste 1 device-check no Pixel 7 Pro, Teste 2 harness.html 851/851 desktop re-sync 2026-08-16, Teste 3 checklist on-device 6/6), 2 bugs reais encontrados e corrigidos na UAT. 2026-08-16 — auditoria de hardening pós-milestone (P1/P2): engine 930 asserts Node / 851 browser, host-inject 10/10, wrapper JVM 16 debug+release; docs re-sincronizados

Progress: [██████████] 100% — Milestone v1.0 complete

## Performance Metrics

**Velocity:**

- Total plans completed: 23
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Motor Core & Lifecycle | 4/4 | 4 | — |
| 2. DOM Detection & Scoping | 4/4 | 4 | — |
| 3. Degradation Levers | 4/4 | 4 | — |
| 4. Overlay & Polish | 4/4 | 4 | — |
| 5. Harness Hardening & Device Validation | 7/7 | 7 | — |

**Recent Trend:**

- Last 5 plans: 03-04 (50min), 03-03 (45min), 03-02 (40min), 03-01 (45min), 02-04 (40min)
- Trend: —

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01-motor-core-lifecycle P01-01 | 6min | 2 tasks | 4 files |
| Phase 01-motor-core-lifecycle P01-02 | 4 | 2 tasks | 2 files |
| Phase 01 P01-03 | 5 | 2 tasks | 3 files |
| Phase 01-motor-core-lifecycle P01-04 | 9min | 2 tasks | 4 files |
| Phase 02-dom-detection-scoping P02-03 | 75 | 2 tasks | 3 files |
| Phase 02-dom-detection-scoping P02-04 | 40min | 2 tasks | 3 files |
| Phase 03-degradation-levers P03-01 | 45min | 2 tasks | 2 files |
| Phase 03-degradation-levers P03-02 | 40min | 2 tasks | 3 files |
| Phase 03-degradation-levers P03-03 | 45min | 2 tasks | 3 files |
| Phase 03-degradation-levers P03-04 | 50min | 2 tasks | 3 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Phase 3]: Closure = prove the matrix, not extend it (D-28) — the final plan's one new lock is the source scan asserting the applicators map keys == the four matrix levers (autoplay/playbackRate/saturation/volume) with 'buffer' never an applicator (T15 lock + D-26 standalone capstone, T-L51a)
- [Phase 3]: Reentrancy contract (D-29) — teardown UNBINDS the per-element loadstart/emptied/ended listeners (real DOM dedupes by fn ref; the fake accumulates — the unbind keeps both hosts at one bind per cycle); registerVideo re-tracks a removed→re-added SAME node in the live list exactly once (D-18 companion); destroy/re-init re-applies the current phase fresh (T-L47/T-L48)
- [Phase 3]: Fatigue reset via the PUBLIC path reverts all five levers and returns phase to 0 — resetSession's explicit revertAll + the sync(0) reconcile backstop both run; the closure suite proves the combined real path (T-L46)
- [Phase 3]: Autoplay contract (D-25) — at phase 3 removeAttribute('loop') (NEVER loop="false" — a present attribute keeps looping), origHadLoop captured first-touch, revert restores PRESENCE via setAttribute('loop',''); the ended listener pauses ONLY while appliedLevers.autoplay holds = the stop point (bound once per element in the _bound block, T-D27 discipline)
- [Phase 3]: Buffer contract (D-26) — the buffer is a standalone applicator-shaped helper driven ONLY from onEnded at the stop point, NOT in the applicators map (the T15 matrix lock + the reconcile revert loop would cancel a matrix-driven stall); frame-counted on the rAF carrier (processStalls in processBatch, no timers)
- [Phase 3]: Buffer defaults (D-27) — CONFIG.buffer { enabled: false, stallFrames: 2 } frozen; module flag seeded at init from CONFIG, _setBufferEnabled test handle (precedent _setDevMode); revertAll cancels pending stalls (a cancelled stall never resumes later)
- [Phase 3]: Clamp spec locked (D-22) — webkit rate max 2.0 (Safari cap), chromium rate max 4.0 (audible band), min 0.5 both; volume max 1; every lever value clamped through CONFIG.clampTables[env.platform] before writing
- [Phase 3]: Platform seam (D-21) — env.platform 'webkit'|'chromium' DI override (validated loudly), UA-sniffed default; harness passes explicit platforms; _clampForPlatform test handle
- [Phase 3]: Volume lever gates on muted !== true && volume > 0 with feature-detect and NEVER assigns video.muted (Anti-Pattern 2) — source scan uses (?!=) so the read gate `=== true` doesn't false-positive
- [Phase 3]: Playback values 0.9/0.8 (D-23) with preservesPitch forced true; volume factor 0.5 at phase 3 (D-24) applied to the captured original
- [Phase 3]: filterTarget(video, exempt) — the D-15 wrapper walk exempts the element the lever already filtered, else OUR OWN saturate write reads as 'transformed' and the next apply/revert climbs to the feed root (the self-reference bug found this plan, locked by T-L3d/T-L6c/T-L7a/T-L11)
- [Phase 3]: revert writes to entry.filterTarget (stored), never re-walks; a changed target (React wrapper replacement, Pitfall 7) re-captures origFilter fresh
- [Phase 3]: registryElements[] pruned live list (D-18) is the iteration mechanism for applyAll/revertAll over the non-iterable WeakMap; pruned on batch removedNodes; WeakMap semantics unchanged (T-D31)
- [Phase 3]: lever values live only in CONFIG.leverParams (saturation 0.85/0.65/0.4); engine has zero saturate(0.N) literals (source scan)
- [Phase 3]: resume signals in tests require setVisibility('visible') BEFORE the visibilitychange dispatch — the engine branches on document.visibilityState, not the event type
- [Phase 2]: The rAF batch carrier runs on REELS regardless of observer presence — with the [role=main] anchor missing, connectWatcher has zero roots and never creates an observer, so the old `&& watcher.observer` gate would silence the entire drift path; the anchor-missing case is exactly when health matters (T-D33)
- [Phase 2]: teardown() resets health to fresh {missStreak:0, drifted:false} — per-engine-instance health is load-bearing now that the batch runs without an observer; Phase 1 no-DOM suites flush REELS frames (missStreak++) and stale misses would cross freshEnv() re-inits and falsely declare drift
- [Phase 2]: The drift console.warn names CONFIG.health.driftThreshold ('feed anchor missing for N scans') instead of a literal '5 scans' — same message shape, honors the no-magic-literal rule (T-D38)
- [Phase 2]: Drift fallback stays at the registration-path level: while drifted, processBatch swaps the scope SOURCE to fallbackScope() (document-scoped <video> on /reels/ only) and feeds the results through the same batchCallback — D-14 filters and idempotent register untouched
- [Phase 2]: demo.html feed shape merges the loggedIn fixture evidence (loop/autoplay/dialog) with the live-dump video count (4) — SHAPES.loggedIn carries no videos field and buildReelsFeed defaults to 0 children
- [Roadmap]: Use `Date.now()` wall-clock deltas at event boundaries for anything spanning sleep/hidden (per research PITFALLS + ARCHITECTURE); `performance.now()` only as internal refinement for in-page segments — decide explicitly in Phase 1 planning
- [Roadmap]: Filter lever defaults to non-transformed ancestor wrapper (iOS-safe), with on-device iOS pixel check as a Phase 3/5 gate (STACK vs PITFALLS tension resolved toward PITFALLS)
- [Roadmap]: Simulated buffer is a flagged, default-off stop-point capstone only; drop from v1 if perception validation fails
- [Roadmap]: Harness is a Phase 1 citizen — DI seam + fake clock scaffold ships with the engine, not as an afterthought
- [Roadmap]: UNKNOWN context never degrades (fail-safe); pathname authoritative for preserved routes
- [Phase ?]: Session clock anchors lastBoundary at now when the running gate transitions to true — page-origin/pause gaps are never counted, so advance(180000) after REELS accumulates exactly 180000
- [Phase ?]: init() resets accumulation state and the listener registry — each re-init (fresh mocks per test) behaves as a brand-new engine
- [Phase ?]: init() starts the rAF poll so one raf.flush() = one frame = one tick under the harness
- [Phase ?]: SlowGram.getConfig() added as the test/consumer CONFIG handle — suites assert segmentCapMs from the engine's own source, never literals
- [Phase ?]: phaseBoundariesMin = [3, 7, 12] locked (FA-03): phase 0 <3m, 1 3-7m, 2 7-12m, 3 >=12m; boundary comparison is elapsedMs >= boundaryMs (integer ms) - exactly at a boundary returns the NEXT phase
- [Phase ?]: fatigueWindowMs 300000 and segmentCapMs 900000 stored in CONFIG - the VALUES live in the constants object; strict > comparison semantics land in Plan 03
- [Phase ?]: degradationMatrix and selectors stored in Phase 1 though Phase 3/2 consume them (A5) - CORE-05 single-object intent
- [Phase ?]: phaseFor is defensive-total: elapsedMs < 0 returns 0; Number.MAX_SAFE_INTEGER terminates the loop safely (phase 3)
- [Phase ?]: SlowGram._phaseFor exposed as a documented test-only handle for the pure boundary contract; production surface stays sync() + getState().phase
- [Phase ?]: Strict > fatigue comparison locked (FA-05): gap exactly fatigueWindowMs (300000) does NOT reset; 300001 does — asserted as a boundary pair (T23 vs T24), window always read from getConfig().fatigueWindowMs
- [Phase ?]: Gaps <= fatigueWindowMs are discounted, never accumulated (Pitfall 5): hiddenAt clears, lastBoundary refreshes to now — the session clock never counts unverifiable background time
- [Phase ?]: hiddenAt-null fallback base = lastBoundary (WebView missed-visibilitychange): idempotent — repeated resume signals only refresh lastBoundary, no spurious reset, no accumulation (T-01-09)
- [Phase ?]: Four-signal lifecycle wiring on locked Chrome Page Lifecycle targets (visibilitychange/resume -> document, pageshow[persisted]/focus -> window); pageshow persisted:false ignored (initial-load guard, Pitfall 8)
- [Phase ?]: destroy() shipped functional in Plan 03 (removes all 4 listeners via lifecycleHandlers registry + state.destroyed stops the rAF poll) — Plan 04 scope shrinks to env validation + re-init + two-host smoke
- [Phase ?]: resetSession always emits observable 'reset'; sync(0) emits phasechange 0 from a higher phase; context preserved (reset zeroes time, not context)
- [Phase ?]: destroy() locks the reset-to-fresh contract (T-01-11): destroys resets state to pre-init zeros/UNKNOWN, signals inert after destroy, subsequent init() is a clean re-init — supersedes Plan 03 destroy-keeps-state
- [Phase ?]: init() preserves the subscriber registry across re-init (teardown keeps listeners): external hooks survive destroy/init cycles; D3 proves double-init yields exactly one contextchange
- [Phase ?]: init() rethrows after console.error on bootstrap failure (was swallow-only): caller sees the descriptive Error; D1 asserts thrown message; containment preserved
- [Phase ?]: Kept the D-13 role-attribute refresh inside batchCallback (T-D8b asserts it; refineFromDOM does zero DOM queries, compatible with D-09)
- [Phase ?]: Moved healthScan out of batchCallback into processBatch (one scan per rAF batch, not per record)
- [Phase ?]: connectWatcher performs a synchronous processBatch() re-sync after observing (D-07 reconnect re-sync)
- [Phase ?]: FakeVideoElement.src mirrors into attributes so readSrc works identically on fake and real elements

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

- [Phase 5] Device-validation methodology (device matrix, WebView version variance, <1% CPU measurement technique) needs a targeted research pass
- [Phase 4] Overlay & Polish planning is next — the neutral elapsed-time counter rides emit('elapsed') (on the bus since Phase 1) + the mutating/overlay-host exclusion seams (D-14)
- ~~[Phase 3] Playback/Volume clamp-table values contested~~ — RESOLVED at 03-02 (D-21/D-22): webkit 2.0 cap, chromium audible band 4.0, locked in frozen CONFIG.clampTables
- ~~[Phase 3] Filter application point contested between research docs~~ — RESOLVED at 03-01 (D-15): non-transformed ancestor wrapper (PITFALLS wins over STACK), on-device iOS pixel check deferred to Phase 5
- ~~[Phase 2] Live Instagram DOM structure unverified (research confidence LOW-MEDIUM)~~ — RESOLVED: the SelectorRegistry health contract (N=5 drift → selectorHealth event + dev warn + bounded prod fallback) makes drift loud instead of silent, and demo.html + the fixture-refresh runbook (HARN-04) cover the residual drift risk

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-08-15T23:50:00.000Z
Stopped at: Milestone v1.0 complete (UAT passed, milestone closed)
Resume file: (none — milestone complete; next: deploy strategy decision for v1.1/v2)
