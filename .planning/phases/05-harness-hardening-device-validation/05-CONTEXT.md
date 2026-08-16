# Phase 5: Harness Hardening & Device Validation - Context

**Gathered:** 2026-08-15
**Status:** Ready for planning

<domain>
## Phase Boundary

The complete SlowGram engine is validated end-to-end — performance under synthetic churn (<1% CPU observer budget), wall-clock truth across hidden periods, social-surface preservation as a first-class requirement, drift resistance via versioned real-DOM snapshots, an instant kill-switch, and a human-executable on-device validation checklist for iOS/Android. This phase ships a *validated* motor, not new capability: every item hardens or proves what Phases 1–4 built.

</domain>

<decisions>
## Implementation Decisions

### Performance & Churn (HARN-01)
- **D-1:** CPU budget is measured DETERMINISTICALLY as work-count in the rAF batch — records processed per frame under synthetic churn — never a real profiler and never `performance.now()` (the Phase 1 SCAN ban stays green). The "5k mutations/s" claim is structural, not sampled. — **Reversibility:** reversible — the metric lives in a test helper; changing it touches one suite.
- **D-2:** A per-record batch cap in frozen CONFIG: `CONFIG.harness.maxBatchRecords = 200`. Rationale: 5k mutations/s ÷ 60fps ≈ 83 records/frame → 200 gives ~2.4× headroom. The `processBatch` YIELDS at the cap (deferred records carry to the next frame) — it never overruns a frame. CORE-05: the cap is CONFIG, not a module literal.
- **D-3:** Churn injection is batch-style into the FakeMutationObserver — enqueue 5k add/remove-video records, drain via `raf.flush()`, derive the rate as records ÷ frames × 60fps. Zero timers, both hosts deterministic.
- **D-4:** Acceptance is TWO gates: (1) no single frame processes more than `maxBatchRecords` (yields — proves no perceptible jank structurally), and (2) the full churn drains in finite frames (records ÷ cap ≤ expected frames — proves responsiveness under worst case).

### Wall-clock Equivalence (HARN-02)
- **D-5:** TWO first-class tests, each with a dedicated hidden-period fixture: (a) counting equivalence — the motor's accumulated `elapsedMs` equals the real-clock delta over the VISIBLE segment only, the hidden period counts as zero (the session never counts what it cannot verify); (b) reset equivalence — a gap > fatigueWindowMs resets (the session never continues from a stale base).
- **D-6:** Each test runs BOTH visibility scenarios: (a) the normal driver (`setVisibility('hidden')` + dispatch `visibilitychange`), and (b) the WebView missed-event case (document hidden WITHOUT the event — recovered via the `hiddenAt=null → lastBoundary` fallback from Phase 1). The missed-event case is where "the session lies" would hide.
- **D-7:** Each assert is DUAL: (a) real-clock delta vs. motor accumulation (`elapsedMs == visible delta`), and (b) state invariants (`hiddenAt`/`lastBoundary`/`elapsedMs` correct after each transition). The delta is the visible promise; the invariants prove the mechanism.

### Social Preservation First-Class (HARN-03)
- **D-8:** Full CARTESIAN matrix: every `CONFIG.preservedRoutes` route (/direct/, /messages/, /p/, /explore/, /accounts/, /stories/) × every lever (saturation, playbackRate, volume, autoplay, buffer) + the overlay — asserting nothing is applied and nothing persists after a detour. A single lever leaking on a single social route fails the suite.
- **D-9:** Persistence is proven by a PRE/POST state snapshot — `elapsedMs`, per-video `appliedLevers`, wrapper styles, overlay opacity/text — asserted IDENTICAL across the social detour. AND the legitimate degradation is re-applied correctly on return to /reels/ (the round-trip contract D-16 stays intact — a detour never kills real degradation, it just never leaks).

### Drift & Real-DOM Snapshot (HARN-04)
- **D-10:** The real-DOM snapshot (Instagram dump) becomes a VERSIONED FIXTURE + a documented refresh runbook. A test asserts `CONFIG.selectors` still finds its elements in the current snapshot — fail-first in CI, never silent in prod. No periodic runtime re-scan (adds cost/network for a 3-selector dependency). — **Reversibility:** reversible — fixture swap is a documented procedure.
- **D-11:** The existing health check (N=5 zero-hit scans → `selectorHealth` drift, Phase 2 D-09/D-10) becomes a first-class test that FEEDS the refresh loop: on failure it names the missing selector and links to the fixture/runbook update. Drift is loud in CI, not silent until a user complains.

### Kill-switch (HARN-05)
- **D-12:** A single master flag in frozen CONFIG (`CONFIG.killSwitch.enabled = true` default) + a module latch seeded at init. EVERY entry point (pollLoop, batchCallback, registerVideo, overlay) checks it and no-ops — the engine turns off within one rAF frame, no new timers.
- **D-13:** Disabling is a REVERT, not a pause: `revertAll()` restores every lever, the overlay hides/removes, accumulation stops (`running=false`) — the user gets a native feed immediately. Re-enabling resumes fresh. Kill-switch is reversible (≠ destroy — no teardown of the subscription/registry surface).
- **D-14:** Test contract: flip the flag → the next flush does ZERO work (no accumulation, no lever apply, no overlay render); re-enable → the engine accumulates again.

