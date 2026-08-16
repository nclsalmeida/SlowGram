# Pitfalls Research

**Domain:** WebView-embedded anti-addiction engine — vanilla JS IIFE degrading Instagram web Reels consumption inside WKWebView (iOS) / Android WebView
**Researched:** 2026-08-15
**Confidence:** MEDIUM (cross-checked across WebKit/Apple/Android primary docs, Chromium engineering blogs, bug trackers, and Instagram automation extension code; individual claims tagged in Sources)

**Roadmap phase references used throughout** (descriptive names — map to the actual phase plan):
- **Phase 1 — Motor core & lifecycle:** IIFE skeleton, session clock, visibility/backgrounding handling, time accounting
- **Phase 2 — DOM detection & scoping:** MutationObserver architecture, semantic selectors, route tracking, social-preservation allowlist
- **Phase 3 — Degradation levers:** color saturation, playbackRate, volume, loop-block, simulated buffer, per-platform adaptation
- **Phase 4 — Overlay & polish:** elapsed-time overlay, stacking contexts, fullscreen behavior
- **Phase 5 — Test harness & hardening:** DOM mocks, on-device validation, performance budget, fallback logic

---

## Critical Pitfalls

Mistakes that cause silent feature death (levers stop working without errors) or violate the project's inegociável constraints.

### Pitfall 1: Scope leakage — degrading videos outside the Reels surface

**What goes wrong:**
`document.querySelectorAll('video')` is the natural first implementation. It catches Reels — and also stories, profile-grid videos, DM-shared reels, embedded videos, and ads. Saturation/playbackRate/volume degradation then hits the exact surfaces the project promises to preserve (`/direct/`, profiles, search). The user's social utility is damaged and the product's core contract is broken. Reels also appear inside the home feed and profile pages, not only at `/reels/` — so pathname-only checks are not sufficient.

**Why it happens:**
Instagram renders all video with `<video>` elements; there is no attribute that says "this is a Reel in a passive-consumption surface." The feed virtualizes DOM, so off-screen videos are removed — it's tempting to just grab every video and apply degradation globally, which is the fastest path and the wrong one.

**How to avoid:**
- Define an explicit **allowlist of degraded surfaces** (Reels tab feed; optionally home-feed video posts IF product decides so — default: Reels surfaces only) and an explicit **preserve-list of social surfaces** (any pathname under `/direct/`, `/messages`, `/accounts/`, profile `/p/` pages, search results, stories tray).
- Scope video selection to the **feed container** (role/attribute anchored, e.g. `main[role="main"]` + known feed structure), not `document`.
- Re-check scope on every route change (SPA navigation) and on every mutation batch — a preserved-route video must be **restored to native state immediately** (remove filter, reset rate/volume).
- In the test harness, add a mock that asserts **no degradation is applied to non-Reels surfaces** — this must be a first-class test, not an afterthought.

**Warning signs:**
- Stories or profile reels look washed out / slow when the user is just browsing social routes.
- A DM-embedded reel plays desaturated.
- Test logs show degradation applied to more nodes than the number of Reels feed videos.

**Phase to address:**
Phase 2 (DOM detection & scoping). Enforce the allowlist there; Phase 3 levers must take a "target video + scope verdict" as input, never self-scope.

---

### Pitfall 2: Applying the CSS filter directly to `<video>` — silently fails on iOS Safari/WKWebView

