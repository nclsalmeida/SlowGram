# Project Research Summary

**Project:** SlowGram — v1.0 "Motor Anti-Vício" (anti-addiction degradation engine for Instagram web in WKWebView/WebView)
**Domain:** Injected client-side digital-wellbeing tool (silent, graduated sensory degradation of passive Reels consumption)
**Researched:** 2026-08-15
**Confidence:** MEDIUM

## Executive Summary

SlowGram is a silent anti-addiction engine: a single vanilla-JS IIFE injected into Instagram web inside WKWebView (iOS) / WebView (Android) that degrades passive Reels consumption over session time via color saturation, playbackRate, relative volume, autoplay-loop blocking, and a simulated-buffer stop point — while keeping scroll 100% native and social routes (DMs, profiles, search) completely untouched. Research concludes the product is buildable with **zero new technologies**: all five degradation levers map 1:1 onto native Baseline web-platform APIs (CSS `filter: saturate()`, `playbackRate`, `volume`/`muted`, `loop`-attribute removal + `MutationObserver`, `visibilitychange`), and the recommended test approach is a hand-rolled dependency-injection harness (fake clock + FakeMutationObserver + FakeVideoElement + ~30-line assert runner) running in a plain browser page. No npm, no bundler, no test framework — the IIFE *is* the deliverable and the final artifact.

The category (one sec, Opal, iOS Screen Time, Boring Mode, Bastion) splits between hard blockers and entry-friction nudges; almost nobody does **silent, graduated, multi-lever degradation that preserves the entire UI**. Evidence supports SlowGram's core design: gradual (not immediate) blocking helps heavy users most (SSRN blocker experiment), neutral framing reduces rumination and reactance (Chalmers/Loerakker), grayscale measurably cuts screen time 20–28 min/day (Holte & Ferraro; Frontiers 2026), and users prefer informational tracking over restrictive blocking (JCR). The 4-phase timeline (0–3 native "acolhimento" / 3–7 micro-atrito / 7–12 sensory wear / 15+ stop point) is the product's "reverse-retention algorithm" and the one thing no shipped tool does.

The three biggest risks are all **silent failures**, not crashes: (1) **platform quirks** — iOS drops CSS filters applied directly to `<video>`, caps `playbackRate` at 2.0, never honors `volume`, and WKWebView/Android WebView may not deliver `visibilitychange`; mitigation is per-platform clamp/lever tables, feature-detection (never touching `muted`), and a device-validation gate. (2) **scope leakage** — degrading videos outside the Reels surface destroys the social-utility contract; mitigation is an explicit degraded-surface allowlist + preserved-route list with the pathname guard checked first. (3) **selector drift** — Instagram's hashed classes change every deploy and semantic anchors drift ~monthly; mitigation is role/attribute selectors only, centralized in a CONFIG selector registry with a health check, and idempotent re-apply on every invalidating event. Overall confidence is MEDIUM; the largest gap is that the live Instagram DOM structure was not verified during research and must be validated with real-DOM snapshots during build.

## Key Findings

### Recommended Stack

[Full detail: STACK.md](STACK.md). Verdict: **zero new technologies** — all levers are Baseline web-platform APIs shipped in both engines for a decade. The only genuinely hard constraint is the iOS `volume` quirk (not settable in JavaScript; reads 1) which changes the volume-lever design on WKWebView and must be feature-detected, not assumed.

