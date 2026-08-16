# Feature Research

**Domain:** Anti-addiction / digital-wellbeing engine injected into a social-media feed container (Instagram web Reels inside WKWebView/WebView)
**Researched:** 2026-08-15
**Confidence:** MEDIUM (web-tier, cross-corroborated across multiple independent sources; technical claims from official MDN/WebKit/Chrome/Apple docs)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist in any screen-time / anti-addiction tool. Missing these = the product feels broken, deceptive, or useless. SlowGram inherits these expectations even though it is a silent injection: the category has already trained users.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Session-time tracking that is accurate and never "lies" | Every tool in the category (iOS Screen Time, Android Digital Wellbeing, one sec, Moment, Opal) tracks elapsed time; it is the foundational primitive every other feature reads. A counter that drifts or fails to reset destroys trust. | MEDIUM | Must be timestamp-based, not a running timer. On Android WebView `visibilitychange` is NOT reliably delivered (it derives from Activity `onStop`, which is not guaranteed) and the process freezes when backgrounded — timers stretch to ~1/min. Real-world fix: also listen on `window focus` and `pageshow`, and compute elapsed hidden time at catch-up on return. |
| Grace period at session start (first minutes 100% native) | Users expect the first minutes to be free of intervention. one sec supports *delayed* interruptions ("appear delayed after X minutes after the initial opening"); Boring Mode fades "over your chosen time" (10/30/60 min); blocker research shows gradual escalation beats immediate blocking. SlowGram's 0–3 min "acolhimento" phase matches this expectation. | LOW | Fixed 3-min window is a parameter; phase values already centralized per PROJECT.md. |
| Visible feedback mechanism (elapsed-time counter) | Users must be able to attribute the degraded state to the tool, not to a broken Instagram. Tracking alone improves self-awareness (JCR field study) and users prefer informational tracking over restrictive blocking — even when they believe blocking is "more effective." The counter overlay is also the answer to "why does the feed look/sound off?" | LOW | Neutral, `pointer-events: none`, `z-index: 999999` per constraints. Must not cover interactive controls; must not flash-shame. |
| Reset on backgrounding >5 min (user-intent signal) | All session-based tools reset when the user leaves and returns after a meaningful gap; it is the standard definition of "a new session." Chrome itself freezes hidden tabs after ~5 min, aligning with the 5-min threshold. | MEDIUM | Compute at catch-up: on `visibilitychange(visible)` / `pageshow` / `resume`, `elapsed = now − hiddenTimestamp`; if > 5 min, reset fatigue and re-derive phase from a fresh session. Never rely on a background timer to detect the 5-min mark. |
| Preservation of core utility — social routes never degrade | iOS Screen Time *always* keeps calls/messages available during Downtime (Apple explicitly allows communication through restrictions); one sec is marketed around "it's only worth the wait if you really intend to message someone." Breaking DMs/`/direct/`, `/messages`, profiles, or search is the category's cardinal sin and the #1 reason users uninstall. | MEDIUM | Strict pathname router: `/direct/`, `/messages`, profiles, search → engine pauses all levers. Must also handle SPA navigation (pathname changes without reload) via MutationObserver/popstate. |
| No data exfiltration / on-device only | one sec markets "all data stored offline, on-device for your privacy." Digital-wellbeing users are privacy-alert; a silent injection that phones home would be killed on sight. | LOW | Already satisfied by design: zero network calls, zero platform API. |
| Escape hatch / autonomy support | Reactance research (Lukoff/Lyngs 2022): strong enforcement triggers reactance — users "stay on just out of spite." Autonomy support is the difference between an intervention and an annoyance. SlowGram's inherent escape hatches are: scroll stays native, social routes stay live, and degradation is perceptual rather than blocking. | LOW | v1 has no settings UI (per PROJECT.md), so the escape hatch is architectural: the user is never locked out of anything. Document this as the v1 autonomy story. |

### Differentiators (Competitive Advantage)

