---
phase: 05-harness-hardening-device-validation
plan: 06
subsystem: validation
tags: [on-device, checklists, webview, wkbwebkit, device-check]
requires:
  - phase: 05-05
    provides: the kill-switch (the emergency exit the checklist points to if a device item misbehaves)
  - phase: 03-degradation-levers
    provides: the clamp tables + leverParams the device page displays (D-21/D-22/D-24)
  - phase: 04-overlay-polish
    provides: the overlay pill guarantees the checklist verifies on-device (OVER-01..03)
provides:
  - device-check.html — standalone zero-dep page running the REAL engine against the REAL device DOM (live verdict + clamp tables + lever values)
  - 05-DEVICE-CHECKLISTS.md — 3 surfaces × 6 items, each mapped 1:1 to a guarantee, variance annotated not gated
  - The HARN-06 human checkpoint: the checklist records the on-device run that completes the milestone's validation story
affects: [05-07 (the closing parity gate), 05-VERIFICATION (the human run evidence), the milestone ship decision]
actuals:
  tokens: 24000
  tasks: 2
  commits: 1
tech-stack:
  added: []
  patterns: [standalone zero-dep browser page (demo.html analog), real-engine-against-real-DOM, annotate-don't-gate checklist tables]
key-files:
  created: [device-check.html, .planning/phases/05-harness-hardening-device-validation/05-DEVICE-CHECKLISTS.md]
  modified: []
key-decisions:
  - "device-check.html runs the REAL engine (src/slowgram.js) with no harness/fixtures — the verdict on a blank file:// page is honestly UNKNOWN/phase 0; the checklist directs the feed-side items to the bookmarklet flow"
  - "The overlay/filter/volume/reset items cannot be asserted headlessly — they are human-visual on real devices (RESEARCH Pattern F), with variance annotated, never gated"
  - "The checklist maps every item to its guarantee ID (D-21/D-22, D-15, D-24, HARN-02, HARN-03, OVER-01..03) so the completed record is verifiable evidence, not anecdote"
---

# Plan 05-06 — On-Device Validation (HARN-06) Summary

## What was built

The human checkpoint of the phase: `device-check.html` — a standalone zero-dependency page the user opens on each real device (iOS Safari, Android Chrome, Android WebView) that runs the REAL engine against the REAL device DOM, shows the live verdict (context/phase/elapsed from getState), the frozen clamp tables (webkit/chromium), and the per-phase lever values from CONFIG. Plus `05-DEVICE-CHECKLISTS.md` — the per-platform checklist where every item maps 1:1 to an existing engine guarantee, with variance annotated, never gated.

## Verification

- **device-check.html renders in a real browser (Edge headless dump-dom):** live verdict populated (Context: UNKNOWN / Phase: 0 — honest for a blank file:// page), webkit + chromium clamp tables rendered (0.5/2.0/4.0), lever values rendered (0.85/0.65/0.4), no "carregando…" placeholder left, no init/render errors
- **node test/slowgram.test.js stays green** (no regression — this plan is a human-validation deliverable, no suite change)
- **05-DEVICE-CHECKLISTS.md:** three platform sections (iOS Safari / Android Chrome / Android WebView), six items each, every item carries its guarantee reference (D-21/D-22, D-15, D-24, HARN-02, HARN-03, OVER-01..03), variance-note column + annotate-don't-gate rule, and a How-to-run block (file:// open + bookmarklet flow)

## Notes

- The HUMAN device run (physical devices, the checklist record) is the phase checkpoint — it feeds the final 05-VERIFICATION.md as the HARN-06 evidence. This plan delivered the page + checklists; the run itself is the `autonomous: false` gate.
- Zero new dependencies; zero suite changes; the engine is untouched.
