# Stack Research

**Domain:** Vanilla JS anti-addiction degradation engine (SlowGram) — injectable IIFE for WKWebView (iOS) / WebView (Android) running Instagram web
**Researched:** 2026-08-15
**Confidence:** MEDIUM (cross-verified web sources; all recommendations are Baseline web-platform APIs — no external packages to pin)

## Executive Position

**Stack verdict: zero new technologies.** The v1 motor's five degradation levers (color saturation, playbackRate, relative volume, autoplay-loop block, simulated buffer) map 1:1 onto native, Baseline web-platform APIs that have shipped in both WebKit and Chromium for a decade. The only genuinely hard constraint discovered is the **iOS `volume` quirk** (see Pitfall-lever table below) — it changes the volume-lever design on WKWebView and must be feature-detected, not assumed. The test harness is a hand-rolled dependency-injection harness (fake clock + fake MutationObserver + fake media element + tiny assert runner) that runs in a plain browser page via `<script>` tags. **Nothing is installed via npm; there is no build step.**

---

## Recommended Stack

### Core Technologies (all native web platform — no packages)

| Technology | Version/Baseline | Purpose | Why Recommended |
|------------|------------------|---------|-----------------|
| `CSS filter: saturate()` (inline `el.style.filter`) | Baseline since Safari 6 / Chrome 18 (2012); universal in modern WebKit + Chromium | Color-saturation degradation lever | GPU-composited in both engines; applies directly to `<video>` without flags; static saturate is cheap (only animated heavy blurs cause mobile jank). Apple's own docs show filters on video since Safari 6. **Apply to the video element itself** — cross-origin/CDN video without CORS can break some filter combos, but Instagram Reels media is same-origin, so direct application is safe. |
| `HTMLMediaElement.playbackRate` | Baseline Widely available since July 2015 (Chrome 4+, Safari 3.1+, iOS Safari 3.2+, Android WebView + Chrome Android all green on caniuse) | Playback-speed degradation lever | WebKit bug 55943 (play() resetting playbackRate to defaultPlaybackRate) was **fixed in 2011** — a JS `play()` call no longer resets your rate, only the built-in UI does. `preservesPitch` defaults true (audio pitch corrected). Stay in 0.25–4.0 to keep audio audible; subtle degradation uses ~0.85–0.95. |
| `HTMLMediaElement.volume` (Chromium only) + `muted` (both) | `volume`: **not Baseline** (MDN "Limited availability" — broken on iOS); `muted`: Baseline since July 2015 | Relative-volume attenuation lever | Apple docs: *"volume property is not settable in JavaScript"* on iOS — reading always returns 1 (iOS 13.3+ appears to set then reverts after event loop). Android WebView (Chromium) honors 0–1 normally. **Strategy: feature-detect volume; scale volume on Chromium, fall back to `muted`-only on iOS** (binary: normal vs silent). Do NOT use Web Audio gainNode for v1 — it rewires the element's audio graph and fights autoplay policy. |
| `loop` attribute removal via `MutationObserver` (`attributeFilter:['loop','autoplay']`) | Baseline since July 2015 | Autoplay-loop block lever | `loop` is a boolean **content attribute** — `loop="false"` still loops; only `removeAttribute('loop')` stops it. While `loop` is present, the `ended` event never fires (spec: seek to start and return). Removing it makes `ended` fire → we pause. whatwg/html#2691 confirms `loop` is observable via MutationObserver with `attributeFilter:['loop']`. |
| `visibilitychange` + `document.hidden` | Baseline since July 2015 | Session-fatigue reset (>5 min background) | Standard, universal. Pause-on-hidden saves 5–12% CPU on long sessions. Reset elapsed time when `document.hidden` returns true. |
| `performance.now()` (monotonic) for elapsed-time tracking | Baseline since 2012 | Session timing (not `Date.now()`) | Wall-clock `Date.now()` jumps on timezone/clock changes; monotonic `performance.now()` is immune. Drives the 0–3 / 3–7 / 7–12 / 15+ min phase thresholds. |
| `requestAnimationFrame` for phase polling | Baseline since 2012 | Graceful phase-transition checks | Coalesces checks to display refresh; never blocks scroll (scroll stays 100% native). Do phase computation in rAF, apply lever changes imperatively (no CSS transitions that repaint whole frames). |
| Plain `<div>` overlay: `position:fixed; pointer-events:none; z-index:999999` | n/a (CSS) | Neutral elapsed-time counter + simulated-buffer spinner | Pointer-events:none guarantees zero UX collision (project constraint). Same overlay host doubles as the buffering spinner container (visibility toggled by the buffer lever). |