### On-device Checklist (HARN-06)
- **D-15:** Deliverable form: a structured markdown checklist per platform (iOS Safari / Android Chrome / Android WebView) + a `device-check.html` companion page that runs the engine against REAL DOM (real video element, real rAF/clock, real platform sniffing) so a human on a real device ticks each item. Matrix is the three runtime surfaces the product targets; version variance is annotated, not a hard gate. Checklist items map 1:1 to existing guarantees: platform clamp display (D-21/D-22), iOS filter rendering (visual check), volume audible change, 6-min background reset, social preservation + overlay hidden.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase / Requirements Definition
- `.planning/ROADMAP.md` §Phase 5 — goal, success criteria, HARN requirements
- `.planning/REQUIREMENTS.md` §Harness & Validação (HARN) — HARN-01..07 requirement texts (pt-BR)

### Research (constrains the phase)
- `.planning/research/ARCHITECTURE.md` — the bus/event spine, Pattern 4 (mutating flag), D-14 overlay-host exclusion
- `.planning/research/PITFALLS.md` — visibility-handling pitfalls (the wall-clock tests' rationale), no-timer discipline
- `.planning/research/STACK.md` — zero-new-technology verdict (harness stays vanilla)

### Existing Engine (the phase hardens/proves this)
- `src/slowgram.js` — the renamed engine (was ecoinsta.js): `processBatch`/`batchCallback` (churn target), `resetSession`/`onResume` (wall-clock target), `applyAll`/`revertAll`/applicators (social matrix target), `selectorHealth`/drift (D-09/D-10), `pollLoop` (kill-switch gate points), `overlay` module (Phase 4)
- `test/slowgram.test.js` — the dual-host suite (Node 715 / Edge 667); T23/T24 = existing wall-clock boundary tests being promoted to first-class
- `test/harness.js` — FakeMutationObserver/FakeClock/FakeElement/FakeDocument (churn + hidden-period drivers)
- `test/fixtures/instagram-shapes.js` + `test/dom-mocks/instagram-mock.js` — versioned DOM shapes (drift fixture seed) + buildSocialRoute (social matrix fixture)
- `test/harness.html` — the plain-browser dual-host page (HARN-07 seed)

### Rename note
The project was renamed EcoInsta → SlowGram in 2026-08-15 (commit `7e94d06`). All paths/APIs referenced above use the new name; the folder remains `Downloads/EcoInsta` (workspace root).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **FakeMutationObserver** (harness.js) — record-injection API (`record`/`recordAttributeMutation`) is the churn driver; no new fake needed
- **FakeClock** — the wall-clock tests' dual view: advance visible segments, verify `elapsedMs` vs. real delta
- **`setVisibility` + `visibilitychange` dispatch** — the established hidden-period driver (T23/T24 precedent)
- **`CONFIG` frozen pattern** — `harness.maxBatchRecords` and `killSwitch.enabled` slots join the same object (CORE-05)
- **`selectorHealth` (D-09/D-10)** — the drift check to promote to first-class

### Established Patterns
- **No timers ban** — churn and wall-clock methodology must stay within fake-clock + rAF flush (never setTimeout/performance.now)
- **No magic literals (CORE-05)** — maxBatchRecords and killSwitch live in CONFIG; tests read via getConfig
- **Dual-host determinism** — every new test runs identically in Node + Edge headless (the parity contract)
- **Containment** — every new entry point (kill-switch checks) is try/catch-safe

### Integration Points
- `processBatch` — the yield-at-cap logic (D-2) + the kill-switch gate (D-12)
- `pollLoop` — the kill-switch check that stops accumulation within one frame
- `revertAll` — the kill-switch disable path (D-13)
- `registerVideo`/`batchCallback` — churn + social-matrix assertion surfaces
- `device-check.html` — new page; mirrors demo.html's structure but against REAL DOM

</code_context>

<specifics>
## Specific Ideas

- The phase is "prove, don't extend": every D-1..D-15 hardens or validates existing machinery; the only new runtime surface is the kill-switch flag (D-12..D-14) and the device-check page (D-15).
- The "<1% CPU" promise is reframed structurally: a yield cap + finite drain is the honest, CI-stable proxy for "no perceptible jank" — the phase's answer to the long-standing Phase 5 research blocker.

</specifics>

<deferred>
## Deferred Ideas

- Real-profiler %CPU measurement (D-1 rejects it — flaky in CI, SCAN-incompatible)
- Periodic runtime re-scan of the live Instagram DOM (D-10 rejects it — cost/network for a 3-selector dependency)
- A broader device matrix than 3 surfaces (D-15 — version variance annotated, not gated)

</deferred>

---

*Phase: 5-Harness Hardening & Device Validation*
*Context gathered: 2026-08-15*