Where SlowGram competes. The category is split between hard blockers (Opal, Cold Turkey, iOS Downtime) and open-friction nudges (one sec, ClearSpace). Almost nobody does **silent, graduated, multi-lever sensory degradation that preserves the entire UI**.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Imperceptible graduated multi-lever degradation (saturation → playbackRate → volume → loop-block → stop point) | Grayscale research is strong: grayscale reduces screen time 20–28 min/day (d≈0.51) and improves perceived control — but *does not* reduce unlock frequency (deep-rooted checking habits persist). That means pure grayscale shortens sessions; it does not stop the checking loop. SlowGram's escalating timeline (color → speed → audio → loop → stop point) is a reverse-retention algorithm no shipped tool has. Boring Mode validates "fades so slowly you barely notice" as viable and liked. | HIGH | Saturation lever must be applied ONLY to the active in-viewport video: WebKit has documented filter-on-video perf hazards (blur breaks pages — bug 228312; memory explosion for offscreen filtered elements — bug 83815; video sync paints hanging main thread — bug 238707). Use `filter: saturate(n)` on the current video only, gate with `@supports` and reduced-motion, keep a kill switch. playbackRate 0.85–0.95x / 1.05–1.15x is safe everywhere (safe range 0.5–4; pitch preserved; Chromium clamps to [1/16,16]) — must re-apply per video and survive React re-renders. |
| 4-phase continuous timeline (0–3 / 3–7 / 7–12 / 15+ min) | Block-immediacy research (SSRN randomized experiment): a *gradual* block improves productive time — and helps **heavy users the most**. Graduated escalation is empirically the right curve, and it directly implements the "reverse retention algorithm" core value. | MEDIUM | Phase values fixed and centralized per PROJECT.md; the engine is a pure function `phase(t)` so the harness can assert deterministic phase transitions. |
| Neutral, non-judgmental feedback overlay | Framing research (Chalmers 2023): negative framing (highlighting "failures") significantly increases rumination and decreases self-compassion; neutral/positive framing increases reflection. Shame-based counters ("You've wasted 47 minutes!") induce reactance, not change. A guilt-free elapsed-time counter is both evidence-backed and rare. | LOW | Counter states elapsed time only; no commentary, no color-coding, no "limit reached" language. |
| Scroll 100% native — zero input friction | Friction research cuts both ways: one sec's 3–60s delay reduces app-open attempts 37% and openings 57% — but the open-friction model intercepts *entry*, not *consumption*. In-feed frictions (reaction-gated scrolling) frustrate 53% of users. Keeping scroll, swiping, and taps perfectly native while degrading the *media itself* is the position SlowGram owns. | LOW | By design: the engine never touches scroll/input events. |
| Zero platform API automation | Bots that like/comment trigger anti-bot detection; SlowGram does zero requests. Undetectable, ToS-safe, and privacy-clean. | LOW | Already out of scope by design; keep it that way. |
| Single-file IIFE, zero dependencies, injection-ready | Portability into WKWebView/WebView (no extension store, no build chain) is the category's practical gap — most tools are native apps or browser extensions that cannot live inside a WebView container. | MEDIUM | No build step; mocks of DOM selectors make the engine testable in a plain page (harness). |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Abrupt hard blocking / lock-screen at the stop point | "If I can't get in, I can't overuse" — the bluntest framing. | Reactance research: strong enforcement → "stay on just out of spite," abandonment, and resentment of the tool. SSRN blocker study: partial blocking *increased* work-time distraction; blocking can backfire. Also forbidden by PROJECT.md ("bloqueio abrupto — proibido por design"). | The stop point (15+ min) is a perceptual ceiling: heaviest degradation + neutral counter + loop-block, never a wall. The user can always leave on their own or use social routes. |
| Guilt-shaming counter messages ("You've wasted X hours!") | Feels urgent and motivating to build. | Negative framing increases rumination and decreases self-compassion (Chalmers 2023); goal-reminder intrusiveness made participants "stay on just out of spite" (Lukoff/Lyngs). | Neutral elapsed-time counter, pointer-events none, elegant typography. |
| Blocking DMs / messages / profiles / search | "Block the whole app to stop Reels." | Category table stakes are the opposite: Apple always allows communication during Downtime; one sec users keep Instagram for messaging. Blocking social utility destroys the product's value contract and gets the tool deleted. | Strict route preservation — `/direct/`, `/messages`, profiles, search are hard-paused routes; degradation applies only to the Reels feed. |
| Artificial scroll lag / scroll inertia | "Slow them down by making scrolling heavy." | Feels like a broken app; users blame Instagram/container, not the habit. The entire "no lag → no frustration" loop is what IG engineers optimize — we must not add lag. Forbidden by PROJECT.md (scroll 100% normal). | Degrade media (color/speed/audio/loop), never input. |
| Deliberation / mindfulness messages at app-open or per-scroll | one sec's visible pattern; quotes interstitials (Reravel) look attractive. | PNAS controlled experiment: the *deliberation message itself* was not effective — only friction + the dismiss option worked. SlowGram's model is friction-free at entry; a message at open or scroll is both ineffective and detectable. | Silent degradation; the neutral counter is the only visible UI. |
| Fake engagement / API automation (auto likes, comments to "dilute" the feed) | "Make the feed less rewarding by polluting signals." | Auto-engagement is the exact fingerprint anti-bot systems hunt; it violates ToS and creates detection risk (PROJECT.md: zero platform API automation). | Perceptual levers only; nothing is sent to the platform. |
| Per-user timing personalization in v1 | Users love customization (one sec/Opal/Bastion all offer it; autonomy research supports customization). | Contradicts PROJECT.md fixed-timings decision; adds a settings surface to an IIFE meant to be zero-config; risks scope explosion in a milestone that must validate the *concept* (selectors + degradation). | Centralized constant object (`TIMELINE = { native: 180, micro: 420, ... }`) — manual edit = the v1 "settings." Revisit as v2 with autonomy-support framing. |
| Simulated buffer as a primary degradation lever | "Real-world buffering is annoying; fake it to stop Reels." | Instagram aggressively prefetches 1–2 Reels ahead, buffers the first seconds, and cancels downloads instantly on behavior change — the platform engineers specifically to eliminate spinners ("no spinner, no delay, no disappointment"). A fake buffer will either do nothing (prefetched content keeps playing) or flash a visible spinner → perceptibility + frustration. | Keep it as the stop-point capstone only (final gentle push), gated behind a flag; primary levers are saturation, playbackRate, loop-block. Measure perceptibility in the harness before trusting it. |
| Progress dashboards / "time saved" charts in v1 | one sec visualizes progress ("watching your progress reflected in numbers is incredibly motivating"). | Needs persistence across sessions and a UI surface — scope creep for a silent IIFE; also *shows the user the tool exists*, working against the subliminal design. | v2+, if the wrapper exists and the user opts into visibility. |

