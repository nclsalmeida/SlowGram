# Phase 3: Degradation Levers - Context

**Gathered:** 2026-08-15
**Status:** Ready for planning

<domain>
## Phase Boundary

The engine now degrades Reels consumption: five idempotent, revertible degradation levers — Filter (saturate), Playback (playbackRate), Volume (volume, never muted), Autoplay (loop-block + pause-on-ended = stop point), and gated Buffer — apply per phase under per-platform clamp tables, routed by the DegradationEngine hub, without ever touching scroll or blocking abruptly. Phase 2 delivered the trust contract (context/scope verdicts, VideoRegistry with per-video state); Phase 3 consumes it: the hub reads `state.phase` + `CONFIG.degradationMatrix` and applies to registered videos, and `revertAll()` restores native condition on social routes and fatigue reset.

</domain>

<decisions>
## Implementation Decisions

### Filter Application Point (THE gate — D-15)
- **Options:** (a) apply `filter: saturate(n)` to the `<video>` element itself (STACK.md:19 — same-origin media, cheap, GPU-composited); (b) apply to a static, non-transformed **ancestor wrapper** (PITFALLS.md Pitfall 2 — iOS gives accelerated video its own GPU layer and drops the filter); (c) hybrid.
- **Resolution: (b) — PITFALLS wins over STACK.** The STACK argument ("same-origin is safe") addresses a *CORS/filter-combination* failure mode; PITFALLS addresses a *silent rendering* failure on the **primary platform** (iOS WKWebView) — a lever that no-ops on iPhones with zero errors is a product failure. Corroborated: SferaDev production evidence, WordPress core ticket #59104 (duotone/SVG filters fail on video in Safari 16.x), WebKit bug 184601 (SVG `url(#)` never works on WebKit video). **Reversibility:** costly to widen (video-direct has no iOS path); narrowing (to video-direct on non-WebKit) is a future Phase 5 device-gate option. The on-device iOS pixel check remains a Phase 3/5 gate (STATE.md locked decision: "resolved toward PITFALLS").
- **Wrapper rules (Pitfall 2 + Anti-Pattern 6):**
  1. Walk `parentNode` from the video; return the FIRST ancestor that is **not transformed** (`style.transform`/`style.filter` empty) — skip transformed ancestors (they get their own GPU layer and drop the filter again).
  2. **Bounded:** the walk stops at `BODY`/`HTML` — never body-wide, never a large container (Anti-Pattern 6: cheap per-pixel ops only, never blur, never big ancestors). No safe wrapper found → return null → the lever skips (fail-safe, no broken filter).
  3. Never the `<video>` itself; never a `transform`ed/`filter`ed element; plain filter functions only (`saturate()`, `brightness()`, `contrast()`) — never `url(#svgFilter)`.
  4. **Static** value — never animate (continuous re-composite of a large video surface = jank; Performance Traps).
  5. Detection is inline-style based (`node.style.transform`/`node.style.filter`); computed-style + on-device pixel verification are the Phase 5 device gate.

### DegradationEngine Hub Contract (D-16)
- The hub routes `state.phase → CONFIG.degradationMatrix[phase] → applicator keys` and reconciles **per video**: levers in the matrix → `apply(phase, video)`; levers applied but no longer in the matrix → `revert(video)`. The reconcile makes de-escalation and fatigue reset automatic (matrix['0'] is empty → reset reverts everything).
- **Triggers:** phase transition (after `phasechange`), new video registration (apply current phase immediately — a video appearing mid-phase-2 must be degraded), `loadstart` (media state reset → re-apply current phase, Pattern 2 apply-after-load), return to REELS after SOCIAL/UNKNOWN (re-apply to surviving registry), and `revertAll()` on SOCIAL/UNKNOWN context (trust contract: never degrade social) and on fatigue reset (LEVR-07).
- `applyAll()`/`applyToVideo()` guard `state.context === 'REELS'` — the hub never applies outside the Reels surface. `revertAll()` is context-agnostic (restores native everywhere).
- No new timers: everything rides the existing event/batch/rAF spine (Phase 1 ban).

