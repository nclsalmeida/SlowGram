---
phase: 4
slug: overlay-polish
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-15
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test-style assertion runner in `test/slowgram.test.js` (project's existing harness, same as Phases 1-3) |
| **Config file** | none — plain node assertions (existing pattern) |
| **Quick run command** | `node test/slowgram.test.js` |
| **Full suite command** | `node test/slowgram.test.js` |
| **Estimated runtime** | ~2-3 seconds (Phase 1-3 suite: 560 assertions) |

---

## Sampling Rate

- **After every task commit:** Run `node test/slowgram.test.js`
- **After every plan wave:** Run `node test/slowgram.test.js` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~3 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | OVER-01 | T-04-01 | overlay host only exists on REELS phase >= 1, non-interactive | unit | `node test/slowgram.test.js` | ✅ existing suite | ⬜ pending |
| 04-01-02 | 01 | 1 | OVER-01 | T-04-01 | pointer-events none everywhere; z-index from CONFIG | unit | `node test/slowgram.test.js` | ✅ | ⬜ pending |
| 04-02-01 | 02 | 2 | OVER-01 | T-04-02 | 1/s value-throttled update, no timer APIs (source scan) | unit | `node test/slowgram.test.js` | ✅ | ⬜ pending |
| 04-02-02 | 02 | 2 | OVER-01 | T-04-02 | text = floored minutes + CONFIG.overlay.unitLabel; tabular-nums width | unit | `node test/slowgram.test.js` | ✅ | ⬜ pending |
| 04-03-01 | 03 | 3 | OVER-02 | T-04-03 | instant hide on SOCIAL/UNKNOWN; never visible on preserved routes | unit | `node test/slowgram.test.js` | ✅ | ⬜ pending |
| 04-03-02 | 03 | 3 | OVER-03 | T-04-03 | hidden while `webkitDisplayingFullscreen`; restored on exit | unit | `node test/slowgram.test.js` | ✅ | ⬜ pending |
| 04-04-01 | 04 | 4 | OVER-01 | T-04-04 | visibilitychange hide/reappear; fade transitions; destroy removes host | unit | `node test/slowgram.test.js` | ✅ | ⬜ pending |
| 04-04-02 | 04 | 4 | OVER-01/02/03 | T-04-04 | overlayHost D-14 seam: overlay DOM writes do not re-trigger the observer | unit | `node test/slowgram.test.js` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — no new framework or fixtures needed. The Phase 1-3 harness (fake clock, fake MutationObserver, FakeVideoElement, real-DOM smoke) is reused.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pill legibility + coexistence with Instagram Web chrome | OVER-01 | Visual judgment over real video frames and real IG DOM (pixel/contrast) | Open demo.html on /reels/ at phase >= 1; verify the pill reads "N min", sits bottom-left above the caption, never blocks taps, and is hidden on a social route, in fullscreen, and on hidden tab |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none — existing harness)
- [x] No watch-mode flags
- [x] Feedback latency < 3s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
