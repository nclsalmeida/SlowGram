---
phase: 05-harness-hardening-device-validation
created: 2026-08-15
---

# SlowGram — On-Device Validation Checklist (HARN-06)

> The milestone's validation is only honest on the surfaces the product ships on.
> Three distinct rendering surfaces exist (RESEARCH Pattern F — verified):
> **iOS Chrome IS WKWebView** (WebKit engine, not Chromium), **Android WebView**
> is a Chromium-based embedding **distinct from Chrome Android**. CSS `filter` on
> video elements renders inconsistently across WebKit surfaces. The checklist is
> therefore **human-visual on real devices**, with variance **annotated, never
> gated** (a surface that renders differently gets a variance note, not a fail).

## How to run

1. Open `device-check.html` on the device (from `file://` — copy the file over or
   serve it locally). Confirm the verdict panel + clamp tables render (Item 1).
2. Inject the engine into the real Instagram feed tab (bookmarklet: the contents
   of `src/slowgram.js` + `SlowGram.init()`). Navigate to `/reels/` and let it run.
3. Execute each item below per platform, record `observed` + `variance note`.
4. Items map 1:1 to engine guarantees — the reference IDs are cited per item.

---

## Platform A — iOS Safari (WebKit)

| # | Item | Expected | Observed | Variance note |
|---|------|----------|----------|---------------|
| 1 | **Clamps displayed** (D-21/D-22) | device-check.html renders the webkit clamp table (playbackRate 0.5–2.0, volume 0–1); a rate pushed past 2.0 is clamped by Safari (no-op) | | |
| 2 | **iOS filter visual** (D-15) | a real Reel at phase 1: the saturation filter on the wrapper is imperceptible-to-gradual (the wrapper-not-video mitigation); record what WebKit actually renders | | |
| 3 | **Volume audibility** (D-24) | phase 3: the volume lever lowers the video audibly (relative 0.5 factor) | | |
| 4 | **6-min background reset** (HARN-02) | background the tab 6+ min (iOS throttling pauses rAF), return: elapsed reset to post-resume — the session never counted the hidden time | | |
| 5 | **Social preservation** (HARN-03) | navigate to /direct/ (and one more preserved route): no degradation, no overlay, native feed; return to /reels/ re-applies | | |
| 6 | **Overlay pill** (OVER-01..03) | REELS ≥ 3 min: the "N min" pill appears bottom-left, non-interactive; absent on social/fullscreen/hidden tab | | |

## Platform B — Android Chrome (Chromium)

| # | Item | Expected | Observed | Variance note |
|---|------|----------|----------|---------------|
| 1 | **Clamps displayed** (D-21/D-22) | device-check.html renders the chromium clamp table (playbackRate 0.5–4.0 — the audible band, volume 0–1) | | |
| 2 | **iOS filter visual** (D-15) | the saturation wrapper filter is gradual (Chromium renders CSS filter on video wrappers more consistently than WebKit); confirm visually | | |
| 3 | **Volume audibility** (D-24) | phase 3: volume lever audibly lowers (within the 0–1 band) | | |
| 4 | **6-min background reset** (HARN-02) | background 6+ min, return: elapsed reset to post-resume | | |
| 5 | **Social preservation** (HARN-03) | /direct/ (+ one more preserved route): native feed, no overlay; return re-applies | | |
| 6 | **Overlay pill** (OVER-01..03) | REELS ≥ 3 min: pill bottom-left, non-interactive; absent on social/fullscreen/hidden | | |

## Platform C — Android WebView (embedded, distinct from Chrome)

| # | Item | Expected | Observed | Variance note |
|---|------|----------|----------|---------------|
| 1 | **Clamps displayed** (D-21/D-22) | device-check.html renders the chromium clamp table (WebView is Chromium-based) — annotate any feature-flag differences | | |
| 2 | **iOS filter visual** (D-15) | the saturation wrapper filter is gradual; annotate any WebView-specific rendering gap (feature flags differ from Chrome Android) | | |
| 3 | **Volume audibility** (D-24) | phase 3: volume lever audibly lowers | | |
| 4 | **6-min background reset** (HARN-02) | background 6+ min (WebView lifecycle may kill/restart the page — note it), return: elapsed reset to post-resume | | |
| 5 | **Social preservation** (HARN-03) | /direct/ (+ one more preserved route): native feed, no overlay; return re-applies | | |
| 6 | **Overlay pill** (OVER-01..03) | REELS ≥ 3 min: pill bottom-left, non-interactive; absent on social/fullscreen/hidden | | |

---

## Recording rules

- **Annotate, don't gate:** a rendering difference (e.g. iOS shows the filter
  more/less aggressively) is a variance NOTE, never a fail — the guarantee is the
  engine's behavior (gradual, contained, reversible), which the suite proves.
- **The kill-switch is the emergency exit:** if any item misbehaves on a device,
  flip `CONFIG.killSwitch.enabled` to `false` in the build — the engine reverts
  to native within one frame (HARN-05).
- Record the device model + OS version per run; append the completed tables to
  the phase verification report (05-VERIFICATION.md) as the HARN-06 evidence.
