---
phase: 2
slug: dom-detection-scoping
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-15
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded by plan-phase from 02-RESEARCH.md "Validation Architecture" (:481-514) and the plan-task map.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — hand-rolled assert runner in `test/harness.js` (zero dependencies, per CORE-04/CORE-06/HARN-07) |
| **Config file** | none — files loaded via `<script>` tags in `test/harness.html`; no framework config |
| **Quick run command** | `node test/slowgram.test.js` |
| **Full suite command** | `node test/slowgram.test.js` + `test/harness.html` browser host + Edge headless smoke: `& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless --disable-gpu --no-sandbox --user-data-dir=<fresh temp profile> --dump-dom "file:///C:/Users/Usuario/Downloads/EcoInsta/test/harness.html" 2>$null \| Out-String` (grep `TOTAL: N passed / N run`) |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node test/slowgram.test.js`
- **After every plan wave:** Full suite (Node + browser host + Edge headless smoke); parity count measured live, never hard-coded
- **Before `/gsd-verify-work`:** Full suite green on both hosts
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 02-01 | 1 | DETC-01, DETC-07 | T-02-01 / T-02-03 | pathname authoritative; UNKNOWN never degrades; narrow roots; zero DOM queries in batch | unit | `node test/slowgram.test.js` (tracer suite T-D1..T-D5) | ❌ W0 | ⬜ pending |
| 2-01-02 | 02-01 | 1 | DETC-07, DETC-06 | T-02-04 | fixtures encode real evidence; `verifiedSelectors` list bounds all queries; real-DOM verification task | unit + integration | `node test/slowgram.test.js` + Edge headless dump validation | ❌ W0 | ⬜ pending |
| 2-02-01 | 02-02 | 2 | DETC-01, DETC-03 | T-02-06 | exhaustive decision table; never-upgrade asserted both directions; UNKNOWN safe | unit | `node test/slowgram.test.js` (DETC-01/03 suite T-D6..T-D9) | ❌ W0 | ⬜ pending |
| 2-02-02 | 02-02 | 2 | DETC-02 | T-02-05 | History API interception + rAF fallback; destroy() restores originals | unit | `node test/slowgram.test.js` (DETC-02 suite T-D10..T-D16) | ❌ W0 | ⬜ pending |
| 2-03-01 | 02-03 | 3 | DETC-04, DETC-08 | T-02-08 / T-02-09 / T-02-10 | two-root observer + locked attributeFilter; mutating-flag self-filter; disconnect on SOCIAL/UNKNOWN, keep registry | unit | `node test/slowgram.test.js` (DETC-04/08 suite T-D17..T-D25) | ❌ W0 | ⬜ pending |
| 2-03-02 | 02-03 | 3 | DETC-05 | T-02-11 | WeakMap registry; loadstart/emptied reset; idempotent register; no leak | unit | `node test/slowgram.test.js` (DETC-05 suite T-D26..T-D31) | ❌ W0 | ⬜ pending |
| 2-04-01 | 02-04 | 4 | DETC-06 | T-02-12 / T-02-13 / T-02-14 | N=5 drift lifecycle; fail-loud dev / fail-soft prod; class-free selectors asserted | unit | `node test/slowgram.test.js` (DETC-06 suite T-D32..T-D38) | ❌ W0 | ⬜ pending |
| 2-04-02 | 02-04 | 4 | DETC-07 | T-02-15 | demo.html renders deterministic detection verdict; two-host smoke green | integration + smoke | `node test/slowgram.test.js` + Edge headless `test/harness.html` + `demo.html` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Test numbering is continuous (T-D1..T-D39), zero gaps/duplicates.*

---

## Wave 0 Requirements

- [ ] `test/harness.js` — record-producing FakeMutationObserver (observe/disconnect/takeRecords + record queue, replacing the stub at :78), FakeElement mini-DOM (`contains`, `appendChild`/`removeChild` for feed recycling), FakeVideoElement (`src` + `loadstart`/`emptied` dispatch), FakeLocation (`pathname`, `setPathname`, `history.pushState`/`replaceState`, `dispatchPopstate`/`dispatchHashchange`)
- [ ] `test/fixtures/instagram-shapes.js` — fixture builder derived from the verified live dump (RESEARCH.md:58 shape) + logged-in shape per A1/A2; exposes `instaShapes.SHAPES`; `verifiedSelectors` = `['video', '[role="main"]', '[role="dialog"]']`
- [ ] `test/dom-mocks/instagram-mock.js` — mock builder composing FakeElement trees from fixture shapes (DETC-07)
- [ ] `test/slowgram.test.js` — DETC-01..08 suites (T-D1..T-D39), appended after Phase 1 suites
- [ ] `demo.html` — DETC-07 deliverable, does not exist yet (new)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Browser host run of same engine file | CORE-04, CORE-06, DETC-07 | Node mocks prove the DI seam; a real browser host is the other half of the "same file, two hosts" contract | Open `test/harness.html` in Edge; confirm the pass/fail table renders green for all suites; parity with Node host |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending