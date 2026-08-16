# Phase 2: DOM Detection & Scoping - Context

**Gathered:** 2026-08-15
**Status:** Ready for planning

<domain>
## Phase Boundary

The engine correctly classifies the current surface as REELS/SOCIAL/UNKNOWN and scopes all degradation to the Reels surface only — the trust contract that social routes never degrade is established before any lever exists. Delivers ContextDetector, RouteGuard, DomWatcher, VideoRegistry, the selector registry with health check, and the Instagram DOM mocks + demo.html that make detection deterministically testable. Phase 3 levers consume the context/scope verdicts produced here; the engine's existing setContext() bus and CONFIG already carry the seams Phase 1 built.

</domain>

<decisions>
## Implementation Decisions

### Reels Surface Scope
- **D-01:** REELS = the `/reels/` tab only. Home-feed video posts, profile reels, stories, and DM-shared reels are never REELS — they stay UNKNOWN or SOCIAL. Matches research Pitfall 1: "default: Reels surfaces only." — **Reversibility:** costly — widening later to home-feed is a product re-decision with new false-positive risk; narrowing is easy. User explicitly chose "Reels tab only" over the broader alternatives.
- **D-02:** Pathname is authoritative for REELS. Context = REELS only when `pathname` starts with `/reels/` (or `/reels/<id>`); DOM signals (video presence, role) refine detection but never upgrade a non-reels pathname. User chose "Pathname authoritative" over "pathname + video required" — the empty-reels-tab edge is acceptable.
- **D-03:** The fullscreen reels viewer dialog (`role="dialog"` opened by tapping a reel) counts as REELS while the pathname stays `/reels/` or `/reels/<id>`. Videos inside the dialog degrade too — the full reels consumption surface is preserved. User chose "Include dialog" (recommended).