**What goes wrong:**
The saturation lever is the flagship degradation. On iOS (the primary platform), a CSS `filter` applied directly to a `<video>` element is unreliable: iOS Safari gives a transformed/accelerated video its own GPU layer and **drops the filter** (SferaDev production evidence; WordPress core ticket #59104 confirms duotone/SVG filters fail on video in Safari 16.x). SVG `url(#...)` filters never work on video in WebKit at all (WebKit bug 184601 — the accelerated compositing codepath doesn't support url() references). Result: on iPhones the degradation simply does not render, and nobody gets an error.

**Why it happens:**
Video is composited through a special accelerated path; CSS filters on video have been a WebKit pain point for years. Developers test in desktop Chrome (where it works) and never validate on WebKit.

**How to avoid:**
- Apply `filter: saturate(...)` to a **static, non-transformed ancestor wrapper** of the video — never to the `<video>` itself, never to a `transform`ed/`filter`ed element.
- Use only **plain filter functions** (`saturate()`, `brightness()`, `contrast()`), never `url(#svgFilter)`.
- Keep the degradation **static** — do not animate the filter value; animating forces continuous re-composite of a large video surface (see Performance Traps).
- Wrap the re-apply logic in the same re-detection path as the React-wipe pitfall (Pitfall 7): React may replace the wrapper node between re-renders.

**Warning signs:**
- On-device iOS test shows no color change while desktop shows it.
- `getComputedStyle(video).filter` returns the value but the screen is unchanged.

**Phase to address:**
Phase 3 (degradation levers), with Phase 5 (test harness) running a WebKit-visible device check as a gate.

---

### Pitfall 3: playbackRate and volume levers silently no-op due to platform clamping and muted autoplay

**What goes wrong:**
Two silent failures bundled:
1. **playbackRate clamps:** Safari caps playbackRate at **2.0** on macOS and iOS (Chrome/Firefox clamp 0.0625–16). Any degradation value > 2.0 does nothing on iOS. Chrome/Firefox additionally **mute audio** outside 0.5–4.0, which silently kills the separate volume lever's effect.
2. **Volume is inert under muted autoplay:** Instagram Reels autoplay **muted by default**. `video.volume` changes are inaudible while muted — the volume lever does nothing until the user unmutes. Worse, on iOS, if the video "gains an audio track or becomes unmuted without a user gesture, playback pauses" (WebKit policy) — a programmatic `muted = false` can **pause the reel outright**.

**Why it happens:**
Developers assume media element properties are portable across engines and assume the user is hearing audio. In a muted-autoplay feed, most of the session the volume lever is a no-op, and on iOS the rate lever is capped.

**How to avoid:**
- **Never touch `muted`.** Only ever set `volume` (0–1) and only when the video is currently unmuted and audible (`!video.muted && video.volume > 0`); re-evaluate per video.
- Keep playbackRate degradation inside **0.5–2.0** for cross-platform consistency; treat the lever as "rate-of-decay limiter" not "fast-forward".
- Design the lever stack so each lever is **independently verifiable**: harness must assert saturation changes pixel color, playbackRate changes `video.playbackRate`, and volume changes are only asserted when unmuted.
- On iOS, prefer saturation + playbackRate(slow) + loop-block + buffer as the reliable stack; volume is a bonus lever for unmuted users.

**Warning signs:**
- Harness asserts playbackRate 3.0 "applied" — check `video.playbackRate` after set on WebKit (clamped to 2.0).
- Volume tests pass in a fake DOM that ignores muted state.

**Phase to address:**
Phase 3 (degradation levers) with per-platform clamp tables as part of the design; Phase 5 harness must model WebKit clamps.

---

### Pitfall 4: Relying on `visibilitychange` alone for backgrounding detection and the fatigue reset

**What goes wrong:**
The fatigue reset (">5 min in background → reset") silently never fires in WebView. `visibilitychange` is **not reliably delivered** in embedded WebViews: on Android the host app must call `webView.onPause()/onResume()` for the page to learn about backgrounding (lyrion-dashboard production evidence: "visibilitychange isn't reliably delivered in a WebView"); on iOS the WKWebView may simply be suspended with the page frozen. If the engine only listens to `visibilitychange`, the reset logic never runs, and the session clock keeps whatever stale state it had — users return to an already-degraded feed after a long break, violating the acolhimento (welcome) phase and the reset contract.

**Why it happens:**
The Page Visibility API works in browsers; WebView is a different lifecycle host where the native app owns background/foreground transitions and may not propagate them to the page.

**How to avoid:**
- Treat **every resume signal** as a candidate reset check: `visibilitychange`, `pageshow`, window `focus`, and a wall-clock delta check on the next rAF/timer tick.
- Track `hiddenSince` timestamp on the first hidden signal; on **any** resume signal, compute `Date.now() - hiddenSince`; if > 5 min → reset fatigue. Never rely on a timer firing *during* background to detect the 5-min mark.
- Use `Date.now()` (wall clock), **not** `performance.now()` — iOS stops advancing `performance.now()` while the page sleeps.
- Remember hidden transitions happen during navigation too (WebKit fires `visibilitychange:hidden` on unload, after `pagehide`).

**Warning signs:**
- Manual device test: background the app 6 minutes, return → feed still degraded.
- No reset log line on resume in the harness.

**Phase to address:**
Phase 1 (motor core & lifecycle) — the reset contract is core behavior, not a later add-on.

---

### Pitfall 5: Counting session time with timer ticks — phase timing drifts or freezes

**What goes wrong:**
The 4-phase timeline (0–3 / 3–7 / 7–12 / 15+ min) is computed wrong if the clock counts ticks. In background/hidden states: `requestAnimationFrame` is never called, `setTimeout`/`setInterval` are throttled (Chrome: 1/sec batching; after ~5 min hidden and silent: **once per minute**), and **pages playing audible audio are exempt from throttling**. So a naive tick counter either freezes during background (under-counting) or keeps running while audio plays in the background (over-counting — user "watched" Reels while doing something else). Both produce wrong phase transitions and wrong resets.

**Why it happens:**
Ticking is the obvious implementation; browsers actively sabotage ticks in hidden pages by design, and the audio-exemption rule makes the behavior environment-dependent.

**How to avoid:**
- Session time = **sum of wall-clock deltas sampled at event boundaries** (video in-viewport enter/exit via IntersectionObserver, visibility changes, resume signals) — never accumulated tick counts.
- **Gate accumulation on visibility and on the target video being in the viewport**: don't count time while hidden, and don't count time while the user is browsing non-Reels surfaces (couples to Pitfall 1's scoping verdict).
- Cap a single accumulation segment (e.g., ignore segments > 15 min in one go — likely a suspend artifact).

**Warning signs:**
- Phase transitions occur at different wall-clock times on iOS vs Android.
- Debug log shows session seconds ≠ wall-clock seconds the user was actually watching.

**Phase to address:**
Phase 1 (session clock design) — this is the motor's heartbeat; every lever reads the clock.

---

### Pitfall 6: MutationObserver on `document.body` — microtask jank on a virtualized feed

**What goes wrong:**
`new MutationObserver(...).observe(document.body, {childList: true, subtree: true})` on Instagram web is a performance disaster: the infinite feed **constantly virtualizes** (removes/inserts off-screen items), React re-renders touch hundreds of nodes per batch, and every one of those mutations generates a record. Observer callbacks run as **microtasks that block rendering before paint**. On a low-end Android WebView this is frame drops, scroll jank, and battery drain — the "high performance" constraint violated on the devices most likely to run the engine, and the user uninstalls the wrapper that hosts it.

**Why it happens:**
Subtree-wide observation is the path of least resistance for "detect new videos anywhere." The cost is proportional to total DOM churn, not to what you care about. Multiple third-party observers on the same subtree multiply record cost (Instagram's own scripts + the engine).

**How to avoid:**
- Observe **narrowly**: the feed container (childList, `subtree: false` where possible) or the specific insertion points where `<video>` nodes appear.
- **Debounce** the callback (rAF or `setTimeout(0)`), coalescing a burst into one scan; scan only **inserted subtrees**, never the whole document.
- No `querySelectorAll('*')` in callbacks; no forced layout reads (`offsetTop`/`getComputedStyle` of arbitrary nodes); use `getElementById`/live collections for known anchors.
- Disconnect observers on route changes to social surfaces (no feed → no observation), and **drain records** with `takeRecords()` in the debounce path to avoid memory spikes from records holding node references.
- Budget: observer callback must stay < 1% of CPU during steady scrolling (measure in the harness with synthetic churn).

**Warning signs:**
- Scroll jank only while scrolling the feed, not on other routes.
- DevTools performance profile shows a microtask handler consuming paint time per frame.
- Harness churn test (5k mutations/sec) shows callback time growing superlinearly.

**Phase to address:**
Phase 2 (DOM detection & scoping) — the observer architecture is decided here; Phase 5 adds the perf budget test.

---

### Pitfall 7: Selector drift and React state resets — degradation silently stops being applied

**What goes wrong:**
Two compounding failures:
1. **Selector drift:** Meta's CSS-in-JS generates hashed class names that change **on every deploy, multiple times per week**; even semantic anchors (`role`, `aria-label`) drift roughly monthly (verified across scraper/automation maintainers — "selector_drift" is a recognized failure class). When the anchor changes, the engine finds no videos and **degrades nothing, silently**.
2. **React wipes:** Instagram's React code resets media state per video — `loop`, `muted`, `volume`, `currentTime` are re-set between feed items, and React re-renders can overwrite inline styles the engine set. Degradation applied once to a video evaporates on the next reel or re-render.

**Why it happens:**
The engine runs inside someone else's constantly-shipping React app; the DOM is not an API. Silent no-op is the default failure mode of any selector-based integration.

**How to avoid:**
- Semantic attributes only (roles, `aria-label`, tagName, `time[datetime]`, pathname) — never classes. Confirm against real `instagram.com` DOM snapshots in the harness, refreshed periodically.
- **Re-apply on every event that can invalidate state:** mutation batches (new video mounted), `ended`, `play`, `volumechange`, route change — idempotent apply functions.
- Put all anchors in one **selector registry** with a `health` check (e.g., if the Reels anchor is missing for N consecutive scans, log/expose it — fail loud in dev, fail soft in prod with fallback: degrade by `document`-scoped `video` elements but only on Reels routes).
- Architect for drift: detection result is a verdict ("current surface = Reels"), not a hard-coded node list.

**Warning signs:**
- Harness runs against a fresh real-DOM snapshot and finds 0 videos (drift happened).
- Degradation present at reel #1, gone by reel #3 without user action.

**Phase to address:**
Phase 2 (selectors + registry + re-apply) and Phase 5 (snapshot refresh + health checks as a CI-able test).

---

### Pitfall 8: Simulated buffer reads as "broken app" and desyncs Instagram's player state

**What goes wrong:**
The simulated-buffer lever (fake a stall to drain patience) backfires in three ways:
1. **Perception:** stall detection is sharp — ~80–200 ms is the detection band, ~200 ms is reliably noticed under attention, and multi-second stalls are "broken product" signals in short-form video (the industry obsesses over killing spinners). Users attribute fake stalls to Instagram's servers or their network, get frustrated (the exact emotion the product forbids), and report/remove the wrapper.
2. **State desync:** pausing the video fires `pause`/`playing` events that Instagram's React handlers observe — the UI flips to a play icon / shows its own buffering state, and its feed logic may treat the pause as user-initiated. The user taps play, the video resumes instantly (no real stall), the illusion collapses and the user now knows something is controlling their player.
3. **Real Instagram stalls are rare** (prefetch + ABR), so a fake stall is inconsistent with the user's experience of the platform → attribution to the wrapper.

**Why it happens:**
Pausing/`seek`-toggling is the obvious way to "simulate buffering" — but media element state is observed by the host app's code and by the user's attention system, both of which are calibrated for a platform that almost never stalls.

**How to avoid:**
- If kept in v1, constrain fake stalls to **very short, sparse, imperceptible** events: sub-200 ms, at most 1–2 per video, never while the user is interacting (no stall within ~1 s of a tap), never in the acolhimento phase, and never on social surfaces.
- **Prefer levers that don't touch player state:** saturation, rate, volume, and loop-block are "passive" (style/property changes the host tolerates). If the buffer lever is kept, implement it by **not** toggling play state — e.g., throttle via network-observer-free playback-rate dips or drop-frame via rate, rather than `pause()`.
- Alternative that satisfies the same goal: the **loop-block + end-of-reel pause** (Pitfall 9) provides the "stop" moment without faking a fault.
- Harness must assert the buffer lever never emits a `pause` event visible to the host UI (assert against a mocked React handler).

**Warning signs:**
- User-visible spinner appears during fake stall.
- Instagram's own buffering UI or play icon appears when the engine "buffers".
- Harness's mocked host handler records a `pause` event it didn't initiate.

**Phase to address:**
Phase 3 (degradation levers) — design decision for the buffer lever; revisit in Phase 5 with real-device perception validation.

---

### Pitfall 9: Loop-block misunderstanding — "block the loop" pauses the reel in place, it does not stop consumption

**What goes wrong:**
The autoplay-loop-block lever is designed on a wrong mental model: that blocking the loop stops the endless feed. On Instagram web, Reels **loop in place** by default (the `<video>` has `loop`; the feed does NOT auto-advance on `ended` — that's why "Auto Reels Scroller" extensions exist, to add scrolling on end). So setting `video.loop = false` makes the reel **pause at the end and stay** — which is actually the desired "stop point" — but Instagram resets `loop`/`currentTime` between items and on user interaction, and the user can tap to replay, which resets to full quality if the engine doesn't re-apply. If the engine instead assumes "ended → feed advances → user gets a fresh reel," the lever actively makes consumption *worse* (fresh content beats degraded content).

**Why it happens:**
Native app Reels advance on swipe/end; developers port that assumption to web, where the player loops and only the user scrolls.

**How to avoid:**
- Model the lever's real semantics: `loop = false` + degradation re-apply on `ended`/`play` = "the reel ends and doesn't come back until the user acts." That is the stop-point lever.
- Re-assert `loop = false` and degradation on `ended`, `play`, and feed mutations (React resets them).
- Treat tap-to-replay as a **new engagement**: keep the current degradation level (do not reset the clock) but re-apply all levers to the replaying video.
- Harness: mock an `ended` event and assert the feed does NOT advance and the video stays paused with degradation intact.

**Warning signs:**
- Harness expects auto-advance and fails (wrong model).
- User replays a reel and it comes back full-quality.

**Phase to address:**
Phase 3 (degradation levers) — with the correct feed-behavior model documented in the design.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Global `document.querySelectorAll('video')` for detection | Works everywhere immediately | Scope leakage into social surfaces; perf cost on whole-document scans; drift pain | Never — violates social preservation |
| One body-level `subtree: true` observer | Catches every new video | Jank, memory spikes, cascading callbacks; hard to unwind later | Never — observer architecture is Phase 2 core |
| Hardcoded selector strings inline in levers | Fast to write | Every drift requires touching multiple code paths; no health signal | Never — selector registry with health checks |
| Session time via interval ticks | Trivial | Wrong phases on every platform; the reset contract silently breaks | Never — wall-clock delta design |
| Skip the per-platform clamp table | One code path | Levers no-op on iOS (rate > 2.0) with zero errors | Never — clamps are the spec |
| Fake buffer via `video.pause()` | Trivial implementation | Host UI desync + user frustration + detection surface | Only if sub-200 ms, sparse, non-interactive, and off in acolhimento — strongly prefer not in v1 |
| Don't refresh real-DOM snapshots in harness | Saves time now | Harness validates against fiction; drift ships silently | Never — snapshot refresh is the drift alarm |

## Integration Gotchas

Common mistakes when connecting to the two WebView containers and Instagram web.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| iOS WKWebView container | Assuming `visibilitychange` fires on app background; assuming filter on `<video>` renders | Listen for resume via `pageshow`/`focus` too; compute hidden time from `Date.now()` deltas; apply filter to non-transformed ancestor wrapper; never unmute programmatically (WebKit pauses playback) |
| Android WebView container | Assuming autoplay works; `mediaPlaybackRequiresUserGesture` defaults to **true** → autoplay blocked | Detect non-playing videos as "container blocked autoplay" and don't fight it — degradation must not depend on autoplay being enabled; document the native flag as a container requirement |
| Android WebView lifecycle | Relying on `visibilitychange` for backgrounding | Host must call `webView.onPause()/onResume()`; engine must also listen `focus`/`pageshow` and use wall-clock deltas |
| iOS WKWebView fullscreen video | Applying filter/overlay inside fullscreen player layer | Fullscreen is a separate layer — accept that filter/overlay don't apply; lean on rate/loop/volume levers; hide overlay when `video.webkitDisplayingFullscreen` |
| Instagram React media state | Setting `loop`/`volume`/`muted` once per video | Re-apply on `ended`, `play`, `volumechange`, route change, mutation batch — React resets these per item |
| Instagram SPA routing | Checking `location.pathname` once at boot | Hook `pushState`/`replaceState`/`popstate` and re-evaluate scope on every change; pathname-only misses `/reels/` tab navigation inside the SPA |
| Instagram's click catcher over video | Overlay/UI placed above video can't be interacted with — reverse: engine's overlay is `pointer-events: none` so fine; but z-index fights | Instagram draws its own overlay above video (extensions raise video z-index to reach controls) — engine overlay needs `z-index` above Instagram's catchers and must never capture events (pointer-events none enforced) |

## Performance Traps

Patterns that work at small scale but fail on mobile WebView.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `subtree: true` observer on body | Scroll jank, 1%+ CPU in observer callbacks, frame drops on low-end Android | Observe feed container only, `childList` w/o subtree where possible, debounce + scan inserted subtrees | Any steady feed scrolling (virtualized list re-renders) |
| Re-querying selectors every frame | Layout/query cost per frame; `querySelectorAll` in rAF | Cache handles; invalidate only on mutation/routes; live collections for anchors | Sustained scrolling on low-end devices |
| Animated CSS filter on video | Continuous GPU re-composite of large surface; heat/battery; memory pressure on 1080p | Static filter values; apply on ancestor; avoid `will-change` overuse | Mid-range Android/iOS with 1080p reels |
| rAF loop not gated on visibility | Battery drain while hidden; rAF never fires hidden anyway (silent waste) | Gate all loops on `document.hidden`; pause work on hidden | Any hidden/suspended WebView |
| Observers never disconnected on route change | Records accumulate on social routes; memory spikes from node refs | Disconnect feed observer outside Reels surfaces; `takeRecords()` in debounce | Long sessions switching routes frequently |
| Timer-based time accounting | Phase drift, wrong resets | Wall-clock deltas at event boundaries | Backgrounding/throttling on any platform |

## Security Mistakes

Domain-specific detection/fingerprinting issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Setting `video.muted = false` programmatically | iOS WebKit **pauses playback** (unmute without gesture); user sees broken autoplay; high observability | Never touch `muted`; only `volume` when already unmuted |
| Mutating media properties without expecting events | `ratechange`/`volumechange` events fire and Instagram's React handlers observe them — volume/mute UI desync, low-grade automation signal | Prefer passive levers (styles, ancestor filter); accept rate/volume events only during degradation phases; never dispatch artificial events |
| Tampering with UA or network (e.g., faking requests, altering UA to hide WebView) | Account checkpoint / `login_required` forced logout (SwiftyInsta #163 evidence: custom UA → Instagram logs account out); fingerprinting escalation | Zero UA/network tampering in the engine — that's the container's domain, and only the documented cookie/UA handling; engine stays client-side-only |
| Assuming WebView is invisible to Instagram | Android UA carries `; wv)` token; WebViews are detectable; Instagram already serves degraded content/login walls to WebViews | Keep the engine minimal and passive; the more indistinguishable from user gestures, the better; zero synthetic requests by design |
| Ignoring that hidden-state rendering is skipped | Any "hide overlay on background" logic never paints — but also any code assuming background work ran is wrong | Treat `hidden` as suspend: no rendering, no work, just timestamp bookkeeping |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Degradation starts before 3 min (acolhimento violated) | User notices "something changed" immediately → resentment, removal | Hard guarantee: no lever active before phase 2; clock starts only after Reels-viewing confirmed |
| Fake buffering / stalls | User blames network/app; frustration is the emotion the product forbids | Sub-200 ms, sparse, non-interactive stalls only — or drop the lever in favor of loop-block + rate |
| Overlay shows guilt-laden copy ("You've been scrolling 15 min") | Shame → user feels judged → leaves permanently; violates "neutral, elegant" spec | Neutral elapsed-time only; no messaging, no counts of "wasted" time |
| Overlay blocks taps or covers controls | User can't pause/scroll → broken app | `pointer-events: none` enforced; overlay never above interactive controls except as a passive layer; test tap-through |
| Degrading audio while user is on a call/has headphones expecting social audio | Perceived broken playback of a reel the user *wants* to hear | Volume lever only in deep phases and only when unmuted; never during first minutes; skip entirely if user re-muted (respect their choice) |
| Reset feels like "punishment undone" — no, reset is the opposite: returning after a real break should be acolhimento again | Positive reinforcement of healthy behavior | After >5 min background, full reset INCLUDING overlay hide — the engine should celebrate absence by restoring native feel |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Volume lever:** Often "implemented" but tested only in a fake DOM — verify it actually audibly changes sound on-device with an **unmuted** reel (muted autoplay makes it a silent no-op).
- [ ] **playbackRate lever:** Often set to 2.5–4x and "verified" in Chrome — verify on WebKit where the cap is 2.0; keep degradation within 0.5–2.0 and assert the clamped value.
- [ ] **Saturation lever:** Often applied to `<video>` directly and verified on desktop — verify on an iPhone that the filter renders (ancestor wrapper), and that React re-renders don't wipe it.
- [ ] **Fatigue reset:** Often wired only to `visibilitychange` — verify backgrounding the app 6 minutes and returning actually resets (WebView may not deliver visibilitychange; needs `focus`/`pageshow` + wall-clock delta).
- [ ] **Social preservation:** Often assumed by "we only touch video" — verify a DM-shared reel, a profile reel, and a story stay 100% native while the Reels feed is degraded.
- [ ] **Session clock:** Often counts ticks — verify phase times match wall-clock watch time on both platforms, including a backgrounded period in the middle.
- [ ] **Overlay z-index:** Often 999999 and "fine" — verify it renders above Instagram's own fixed headers/click catchers, doesn't block taps, and disappears in fullscreen video.
- [ ] **Selector health:** Often no signal when the Reels anchor drifts — verify there's a logged health check and a documented fallback path before the silent no-op happens in production.
- [ ] **Perf budget:** Often "seems fast on my desktop" — verify <1% CPU observer cost with a synthetic 5k-mutations/sec churn test, and no jank on a low-end Android WebView.

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Selector drift (degradation stops) | LOW | Health check logs missing anchor → refresh real-DOM snapshot in harness → update selector registry → re-run drift tests. Ship a one-line config change, not a code rewrite. |
| Filter not rendering on iOS | MEDIUM | Switch to ancestor-wrapper application (already designed) → verify on device → confirm no transformed ancestor. |
| Scope leakage reported by user | HIGH (trust damage) | Immediate hot-fix: tighten allowlist; add preserve-route assertion test; audit which surfaces were affected. |
| Session clock drift | MEDIUM | Recompute from wall-clock deltas; instrument phase transitions; compare against device wall time in manual test. |
| Fake-buffer frustration | MEDIUM | Disable the buffer lever globally (flag), keep saturation/rate/loop; revisit with perception testing. |
| React wiping degradation | LOW | Re-apply on `ended`/`play`/mutation (idempotent); verify with a churn test. |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Scope leakage (P1) | Phase 2 (detection & scoping) | Harness asserts zero degradation on social surfaces; manual device test |
| Filter on video iOS (P2) | Phase 3 (levers) + Phase 5 (device test) | WebKit-visible device check: pixel color changes |
| Rate/volume clamps (P3) | Phase 3 (levers, clamp tables) | Harness with WebKit clamp model; on-device unmuted volume test |
| Visibilitychange reliability (P4) | Phase 1 (lifecycle) | Background 6 min on device → reset fires on resume |
| Tick-based time accounting (P5) | Phase 1 (session clock) | Wall-clock equivalence test with hidden period |
| Observer perf (P6) | Phase 2 (observer architecture) | Churn perf test (<1% CPU, no jank) |
| Selector drift / React wipe (P7) | Phase 2 + Phase 5 (registry, snapshots) | Snapshot refresh test; re-apply on events test |
| Fake buffer UX (P8) | Phase 3 (lever design) + Phase 5 (perception) | No visible spinner; no host-visible pause event; acolhimento off |
| Loop-block semantics (P9) | Phase 3 (levers) | Mock `ended` → stays paused, no auto-advance, degradation intact |
| Autoplay-blocked container | Phase 3 (adaptation) | Android container w/o gesture flag: engine doesn't fight, still degrades styles |
| Overlay stacking/fullscreen | Phase 4 (overlay) | Tap-through + fullscreen hide test |

## Sources

- WebKit — "New video policies for iOS" (Jer Noble, 2016) — **HIGH** (primary policy: muted autoplay allowed, unmute-without-gesture pauses playback)
- Apple Developer — `WKWebViewConfiguration.allowsInlineMediaPlayback` / `mediaTypesRequiringUserActionForPlayback` — **HIGH** (primary docs)
- Android Developers — `WebSettings.setMediaPlaybackRequiresUserGesture` — **HIGH** (default true = autoplay blocked without container config)
- MDN — Page Visibility API, `visibilitychange`, `HTMLMediaElement.playbackRate`, Web audio playbackRate guide — **HIGH**
- Chrome for Developers — "Background tabs" (2017), "Heavy throttling of chained JS timers in Chrome 88" (2021) — **HIGH** (throttling rules incl. audio exemption, rAF never fires hidden)
- WebKit bug 184601 — SVG `url(#)` filters don't apply to video — **HIGH** (primary bug tracker)
- WebKit commit 1a31d8a — `visibilitychange:hidden` fires during navigations; pagehide-before-visibilitychange ordering — **MEDIUM**
- WordPress core ticket #59104 — duotone/SVG filters fail on video in Safari 16.x — **MEDIUM**
- SferaDev commit 7ad2de9 — iOS Safari drops CSS filter on transformed video; must use non-transformed ancestor — **MEDIUM**
- ytyng.com — WKWebView reports hidden when OS-invisible; rAF/transitions/timers paused — **MEDIUM**
- lyrion-dashboard commit 4b229a9 — `visibilitychange` not reliably delivered in WebView; wire onPause/onResume; use `focus`/`pageshow` — **MEDIUM**
- danieljwilson.me — playbackRate ranges table (Safari max 2.0) — **MEDIUM**
- OmniScrape Instagram scraper guide — Meta CSS-in-JS hashed classes change every deploy (weekly); use semantic attributes — **MEDIUM**
- meta-skills automation-flows/instagram.md — `selector_drift` failure class; `main[role="main"]` anchor; ~monthly drift — **MEDIUM**
- unpacked.danielhowells.com — MutationObserver cost breakdown (subtree scope, microtask delivery, attributeFilter) — **MEDIUM**
- whatwg/dom issue #484 — batched mutation reduction; net-change analysis — **MEDIUM**
- StackOverflow 31659567 — MutationObserver perf practices (narrow scope, debounce, avoid querySelectorAll, drain records) — **MEDIUM**
- kbrianps/instagram-video-controls — Instagram media state handling, `volumechange` tracking, click catcher over video, loop default — **MEDIUM**
- melancholic-ksm/igtool — Instagram video state sync, visibility API override for background playback — **MEDIUM**
- Auto Reels Scroller (Chrome Web Store) — existence proves Reels loop in place / do not auto-advance — **MEDIUM**
- AVEQ — video stalling perception thresholds (80–200 ms detection band) — **MEDIUM**
- AIT — "death of the loading spinner" (spinner = broken product in short-form video) — **MEDIUM**
- TrueLink / BrowserInsight / NullMark — WebView detectability (`; wv)` UA token, iOS context probes) — **MEDIUM**
- SwiftyInsta issue #163 — custom user agent → Instagram forced logout (`login_required`) / checkpoint — **MEDIUM**
- UX StackExchange 41717 — buffering play/pause state toggling frustrates users — **LOW**

---
*Pitfalls research for: SlowGram v1.0 anti-addiction motor (WebView-embedded Instagram Reels degradation)*
*Researched: 2026-08-15*