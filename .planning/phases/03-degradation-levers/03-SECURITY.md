---
phase: 03
slug: degradation-levers
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-08-15
---

# Phase 03 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| page DOM structure → wrapper selection | parentNode chain is untrusted evidence; the walk must stay bounded (never BODY/HTML, never the video) or the filter lands on the wrong surface | DOM structure (untrusted) → style write target |
| engine style writes → host page | the lever writes wrapper.style.filter; a failure must log, never break the host; the write must not retrigger the observer (D-14) | style property write → host page |
| context verdict → lever application | apply must be REELS-only; revert must be context-agnostic (social/reset trust contract) | context verdict → lever state |
| platform verdict → lever limits | env.platform is untrusted input; the clamp tables must be the single source of limits and clamping must never throw | platform string → numeric limits |
| video media state → lever application | muted/volume/playbackRate are untrusted evidence; the volume lever must never write muted (WebKit pause) and never write out-of-band values (silent no-ops) | media property state → lever values |
| video attribute state → autoplay behavior | the loop attribute is untrusted evidence; removal must be exact (removeAttribute, never loop=false) and reversible (origHadLoop) | attribute presence → autoplay behavior |
| ended event → stop point | the ended listener must only act when the lever is applied (phase 3) — never pause outside the stop point | event → pause action |
| buffer flag → stall behavior | the stall must be default-off, frame-counted (no timers), and cancelled cleanly on revertAll | config flag → stall state |
| lever writes ↔ video native state | the full-stack round-trip must restore EXACTLY the captured originals (origFilter/origPlaybackRate/origVolume/origHadLoop) — a partial restore is a silent product leak | lever state → native media state |
| registry ↔ lifecycle | destroy/re-init and feed churn must not duplicate listeners, leak elements, or carry stale appliedLevers across instances | registry entries ↔ lifecycle events |
| buffer stall ↔ context | a stall started at the stop point must never outlive the REELS surface — SOCIAL/reset cancels it or it resumes off-surface | stall state → playback |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-03-01 | Tampering | wrapper walk selecting a transformed/big ancestor | high | mitigate | D-15 bounded walk: skip transformed, stop at BODY/HTML (null → skip), never the video; locked by T-L8/T-L9/T-L10 | closed |
| T-03-02 | Tampering | lever applied outside REELS (scope leakage) | high | mitigate | applyToVideo/applyAll guard `context === 'REELS'`; SOCIAL/UNKNOWN → revertAll; UNKNOWN never degrades (T-L6/T-L18) | closed |
| T-03-03 | Denial of Service | registryElements leak on feed virtualization (long session) | medium | mitigate | batch removedNodes pruning (T-L12); WeakMap still GC-safe for state | closed |
| T-03-04 | Spoofing | stale appliedLevers after media reset (recycled node) | medium | mitigate | loadstart/emptied clear appliedLevers; apply-after-load re-applies (T-L13/T-L16) | closed |
| T-03-05 | Tampering | saturation value drift (magic literals) | low | mitigate | values only in CONFIG.leverParams; T-L14 source scan forbids literals | closed |
| T-03-06 | Tampering | out-of-band playbackRate silently no-ops on WebKit | high | mitigate | clampForPlatform through CONFIG.clampTables (webkit max 2.0); T-L24 proves the clamp | closed |
| T-03-07 | Tampering | programmatic muted write pauses iOS playback | high | mitigate | volume lever never assigns muted (gate + source scan, T-L32a); only read gate `video.muted === true` present | closed |
| T-03-08 | Tampering | volume applied to muted/zero-volume videos is inert or wrong | medium | mitigate | LEVR-03 gate (muted !== true && volume > 0) + feature-detect (T-L27/T-L28) | closed |
| T-03-09 | Tampering | platform seam misdetection | low | mitigate | DI override validated loudly; UA sniff is a default only; tests pass explicit platforms | closed |
| T-03-10 | Tampering | loop="false" instead of removal (attribute presence keeps looping) | high | mitigate | removeAttribute('loop') only; source scan forbids loop=false (T-L42a); comments only, no write | closed |
| T-03-11 | Tampering | ended-pause firing outside the stop point (breaks autoplay below phase 3) | medium | mitigate | the ended listener gates on appliedLevers.autoplay (T-L38/T-L41) | closed |
| T-03-12 | Tampering | timer-based buffer stall (violates the Phase 1 ban) | high | mitigate | frame-counted on the rAF carrier; timer scan stays green (T-L42); no setTimeout/setInterval in source | closed |
| T-03-13 | Denial of Service | a cancelled stall resumes a video after revertAll (social leak) | low | mitigate | revertAll clears bufferStall (T-03-13 in tests) | closed |
| T-03-20 | Tampering | partial revert — one lever restored, others left degraded after SOCIAL/reset | high | mitigate | T-L45/T-L46 assert the FULL native set in one round-trip | closed |
| T-03-21 | Tampering | listener duplication across init/destroy cycles (ended/loadstart/emptied bound twice) | high | mitigate | `_bound` flag + T-L47 assert (video.listeners.ended length 1) | closed |
| T-03-22 | Denial of Service | a cancelled buffer stall resumes a video after SOCIAL (off-surface playback) | medium | mitigate | revertAll clears bufferStall; T-L49 spies play() and asserts zero calls | closed |
| T-03-23 | Information Disclosure | an applicator map key drifting from the matrix (lever applied outside its phase or buffer entering the map) | medium | mitigate | T-L51a source scan locks the 4-key set and bans 'buffer' in the map | closed |
| T-03-SC | Tampering | npm/pip/cargo installs | low | accept | zero new packages this phase — no install task, no [ASSUMED]/[SUS] packages to vet | closed |

*Status: open · closed · open — below {block_on} threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| SC-1 | T-03-SC (03-01) | Zero new packages this phase — no install task, no [ASSUMED]/[SUS] packages to vet | Plan author (roadmap/planner) | 2026-08-15 |
| SC-2 | T-03-SC (03-02) | Zero new packages this phase — no install task, no [ASSUMED]/[SUS] packages to vet | Plan author (roadmap/planner) | 2026-08-15 |
| SC-3 | T-03-SC (03-03) | Zero new packages this phase — no install task, no [ASSUMED]/[SUS] packages to vet | Plan author (roadmap/planner) | 2026-08-15 |
| SC-4 | T-03-SC (03-04) | Zero new packages this phase — no install task, no [ASSUMED]/[SUS] packages to vet | Plan author (roadmap/planner) | 2026-08-15 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-15 | 21 | 21 | 0 | gsd secure-phase (L1 short-circuit: register at plan time, asvs_level 1, threats_open 0) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-08-15
