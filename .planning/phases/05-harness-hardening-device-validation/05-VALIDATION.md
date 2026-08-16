---
phase: 5
slug: harness-hardening-device-validation
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-15
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node built-in `node:test` (zero-dependency, no framework — HARN-07) |
| **Config file** | none — plain `node --test` script, no framework |
| **Quick run command** | `node test/slowgram.test.js` |
| **Full suite command** | `node test/slowgram.test.js` (+ Edge headless smoke: `EDGE=<path> node test/slowgram.test.js`) |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node test/slowgram.test.js`
- **After every plan wave:** Run full suite + Edge headless smoke (dual-host parity)
- **Before `/gsd-verify-work`:** Full suite must be green (both hosts)
- **Max feedback latency:** ~3 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | HARN-01 | T-5-01 / — | batch yields at cap, never over | unit | `node test/slowgram.test.js` | ✅ | ⬜ pending |
| 05-01-02 | 01 | 1 | HARN-01 | T-5-01 / — | finite-frame drain under 5k churn | unit | `node test/slowgram.test.js` | ✅ | ⬜ pending |
| 05-02-01 | 02 | 2 | HARN-02 | T-5-02 / — | counting equivalence + hidden=0 | unit | `node test/slowgram.test.js` | ✅ | ⬜ pending |
| 05-02-02 | 02 | 2 | HARN-02 | T-5-02 / — | reset equivalence (gap > window) | unit | `node test/slowgram.test.js` | ✅ | ⬜ pending |
| 05-02-03 | 02 | 2 | HARN-02 | T-5-02 / — | WebView missed-event scenario | unit | `node test/slowgram.test.js` | ✅ | ⬜ pending |
| 05-03-01 | 03 | 3 | HARN-03 | T-5-03 / — | cartesian matrix: no lever persists on social | unit | `node test/slowgram.test.js` | ✅ | ⬜ pending |
| 05-03-02 | 03 | 3 | HARN-03 | T-5-03 / — | pre/post snapshot + re-application on return | unit | `node test/slowgram.test.js` | ✅ | ⬜ pending |
| 05-04-01 | 04 | 4 | HARN-04 | T-5-04 / — | selector fixture test names missing selector | unit | `node test/slowgram.test.js` | ✅ | ⬜ pending |
| 05-05-01 | 05 | 5 | HARN-05 | T-5-05 / — | kill-switch flip: next flush does zero work | unit | `node test/slowgram.test.js` | ✅ | ⬜ pending |
| 05-05-02 | 05 | 5 | HARN-05 | T-5-05 / — | re-enable resumes accumulation | unit | `node test/slowgram.test.js` | ✅ | ⬜ pending |
| 05-06-01 | 06 | 6 | HARN-06 | T-5-06 / — | device-check.html + per-platform checklists | manual | on-device runbook | ✅ | ⬜ pending |
| 05-07-01 | 07 | 7 | HARN-07 | T-5-07 / — | dual-host parity formalized (Node/Edge) | unit | `node test/slowgram.test.js` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] none — existing infrastructure covers all phase requirements (harness, fakes, dual-host runner already in place from Phases 1–4)

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| iOS filter rendering on video | HARN-06 | WebKit CSS filter variance documented — only a real device can judge visual result | Run device-check.html on iOS Safari; confirm saturation/filter visual on a real Reel |
| Volume audibility | HARN-06 | Audio output cannot be asserted headlessly | Run device-check.html; confirm lever lowers volume audibly |
| 6-min background reset | HARN-06 | Real background/tab behavior (iOS throttling) is device-specific | Background the tab 6+ min, return, confirm elapsed reset |
| WebView vs browser variance | HARN-06 | Three distinct surfaces (iOS WKWebView / Android Chrome / Android WebView) render differently | Run the checklist on each platform; annotate variance, no hard gate |

*Manual-only items all map to HARN-06 (on-device validation) — everything else is automated.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
