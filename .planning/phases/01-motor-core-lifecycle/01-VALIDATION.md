---
phase: 1
slug: motor-core-lifecycle
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-15
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — hand-rolled ~30-line assert runner in `test/harness.js` (zero dependencies, per CORE-04/CORE-06/HARN-07) |
| **Config file** | none — files loaded via `<script>` tags in `test/harness.html`; no framework config |
| **Quick run command** | `node test/slowgram.test.js` |
| **Full suite command** | `node test/slowgram.test.js` + open `test/harness.html` in a browser (same tests, two hosts) |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node test/slowgram.test.js`
- **After every plan wave:** Run `node test/slowgram.test.js` + `test/harness.html` smoke (open in Edge)
- **Before `/gsd-verify-work`:** Full suite must be green on both hosts
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | CORE-01 | T-1-01 / — | Engine exceptions never propagate to host page | unit | `node test/slowgram.test.js` (clock suite) | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 1 | CORE-02 | — | N/A | unit | `node test/slowgram.test.js` (phase suite) | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 1 | CORE-03 | — | N/A | unit | `node test/slowgram.test.js` (fatigue suite) | ❌ W0 | ⬜ pending |
| 1-01-04 | 01 | 1 | CORE-04 | T-1-04 / — | Validate injected `env` shape defensively; fail loudly, not crash host | unit + smoke | `node test/slowgram.test.js` (DI suite) + `test/harness.html` | ❌ W0 | ⬜ pending |
| 1-01-05 | 01 | 1 | CORE-05 | T-1-05 / — | deepFreeze; strict-mode write throws | unit | `node test/slowgram.test.js` (config suite) | ❌ W0 | ⬜ pending |
| 1-01-06 | 01 | 1 | CORE-06 | — | N/A | unit + smoke | `node test/slowgram.test.js` + `test/harness.html` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/harness.js` — FakeClock (`now`/`advance`), FakeDocument (visibilityState + addEventListener/dispatchEvent), FakeWindow (addEventListener/dispatchEvent), FakeMutationObserver stub, assert runner + result table renderer
- [ ] `test/slowgram.test.js` — suites for clock, phase machine, fatigue, DI seam, CONFIG freezing
- [ ] `test/harness.html` — `<script>` tags for engine + harness + tests, renders pass/fail table
- [ ] `src/slowgram.js` — the engine IIFE itself (the unit under test)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Browser smoke run of same engine file | CORE-04, CORE-06 | Node mocks prove the DI seam; a real browser host is the other half of the "same file, two hosts" contract | Open `test/harness.html` in a browser; confirm the pass/fail table renders green for all suites |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending