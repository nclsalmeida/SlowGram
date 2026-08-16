---
phase: 03-degradation-levers
plan: 02
subsystem: degradation-engine
tags: [playback, volume, clamp-tables, platform-seam, levr-02, levr-03, levr-08]
requires:
  - phase: 03-degradation-levers
    provides: "03-01 DegradationEngine hub (per-video reconcile, register/loadstart hooks, revertAll), CONFIG.leverParams (saturation), FakeVideoElement (src mirror), freshEnv"
provides:
  - "Playback lever (LEVR-02): CONFIG.leverParams.playbackRate {2:0.9, 3:0.8} — subtle slow-down inside 0.5–2.0, pitch preserved (preservesPitch forced true), re-applied per video via the register/loadstart hooks"
  - "Volume lever (LEVR-03): CONFIG.leverParams.volume {3:0.5} relative factor; feature-detect (typeof volume === 'number'); gate muted !== true && volume > 0; NEVER assigns video.muted (Anti-Pattern 2 — source-scan proven); revert restores origVolume"
  - "Per-platform clamp tables (LEVR-08/D-22): frozen CONFIG.clampTables — webkit { playbackRate {0.5, 2}, volume {0, 1} }, chromium { playbackRate {0.5, 4}, volume {0, 1} } — with clampForPlatform applied to every lever value before writing"
  - "Platform seam (D-21): env.platform 'webkit'|'chromium' DI override, validated loudly (CORE-04), UA-sniffed default; _clampForPlatform test handle"
  - "FakeVideoElement media stubs (STACK.md:40): playbackRate/volume/muted/loop/paused/currentTime/duration/play/pause/preservesPitch — additive, src mirror unchanged"
affects: [03-03-autoplay-buffer, 03-04-closure, 04-overlay-polish, verify-work]
actuals:
  tokens: 17200
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns:
    - "Clamp-through-spec: every lever value is clamped through CONFIG.clampTables[env.platform] before writing — an out-of-band value can never silently no-op on WebKit (rate > 2.0) or mute audio on Chromium (rate > 4.0)"
    - "Gate-before-write (volume): feature-detect + muted/audibility gate BEFORE any write; muted is read-only evidence, never an assignment"
    - "DI platform seam: validated override with deterministic UA-sniffed default — the harness passes explicit platforms, production gets a sane default"
    - "Media stubs on the fake: plain properties the levers read/write like a real element — the same engine file stays green in both hosts"
key-files:
  created: []
  modified:
    - src/slowgram.js
    - test/harness.js
    - test/slowgram.test.js
key-decisions:
  - "Clamp spec values (D-22): webkit rate max 2 (Safari hard cap — above silently no-ops), chromium rate max 4 (audible band — beyond mutes audio, killing the volume lever), min 0.5 both (design band, PITFALLS:79); volume max 1 both"
  - "Playback values (D-23): 0.9 at phase 2, 0.8 at phase 3 — subtle slow-down inside the band; pitch forced via preservesPitch"
  - "Volume factor (D-24): 0.5 at phase 3 (the only matrix phase with volume); applied to the CAPTURED original volume, so revert restores exactly"
  - "The muted-assignment source scan needed a `(?!=)` lookahead — `video.muted === true` (a read gate) matched `\.muted\s*=` on the first '=' of '==='; the scan now proves ASSIGNMENT-free, not comparison-free"
requirements-completed: [LEVR-02, LEVR-03, LEVR-08]
coverage:
  - id: L5
    description: "Playback lever (LEVR-02): playbackRate values inside 0.5–2.0 (0.9/0.8), clamped through the platform table, pitch preserved (preservesPitch true), re-applied per video via register-time and loadstart (browser resets rate to 1.0 on source change)"
    requirement: LEVR-02
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#T-L21 playback end-to-end (1 → 0.9 → 0.8)"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-L22 preservesPitch forced true"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-L25 revert on SOCIAL (orig restored)"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-L31 loadstart re-apply (browser reset)"
        status: pass
    human_judgment: false
  - id: L6
    description: "Volume lever (LEVR-03): relative factor on the original volume (0.5 at phase 3), feature-detect (typeof volume === 'number'), gate muted !== true && volume > 0, NEVER assigns video.muted (Anti-Pattern 2, source-scan proven), revert restores origVolume"
    requirement: LEVR-03
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#T-L26 volume × 0.5 + revert"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-L27 muted gate (untouched, muted never reassigned)"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-L28 zero/unsupported feature-detect gate"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#SCAN no video.muted assignment (T-L32a)"
        status: pass
    human_judgment: false
  - id: L7
    description: "Per-platform clamp tables (LEVR-08/D-22): frozen CONFIG.clampTables is the spec of every lever limit; clampForPlatform clamps every lever value before writing; _clampForPlatform test handle proves the webkit 2.0 cap and chromium audible band"
    requirement: LEVR-08
    verification:
      - kind: unit
        ref: "test/slowgram.test.js#T-L19 clampTables frozen values"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-L23 platform seam validation"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#T-L24 clamp behavior (webkit 2.5→2, chromium 2.5 kept)"
        status: pass
      - kind: unit
        ref: "test/slowgram.test.js#SCAN clamp literals only in CONFIG (T-L32b)"
        status: pass
    human_judgment: false