### Applicator Interface & State Location (D-17)
- Each lever implements `{ key, apply(phase, video), revert(video) }` (LEVR-06) where **`key` matches the CONFIG.degradationMatrix lever name** ('saturation' — the Phase 1 matrix is frozen and locked by T15).
- Per-video applied/original state lives in the **VideoRegistry WeakMap entry** (`appliedLevers` + per-lever originals like `origFilter`) — NOT on the element (consistent with Phase 2's WeakMap contract, DETC-05); `getRegistryState()` keeps returning a copy. `appliedLevers` starts `null` (T-D26f locked) and is cleared on `loadstart`/`emptied` so the apply-after-load hook re-applies fresh.

### Live-Element Iteration (D-18)
- WeakMap is **non-iterable** — the hub cannot enumerate registered videos for `applyAll`/`revertAll`. Companion: a pruned parallel array `registryElements[]` of live elements, pushed on register, pruned when the batch observes a `removedNodes` VIDEO (feed virtualization). This keeps iteration possible while staying **memory-bounded** (the array holds only currently-in-DOM videos — the anti-leak companion to DETC-05's WeakMap GC-safety). WeakMap/registryCount semantics are untouched (T-D26..T-D31 stay green).

### Lever Parameters & Clamp Tables (D-19)
- Per-phase lever values live in a new frozen `CONFIG.leverParams` block — no magic numbers in module bodies (CORE-05). Saturation escalation (D-20): phase 1 `saturate(0.85)`, phase 2 `saturate(0.65)`, phase 3 `saturate(0.40)` — imperceptible gradient, escalating. Per-platform **clamp tables** (LEVR-08) ship with the Playback/Volume levers (03-02) where the clamps matter (WebKit 2.0 rate cap, mute range); saturation needs no platform clamp (universal).

### Saturation Escalation Values (D-20)
- `CONFIG.leverParams.saturation = { '1': 0.85, '2': 0.65, '3': 0.40 }` — read via the applicator from CONFIG, never literals. The three phases all include 'saturation' in the matrix (frozen); the escalation is the per-phase value.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase / Requirements Definition
- `.planning/ROADMAP.md` §Phase 3 — goal, success criteria 1-5, LEVR requirements 01-09
- `.planning/REQUIREMENTS.md` §Alavancas de Degradação (LEVR) — LEVR-01..09 requirement texts

### Research (decides scope/architecture questions this phase answers)
- `.planning/research/PITFALLS.md` §Pitfall 2 (filter on video silently fails on iOS — ancestor wrapper, plain functions, static), §Pitfall 3 (playbackRate/volume clamps + muted autoplay), §Performance Traps (animated filters, heavy containers), §Anti-Pattern 6 (blur on big containers)
- `.planning/research/STACK.md` — the "apply to video element" counter-position (line 19), feature-detection requirement, no-new-tech verdict
- `.planning/research/ARCHITECTURE.md` §Pattern 3 (Applicator interface), §Pattern 2 (WeakMap + apply-after-load), §Anti-Pattern 2 (never touch muted), §Anti-Pattern 4 (mutating flag)
- `.planning/research/FEATURES.md` — lever family rationale, playbackRate safe range (0.85–0.95 subtle), simulated-buffer-as-capstone-only

### Existing Code Seams
- `src/slowgram.js` — `CONFIG.degradationMatrix` (frozen, keys 'saturation'/'playbackRate'/'volume'/'autoplay'), `syncPhase()` transition guard, VideoRegistry WeakMap (`appliedLevers: null` reserved), batchCallback (addedNodes only — removedNodes pruning lands here), setContext (REELS/SOCIAL/UNKNOWN hooks), resetSession, `_setMutatingForTest`/`_setOverlayHostForTest`
- `test/slowgram.test.js` — T22/T23 (phasechange transition guard), T-D26 (appliedLevers null), T-D31 (WeakMap GC-safety semantics), freshEnv + FakeElement tree pattern
- `test/harness.js` — FakeElement (style {} object, parentNode wiring), FakeVideoElement (playbackRate/volume/muted/loop/paused stubs per STACK.md:40 — verify), FakeMutationObserver.record

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CONFIG.degradationMatrix` (src/slowgram.js:171-176) — already carries the per-phase lever lists; the hub's only routing table (frozen, T15-locked).
- `syncPhase()` (src/slowgram.js:118-126) — transition-guarded; the hub hooks after `emit('phasechange')` — one applyAll per real transition, never per frame.
- VideoRegistry entry shape `{ registeredAt, src, started, ended, appliedLevers: null }` (registerVideo) — `appliedLevers` is the Phase 3 reservation; loadstart/emptied handlers (onLoadStart/onEmptied) are the apply-after-load hook points.
- `setContext()` (src/slowgram.js:~520) — REELS→connect / SOCIAL|UNKNOWN→disconnect already wired; the hub adds revertAll (SOCIAL/UNKNOWN) + applyAll (REELS) in the same branches.
- `mutating` flag + `_setMutatingForTest` — D-14 self-mutation discipline for the lever's style writes.
- FakeElement.style is a plain `{}` object — transform/filter detection reads it directly; FakeElement.parentNode is wired by appendChild/constructor.

### Established Patterns
- Wall-clock/event-driven, no timers: the hub rides phasechange (transition-guarded) + the batch/rAF spine.
- CONFIG is the single source of truth: lever values go in CONFIG.leverParams, never literals (CORE-05).
- UNKNOWN never degrades: applyAll guards context === 'REELS'; revertAll restores on every non-REELS surface.
- Contained handlers: applicator apply/revert bodies are try/catch contained so a lever failure never escapes into Instagram's page.
- WeakMap registry is the per-video state home (DETC-05): lever state lives there, never on the element.

### Integration Points
- DegradationEngine → `state.phase` + `CONFIG.degradationMatrix` (routing) and VideoRegistry entries (per-video state).
- DegradationEngine → setContext (REELS apply / SOCIAL·UNKNOWN revert), resetSession (revertAll per LEVR-07).
- VideoRegistry → loadstart/emptied (apply-after-load re-apply), batchCallback removedNodes (registryElements pruning).
- Phase 4 Overlay → same `mutating` flag + overlay-host exclusion for its own DOM writes.

</code_context>

<specifics>
## Specific Ideas

- Saturation lever targets the wrapper, not the video — the flagship lever must render on iOS (the product's primary platform) or the whole degradation story silently fails.
- The hub reconcile (apply in-matrix / revert out-of-matrix) makes fatigue reset free: resetSession → syncPhase(0) → matrix['0'] empty → everything reverts. LEVR-07's revertAll is the explicit, documented handle for the same path.
- Escalation is value-based, not lever-count-based: all of phases 1-3 carry saturation, so the escalation curve lives in CONFIG.leverParams.saturation values (0.85 → 0.65 → 0.40).
- Buffer lever (LEVR-05) stays flagged-off and deferred to the stop-point capstone plan (03-03) — never a primary lever (FEATURES.md line 47).

</specifics>

<deferred>
## Deferred Ideas

- Video-element-direct filter on non-WebKit platforms — Phase 5 device-gate decision, if the ancestor wrapper proves insufficient on Android.
- Computed-style transform detection (`getComputedStyle` seam) — the wrapper walk is inline-style based in v1; computed-style + on-device pixel check land in Phase 5 validation.
- User-configurable lever values — out of scope (v1 fixed values; CONFIG.leverParams is the "settings" object).
- Home-feed videos as a degraded surface — rejected (D-01); stays UNKNOWN/SOCIAL-preserved.
- Re-apply on `volumechange`/`ratechange` events — the register/loadstart/phasechange hooks cover the common paths; event-driven re-apply per media event is Phase 5 hardening if drift appears.

</deferred>

## Plan 03-02 Decisions (Playback + Volume + Clamp Tables)

### D-21: Platform seam (env.platform)
The engine needs a deterministic platform key for the clamp tables. New optional DI override `platform` ('webkit' | 'chromium' | null): validated in resolveEnv (malformed → descriptive Error, CORE-04), default UA-sniffed when absent (`navigator.userAgent` — 'Chrome' → chromium first, then 'Safari' → webkit, else chromium fallback; no navigator in the harness → 'chromium'). The harness passes explicit platforms. No UA parsing beyond the two keys; WebView detection is out of scope.

### D-22: Clamp tables as the spec (LEVR-08)
`CONFIG.clampTables = { webkit: { playbackRate: {min:0.5, max:2}, volume: {min:0, max:1} }, chromium: { playbackRate: {min:0.5, max:4}, volume: {min:0, max:1} } }` — frozen. WebKit rate max 2.0 (Safari hard cap — anything above silently no-ops, PITFALLS:71); Chromium rate max 4.0 (audible band — beyond that Chrome mutes audio and kills the volume lever, PITFALLS:71-79). min 0.5 both (the design band, PITFALLS:79). The engine clamps EVERY lever value through the platform table before writing (`clampForPlatform(key, value)`), so a future out-of-band value can never silently no-op. `SlowGram._clampForPlatform` test handle (precedent: _phaseFor).

### D-23: Playback lever values (LEVR-02)
`CONFIG.leverParams.playbackRate = { '2': 0.9, '3': 0.8 }` — subtle slow-down inside the 0.5–2.0 band (PITFALLS:79; FEATURES:29 suggests 0.85–0.95 subtle). Pitch preserved: the lever sets `preservesPitch = true` when the property exists (defaults true; explicit for safety). Re-applied per video by the existing register/loadstart hooks (rate resets to 1.0 on source change).

### D-24: Volume lever values + gate (LEVR-03)
`CONFIG.leverParams.volume = { '3': 0.5 }` — relative factor at the stop-point phase (matrix has volume only at phase 3). The lever: (1) feature-detects `typeof video.volume === 'number'`; (2) gates on `video.muted !== true && video.volume > 0`; (3) writes `entry.origVolume * factor`, clamped through the platform table; (4) NEVER touches `video.muted` (Anti-Pattern 2 — WebKit pauses on programmatic unmute). Revert restores origVolume. A muted-at-apply video stays untouched until the next re-apply hook.

</plan_03-02>

## Plan 03-03 Decisions (Autoplay + Buffer capstone)

### D-25: Autoplay lever = loop-removal + pause-on-ended (LEVR-04)
At phase 3 (the only matrix phase with 'autoplay'), the lever REMOVES the `loop` attribute entirely — never `loop="false"` (a present attribute, even false, keeps the loop behavior). The original presence is captured (`entry.origHadLoop`) and restored on revert. An `ended` listener, bound ONCE per element at register (same `entry._bound` block as loadstart/emptied), pauses the video when the autoplay lever is applied — the stop point: a loop-less reel ends and stops instead of restarting.

### D-26: Buffer = flagged capstone, NOT matrix-driven (LEVR-05)
The T15-locked matrix cannot gain a 'buffer' key, and the buffer must not join the applicators map (the reconcile's revert loop would cancel it every pass). So the buffer is a standalone applicator-shaped helper driven from `onEnded`: when `CONFIG.buffer.enabled` (default FALSE) and the autoplay stop point is active, the ended pause holds for `CONFIG.buffer.stallFrames` rAF frames (~33ms at 60fps — sub-200ms, the 80–200ms perceptibility band from PITFALLS:191) and then resumes via `play()` — the "pause + spinner + resume" capstone minus the spinner (Phase 4's overlay). Frame-counted on the existing rAF carrier — NO timers (Phase 1 ban). The flag is a module var seeded from CONFIG at init with a `_setBufferEnabled` test handle (precedent: _setDevMode), so the frozen CONFIG stays the production default and tests flip it deterministically.

### D-27: Buffer flag + stall frame count in CONFIG
`CONFIG.buffer = { enabled: false, stallFrames: 2 }` — frozen. enabled=false is the locked production default (FEATURES.md:47 — a fake buffer risks perceptibility/frustration; capstone only); stallFrames=2 ≈ 33ms at 60fps, sub-200ms.

</plan_03-03>

## Plan 03-04 Decisions (Phase closure — integration + reentrancy + final smoke)

### D-28: Closure = prove the matrix, not extend it
No new lever values, no new engine paths, no new CONFIG in the closure plan. The five levers are built; 03-04's job is to prove they compose on ONE video and survive the lifecycle round-trips (phase transitions, SOCIAL/UNKNOWN reverts, fatigue reset, destroy/re-init, feed churn). The one new lock: a source scan asserting the applicators map keys == the union of `CONFIG.degradationMatrix` phase lists (saturation, playbackRate, volume, autoplay) and that 'buffer' is NOT among them — the T15 matrix lock and the D-26 standalone-buffer contract, made explicit.

### D-29: Reentrancy contract — destroy restores native, listeners never duplicate
`teardown()` already calls `revertAll()` (LEVR-07 hygiene) and re-inits reset `videoStates`/`registryElements`/`health` to fresh; the `_bound` flag guarantees one listener set per element per engine instance. The closure suite proves: an init → levers-applied → destroy → re-init cycle ends with every video native AND the re-init'd registry applying the current phase fresh, with the `ended` listener count never exceeding one per element (T-D27 discipline extended).

</plan_03-04>
</plan_decisions>

---

*Phase: 3-Degradation Levers*
*Context gathered: 2026-08-15*