### Preserved Routes & RouteGuard
- **D-04:** Full preserve list: `/direct/`, `/messages/`, profiles (`/<username>/`), `/p/` posts, `/explore/` (search), `/accounts/`, and the stories tray. These never degrade. User chose "Full preserve list" over core-only.
- **D-05:** Pathname matching = prefix + keyword-guard. A route matches when `pathname === prefix` or starts with `prefix + '/'`. Profiles are matched by the guard rule: single-segment pathnames that do NOT start with a known keyword (`reels`, `direct`, `messages`, `p`, `explore`, `accounts`, `stories`) are treated as profiles and preserved — no curated username allowlist needed. User chose "Prefix + keyword-guard (Recommended)".
- **D-06:** RouteGuard re-asserts preservation on every SPA navigation signal: pushState/replaceState interception + popstate + hashchange, PLUS a pathname re-check on each rAF tick as a fallback for navigation types that bypass interception. User chose "Intercept + rAF fallback (Recommended)".
- **D-07:** On a route flip to a preserved (social) route, DomWatcher disconnects its observer (DETC-08) and the clock pauses via the existing `setContext(SOCIAL)`. The VideoRegistry is NOT cleared on disconnect — reconnecting re-syncs on return to `/reels/`. (Phase 3's `revertAll()` owns restoring videos to native; Phase 2 guarantees only context + observer disconnect + no accumulation.) User chose "Disconnect, keep registry (Recommended)".

### Drift & Health-Check Stance
- **D-08:** Fail-loud in dev, fail-soft in prod. Dev/harness: log + expose a health signal when the Reels anchor is missing for N consecutive scans. Prod: if the `/reels/` anchor is missing but pathname says `/reels/`, degrade document-scoped `<video>` nodes only on that route (bounded fallback). Matches research Pitfall 7 guidance. User chose "Fail-loud dev, fail-soft prod (Recommended)".
- **D-09:** Health check runs per rAF batch (each mutation batch on `/reels/`); drift is declared at N=5 consecutive scans with zero video+anchor hits. Fast detection, low noise — a momentary empty reels tab won't trip it. No timer-based health check (Phase 1 banned timers). User chose "Per-batch, N=5 (Recommended)".
- **D-10:** SelectorRegistry surfaces health via a public handle `SlowGram.getSelectorHealth()` plus a `selectorHealth` bus event emitted on drift-declared and drift-recovered. Harness asserts against the handle; prod fallback logs once. User chose "Public handle + bus event (Recommended)" — keeps DETC-06 deterministically testable.

### Observer Scope & Lifecycle
- **D-11:** DomWatcher observes ONLY the Reels feed container (role/attribute anchored, e.g. `[role="main"]` within `/reels/`), `childList` + `subtree`, with `attributeFilter` limited to `['src','loop','autoplay','role']`. No body-wide observation — matches Pitfall 6 (narrow observer) + DETC-04. User chose "Feed container only (Recommended)".
- **D-12:** Observer connects ONLY when context is REELS (pathname `/reels/` + feed container present); disconnects on SOCIAL/UNKNOWN (DETC-08); reconnects on return to `/reels/`. Saves CPU on social routes by construction. User chose "Connect-on-REELS only (Recommended)".
- **D-13:** ContextDetector refreshes from: (1) pathname events (route change), (2) role/attribute mutations on `/reels/` (video mount, role change), (3) the rAF batch after mutations. Video lifecycle events (`loadstart`/`emptied`) feed VideoRegistry per-video reset, NOT context classification. User chose "Pathname + mutations + batch (Recommended)".
- **D-14:** Self-mutation filtering = a `mutating` flag around all engine writes (style.filter, playbackRate, volume) PLUS exclusion of nodes inside the engine's own overlay host subtree. Matches research Pattern 4 / Anti-Pattern 4 (no feedback loops). User chose "Mutating flag + overlay-exclusion (Recommended)".

### the agent's Discretion
- VideoRegistry per-video state shape (beyond the WeakMap + `loadstart`/`emptied` lifecycle reset required by DETC-05) is left to planning — Phase 2 holds registration + lifecycle; Phase 3 adds applied-lever state.
- Selector registry exact contents (which roles/attributes are anchors vs helpers) beyond `video`, `[role="main"]`, and the preserved-route keywords is left to research/planning grounded in the research docs.
- Instagram DOM mock fixture depth (which route snapshots to encode in mocks) beyond the DETC-07 requirement is planner discretion.

### Folded Todos
None — `todo match-phase 2` returned 0 matches.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase / Requirements Definition
- `.planning/ROADMAP.md` §Phase 2 — Phase goal, success criteria 1-5, plan/wave scaffolding, DETC requirements 01-08
- `.planning/REQUIREMENTS.md` §Detecção & Escopo DOM (DETC) — DETC-01..DETC-08 requirement texts (the acceptance contract)

### Research (decides scope/architecture questions this phase answers)
- `.planning/research/PITFALLS.md` §Pitfall 1 (scope leakage: reels in home feed/profiles, allowlist + preserve-list, per-route re-check) — the defining anti-pattern for this phase
- `.planning/research/PITFALLS.md` §Pitfall 6 (narrow observer, debounce, no querySelectorAll in callbacks, disconnect on social, takeRecords) — the observer architecture spec
- `.planning/research/PITFALLS.md` §Pitfall 7 (selector drift + React wipe, selector registry health check, fail-loud dev / fail-soft prod fallback) — the drift stance
- `.planning/research/PITFALLS.md` §Performance Traps + §"Looks Done But Isn't" — observer perf budgets and the social-preservation checklist items
- `.planning/research/ARCHITECTURE.md` §Pattern 2 (WeakMap VideoRegistry with loadstart/emptied reset), §Pattern 4 (Guarded MutationObserver, mutating flag + overlay exclusion) — the two patterns this phase implements
- `.planning/research/ARCHITECTURE.md` §Component Responsibilities (ContextDetector, RouteGuard, DomWatcher, VideoRegistry) + §Data Flow (signal path) — component contracts and event flow
- `.planning/research/STACK.md` — observer scope guidance (feed container, attributeFilter), selector constraints (role/attribute never classes)

### Existing Code Seams
- `src/slowgram.js` — CONFIG `selectors`/`preservedRoutes` placeholders (Phase 2 owns real values), `setContext()` bus + `contextchange` event, `resolveEnv` DI seam (document/window/MutationObserver/requestAnimationFrame), `getSelectorHealth`/`selectorHealth` will be added here
- `test/slowgram.test.js` + `test/harness.js` + `test/harness.html` — FakeMutationObserver/FakeVideoElement/assert-runner patterns to extend with Instagram DOM mocks

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SlowGram.setContext()` + `contextchange` bus (src/slowgram.js:486): ContextDetector's output feed — throw on invalid, emit only on change, re-runs running gate + tick. Detectors call this, no new clock plumbing needed.
- `resolveEnv` DI seam (src/slowgram.js:103): DomWatcher builds its observer from `env.MutationObserver` and `env.document` — mocks inject FakeMutationObserver exactly as Phase 1 does for clock.
- CONFIG frozen object (src/slowgram.js:164): `selectors` (video/roleMain) and `preservedRoutes` placeholders already deep-frozen — Phase 2 fills real values; consumers read via `SlowGram.getConfig()`.
- Event bus `on`/`emit` (src/slowgram.js:376): subscribers survive destroy/re-init (Phase 2+ consumers subscribe once at page load); `selectorHealth` event plugs into the same bus.
- FakeMutationObserver + FakeVideoElement + assert runner (test/harness.js): D6 regression tests already drive real rAF request cycles; extend with Instagram DOM mock fixtures per DETC-07.

### Established Patterns
- Wall-clock deltas at event boundaries, no timers (CORE-01): DomWatcher must be rAF/mutation-batch driven, never interval-driven.
- UNKNOWN context never degrades (fail-safe by design): ContextDetector default is UNKNOWN; only explicit `/reels/` pathname → REELS.
- Deep-frozen single CONFIG: selector registry + preserved routes live in CONFIG, no magic strings scattered in module bodies.
- Contained handlers (try/catch in lifecycle + emit): DomWatcher callbacks and ContextDetector refresh must be contained so engine failures never escape into Instagram's page.

### Integration Points
- ContextDetector → `SlowGram.setContext(REELS|SOCIAL|UNKNOWN)` (already gates the clock).
- DomWatcher → ContextDetector via a refresh signal (mutations + pathname) and → VideoRegistry.register(video).
- RouteGuard → pathname monitoring (pushState/replaceState/popstate interception + rAF pathname check) → setContext.
- SelectorRegistry → CONFIG.selectors (real values), `SlowGram.getSelectorHealth()` handle, `selectorHealth` bus event.
- VideoRegistry → per-video WeakMap state + `loadstart`/`emptied` listeners (Phase 3 levers consume; DETC-05).

</code_context>

<specifics>
## Specific Ideas

- User chose "Reels tab only" explicitly — the product degrades ONLY the `/reels/` passive-consumption surface; home feed stays native.
- User chose "Full preserve list" — `/direct/`, `/messages/`, profiles, `/p/`, `/explore/`, `/accounts/`, stories tray all locked as never-degrade.
- User accepted the "empty reels tab" edge case (pathname authoritative means a momentarily empty `/reels/` still counts as REELS).
- User wants the fullscreen reels viewer dialog counted as REELS (heavy consumers watching fullscreen still get degraded).

</specifics>

<deferred>
## Deferred Ideas

- Home-feed video posts as a future REELS surface — explicitly rejected for v1 (D-01); belongs in a future phase/backlog if product re-decides.
- Profile reels as a degraded surface — rejected (stays SOCIAL/preserved); future phase if ever considered.
- VideoRegistry clearing on social routes — considered and rejected (D-07 keeps registry for reconnect sync); revisit only if stale-state bugs appear.

</deferred>

---

*Phase: 2-DOM Detection & Scoping*
*Context gathered: 2026-08-15*