**Core technologies:**
- `CSS filter: saturate()` (inline `el.style.filter`) — color-saturation lever; GPU-composited in both engines, cheap when static; apply to the video's non-transformed ancestor wrapper for iOS reliability (see Pitfall 2 tension below)
- `HTMLMediaElement.playbackRate` — speed lever; stay in 0.25–2.0 (WebKit caps at 2.0; audio mutes outside ~0.5–4.0); `preservesPitch` defaults true; JS `play()` no longer resets the rate (WebKit bug 55943 fixed 2011) but React re-triggers require re-apply per video
- `volume` (Chromium) / `muted` (both) — audio lever; feature-detect volume (set 0.5 → read back → if 1, use `muted` only on iOS); **never** toggle `muted` programmatically (WebKit pauses playback on unmute-without-gesture)
- `loop` attribute removal via `MutationObserver` (`attributeFilter:['loop','autoplay']`) — loop-block lever; `loop="false"` still loops — only `removeAttribute('loop')` stops it, then pause on `ended`
- `visibilitychange` + `document.hidden` — fatigue reset (>5 min background); pause-on-hidden saves 5–12% CPU; **must be supplemented** with `pageshow`/`focus`/wall-clock deltas because WebView delivery is unreliable
- `performance.now()` / `Date.now()` wall-clock deltas — session timing; never timer ticks (see timing tension below)
- `requestAnimationFrame` — phase polling coalesced to display refresh; never blocks scroll
- Plain `<div>` overlay: `position:fixed; pointer-events:none; z-index:999999` — neutral counter + buffer-spinner host

**Test harness:** fake clock (`advance(ms)`) as the keystone of determinism + FakeMutationObserver + FakeVideoElement + ~30-line assert runner, wired through a DI seam so the *same* engine file runs under mocks and live in the WebView. Runs in a plain browser page (`harness.html`, `<script>` tags only) and optionally under Node — zero extra tooling.

### Expected Features

[Full detail: FEATURES.md](FEATURES.md). The category has already trained users; SlowGram inherits screen-time expectations even as a silent injection.

**Must have (table stakes):**
- Session-time engine — timestamp-based with catch-up, never a running timer; users trust a counter only if it never "lies"
- 3-min acolhimento grace period (first minutes 100% native) — matches the category's delayed-intervention expectation
- Neutral elapsed-time counter overlay — the visible feedback that answers "why does the feed look/sound off?"; also evidence-backed (tracking beats blocking)
- Reset on backgrounding >5 min — the standard definition of "a new session"; must be timestamp-computed at catch-up, never a background timer
- Social route preservation (`/direct/`, `/messages`, profiles, search never degrade) — the category's cardinal sin is breaking DMs; non-negotiable
- Zero data exfiltration / on-device only — satisfied by design (zero network calls)
- Escape hatch / autonomy support — architectural in v1: nothing is ever locked out, degradation is perceptual not blocking

**Should have (competitive / differentiators):**
- Imperceptible graduated multi-lever degradation (saturation → playbackRate → volume → loop-block → stop point) — the reverse-retention algorithm; grayscale research (20–28 min/day) validates the lever family, but pure grayscale doesn't stop the checking loop, so the escalating timeline is the moat
- 4-phase continuous timeline — gradual blocking helps heavy users most; engine is a pure `phase(t)` function for deterministic testing
- Neutral, non-judgmental feedback — shame-based counters induce reactance, not change
- 100% native scroll — the engine never touches input events; in-feed frictions frustrate 53% of users
- Single-file IIFE, zero dependencies, injection-ready — the practical gap vs. native-app/extension competitors
- Zero platform API automation — undetectable, ToS-safe

**Defer (v2+):**
- Native wrapper (WKWebView/WebView container) — packaging exercise once the IIFE is proven; v1 is engine-only per PROJECT.md
- User-configurable timings — autonomy research supports it, but it contradicts v1 fixed-timings scope; centralized constant object is the v1 "settings"
- Progress dashboards / "time saved" charts — motivating (one sec) but reveal the tool's presence; contradicts subliminal design
- Snooze/break management, TikTok support — second-network and settings-surface work