duration: 40min
completed: 2026-08-15
status: complete
---

# Phase 03 Plan 02: Playback + Volume Levers + Clamp Tables Summary

**Deliver the Playback and Volume levers under the per-platform clamp tables (LEVR-08) with the DI platform seam — the two media-API levers wired into the 03-01 hub, never touching muted, never writing out-of-band values, validated in both hosts**

## Performance

- **Duration:** 40 min
- **Started:** 2026-08-15T18:15:00Z
- **Completed:** 2026-08-15T18:55:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Playback lever (LEVR-02): `playbackRate` 0.9 → 0.8 (phases 2/3) inside the 0.5–2.0 band, clamped through the platform table, pitch preserved (`preservesPitch` forced true), re-applied per video by the existing register/loadstart hooks (the browser resets rate to 1.0 on source change — apply-after-load keeps it degraded)
- Volume lever (LEVR-03): relative factor 0.5 at phase 3 on the CAPTURED original volume; feature-detect (`typeof volume === 'number'`) + gate (`muted !== true && volume > 0`); NEVER assigns `video.muted` (Anti-Pattern 2 — WebKit pauses on programmatic unmute) — proven by a dedicated source scan; revert restores origVolume
- Clamp tables (LEVR-08/D-22): frozen `CONFIG.clampTables` — webkit rate max 2.0 (Safari hard cap), chromium rate max 4.0 (audible band), min 0.5 both; `clampForPlatform` runs on every lever value before writing; `_clampForPlatform` test handle proves the spec
- Platform seam (D-21): `env.platform` DI override ('webkit'|'chromium') validated loudly in resolveEnv (CORE-04), UA-sniffed default; the harness passes explicit platforms
- FakeVideoElement media stubs (STACK.md:40): playbackRate/volume/muted/loop/paused/currentTime/duration/play/pause/preservesPitch — additive, src mirror unchanged
- Full-stack reconcile: phase 3 now applies saturation + playbackRate + volume together and `revertAll()` restores all three (T-L29); the escalation profile is phase-gated per the T15-locked matrix (T-L30)
- Both hosts green: Node 485 assertions (up from 425), Edge headless 453 (32 Node-only source-scan asserts — parity contract holds)

## Task Commits

Both tasks land in one feat commit plus the docs commit (the LEVR suite is one contiguous test insertion and the two tasks' engine work interleaves — the 03-01/02-04 precedent):

1. **Tasks 1+2: Playback + Volume levers + clamp tables** - `feat(03-02): Playback + Volume levers + per-platform clamp tables (LEVR-02/03/08)`
2. **Plan metadata / phase docs** - `docs(03-02): complete Phase 3 plan 02 — summary, state, roadmap, requirements`

## Files Created/Modified
- `src/slowgram.js` - resolveEnv platform validation + default; CONFIG.clampTables + leverParams.playbackRate/volume; `clampForPlatform()`; `playbackApp` (apply/revert with pitch preservation); `volumeApp` (apply/revert with the muted gate); `SlowGram._clampForPlatform` test handle
- `test/harness.js` - FakeVideoElement media stubs (playbackRate/defaultPlaybackRate/volume/muted/loop/autoplay/paused/currentTime/duration/ended/preservesPitch/play/pause)
- `test/slowgram.test.js` - T-L19..T-L31 (LEVR 03-02 suite) + SCAN additions (muted-assignment, playbackRate/clamp literals); freshEnv platform passthrough

## Decisions Made
- Clamp spec values locked (D-22): webkit rate max 2, chromium rate max 4 (audible), min 0.5 both; volume max 1 both.
- Playback values (D-23): 0.9/0.8 — subtle slow-down, pitch forced.
- Volume factor (D-24): 0.5 at phase 3, applied to the captured original.
- The muted-assignment scan required a `(?!=)` negative lookahead — the read gate `video.muted === true` matched the first '=' of '==='; the scan now proves zero ASSIGNMENTS (the actual Anti-Pattern 2 contract).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The `\.muted\s*=` source scan false-positived on the volume gate's `video.muted === true` comparison — fixed with a `(?!=)` lookahead (assignment-only matching). Not an engine bug; a scan-precision fix.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- 03-03 (Autoplay loop-block + Buffer capstone) consumes the hub unchanged: the 'autoplay' matrix key already exists at phase 3; FakeVideoElement now has loop/autoplay/paused/play/pause/ended stubs for the loop-removal + pause-on-ended behavior; CONFIG.leverParams gets an autoplay block
- The clamp-table pattern (clampForPlatform) is the template for any future lever limit; Phase 5's WebKit clamp model asserts against the same frozen CONFIG.clampTables
- Phase 5 device gate: on-device unmuted-volume test + rate-clamp verification (PITFALLS:84,308)

## Self-Check: PASSED
- FOUND: src/slowgram.js, test/harness.js, test/slowgram.test.js, 03-02-SUMMARY.md
- FOUND: Node 485 assertions green (exit 0); Edge headless harness.html 453/453
- FOUND: feat commit (Tasks 1+2) + docs commit

---
*Phase: 03-degradation-levers*
*Completed: 2026-08-15*