## Feature Dependencies

```
Session-time engine
    └──requires──> Lifecycle tracking (visibilitychange/pagehide/freeze + pageshow/focus catch-up)

4-phase timeline engine
    └──requires──> Session-time engine

Feed detection (MutationObserver + role/attribute selectors)
    └──requires──> Debounced/rAF-batched observer core

Degradation levers (saturation, playbackRate, volume, loop-block)
    └──requires──> 4-phase timeline engine
    └──requires──> Active-video tracking (per-video observer + IntersectionObserver)

Neutral counter overlay
    └──requires──> Session-time engine

Route preservation (/direct/, /messages, profiles, search)
    └──requires──> Pathname router (SPA-aware)
    └──requires──> Feed detection (to gate levers)

Fatigue reset (>5 min background)
    └──requires──> Lifecycle tracking (timestamps)

Harness (demo page + DOM mocks)
    └──requires──> Mock selectors matching role/attribute targets

Simulated buffer ──enhances──> Stop-point phase (15+ min)
Volume lever ──enhances──> Sensory-wear phase (7–12 min) [only effective when user unmutes]

Simulated buffer ──conflicts──> Perceptibility principle (visible spinner)
Personalization UI ──conflicts──> v1 fixed-timings scope
Open-time deliberation messages ──conflicts──> Friction-free entry model
```