**Anti-features (explicitly avoided):** abrupt hard blocking (reactance; PROJECT.md forbids), guilt-shaming copy, blocking DMs/messages/profiles/search, artificial scroll lag, open-time deliberation messages (PNAS: ineffective), fake engagement/API automation (anti-bot fingerprint), simulated buffer as a *primary* lever (IG prefetches — it's a no-op or a visible spinner; keep as gated stop-point capstone only, flagged, P2), v1 personalization UI.

### Architecture Approach

[Full detail: ARCHITECTURE.md](ARCHITECTURE.md). A single self-contained IIFE with eight internal modules and a strict dependency DAG: `CONFIG` (pure data) → `SessionClock` → `PhaseMachine` → `DegradationEngine` forms the state spine; `DomWatcher` → `ContextDetector` → `SessionClock` forms the signal path; `Overlay` and `FatigueManager` are leaves. Everything is event-driven — no per-tick DOM scans.

**Major components:**
1. **CONFIG** — single frozen source of truth: 4 phase thresholds, per-phase degradation matrix, selector table, preserved routes, fatigue window; the only module with magic numbers (drift fix = one-line change)
2. **SessionClock** — accumulates reels-eligible visible time only (context==REELS && visible); wall-clock `Date.now()` deltas at event boundaries, never timer ticks
3. **PhaseMachine** — pure `elapsedMs → phase 0..3` mapping, emits `phasechange` only on real transitions; unit-testable without DOM
4. **ContextDetector + RouteGuard** — classifies REELS / SOCIAL / UNKNOWN; pathname authoritative for preserved routes, role/attribute + `<video>` signals refine Reels detection; UNKNOWN = no degradation (fail-safe)
5. **DomWatcher** — narrow-scoped MutationObserver, rAF-batched, self-mutation filtered, feeds `<video>` nodes to VideoRegistry and signals to ContextDetector
6. **VideoRegistry** — `WeakMap<video, state>` with per-element lifecycle reset on `loadstart`/`emptied` (React virtualized feed recycles nodes)
7. **DegradationEngine + 5 Applicators** — hub routing phase → applicability matrix; each applicator is `{key, apply(phase, video), revert(video)}`, idempotent and revertible (one `revertAll()` for fatigue reset)
8. **Overlay + FatigueManager + Bootstrap** — neutral counter (Shadow DOM, pointer-events none), hidden-time timestamping with >5-min reset, and IIFE entry with global try/catch error containment

**Key patterns:** event-bus state spine (one source of truth for phase → applicators can never disagree), WeakMap state with element-lifecycle reset, idempotent applicator interface, guarded MutationObserver with a `mutating` flag to prevent feedback loops. Build order follows the DAG: CONFIG/skeleton → Clock+PhaseMachine → Detector+RouteGuard → dom-mocks+demo scaffold → Watcher+VideoRegistry → applicators (Filter → Playback → Volume → Autoplay → Buffer) → Engine hub → Overlay → FatigueManager → Bootstrap + device validation.

### Critical Pitfalls

[Full detail: PITFALLS.md](PITFALLS.md). Nine critical pitfalls, all silent-failure modes. Top 5:

1. **Scope leakage (P1)** — `querySelectorAll('video')` catches stories, profile videos, DM-shared reels, ads → degrades the exact surfaces the project promises to preserve. *Avoid:* explicit degraded-surface allowlist + preserved-route list; scope to the feed container (role/attr anchored), not `document`; re-check scope on every route change; restore non-Reels videos immediately; make "no degradation on social surfaces" a first-class harness test. **Phase 2.**
2. **CSS filter on `<video>` silently fails on iOS (P2)** — iOS gives accelerated video its own GPU layer and drops the filter; SVG `url()` filters never work on WebKit video (bug 184601). *Avoid:* apply `filter: saturate()` to a static, non-transformed **ancestor wrapper**, never the `<video>`; plain filter functions only; keep filters static (never animate). **Phase 3 + device gate.**
3. **playbackRate/volume silent no-ops (P3)** — Safari caps rate at 2.0; Chrome/Firefox mute audio outside 0.5–4.0; and Reels autoplay **muted by default** so the volume lever is inaudible until the user unmutes — worse, programmatic unmute pauses playback on iOS. *Avoid:* never touch `muted`; volume only when `!video.muted && volume > 0`; keep rate inside 0.5–2.0; per-platform clamp tables are the spec; each lever independently verifiable in the harness. **Phase 3.**
4. **`visibilitychange` alone misses the fatigue reset (P4)** — WebViews don't reliably deliver it (Android needs host `onPause()/onResume()`; iOS WKWebView suspends). *Avoid:* treat every resume signal as a reset candidate (`visibilitychange`, `pageshow`, `focus`, next-tick wall-clock delta); compute `now − hiddenSince` at catch-up, never a background timer; use `Date.now()` (iOS stops advancing `performance.now()` while sleeping). **Phase 1 — core behavior, not an add-on.**
5. **Tick-based time accounting drifts (P5)** — background tabs throttle timers to 1/min; audible-audio pages are exempt (over-counting). *Avoid:* session time = sum of wall-clock deltas at event boundaries (video enter/exit via IntersectionObserver, visibility changes, resume signals), gated on visibility + Reels context; cap single segments (>15 min = suspend artifact). **Phase 1.**

Also critical: **observer perf** (P6 — body-level `subtree:true` observer janks on virtualized feeds; narrow scope, rAF debounce, `takeRecords()`, disconnect on social routes, <1% CPU budget), **selector drift + React wipes** (P7 — semantic attrs only, selector registry with health check, idempotent re-apply on `ended`/`play`/mutation/route change), **simulated buffer backfires** (P8 — ~80–200 ms stall detection; host UI desync; prefer levers that don't touch player state; if kept: sub-200 ms, sparse, never during interaction, off in acolhimento, gated behind a flag), and **loop-block semantics** (P9 — Reels loop *in place* on web, they do NOT auto-advance; `loop=false` + re-apply = the stop point; treat tap-to-replay as new engagement without resetting the clock).

## Implications for Roadmap

All work is greenfield (nothing shipped yet). Suggested structure is 5 phases, matching both the architecture build-order DAG and the pitfalls' own phase mapping. The harness is scaffolded early (fake clock in P1 for the pure spine; dom-mocks + demo in P2 for detection) and hardened in P5 — the DI seam makes the same engine file runnable in both.

### Phase 1: Motor Core & Lifecycle (IIFE skeleton, CONFIG, session clock, phase machine, fatigue reset)
**Rationale:** First because it's the dependency root — CONFIG is read by everything, and the Clock→PhaseMachine spine must be testable before any DOM code exists. Also where the hardest correctness contract (fatigue reset) lives.
**Delivers:** `build.js` + module skeleton; frozen CONFIG (phases, selectors, routes, params); SessionClock (wall-clock deltas, reels-eligible visible time only); PhaseMachine (pure `phase(t)`); lifecycle tracking (`visibilitychange`/`pagehide`/`pageshow`/`focus`) + FatigueManager (>5-min reset); fake-clock harness scaffold + DI seam.
**Addresses:** FEATURES P1 items — session-time engine, 4-phase timeline engine, lifecycle tracking, fatigue reset.
**Avoids:** Pitfalls 4 (visibilitychange-only reset) and 5 (tick counting); Anti-Patterns 1 (setInterval truth) and 5 (over-restriction).
**Standard patterns:** session clock + phase machine are pure-function designs — no phase-specific research needed.

### Phase 2: DOM Detection & Scoping (detector, route guard, watcher, registry, social preservation)
**Rationale:** SOCIAL/UNKNOWN correctness must exist before any degradation does; scoping decisions made here are enforced downstream (levers must never self-scope). The make-or-break primitive (feed detection) and the trust contract (social preservation) both live here.
**Delivers:** ContextDetector + RouteGuard (pathname authoritative; REELS/SOCIAL/UNKNOWN); DomWatcher (narrow-scoped, rAF-batched, self-mutation-filtered); VideoRegistry (WeakMap + loadstart reset); selector registry with health check; preserved-route re-assertion; Instagram DOM mocks + demo.html scaffold.
**Addresses:** FEATURES P1 — feed detection, route preservation; the harness base for all later validation.
**Avoids:** Pitfalls 1 (scope leakage), 6 (observer perf), 7 (selector drift — registry + health check); Anti-Patterns 3 (CSS classes) and 4 (observer feedback loop).
**Research flag:** live Instagram DOM structure was NOT verified this session (LOW-MEDIUM confidence) — selector anchors (`main[role="main"]`, role/aria signals, video insertion points) must be validated against real-DOM snapshots early in the phase; expect drift and design the registry + health check for it.

### Phase 3: Degradation Levers (5 applicators + engine hub, per-platform clamp tables)
**Rationale:** Comes after detection (levers take a "target video + scope verdict" as input) and after VideoRegistry (so applicators never own lifecycle). Each lever has different platform constraints, so each is built and validated independently.
**Delivers:** Applicators in dependency-cheap order — Filter (saturate on non-transformed ancestor wrapper) → Playback (0.5–2.0, re-applied per video) → Volume (feature-detected; `volume` only, never `muted`) → Autoplay (remove `loop`, pause on `ended` = stop point) → Buffer (gated behind a flag, sub-200 ms or deferred to v1.x); per-platform clamp tables; DegradationEngine hub with per-phase applicability matrix and `revertAll()`.
**Addresses:** FEATURES P1 — saturation, playbackRate, autoplay-loop-block levers; P2 — volume lever, simulated buffer (flagged).
**Avoids:** Pitfalls 2 (filter on video/iOS), 3 (rate/volume no-ops), 8 (fake buffer desync), 9 (loop-block semantics); Anti-Patterns 2 (muted toggling) and 6 (heavy filters on large containers).
**Research flag:** two cross-research decisions land here — (a) **filter application point**: STACK says direct on `<video>` (same-origin safe) while PITFALLS says iOS drops it → resolve with an engine-owned non-transformed wrapper + on-device iOS pixel check during this phase; (b) **simulated buffer**: keep only as flagged stop-point capstone pending perception validation, default off. These benefit from `/gsd-plan-phase --research-phase` during planning.

### Phase 4: Overlay & Polish (neutral counter, stacking, fullscreen behavior)
**Rationale:** Leaf component depending on CONFIG + Clock; visually validates the whole product ("wow" + the visible answer to "why does the feed look off"). Well-documented standard CSS patterns.
**Delivers:** Neutral elapsed-time counter overlay (Shadow DOM for style isolation, `pointer-events: none`, `z-index` above Instagram's click catchers, updated ≤1/s), hidden on SOCIAL routes, fullscreen-video handling (`webkitDisplayingFullscreen` → hide), buffer-spinner host wiring.
**Addresses:** FEATURES P1 — neutral counter overlay (table stake + differentiator vs. shame-based counters).
**Avoids:** UX pitfalls — guilt copy, tap-blocking, z-index fights with Instagram's click catcher, overlay in fullscreen.
**Standard patterns:** fixed-position overlay + pointer-events none + Shadow DOM are fully documented — skip research-phase.

### Phase 5: Test Harness Hardening & Device Validation (perf budget, drift tests, on-device gates)
**Rationale:** Last because it validates everything: the milestone's goal is a *validated* motor, and the hardest validations (iOS filter rendering, WebKit clamps, unmuted volume, 6-min background reset, social preservation on-device, real-DOM snapshot refresh, <1% CPU observer cost) all require the completed engine.
**Delivers:** Full harness suite — synthetic 5k-mutations/sec churn perf test, wall-clock equivalence test with hidden period, WebKit clamp model assertions, "no degradation on social surfaces" tests, snapshot-refresh drift tests, selector health checks + documented fallback (degrade by document-scoped videos on Reels routes only), on-device iOS/Android validation checklist, "Looks Done But Isn't" checklist audit, kill-switch/master flag.
**Addresses:** FEATURES P1 — harness (final form); P2 — kill-switch.
**Avoids:** every item on the "Looks Done But Isn't" checklist; Pitfall 7 drift shipping silently; Pitfall 2 iOS filter regressions.
**Research flag:** device-validation methodology (which physical devices/WebView versions; how to measure the <1% CPU budget) is worth a targeted research pass; iOS visibility-semantics variance across versions was flagged MEDIUM-confidence by architecture research.

### Phase Ordering Rationale

- **Dependency-driven:** CONFIG → Clock → PhaseMachine must exist before detection can gate on context; detection must exist before levers can be scoped; VideoRegistry must exist before applicators (they never own lifecycle); FatigueManager last of the core because it resets everything it depends on; Bootstrap/device-validation last because it wires complete modules.
- **Safety before power:** SOCIAL/UNKNOWN correctness (P2) precedes any degradation capability (P3) — you cannot leak scope into DMs if no lever exists yet.
- **Harness is a phase-1 citizen, not an afterthought:** the DI seam + fake clock scaffold in P1 makes the pure spine deterministic from day one; dom-mocks in P2 validate detection; P5 is hardening (perf, drift, device), not first construction.
- **Parallelizable lanes within phases:** mocks/demo scaffold can start alongside Clock/PhaseMachine (P1→P2 overlap); the five applicators (P3) are independent once VideoRegistry lands and can be split across workstreams.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** live Instagram DOM structure unverified — real-DOM snapshot capture + selector validation is required work, not optional.
- **Phase 3:** filter application point (video vs. ancestor wrapper) is contested between STACK and PITFALLS; simulated-buffer perception/desync behavior needs a decision gate.
- **Phase 5:** device-validation methodology (device matrix, WebView version variance, perf-budget measurement technique).

Phases with standard patterns (skip research-phase):
- **Phase 1:** session clock + phase machine are pure-function designs; lifecycle APIs are Baseline-documented.
- **Phase 4:** fixed overlay, pointer-events none, Shadow DOM, z-index stacking — fully documented standard CSS.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Core APIs are HIGH-grade (Baseline, MDN/WebKit/Apple/Android docs); iOS `volume` quirk is multi-source confirmed. Downgraded for two unresolved cross-research tensions (timing clock, filter application point) flagged above. |
| Features | MEDIUM | Feature landscape cross-corroborated across independent sources incl. academic studies (PNAS, CHI, JCR, SSRN, SAGE, Frontiers) and shipped competitor behavior; competitor-specific claims (Bastion, Reravel) rest on community code + marketing sites. |
| Architecture | MEDIUM | Patterns are standard and well-referenced (MDN, WebKit policy, Chrome engineering); the one LOW-MEDIUM pillar is live Instagram DOM structure (roles, virtualization/recycling) — unverified this session, must be validated in Phase 2. |
| Pitfalls | MEDIUM | Cross-checked across primary docs, bug trackers (WebKit bugzilla), and working extension code (instagram-video-controls, igtool); individual claims tagged per source. Two LOW single-source items (CPU-stat, UX buffering) — behaviorally consistent with higher-grade sources. |

**Overall confidence:** MEDIUM — the approach is sound and evidence-backed, but two engineering decisions (timing primitive, filter application point) and the unverified live-DOM surface require resolution during planning/execution.

### Gaps to Address

- **Timing primitive conflict:** STACK recommends `performance.now()` (monotonic, immune to clock jumps) while PITFALLS requires `Date.now()` for the fatigue reset (iOS stops advancing `performance.now()` while the page sleeps); ARCHITECTURE examples use `Date.now()`. *Resolution for planning:* use `Date.now()` wall-clock deltas at event boundaries for anything spanning sleep/hidden (per PITFALLS + ARCHITECTURE), and treat `performance.now()` as an internal refinement only for in-page segments if desired — decide explicitly in Phase 1 planning.
- **Filter application point conflict:** STACK says apply `el.style.filter` directly on the video (same-origin media is safe); PITFALLS says iOS drops filters on `<video>` — apply to a static non-transformed ancestor wrapper. *Resolution:* default to the ancestor-wrapper approach with an engine-owned wrapper element (imperatively inserted, not class-based so React churn can't wipe it), and make the iOS on-device pixel check a Phase 3/5 gate.
- **Live Instagram DOM unverified:** no live-DOM snapshot was captured this session; all selector assumptions (roles, video insertion points, virtualization behavior) must be validated against real snapshots in Phase 2 and refreshed periodically (drift alarm).
- **Container autoplay prerequisites:** WKWebView needs `allowsInlineMediaPlayback = true` + empty `mediaTypesRequiringUserActionForPlayback`; Android WebView defaults `mediaPlaybackRequiresUserGesture` to true. Out of v1 scope (engine-only), but the engine must tolerate an autoplay-blocked container without fighting it, and these flags must be documented for the wrapper milestone.
- **Simulated buffer:** evidence across FEATURES + PITFALLS says it's a no-op or a perceptibility/desync risk; keep it flagged and default-off (stop-point capstone only), drop it from v1 if perception validation fails.
- **Perf budget methodology:** the <1% CPU observer-callback budget needs a concrete synthetic-churn measurement (5k mutations/sec) defined in Phase 5 planning.

## Sources

### Primary (HIGH confidence)
- MDN — Page Visibility API, `visibilitychange`, `HTMLMediaElement.playbackRate`/`volume`/`muted`, `loop`, `MutationObserver`, Autoplay guide, buffered/time-ranges (Baseline statuses, throttle rules)
- WebKit / Apple — "New video Policies for iOS" (Jer Noble, 2016; muted autoplay allowed, unmute-without-gesture pauses), `WKWebViewConfiguration.allowsInlineMediaPlayback` / `mediaTypesRequiringUserActionForPlayback`, "Using CSS Filters", WebKit bugzilla 184601 / 228312 / 83815 / 238707 / 55943 / 151234 / 216917
- Android Developers — `WebSettings.setMediaPlaybackRequiresUserGesture` (default true)
- Chrome for Developers — autoplay policy, background-tab throttling, Chrome 88 heavy timer throttling (incl. audio exemption), Page Lifecycle API
- WHATWG / WICG — page-lifecycle spec, `loop`-attribute observability (whatwg/html#2691), end-of-playback steps

### Secondary (MEDIUM confidence)
- Academic: Grüning et al./PNAS 2023 (one sec — 57% fewer openings; deliberation message ineffective), Haliburton et al./CHI 2024 (1,039-user friction study; breaks/rebound), Pradhan et al./JCR (tracking > blocking), Frontiers Psychiatry 2025 (App Limits/Downtime: no significant effect), SSRN block-immediacy experiment (gradual > immediate; helps heavy users), Ruiz 2024 (design frictions; 53% frustration), Holte & Ferraro/SAGE 2023 + Frontiers Digital Health 2026 (grayscale 20–28 min/day), Lukoff/Lyngs 2022 (reactance, autonomy), Loerakker et al. 2023 (framing/rumination)
- Ecosystem: one sec site/FAQ, Boring Mode, Bastion, Reravel, inControl; kbrianps/instagram-video-controls + melancholic-ksm/igtool (working precedents); Auto Reels Scroller (proves Reels loop in place); OmniScrape + meta-skills (selector drift, hashed-class churn); lyrion-dashboard + SferaDev + WordPress core #59104 + ytyng.com (WebView visibility/filter quirks); unpacked.danielhowells.com + whatwg/dom#484 + SO (MutationObserver cost/perf); danieljwilson.me (playbackRate ranges); Livekit #537 + Zoom forum (iOS volume); Thomas Visser (WKWebView autoplay); TrueLink/BrowserInsight (WebView detectability); SwiftyInsta #163 (UA → forced logout); dash.js #4318 (seek stalls)

### Tertiary (LOW confidence)
- thelinuxcode.com — visibilitychange pause saves 5–12% CPU (single source; pattern itself is Baseline standard)
- UX StackExchange 41717 — buffering state toggling frustrates users (single source, behaviorally consistent with AVEQ stall-detection thresholds)

---
*Research completed: 2026-08-15*
*Ready for roadmap: yes*
