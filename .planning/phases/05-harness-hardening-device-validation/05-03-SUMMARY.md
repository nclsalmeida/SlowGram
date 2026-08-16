---
phase: 05-harness-hardening-device-validation
plan: 03
subsystem: testing
tags: [social-matrix, preserved-routes, trust-contract, levers, snapshot]
requires:
  - phase: 05-02
    provides: the wall-clock suite (same suite file; no interplay)
  - phase: 02-dom-detection
    provides: classifyPathname decision table, preservedRoutes CONFIG, the buildSocialRoute fixture (dom-mocks)
  - phase: 03-degradation-levers
    provides: the four applicators + revertAll/applyAll (the levers the matrix sweeps)
provides:
  - T-S01..T-S08 social matrix suite — the full cartesian preservedRoutes × levers + overlay sweep
  - snapshotFor() pre/post snapshot helper — the honest detour-transparency assert (D-9)
  - The D-16 ida-e-volta contract proven: legitimate degradation re-applies on return to /reels/
  - The SPA popstate navigation driver for route changes (the poll stops on SOCIAL by design)
affects: [05-05 (kill-switch revert shares revertAll), 05-06 (device checklist social item), trust-contract future work]
actuals:
  tokens: 24000
  tasks: 2
  commits: 1
tech-stack:
  added: []
  patterns: [SPA popstate navigation driver, pre/post JSON snapshot equality, matrix sweep over CONFIG arrays]
key-files:
  created: []
  modified: [test/slowgram.test.js]
key-decisions:
  - "Route changes are driven by the SPA popstate signal (refresh('route')) — NOT pathname+flush: the rAF poll stops on SOCIAL by design (running=false), so a flush alone cannot return the engine to REELS"
  - "The 'nothing persists' assert is a JSON snapshot equality (levers + elapsed + phase + overlay + wrapper filter) — a dirty pre-detour state can never pass"
  - "T-S08 asserts cleanliness WHILE on the preserved route (native targets), consistent with T-S05's re-application on return — the two sides of the same contract"
---

# Plan 05-03 — Social Matrix (HARN-03) Summary

## What was built

The first-class social-preservation suite: the full cartesian matrix — every `CONFIG.preservedRoutes` entry × every lever (saturation, playbackRate, volume, autoplay) + the overlay — asserting NOTHING applies on any preserved route and NOTHING persists through the detour, via an honest pre/post snapshot equality. The return path proves the D-16 ida-e-volta contract: legitimate degradation is RE-APPLIED on return to /reels/ (the detour is transparent, it does not kill the degradation state).

## Verification (both hosts)

- **Node:** `node test/slowgram.test.js` — **818 assertions passed** (757 + 61 new)
- **Edge headless harness.html:** **TOTAL: 766 passed / 766 run** — parity holds (818 − 52 Node-only scans)
- **T-S01:** every preserved route classifies SOCIAL, applies no lever, hides the overlay — 6 routes swept
- **T-S02:** full detour through ALL routes and back → state IDENTICAL to the pre-detour snapshot (nothing persisted)
- **T-S03/T-S04:** overlay predicate joins the matrix; all four levers verified applied at phase 3 (meaningful precondition)
- **T-S05:** re-application on return — saturation/playbackRate/volume/autoplay all re-applied; wrapper filter matches the pre-detour value
- **T-S06:** social time never accumulates — elapsed flat through a 4-min detour, return snapshot matches
- **T-S07:** the matrix holds on the REAL Instagram social shape (buildSocialRoute — no role=main feed)
- **T-S08:** zero residue on the preserved route — filter/playbackRate/volume all native, overlay hidden

## Notes

- One real driver insight: after SOCIAL, the rAF poll stops (running=false) — returning to REELS via pathname+flush alone does nothing. The SPA popstate signal (refresh('route')) is the honest navigation driver, matching how the real Instagram SPA navigates.
- Test-only plan: zero engine changes, zero new dependencies, both hosts green.