### Dependency Notes

- **Session-time engine requires lifecycle tracking:** elapsed time is meaningless if hidden-time is double-counted or missed. On Android WebView the process freezes in background and `visibilitychange` is unreliable — so hidden-start is timestamped on `visibilitychange(hidden)`/`pagehide`/`freeze`, and hidden-end is derived at catch-up on `visibilitychange(visible)`/`pageshow`/`focus`. This is the single most important correctness detail in the engine.
- **Degradation levers require active-video tracking:** levers must apply to the currently visible Reels video and be re-applied to each new video element (React re-renders, feed virtualization removes/re-adds nodes). Applying saturation to offscreen/ancestor elements risks the documented WebKit memory/frame bugs. The instagram-video-controls extension is a working precedent: global MutationObserver + per-video attribute observer + rAF throttling.
- **Route preservation requires feed detection:** the engine must know both *which route* (pathname) and *whether a Reels video is live* to pause or apply levers; degradation is only ever applied inside the Reels feed.
- **Fatigue reset requires lifecycle tracking:** the >5-min rule must be computed from timestamps at catch-up, never from a background timer (Chrome intensive-throttling checks hidden-tab timers ~once per minute after 5 min; Android WebView ~1/min or frozen).
- **Simulated buffer conflicts with perceptibility:** Instagram's prefetch engine already "fills the buffer," so a fake buffer is either a no-op or a visible spinner — both failures. Gate it behind the stop-point phase and a flag.
- **Personalization UI conflicts with v1 scope:** PROJECT.md fixes timings; autonomy research (Lukoff/Lyngs) argues customization reduces reactance — a good v2 argument, a bad v1 scope.
- **Dependency on existing scope (nothing shipped yet):** all features above are greenfield; the harness must be built in the same phase as the engine (it validates the selectors and the `phase(t)` transitions deterministically).

## MVP Definition

### Launch With (v1)

- [ ] Session-time engine (timestamp-based, catch-up on return) — the foundation everything reads.
- [ ] Lifecycle tracking (visibilitychange + pagehide + freeze + pageshow/focus catch-up) — required by session engine and fatigue reset.
- [ ] 4-phase timeline engine (`phase(t)` pure function, fixed centralized constants) — the core value.
- [ ] Feed detection (MutationObserver, role/attribute/pathname selectors, rAF-batched, never CSS classes) — Instagram's hashed classes change every deploy; this is the make-or-break primitive.
- [ ] Saturation lever (active in-viewport video only) — highest-evidence lever (grayscale studies) and visually the "wow" of the product.
- [ ] playbackRate lever (0.85–0.95x, re-applied per video) — safe everywhere, pitch preserved, silent perceptibility.
- [ ] Autoplay-loop block lever (pause/strip `loop` at ended) — the strongest *behavioral* stop; precedent exists (extensions already strip `loop`).
- [ ] Neutral counter overlay (elapsed time only, pointer-events none) — the visible feedback table stake and the differentiator against shame-based counters.
- [ ] Route preservation (`/direct/`, `/messages`, profiles, search never degrade) — category table stake, non-negotiable.
- [ ] Fatigue reset via background >5 min (timestamp-computed) — session correctness.
- [ ] Harness: demo page + DOM mocks of the selectors — the deterministic validation loop for every lever and phase.

### Add After Validation (v1.x)