### Simulated-Buffering Technique (not a library — a pattern)

| Technique | What it is | Why |
|-----------|-----------|-----|
| **UI-level pause + spinner** | `video.pause()` → show spinner overlay → `setTimeout(ms)` → `video.play().catch(()=>{})` | `readyState`/`buffered` are read-only — real buffering state cannot be fabricated. `waiting` event is unreliable to force cross-engine (Chrome readyState lied historically; forcing it via seek can stall players, cf. dash.js #4318). Pause+spinner is deterministic, works identically in WebKit and Chromium, touches no network, and `.catch()` guards autoplay-policy rejections (AbortError). |

### Test Harness (dependency-free, no build step)

| Component | What it is | Purpose |
|-----------|-----------|---------|
| **Fake clock** (`fake.now`, `advance(ms)`) | Injected time source driving `performance.now()`/`Date.now()`, `setTimeout`, rAF | The keystone of determinism — time only moves when a test advances it. Phase transitions (3/7/12/15 min) become `advance(3*60*1000)` calls. |
| **FakeMutationObserver** | Records `MutationRecord`s; `flush()` dispatches callback synchronously | Deterministic re-creation of Instagram's React DOM churn: tests mutate fake DOM attributes (add `loop`, add `autoplay`, swap `role`), flush, assert lever reactions. |
| **FakeVideoElement** | Implements `playbackRate/volume/muted/loop/paused/currentTime/duration`, `play()/pause()`, `addEventListener/dispatchEvent`, `style` (filter) | Every degradation lever's target. Playback is a fake state machine; events fire on demand. |
| **Tiny assert runner** (`test(name, fn)`, `assert.equal/ok/throws`) | ~30 lines, IIFE | Results rendered to a DOM `<table>` with pass/fail counts. No framework import. |
| **Engine DI seam** | Engine IIFE accepts `{clock, MutationObserver, document, window, mediaFactory}` via an init/options object | Makes the same engine file runnable under the harness mocks AND live in the WebView — no separate test build. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Plain browser page (`harness.html` + `<script src>` tags) | Run harness + engine + tests | Open `file://` or serve statically; results render into the page. No bundler, no server framework, no CDN. |
| (Optional) Node `node harness.js` | Same harness outside the browser | Mocks are pure JS, so the same files run under Node for CI — zero extra tooling either way. |

---

## Installation

```bash
# Nothing to install. The project is:
#   src/slowgram.js          -> the injectable engine (IIFE, zero deps)
#   test/harness.js          -> fake clock + FakeMutationObserver + FakeVideoElement + assert runner
#   test/slowgram.test.js    -> test cases (plain JS)
#   test/harness.html        -> opens in browser, <script> tags only
npm init -y   # only if you want a package.json manifest for tooling; NOT required to run
```

There is no `npm install` for runtime or dev. If a lockfile/manifest is desired purely for repo hygiene, keep it empty of dependencies.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `el.style.filter` on video element | CSS class on wrapper + `<style>` rule | The wrapper/class approach breaks on Instagram because React re-renders rewrite className and the DOM is re-virtualized; inline `style.filter` set imperatively and re-applied on MutationObserver hits survives re-renders best. |
| Direct `volume` scaling | Web Audio API `GainNode` (Livekit/Zoom pattern) | Only if precise analog attenuation were required on iOS too. It isn't for v1 (muted-only acceptable), and GainNode rewires the element's audio graph, complicates autoplay, and is far more code — rejected. |
| `loop` attribute removal + pause on `ended` | Overriding `HTMLMediaElement.prototype.play` | Prototype patching is fragile vs. future React player internals and smells like the "automation" the project forbids; attribute-level enforcement is declarative, observable, and testable. |
| `removeAttribute('loop')` | `video.loop = false` | Property set is overridden when React re-sets attributes; content-attribute removal is what actually stops looping, and MutationObserver re-applies it after any React churn. |
| UI-level pause+spinner buffering | Seek-triggered `waiting` event | Forcing `waiting` via seeks is cross-engine unreliable and can permanently stall players (dash.js #4318); pause+spinner is deterministic everywhere. |
| `performance.now()` for elapsed time | `Date.now()` | Wall clock jumps (timezone/clock adjustments) would corrupt phase timing; monotonic clock is the correct primitive. |
| Fake clock DI | `vi.useFakeTimers`/`jest.useFakeTimers`/Playwright `page.clock` | Those require a test framework — explicitly out of scope. The 30-line fake clock gives identical determinism with zero deps. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Bundlers/build tooling (webpack, vite, esbuild, rollup, babel, tsc, turbopack) | The deliverable is a single injectable IIFE pasted into a native container; a build step adds complexity and a fingerprint; zero-dependency constraint is explicit in PROJECT.md. | Plain `.js` files loaded via `<script>` tags; the IIFE is already the final artifact. |
| Test frameworks (Jest, Mocha, Vitest, Playwright, Cypress) | Violates "no test framework required at runtime" and adds node_modules; harness must validate in a plain browser page. | Hand-rolled fake clock + FakeMutationObserver + FakeVideoElement + ~30-line assert runner. |
| `jsdom` | Heavy dependency, only needed to fake a DOM — we fake only the ~8 APIs the engine touches, in ~200 lines. | Minimal hand-written fakes (test/harness.js). |
| Runtime libraries of any kind (React, jQuery, lodash, Video.js) | Zero-dependency constraint; all levers are native APIs. | Native web platform APIs (table above). |
| Web Audio `GainNode` for volume | Rewires video element's audio graph; breaks autoplay affordances; iOS still can't route it cleanly for a *degradation ramp*; overkill. | `volume` on Chromium + `muted` fallback on iOS, feature-detected. |
| `MutationObserver` on `document` with `subtree:true, childList:true` | Instagram's DOM churns constantly; subtree-wide childList observation is the #1 perf pitfall on scroll-heavy SPAs. | Scope observers to `[role="main"]`/`[role="dialog"]` containers + `attributeFilter:['loop','autoplay','src','role']`; re-run targeted queries after batches. |
| Class-based CSS selectors (`.x1a2b3c`) | Explicit project constraint — Instagram classes are obfuscated and change constantly. | Role/attribute selectors (`[role]`, `<video>`, `pathname`). |
| Deprecated `MutationEvent` (DOMSubtreeModified etc.) | Removed/discouraged, fires synchronously and crashes perf. | `MutationObserver` (Baseline since 2015). |
| `preservesPitch = false` | Un-pitched slowdown sounds broken/robotic — the opposite of "imperceptible". | Leave `preservesPitch` default (true); degrade rate only to ~0.85–0.95. |

---

## Lever × Engine Support Matrix (the core deliverable)

| Lever | API | WebKit (WKWebView/iOS) | Chromium (Android WebView) | Integration Point |
|-------|-----|------------------------|----------------------------|-------------------|
| Color saturation | `el.style.filter = 'saturate(X)'` | ✅ Safari 6+, GPU-accelerated | ✅ Chrome 18+, GPU-accelerated | Imperative set on each tracked `<video>`; re-apply on MutationObserver hit |
| Playback speed | `el.playbackRate = X` (0.85–0.95; >0.25 to keep audio) | ✅ (play() no longer resets — bug 55943 fixed) | ✅ | Set once per video; re-apply after `play` event (React may re-trigger) |
| Relative volume | `el.volume = X` | ⚠️ **NOT settable on iOS** (reads back 1; muted is the only lever) | ✅ 0–1 honored | Feature-detect: set 0.5 → await tick → read back; if 1, use `muted` boolean only |
| Autoplay-loop block | `removeAttribute('loop')` + `pause()` on `ended` | ✅ | ✅ | MutationObserver `attributeFilter:['loop','autoplay']`; also re-check `autoplay` attr and pause right after `play` if policy forces |
| Simulated buffer | `pause()` + spinner overlay + delayed `play().catch()` | ✅ (guard play() rejection — autoplay policy) | ✅ | Timer-driven via fake/real clock in the buffer-lever module |
| Time counter overlay | `div{position:fixed;pointer-events:none;z-index:999999}` + `textContent` | ✅ | ✅ | One overlay host, updated in rAF; also hosts buffer spinner |

**Native-side prerequisites (wrapper milestone, out of v1 scope but must be documented for the engine's assumptions):**
- WKWebView: `configuration.allowsInlineMediaPlayback = true` + `mediaTypesRequiringUserActionForPlayback = []` (or `.audio`) for Reels autoplay to work at all (Thomas Visser / Apple docs / react-native-webview #1273).
- The engine must assume videos carry `muted` + `playsinline` (Instagram sets these for autoplay) — our volume lever should never *unmute* a muted video (would trigger autoplay-policy pause).

---

## Version Compatibility

| API | Compatible With | Notes |
|-----|-----------------|-------|
| `CSS filter: saturate()` | Safari 6+, Chrome 18+, all modern WebKit/Chromium | No prefix needed since ~2016; `-webkit-filter` legacy only. |
| `playbackRate` | Chrome 4+, Safari 3.1+, iOS Safari 3.2+, Android WebView/Chrome Android (caniuse: 96.68% global) | Negative rates not portable — never use. |
| `volume` | Chromium only reliably; **iOS always reads 1** (MDN: not Baseline) | Must feature-detect; never assert on iOS. |
| `muted` | Universal Baseline (July 2015+) | The portable audio lever. |
| `loop` attribute + `MutationObserver` | Universal Baseline (2015) | `loop="false"` still loops — remove the attribute. |
| `visibilitychange` / `performance.now()` / `requestAnimationFrame` | Universal Baseline | No polyfills needed on any modern iOS/Android WebView. |

---

## Stack Patterns by Variant

**If running on WKWebView (iOS):**
- Use `muted` (not `volume`) for the audio lever — iOS ignores `volume`. Keep the feature-detect so behavior is identical code, different branch.
- Guard every `play()` with `.catch()` — autoplay policy rejects with AbortError; unhandled rejections are the #1 crash-in-console on iOS.
- Verify Reels autoplay works in the container (`allowsInlineMediaPlayback`, empty user-action list); if the container blocks autoplay, the degradation engine still works but has nothing to degrade — surface as a harness warning.

**If running on Android WebView (Chromium):**
- `volume` scaling works — use the analog ramp (e.g., 1.0 → 0.7 → 0.4 → muted at stop phase).
- Same MutationObserver and buffering code paths; no branch needed beyond the volume feature-detect.

**For the test harness (both):**
- Run the same `test/harness.html` — the fake DOM is engine-agnostic; assert lever effects by reading `fakeVideo.playbackRate`, `fakeVideo.style.filter`, `fakeVideo.muted`, `fakeVideo.paused`, and the overlay's `textContent` after `advance()` calls.

---

## Sources

- [MDN HTMLMediaElement.playbackRate](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/playbackRate) — Baseline since July 2015; audio mute range; preservesPitch — MEDIUM (cross-checked with caniuse + Apple docs)
- [caniuse: HTMLMediaElement.playbackRate](https://caniuse.com/mdn-api_htmlmediaelement_playbackrate) — 96.68% global; Safari iOS 3.2+; Chrome 4+; Android WebView supported — MEDIUM
- [WebKit Bugzilla 55943 — play() must not reset playbackRate](https://bugs.webkit.org/show_bug.cgi?id=55943) — RESOLVED FIXED 2011; spec now resets only on built-in UI play — MEDIUM
- [Apple docs: HTMLMediaElement.playbackRate](https://developer.apple.com/documentation/webkitjs/htmlmediaelement/1629746-playbackrate) — historical iOS set-restriction note; modern caniuse shows supported — MEDIUM
- [MDN HTMLMediaElement.volume](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/volume) — "Limited availability … does not work in some widely-used browsers" (iOS) — MEDIUM (cross-checked)
- [Apple Device-Specific Considerations](https://developer.apple.com/library/content/documentation/AudioVideo/Conceptual/Using_HTML5_Audio_Video/Device-SpecificConsiderations/Device-SpecificConsiderations.html) via SO: "volume property is not settable in JavaScript; reading always returns 1" on iOS — MEDIUM (cross-checked with Livekit #537 + Zoom SDK forum)
- [livekit/client-sdk-js #537 — volume broken on iOS, workaround GainNode](https://github.com/livekit/client-sdk-js/issues/537) — confirms iOS volume broken up to iOS 16.1+ — MEDIUM
- [Apple: Using CSS Filters (video filters, Safari 6+, hardware-accelerated)](https://developer.apple.com/library/archive/documentation/InternetWeb/Conceptual/SafariVisualEffectsProgGuide/UsingCSSFilters/UsingCSSFilters.html) — MEDIUM
- [MDN: saturate() CSS function](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/filter-function/saturate) + [CSS Filter Generator performance notes](https://devlab.tools/tool/css-filter-generator) — filters on video composite over decoded frames; static filters cheap; animate blurs = jank — MEDIUM
- [whatwg/html #2691 — loop observable via MutationObserver attributeFilter:['loop']](https://github.com/whatwg/html/issues/2691) — MEDIUM
- [HTML spec: media element end-of-playback steps](https://html.spec.whatwg.org/multipage/media.html) — ended event never fires while loop attribute present — MEDIUM
- [SO: loop="false" still loops; must remove attribute](https://stackoverflow.com/questions/19062772/why-does-my-html5-video-loop-and-never-trigger-the-ended-event-even-though-im) — MEDIUM
- [SO: waiting event unreliable historically, reliable as of 2019](https://stackoverflow.com/questions/21399872/how-to-detect-whether-html5-video-has-paused-for-buffering/23828241) — MEDIUM
- [dash.js #4318 — rapid seeking stalls players (why not to force waiting via seeks)](https://github.com/Dash-Industry-Forum/dash.js/issues/4318) — MEDIUM
- [Thomas Visser: Autoplaying video in WKWebView (allowsInlineMediaPlayback + mediaTypesRequiringUserActionForPlayback)](https://www.thomasvisser.me/2018/06/26/wkwebview-media) + [Apple allowsInlineMediaPlayback](https://developer.apple.com/documentation/webkit/wkwebviewconfiguration/allowsinlinemediaplayback) — MEDIUM
- [MDN MutationObserver](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver) — Baseline July 2015 — MEDIUM
- [Deterministic testing: fake clock keystone pattern](https://grzegorzotto.dev/blog/deterministic-game-testing) + [isaacs/clock-mock](https://github.com/isaacs/clock-mock) — MEDIUM
- [visibilitychange pause pattern saves 5–12% CPU](https://thelinuxcode.com/html-video-loop-attribute-practical-patterns-for-2026-frontends/) — LOW (single source; pattern itself is Baseline standard)

---

*Stack research for: SlowGram v1 anti-addiction engine (degradation levers + DOM-mock test harness)*
*Researched: 2026-08-15*