- [ ] Volume lever (relative, applied only when the user has unmuted) — its audible effect is zero on muted autoplay (Reels default), so it is a weak standalone lever; ship after confirming unmute flows in the target container.
- [ ] Simulated buffer (stop-point capstone, flagged) — only after measuring perceptibility and verifying it against IG's prefetch behavior in the real container.
- [ ] Kill-switch / master flag exposed in code (or a documented snippet to remove the injection) — autonomy-support surface without a settings UI.

### Future Consideration (v2+)

- [ ] Native wrapper (WKWebView/WebView container) — out of scope in v1 by decision; the engine's IIFE contract makes this a packaging exercise.
- [ ] TikTok support — second network once the selector architecture is proven; PROJECT.md defers.
- [ ] User-configurable timings (customization for autonomy) — supported by reactance research; needs a settings surface.
- [ ] Progress visualization ("time saved" stats) — one sec shows charts are motivating, but they reveal the tool's presence; only for an opt-in wrapper.
- [ ] Snooze/break management (one sec users take periodic breaks and rebound fast; a "break from the intervention" toggle is a learned category pattern) — requires a UI surface.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Session-time engine (timestamp + catch-up) | HIGH (foundation) | MEDIUM | P1 |
| Lifecycle tracking | HIGH (foundation) | MEDIUM | P1 |
| 4-phase timeline engine | HIGH (core value) | LOW | P1 |
| Feed detection (role/attribute selectors + rAF batching) | HIGH (make-or-break) | MEDIUM | P1 |
| Saturation lever (active video only) | HIGH | MEDIUM | P1 |
| playbackRate lever | MEDIUM-HIGH | LOW | P1 |
| Autoplay-loop block lever | HIGH | LOW | P1 |
| Neutral counter overlay | MEDIUM | LOW | P1 |
| Route preservation (social never degrades) | HIGH (trust) | MEDIUM | P1 |
| Fatigue reset (>5 min background) | MEDIUM | LOW | P1 |
| Harness (demo + DOM mocks) | HIGH (validation) | MEDIUM | P1 |
| Volume lever | LOW-MEDIUM (muted default) | LOW | P2 |
| Simulated buffer (gated, stop-point) | LOW (perceptibility risk) | MEDIUM | P2 |
| Kill-switch / master flag | MEDIUM (autonomy) | LOW | P2 |
| Native wrapper | HIGH (distribution) | HIGH | P3 |
| TikTok support | MEDIUM | HIGH | P3 |
| User-configurable timings | MEDIUM | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | one sec | Opal | iOS Screen Time / Android Digital Wellbeing | Boring Mode | Bastion | Reravel | Our Approach |
|---------|---------|------|---------------------------------------------|-------------|---------|---------|--------------|
| Intervention model | Friction delay (3–60s) + dismiss option at app open | Hard scheduled blocks with opt-out | App timers + Downtime with "ignore limit" (1/15 min/day) | Gradual fade to grayscale over chosen time | Graduated: time limit, nav frequency, speed bump, degradation | CSS filters + timed quote interstitial | Silent multi-lever degradation inside the feed; zero entry friction |
| Degradation levers | None in-feed | None | None | Grayscale (single lever) | Grayscale by time-of-day/spent | Grayscale, contrast, opacity, vignette, typography | Saturation + playbackRate + relative volume + loop-block + stop point |
| Time feedback | Progress charts (opt-in) | — | Screen Time dashboards | — | Time budget awareness | — | Neutral elapsed-time counter overlay |
| Scroll/input impact | None (app-open only) | Blocks app | Blocks app at limit | None (CSS) | None (CSS) | Interstitial blocks scroll until timer | 100% native scroll, always |
| Blocks messaging/utility | Never (users keep apps for messaging) | Configurable — users carve out | Never — Apple always allows calls/messages | Never | Configurable | Never | Never — routes hard-paused |
| Evidence | PNAS 2023 (57% fewer openings), CHI 2024 longitudinal (1,039 users) | — | Tracking ↑ awareness only (JCR); App Limits/Downtime no significant time effect (Frontiers 2025) | cites grayscale studies (20–50 min/day) | — | — | Grayscale studies (20–28 min/day); block-immediacy (gradual > immediate); framing (neutral > negative) |
| Detectability | Explicit UI | Explicit UI | System-level | Visual (color drains) | Visual | Visual + interstitial | Subliminal by design |

## Sources

- Lukoff, Lyngs & Alberts (2022) — "Designing to Support Autonomy and Reduce Psychological Reactance in Digital Self-Control Tools" (reactance, autonomy, shaming backlash)
- Loerakker, Niess, Bentvelzen et al. (2023) — "Designing Data Visualisations for Self-Compassion in Personal Informatics" (negative framing ↑ rumination, ↓ self-compassion)
- Grüning et al. / PNAS (2023) — "Directing smartphone use through the self-nudge app one sec" (57% fewer app openings; dismiss option strongest; deliberation message ineffective)
- Haliburton et al. / CHI (2024) — "A Longitudinal In-the-Wild Investigation of Design Frictions" (1,039 users; breaks & rebound; more intentional openings)
- Pradhan et al. / JCR — "Your Screen-Time App Is Keeping Track" (tracking improves awareness, not usage; users prefer tracking over blocking)
- Frontiers in Psychiatry (2025) — active nudging study (App Limits/Downtime: no significant screen-time effect; reduced sleep delay)
- SSRN — "Less is Not Always More: Block Intensity and Immediacy of Social Media Blockers" (gradual block helps, especially heavy users; partial block can backfire)
- Ruiz (2024) — "Design Frictions on Social Media" (microboundaries ↑ attention, 53% frustration → opt-out needed)
- Holte & Ferraro / SAGE (2023) — grayscale intervention (20 min/day reduction; unlocks unchanged; improved perceived control)
- Frontiers in Digital Health (2026) — grayscale cross-over trial (28 min/day reduction)
- Boring Mode (Safari extension) — gradual grayscale fade over chosen time; "color drains so slowly you barely notice"
- Bastion (GitHub) — graduated friction, degradation, "calm, not hostile" design language
- Reravel (GitHub) — layered CSS filters + quote interstitial; snooze
- inControl (GoodIT 2023) — progressive darkening while scrolling infinitely; nudging liked more than redesign
- one sec app site & FAQ — friction mechanics, offline-only privacy, delayed/re-interventions, breaks
- Apple Support — Screen Time Communication Limits / Always Allowed (calls & messages preserved during Downtime)
- MDN Page Visibility API / visibilitychange / playbackRate / Autoplay guide; Chrome for Developers — autoplay policies, Chrome 88 intensive throttling, Page Lifecycle API, muted autoplay
- WebKit blog — New <video> Policies for iOS (autoplay, playsinline, unmute-pause)
- Android Developers — WebSettings.mediaPlaybackRequiresUserGesture
- WebKit bugzilla — 228312, 83815, 238707, 225273 (filter/video perf); 151234, 216917 (visibilitychange on unload, event order); whatwg/html#5949 (pagehide before visibilitychange)
- WICG page-lifecycle — lifecycle states, freeze/resume ordering, Android onStop visibilitychange caveat
- Playwright personas / meta-skills / OmniScrape / dev.to — Instagram DOM obfuscation evidence (CSS-in-JS hashed classes, 17 changes in 18 months, role/aria stability)
- github.com/kbrianps/instagram-video-controls & igtool — working precedents for per-video observers, rAF throttling, loop-stripping, volume/rate control on Instagram videos
- Unpacked (MutationObserver cost) & ObserverViewport — observer performance patterns (subtree cost, rAF batching, attributeFilter, unobserve discipline)
- mukundjogi.hashnode.dev — Instagram Reels prefetch window, no-spinner design, no stopping cue

---
*Feature research for: SlowGram anti-addiction engine (v1)*
*Researched: 2026-08-15*
