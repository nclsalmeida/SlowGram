# Phase 2: DOM Detection & Scoping - Research

**Researched:** 2026-08-15
**Domain:** DOM detection & scoping for Instagram web (React SPA) inside a WebView/WKWebView container
**Confidence:** HIGH (live-verified DOM dump + cross-checked community selector references + in-repo seam verification)

## Summary

Phase 2's job is deterministic surface classification (REELS/SOCIAL/UNKNOWN) and scoped degradation. This research **live-verified the actual Instagram DOM** this session: a headless Edge run against `https://www.instagram.com/reels/` (logged-out) produced an 864 KB DOM dump. It proves the core assumption of the phase — that a `/reels/` route renders a real feed with `<video>` elements and a stable `[role="main"]` anchor, with **no login wall** — and pins the exact selector anchors the phase will encode (roles, aria-labels, video attributes). Logged-in shapes (the `loop` attribute, the `role="dialog"` fullscreen reels viewer) cannot be verified without credentials; they are cross-checked against three independent community projects that run the same JS-in-injected-WebView approach and documented as CITED.

Three design tensions are resolved with evidence: (1) **observer root set** — D-11's "feed container only" must be a *root set* (`[role="main"]` plus any `[role="dialog"]` containing a video while pathname is `/reels/`) because the fullscreen viewer is a modal sibling, not a child of the feed anchor; (2) **pathname classification** — the locked D-05 prefix + keyword-guard rule produces UNKNOWN (never-degrade) for home `/`, profile-reels subpages `/{username}/reels/`, and individual `/reel/<id>/` pages, all verified safe by construction; (3) **harness growth** — the Phase 1 fakes (harness.js) are event-only shells; DETC-07 mocks require a real mini-DOM (FakeElement tree), a record-producing FakeMutationObserver, a FakeVideoElement, and a FakeLocation, all hand-rolled (the project bans external packages). Zero new runtime dependencies are needed; the dual-host Node + Edge headless test pattern from Phase 1 carries over unchanged (119/119 asserts verified green this session).

**Primary recommendation:** Implement Phase 2 as a pure pathname classifier (decision table from the D-05 guard) feeding the existing `SlowGram.setContext()` bus, a DomWatcher observing the two-root set with `attributeFilter ['src','loop','autoplay','role']` and rAF-batched `takeRecords()`, a WeakMap VideoRegistry with `loadstart`/`emptied` reset, and a SelectorRegistry health check (N=5 consecutive zero-hit scans → drift → `selectorHealth` event + `getSelectorHealth()` handle, fail-loud dev / fail-soft prod). All of it deterministically testable via extended harness fakes plus a fixture snapshot derived from the live-verified dump.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Phase Boundary (verbatim)
> The engine correctly classifies the current surface as REELS/SOCIAL/UNKNOWN and scopes all degradation to the Reels surface only — the trust contract that social routes never degrade is established before any lever exists. Delivers ContextDetector, RouteGuard, DomWatcher, VideoRegistry, the selector registry with health check, and the Instagram DOM mocks + demo.html that make detection deterministically testable. Phase 3 levers consume the context/scope verdicts produced here; the engine's existing setContext() bus and CONFIG already carry the seams Phase 1 built.

### Locked Decisions (verbatim from CONTEXT.md ## Implementation Decisions)

#### Reels Surface Scope
- **D-01:** REELS = the `/reels/` tab only. Home-feed video posts, profile reels, stories, and DM-shared reels are never REELS — they stay UNKNOWN or SOCIAL. Matches research Pitfall 1: "default: Reels surfaces only." — **Reversibility:** costly — widening later to home-feed is a product re-decision with new false-positive risk; narrowing is easy. User explicitly chose "Reels tab only" over the broader alternatives.
- **D-02:** Pathname is authoritative for REELS. Context = REELS only when `pathname` starts with `/reels/` (or `/reels/<id>`); DOM signals (video presence, role) refine detection but never upgrade a non-reels pathname. User chose "Pathname authoritative" over "pathname + video required" — the empty-reels-tab edge is acceptable.
- **D-03:** The fullscreen reels viewer dialog (`role="dialog"` opened by tapping a reel) counts as REELS while the pathname stays `/reels/` or `/reels/<id>`. Videos inside the dialog degrade too — the full reels consumption surface is preserved. User chose "Include dialog" (recommended).

#### Preserved Routes & RouteGuard
- **D-04:** Full preserve list: `/direct/`, `/messages/`, profiles (`/<username>/`), `/p/` posts, `/explore/` (search), `/accounts/`, and the stories tray. These never degrade. User chose "Full preserve list" over core-only.
- **D-05:** Pathname matching = prefix + keyword-guard. A route matches when `pathname === prefix` or starts with `prefix + '/'`. Profiles are matched by the guard rule: single-segment pathnames that do NOT start with a known keyword (`reels`, `direct`, `messages`, `p`, `explore`, `accounts`, `stories`) are treated as profiles and preserved — no curated username allowlist needed. User chose "Prefix + keyword-guard (Recommended)".
- **D-06:** RouteGuard re-asserts preservation on every SPA navigation signal: pushState/replaceState interception + popstate + hashchange, PLUS a pathname re-check on each rAF tick as a fallback for navigation types that bypass interception. User chose "Intercept + rAF fallback (Recommended)".
- **D-07:** On a route flip to a preserved (social) route, DomWatcher disconnects its observer (DETC-08) and the clock pauses via the existing `setContext(SOCIAL)`. The VideoRegistry is NOT cleared on disconnect — reconnecting re-syncs on return to `/reels/`. (Phase 3's `revertAll()` owns restoring videos to native; Phase 2 guarantees only context + observer disconnect + no accumulation.) User chose "Disconnect, keep registry (Recommended)".

#### Drift & Health-Check Stance
- **D-08:** Fail-loud in dev, fail-soft in prod. Dev/harness: log + expose a health signal when the Reels anchor is missing for N consecutive scans. Prod: if the `/reels/` anchor is missing but pathname says `/reels/`, degrade document-scoped `<video>` nodes only on that route (bounded fallback). Matches research Pitfall 7 guidance. User chose "Fail-loud dev, fail-soft prod (Recommended)".
- **D-09:** Health check runs per rAF batch (each mutation batch on `/reels/`); drift is declared at N=5 consecutive scans with zero video+anchor hits. Fast detection, low noise — a momentary empty reels tab won't trip it. No timer-based health check (Phase 1 banned timers). User chose "Per-batch, N=5 (Recommended)".
- **D-10:** SelectorRegistry surfaces health via a public handle `SlowGram.getSelectorHealth()` plus a `selectorHealth` bus event emitted on drift-declared and drift-recovered. Harness asserts against the handle; prod fallback logs once. User chose "Public handle + bus event (Recommended)" — keeps DETC-06 deterministically testable.

#### Observer Scope & Lifecycle
- **D-11:** DomWatcher observes ONLY the Reels feed container (role/attribute anchored, e.g. `[role="main"]` within `/reels/`), `childList` + `subtree`, with `attributeFilter` limited to `['src','loop','autoplay','role']`. No body-wide observation — matches Pitfall 6 (narrow observer) + DETC-04. User chose "Feed container only (Recommended)".
- **D-12:** Observer connects ONLY when context is REELS (pathname `/reels/` + feed container present); disconnects on SOCIAL/UNKNOWN (DETC-08); reconnects on return to `/reels/`. Saves CPU on social routes by construction. User chose "Connect-on-REELS only (Recommended)".
- **D-13:** ContextDetector refreshes from: (1) pathname events (route change), (2) role/attribute mutations on `/reels/` (video mount, role change), (3) the rAF batch after mutations. Video lifecycle events (`loadstart`/`emptied`) feed VideoRegistry per-video reset, NOT context classification. User chose "Pathname + mutations + batch (Recommended)".
- **D-14:** Self-mutation filtering = a `mutating` flag around all engine writes (style.filter, playbackRate, volume) PLUS exclusion of nodes inside the engine's own overlay host subtree. Matches research Pattern 4 / Anti-Pattern 4 (no feedback loops). User chose "Mutating flag + overlay-exclusion (Recommended)".

### the agent's Discretion (verbatim)
- VideoRegistry per-video state shape (beyond the WeakMap + `loadstart`/`emptied` lifecycle reset required by DETC-05) is left to planning — Phase 2 holds registration + lifecycle; Phase 3 adds applied-lever state.
- Selector registry exact contents (which roles/attributes are anchors vs helpers) beyond `video`, `[role="main"]`, and the preserved-route keywords is left to research/planning grounded in the research docs.
- Instagram DOM mock fixture depth (which route snapshots to encode in mocks) beyond the DETC-07 requirement is planner discretion.

### Deferred Ideas (OUT OF SCOPE — verbatim)
- Home-feed video posts as a future REELS surface — explicitly rejected for v1 (D-01); belongs in a future phase/backlog if product re-decides.
- Profile reels as a degraded surface — rejected (stays SOCIAL/preserved); future phase if ever considered.
- VideoRegistry clearing on social routes — considered and rejected (D-07 keeps registry for reconnect sync); revisit only if stale-state bugs appear.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description (verbatim from REQUIREMENTS.md) | Research Support |
|----|-------------|------------------|
| DETC-01 | ContextDetector classifica o contexto como REELS/SOCIAL/UNKNOWN, com pathname autoritativo para rotas preservadas e sinais role/atributo/`<video>` para Reels | Pure classifier over the D-05 guard; `[role="main"]` + `<video>` verified live on `/reels/`; pathname authoritative (D-02) |
| DETC-02 | RouteGuard preserva `/direct/`, `/messages`, perfis e busca — essas rotas nunca degradam; re-assert em cada mudança de rota | Preserve prefixes verified present in CONFIG seam (`preservedRoutes`); interception + rAF recheck per D-06; pushState/replaceState/popstate/hashchange + `location.pathname` all needed in the seam/fakes |
| DETC-03 | Contexto UNKNOWN nunca degrada (fail-safe por design) | Verified by construction: home `/`, `/reel/<id>/`, `/{username}/reels/` all classify UNKNOWN under the locked guard — never REELS, never degraded |
| DETC-04 | DomWatcher usa MutationObserver estreito com rAF-batch e filtro de self-mutation (evita loop de feedback do próprio motor) | Two-root observer set (feed container + dialog), `attributeFilter ['src','loop','autoplay','role']`, `takeRecords()` consumed in the rAF batch, `mutating` flag + overlay-host exclusion (D-14) |
| DETC-05 | VideoRegistry mantém estado por vídeo em WeakMap com reset de lifecycle em `loadstart`/`emptied` (feed virtualizado recicla nodes) | blob: `src` confirmed on live videos — virtualized feed swaps blob URLs per reel, so `loadstart`/`emptied` are the correct reset signals; WeakMap pattern from ARCHITECTURE.md §Pattern 2 |
| DETC-06 | Seletores por role/atributo centralizados em registry de seletores com health check contra drift — nunca classes CSS ofuscadas | All selectors verified stable: `[role="main"]` (1 hit, live), `video`, aria-labels; CSS classes confirmed obfuscated (`xvbhtw8…`, `x1lliihq…`) and documented as ~monthly drift by community; N=5 health check per D-09, handle+event per D-10 |
| DETC-07 | Mocks de DOM do Instagram (FakeMutationObserver, FakeVideoElement, fixtures de seletores) + `demo.html` para validação determinística | Harness must grow a FakeElement mini-DOM + record-producing FakeMutationObserver + FakeVideoElement + FakeLocation; fixture snapshot from the live-verified dump; demo.html does not exist yet (must be created) |
| DETC-08 | DomWatcher desconecta observers em rotas sociais para reduzir overhead | Connect-on-REELS-only lifecycle (D-12); disconnect on SOCIAL/UNKNOWN, registry kept (D-07); verified by harness tests asserting observer.observe/disconnect call counts |

</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Surface classification (REELS/SOCIAL/UNKNOWN) | Browser / Client | — | The engine runs entirely inside the WebView page; pathname + DOM are client-only inputs. No server involvement exists or is planned |
| Route interception (pushState/replaceState/popstate/hashchange) | Browser / Client | — | History API and location are page-globals injected via the DI seam; must be patched client-side |
| DOM observation (feed container, viewer dialog) | Browser / Client | — | MutationObserver is a client API, resolved through `env.MutationObserver` (src/slowgram.js:138) |
| Video lifecycle tracking | Browser / Client | — | Video events (`loadstart`/`emptied`) fire on page elements; registry is an in-memory WeakMap |
| Selector drift health check | Browser / Client | — | Scans the same page DOM the engine observes; no telemetry backend |
| Clock gating / accumulation | Browser / Client | — | Existing Phase 1 motor (`setContext` → `updateRunning` → `tick`); Phase 2 only feeds it |
| Deterministic test harness | Browser / Client (test host) | Node (test host) | Dual-host: same fake-tree tests run under Node and in harness.html; Edge headless smoke as the real-DOM gate |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (none — vanilla ES5 engine) | — | Phase 2 adds zero runtime dependencies; the engine stays a strict-mode IIFE exactly as Phase 1 locked | Project constraint bans external packages (STACK.md); the DI seam pattern is the "standard stack" of this repo |
| Node.js | 24.19.0 | Node test host for harness.js fakes | VERIFIED this session (`node --version`) — provides `require`, assert runner, exit-code gating |
| Microsoft Edge (headless) | current install | Browser host smoke + live-DOM fixture capture (`--headless --dump-dom`) | VERIFIED this session: `TOTAL: 119 passed / 119 run` from harness.html; same binary captured the live Instagram dump |
| harness.js fakes (in-repo) | — | FakeClock/FakeDocument/FakeWindow/FakeMutationObserver/FakeRAF + assert runner | VERIFIED in-repo (test/harness.js); must be extended with FakeElement mini-DOM, record-producing FakeMutationObserver, FakeVideoElement, FakeLocation |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| test/slowgram.test.js (extended) | — | Same-file dual-host tests: Node `require` + browser `<script>` | All DETC-01..08 assertions; pattern from Phase 1 (CORE-06) |
| test/harness.html | — | Browser host entry that loads harness.js + test file and calls renderResults | Full-suite browser run + Edge headless smoke |
| `demo.html` | — | DETC-07 deliverable: hand-built Instagram-mock DOM + live demo of detection | Must be CREATED this phase (verified absent from repo) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled FakeElement mini-DOM | jsdom | jsdom is an external package — banned by project constraint; hand-rolled ~300-line fake keeps the zero-dep, fully-deterministic dual-host pattern |
| Hand-rolled fakes + Edge headless | Playwright / Puppeteer | External packages banned; Edge `--headless --dump-dom` + CDP verified working with zero deps (this session) |
| Community selector lists hardcoded | SelectorRegistry + health check | Hardcoding drifts silently; registry + N=5 health + fixture refresh is the locked stance (D-08..D-10) |

**Installation:** `npm install` — **none.** No new packages. The phase is implemented with in-repo code and the existing Node + Edge toolchain.

**Version verification:** performed this session — `node --version` → v24.19.0, `npm --version` → 11.17.0, Edge headless run → `TOTAL: 119 passed / 119 run`.

## Package Legitimacy Audit

> **Required whenever this phase installs external packages.** This phase installs **zero** external packages — the project constraint (STACK.md) bans them, and the verification runbook uses only Node built-ins + the Edge CLI. Nothing to audit. No `[ASSUMED]` package names appear anywhere in this research.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | — | — | — | — | — | N/A — no packages installed this phase |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
                     ┌────────────────────────────────────────────────────┐
                     │              SlowGram engine (in-page)             │
                     └────────────────────────────────────────────────────┘

  SPA navigation signals                 DOM mutation signals
  ┌───────────────────────┐              ┌───────────────────────────────┐
  │ pushState/replaceState │              │ MutationObserver (2 roots):  │
  │   (history patch)      │              │  R1: [role="main"] feed      │
  │ popstate / hashchange  │              │  R2: [role="dialog"] w/ video│
  │ rAF pathname re-check  │              │  childList+subtree,          │
  └───────────┬───────────┘              │  attributeFilter             │
              │ location.pathname        │  ['src','loop','autoplay',    │
              ▼                          │   'role']                     │
  ┌───────────────────────┐              └──────────────┬────────────────┘
  │      RouteGuard       │                             │ takeRecords() per batch
  │  (prefix+guard match) │                             ▼
  └───────────┬───────────┘              ┌───────────────────────────────┐
              │ classified               │         DomWatcher            │
              ▼                          │  (rAF-batch processor,        │
  ┌───────────────────────┐              │   self-mutation filter)       │
  │    ContextDetector    │              └───────┬───────────────┬───────┘
  │ REELS/SOCIAL/UNKNOWN  │                      │ register()    │ health scan
  └───────────┬───────────┘                      ▼               ▼
              │ setContext() (existing bus)  ┌──────────────┐  ┌──────────────────┐
              ▼                              │ VideoRegistry│  │  SelectorRegistry│
  ┌───────────────────────┐                  │ WeakMap      │  │  N=5 zero-hit    │
  │ updateRunning → tick  │                  │ loadstart/   │  │  scans → drift   │
  │ (clock gate, Phase 1) │                  │ emptied reset│  │  selectorHealth  │
  └───────────────────────┘                  └──────────────┘  │  event + handle  │
                                                                └──────────────────┘
   Route flip to SOCIAL/UNKNOWN → D-07/D-12: observer.disconnect(), registry kept,
   clock paused via setContext(SOCIAL). Return to /reels/ → reconnect + re-sync.
```

**Reading the diagram:** pathname is the authoritative input (D-02); DOM signals refine within `/reels/` only (D-13); video lifecycle events feed the registry, never context (D-13); the health check runs per mutation batch (D-09).

### Recommended Project Structure
```
src/
├── slowgram.js            # engine — Phase 2 adds ContextDetector/RouteGuard/DomWatcher/
│                          #   VideoRegistry/SelectorRegistry inside the same IIFE +
│                          #   SlowGram.getSelectorHealth() handle (D-10)
test/
├── harness.js             # EXTEND: FakeElement mini-DOM, record-producing
│                          #   FakeMutationObserver, FakeVideoElement, FakeLocation
├── slowgram.test.js       # EXTEND: DETC-01..08 suites + fixture-driven detection tests
├── harness.html           # unchanged — loads harness.js + test file, renderResults
├── fixtures/              # NEW: instagram DOM fixture snapshots (from verified dump)
└── dom-mocks/             # NEW (planner discretion): fixture builder for the mock DOM
demo.html                  # NEW: DETC-07 deliverable — deterministic detection demo
```

### Pattern 1: Pure Pathname Classifier (RouteGuard + ContextDetector core)
**What:** A single pure function maps `location.pathname` → `REELS | SOCIAL | UNKNOWN` using the locked D-04/D-05 rules. Deterministic, unit-testable without DOM.
**When to use:** All classification paths — initial load, route events, rAF re-check (D-06), reconnect re-sync (D-07).
**Example:**
```javascript
// Source: derived from D-05 guard rule (02-CONTEXT.md:23) + D-04 preserve list (02-CONTEXT.md:22)
// CONFIG comes from the frozen registry; keywords locked: reels, direct, messages, p, explore, accounts, stories
function classifyPathname(pathname, CONFIG) {
  // 1. REELS — pathname authoritative (D-02): /reels/ or /reels/<id>
  if (pathname === CONFIG.selectors.reelsPrefix ||
      pathname.indexOf(CONFIG.selectors.reelsPrefix + '/') === 0) {
    return 'REELS';
  }
  // 2. Preserved prefixes (D-04): /direct/, /messages/, /p/, /explore/, /accounts/, /stories/
  for (var i = 0; i < CONFIG.preservedRoutes.length; i++) {
    var p = CONFIG.preservedRoutes[i];
    if (pathname === p || pathname.indexOf(p + '/') === 0) { return 'SOCIAL'; }
  }
  // 3. Profile guard (D-05): single-segment pathnames not starting with a known keyword
  var segs = pathname.split('/').filter(Boolean);          // ''-safe, ignores leading/trailing '/'
  if (segs.length === 1 && !startsWithKeyword(segs[0], CONFIG.routeKeywords)) {
    return 'SOCIAL';                                        // /<username>/
  }
  return 'UNKNOWN';                                         // fail-safe (DETC-03) — never degrades
}
```
**Verified consequences of this exact rule** (derived arithmetic, not live): `/` → UNKNOWN; `/reel/<id>/` (2 segments, first `reel` not a keyword) → UNKNOWN; `/{username}/reels/` (2 segments) → UNKNOWN; `/{username}/` → SOCIAL. Every non-REELS result is never-degrade. [VERIFIED: C:\Users\Usuario\Downloads\SlowGram\.planning\phases\02-dom-detection-scoping\02-CONTEXT.md:22-23]

### Pattern 2: Two-Root Observer Set (DomWatcher)
**What:** D-11's "feed container only" is implemented as a *root set*: observe `[role="main"]` AND any `[role="dialog"]` containing a `<video>` while pathname is `/reels/`. The fullscreen reels viewer is a modal sibling of the feed, so videos inside it would be missed by a single feed root — violating D-03.
**When to use:** Always on REELS (D-12 connect-on-REELS). One `MutationObserver` instance; `observe()` called per root; `disconnect()` on SOCIAL/UNKNOWN.
**Example:**
```javascript
// Source: D-11 (02-CONTEXT.md:33) + D-03 (02-CONTEXT.md:19) + live evidence that the
// viewer is a modal overlay (role="dialog" count 0 on static dump — needs interaction)
function connectWatcher() {
  var roots = [];
  var main = env.document.querySelector(CONFIG.selectors.roleMain);      // feed container
  if (main) { roots.push(main); }
  var dialog = findDialogWithVideo();                                     // R2: viewer dialog
  if (dialog) { roots.push(dialog); }
  observer = new env.MutationObserver(batchCallback);
  for (var i = 0; i < roots.length; i++) {
    observer.observe(roots[i], {
      childList: true, subtree: true,
      attributeFilter: ['src', 'loop', 'autoplay', 'role']               // D-11
    });
  }
}
```
**Pitfall 6 compliance** (PITFALLS.md): no body-wide observation, no `querySelectorAll` inside the mutation callback — records are drained via `takeRecords()` in the rAF batch and processed there.

### Pattern 3: VideoRegistry — WeakMap + Lifecycle Reset (DETC-05)
**What:** Per-video state in a `WeakMap` keyed by the element. `loadstart` and `emptied` listeners reset the per-video state — the virtualized feed recycles `<video>` nodes and swaps blob URLs, so stale state must never survive a node reuse.
**When to use:** Every video registered by DomWatcher from either root.
**Example:**
```javascript
// Source: ARCHITECTURE.md §Pattern 2 (WeakMap VideoRegistry with loadstart/emptied reset)
var videoState = new WeakMap();
function register(video) {
  if (videoState.has(video)) { return; }
  var s = { src: video.src, resetCount: 0 };
  videoState.set(video, s);
  video.addEventListener('loadstart', onReset);   // new media → reset per-video state
  video.addEventListener('emptied', onReset);     // node recycled by feed virtualization
}
```
Live-verified basis: every video in the dump carries `src="blob:https://www.instagram.com/<uuid>"` — the src is a MediaSource blob that changes per reel, which is exactly what fires `loadstart`/`emptied`. [VERIFIED: C:\Users\Usuario\AppData\Local\Temp\eco-ig-dump.html:58]

### Pattern 4: Self-Mutation Filtering (D-14)
**What:** Engine writes (style.filter, playbackRate, volume — Phase 3 levers) set a `mutating` flag; mutation batches taken while `mutating` is true are skipped. Additionally, nodes inside the engine's own overlay host subtree are excluded from registration. Prevents the engine's own writes from triggering re-registration feedback loops (PITFALLS.md Anti-Pattern 4).
**When to use:** Every DomWatcher batch and every lever write.
**Example:**
```javascript
// Source: D-14 (02-CONTEXT.md:36) + ARCHITECTURE.md §Pattern 4
function batchCallback() {
  var records = observer.takeRecords();
  if (mutating) { return; }                       // engine-origin writes — skip
  pendingRecords.push.apply(pendingRecords, records);
  env.requestAnimationFrame(processBatch);        // one batch per rAF (D-09)
}
```

### Pattern 5: FakeElement Mini-DOM (DETC-07 harness)
**What:** A ~300-line hand-rolled element tree so the engine's real selectors run deterministically in BOTH hosts. The Phase 1 `FakeDocument` is an event-only shell (harness.js:26-51) with no `querySelector` — DETC-07 requires real querying.
**When to use:** All detection tests; the fixture builder composes Instagram-shaped trees from the verified dump.
**Example:**
```javascript
// Source: required API surface extracted from Phase 2 selectors + DETC-07;
// matches()/querySelectorAll support 'video', '[role="main"]', '[role="dialog"]' only
function FakeElement(tagName, attrs, children) {
  var el = {
    tagName: tagName, nodeType: 1,
    children: children || [], parentNode: null,
    style: {}, listeners: {},
    getAttribute: function (n) { return attrs[n] !== undefined ? attrs[n] : null; },
    hasAttribute: function (n) { return attrs[n] !== undefined; },
    setAttribute: function (n, v) { attrs[n] = String(v); },
    addEventListener: function (t, cb) { (el.listeners[t] = el.listeners[t] || []).push(cb); },
    dispatchEvent: function (ev) { (el.listeners[ev.type] || []).forEach(function (cb) { cb(ev); }); },
    closest: function () { return null; },       // overlay-exclusion helper (D-14)
    contains: function (other) { return el === other || (el.children || []).some(function (c) { return c.contains(other); }); }
  };
  (children || []).forEach(function (c) { c.parentNode = el; });
  return el;
}
```
The fixture builder then assembles `role="main"` → video children per the verified line-58 shape, and a `role="dialog"` root for D-03 tests.

### Anti-Patterns to Avoid
- **Body-wide observation:** `observer.observe(document.body, {subtree:true})` re-scans the whole app and fires on every React re-render — CPU blowup on a passive-consumption surface (Pitfall 6). Observe only the two roots.
- **`querySelectorAll` inside the mutation callback:** synchronous DOM queries per mutation → jank. Drain `takeRecords()` once per rAF batch (D-09).
- **Selecting on CSS classes:** classes are auto-generated and drift ~monthly (`xvbhtw8…`, `x1lliihq…` confirmed in the live dump). Role/attribute/aria only (DETC-06).
- **Registry cleared on social routes:** D-07 locks keep-registry; clearing breaks reconnect re-sync and leaks Phase 3 `revertAll()` responsibility into Phase 2.
- **Classification that requires video presence:** upgrades a non-reels pathname on DOM signals — violates D-02 (pathname authoritative). The empty-reels-tab edge is accepted.
- **Timer-based health check:** Phase 1 banned timers; the health check is per-rAF-batch (D-09).
- **Dialog videos missed by a feed-only root:** the viewer is a modal sibling — include the dialog root (Pattern 2), or D-03 silently fails.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DOM change detection | Polling / interval scans | Native `MutationObserver` via the `env.MutationObserver` seam (src/slowgram.js:138) | Observer is delivered by the platform; polling burns CPU and misses attribute-only changes; seam keeps it fakeable |
| Per-video state tracking | Arrays / id maps | `WeakMap` keyed on the element | GC-safe, no leaks when the virtualized feed drops nodes (DETC-05); the array equivalent leaks |
| CSS selector matching | A hand-written matcher | The host page's native `querySelector`/`querySelectorAll` | The engine must never reimplement selector matching; fakes only need to support the 3 registered selectors |
| URL classification | Regex over full URL | `location.pathname` prefix + keyword-guard (Pattern 1) | Pathname is the stable, authoritative input (D-02); regex invites cross-route false positives (Pitfall 1) |
| Selector drift detection | Hardcoded selector constants + hope | SelectorRegistry + N=5 health check + `selectorHealth` event (D-08..D-10) | Community-documented ~monthly markup drift; the health signal makes drift loud before it breaks trust |
| SPA navigation tracking | Polling `location.href` | History API interception + popstate/hashchange + rAF re-check (D-06) | Interception covers SPA pushes; the rAF re-check covers bypass cases — both are cheap and deterministic |

**Key insight:** the WebView already provides every DOM primitive this phase needs (querying, observation, events, history). The engine's only job is *scoping and gating* — deciding when and where to act — so hand-rolling platform mechanics buys complexity and divergence risk with zero payoff.

## Runtime State Inventory

> Rename/refactor/migration phases only. Phase 2 is greenfield engine work on an existing seam — no rename of any identifier, route, or stored key. **Not applicable — omitted.**

## Common Pitfalls

### Pitfall 1: Scope leakage — reels outside the `/reels/` tab
**What goes wrong:** The engine degrades home-feed video posts, profile reels, or DM surfaces, breaking the trust contract (D-01, PITFALLS.md Pitfall 1).
**Why it happens:** DOM-only detection finds `<video>` elements everywhere; without pathname authority every video looks like reels.
**How to avoid:** Pathname is authoritative (D-02); the classifier returns REELS only for `/reels/` prefixes; DOM signals refine, never upgrade.
**Warning signs:** A test asserting degradation while `location.pathname` is `/` or `/{username}/` passes.

### Pitfall 2: Observer over-breadth
**What goes wrong:** CPU spikes and feedback loops when observing body-wide on a React SPA (Pitfall 6).
**Why it happens:** `{subtree:true}` on `document.body` fires on every app re-render, not just reels changes.
**How to avoid:** Two-root observation (Pattern 2), `attributeFilter` limited to `['src','loop','autoplay','role']`, disconnect on SOCIAL/UNKNOWN (D-12).
**Warning signs:** Mutation callback counts spike on social routes; harness shows `observe()` called with non-root targets.

### Pitfall 3: Selector drift + React wipe
**What goes wrong:** `[role="main"]` or aria-labels change and detection silently stops (Pitfall 7).
**Why it happens:** Instagram regenerates markup; classes rotate ~monthly (community-documented; obfuscated classes verified live).
**How to avoid:** SelectorRegistry + per-batch health scan, drift at N=5 zero-hit scans, fail-loud dev / fail-soft prod (D-08..D-10); fixture-refresh runbook (HARN-04).
**Warning signs:** `getSelectorHealth()` reports `drift`; harness fixture updates lag the live dump.

### Pitfall 4: Feedback loop from engine's own writes
**What goes wrong:** Phase 3 levers mutate `style`/attributes; the observer re-registers the same videos forever (Anti-Pattern 4).
**Why it happens:** Observer sees the engine's own mutations as page activity.
**How to avoid:** `mutating` flag around engine writes + overlay-host subtree exclusion (D-14, Pattern 4).
**Warning signs:** `register()` called repeatedly for the same element in one batch.

### Pitfall 5: Stale VideoRegistry state on node recycling
**What goes wrong:** A recycled `<video>` keeps Phase 3 lever state from the previous reel (DETC-05).
**Why it happens:** The virtualized feed reuses nodes; blob `src` swaps without a fresh element.
**How to avoid:** `loadstart`/`emptied` listeners reset per-video state (Pattern 3).
**Warning signs:** A registry entry's `src` no longer matches the element's `src`.

### Pitfall 6: Fake-vs-live divergence (CORE-04)
**What goes wrong:** Tests pass on fakes that don't mirror the real DOM; production detection breaks (CORE-04 — the forbidden failure).
**Why it happens:** The logged-out dump shows NO `loop`/`autoplay`/`muted` attributes, while logged-in videos carry `loop` (community-documented). Fixtures built only from the logged-out shape diverge from production.
**How to avoid:** Encode BOTH fixture shapes; tag each fixture with its source (live dump vs community); the Edge headless smoke re-validates against real DOM.
**Warning signs:** `attributeFilter` contains `loop` but the fake never emits a `loop` attribute mutation.

### Pitfall 7: Missed navigation types
**What goes wrong:** A navigation bypassing pushState interception leaves the engine misclassified (D-06 rationale).
**Why it happens:** SPA links, back/forward gestures, and some WebView navigations don't fire popstate reliably.
**How to avoid:** Intercept `history.pushState`/`replaceState` + `popstate` + `hashchange`, PLUS the rAF pathname re-check fallback.
**Warning signs:** A route flip test that only exercises one signal type passes while others fail.

## Code Examples

### Common Operation 1: RouteGuard wiring (interception + fallback)
```javascript
// Source: D-06 (02-CONTEXT.md:24) — interception + rAF re-check fallback
function bindRouteGuard() {
  var w = env.window, h = w && w.history;
  if (h && h.pushState) {
    var origPush = h.pushState.bind(h);
    h.pushState = function () { origPush.apply(h, arguments); onRouteSignal(); };
    var origReplace = h.replaceState.bind(h);
    h.replaceState = function () { origReplace.apply(h, arguments); onRouteSignal(); };
  }
  if (w) {
    w.addEventListener('popstate', onRouteSignal);
    w.addEventListener('hashchange', onRouteSignal);
  }
  // rAF re-check fallback — piggybacks the DomWatcher batch (D-06, no timers)
  // each rAF batch re-reads env.window.location.pathname; if changed, re-classify.
}
```
Note: the pathname source must come from the seam — `env.window.location.pathname` — so the FakeLocation can drive it deterministically.

### Common Operation 2: Health check per batch (D-09/D-10)
```javascript
// Source: D-08..D-10 (02-CONTEXT.md:28-30) — N=5 zero-hit scans → drift
function healthScan() {
  var anchor = env.document.querySelector(CONFIG.selectors.roleMain);   // [role="main"]
  var videos = env.document.querySelectorAll(CONFIG.selectors.video);   // bounded fallback count
  var hit = (anchor !== null) || (videos.length > 0);
  if (hit) { health.missStreak = 0; if (health.drifted) { recover(); } return; }
  health.missStreak++;
  if (health.missStreak >= CONFIG.health.driftThreshold) {              // N=5
    health.drifted = true;
    emit('selectorHealth', { status: 'drift', pathname: currentPathname() });
    if (dev) { console.warn('SlowGram: selector drift — feed anchor missing for 5 scans'); }
    // prod fallback (D-08): degrade document-scoped <video> only while pathname is /reels/
  }
}
```

### Common Operation 3: Fail-soft prod fallback (D-08)
```javascript
// Source: D-08 (02-CONTEXT.md:28) — bounded: document-scoped <video> only on /reels/
function fallbackScope() {
  // Only when pathname says /reels/ but the anchor is missing (drift): degrade ALL
  // page <video> nodes via document.querySelectorAll — the bounded, never-body-observe
  // alternative that keeps the trust contract while drift is investigated.
  return (currentPathname() === CONFIG.selectors.reelsPrefix ||
          currentPathname().indexOf(CONFIG.selectors.reelsPrefix + '/') === 0)
    ? env.document.querySelectorAll(CONFIG.selectors.video)
    : [];
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Class-based selectors (`tWeCl`, `Nm9Fw`, `x1lliihq…`) | Role/attribute/aria selectors (`[role="main"]`, `video`, aria-labels) | ~2021→present; classes confirmed obfuscated in the 2026-08-15 live dump | Class selectors are the #1 drift source; role/aria are the stable contract (meta-skills: "aria-label and role are stable selectors") |
| `src="…mp4"` direct URLs | `src="blob:https://www.instagram.com/<uuid>"` (MediaSource) | pre-2021 era (SO 2020 shows mp4) → present | The blob URL swap per reel is the loadstart/emptied reset signal (DETC-05); `src` must stay in attributeFilter |
| Feed-only video detection | Feed container + viewer dialog root set | This phase | D-03 requires dialog videos to degrade; a feed-only root misses the modal viewer |
| Timer-based health polling | Per-rAF-batch health scans, N=5 | This phase (D-09) | No timers (Phase 1 ban); drift detected in one frame-batch latency |

**Deprecated/outdated:**
- **Class-based Instagram selectors:** any `class="x…"` value — auto-generated, ~monthly drift (CITED: meta-skills automation-flows/instagram.md; verified obfuscated live 2026-08-15). Never use.
- **`document.getElementsByClassName('Nm9Fw')`-style post detection (SO 2020):** pre-blob era, class-dependent — superseded by role/aria anchors.

## Assumptions Log

> All `[ASSUMED]`-level claims requiring user confirmation before they become locked decisions.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Logged-in reels videos carry a `loop` attribute (and player-driven autoplay/muted state) [CITED: kbrianps/instagram-video-controls — the extension strips `loop`, so it must be present] | Code Examples / Pitfall 6 | If `loop` is not an attribute, `attributeFilter ['src','loop','autoplay','role']` just never fires for it — harmless; if the attribute set is wider, the filter may miss a needed signal. Mitigation: keep the filter list from D-11 as locked, fixture-refresh validates |
| A2 | The fullscreen reels viewer is a `role="dialog"` modal [CITED: webscraper thread + IG modal pattern; NOT live-verifiable logged-out; CDP click probe timed out this session] | Pattern 2 / Pitfall 3 | If the viewer isn't `[role="dialog"]`, the R2 root misses it and D-03 silently fails. Mitigation: health scan counts dialog; fixture-refresh runbook; dialog root is an anchor, pathname still authoritative |
| A3 | The viewer dialog is a sibling overlay OUTSIDE `[role="main"]` [ASSUMED from desktop-modal convention] | Pattern 2 | If it's inside main, R1 already covers it — the R2 root is a harmless no-op. Low risk |
| A4 | `/{username}/reels/` (profile reels subpages) classify UNKNOWN under the locked D-05 guard — NOT SOCIAL, because the profile rule only matches single-segment pathnames [derived arithmetic, [VERIFIED: 02-CONTEXT.md:23 rule text] | Pattern 1 | UNKNOWN never degrades (safe), but Phase 4's overlay-hiding on social routes must treat UNKNOWN like SOCIAL or the overlay shows on profile-reels pages. Planner must carry this into Phase 4 planning |
| A5 | Home `/` classifies UNKNOWN (no preserve prefix, no keyword, multi-segment empty) — never degrades | Pattern 1 | Safe by construction; no action needed |
| A6 | Individual `/reel/<shortcode>/` pages classify UNKNOWN (2 segments; `reel` is not in the locked keyword list) — whether they SHOULD degrade is outside D-01's locked scope | Pattern 1 | Safe (no degradation); a product decision if the user wants `/reel/<id>/` to degrade — needs user confirmation, out of scope |
| A7 | `a[href="/reels/"]` nav anchor exists on logged-in desktop [CITED: InstaReelBlocker (WKWebView precedent)]; absent from the logged-out dump (VERIFIED absent there) | Sources | Not load-bearing — pathname is authoritative; the anchor is only a helper for fixtures/health |
| A8 | Stories tray needs no DOM handling — on home/explore the pathname is non-reels, so no registration occurs by construction | Pattern 1 | Safe; no action needed |
| A9 | blob: src URL pattern persists in logged-in sessions (VERIFIED logged-out) | Pattern 3 | If src were a stable URL, loadstart/emptied still fire on media change — behavior identical |

## Open Questions (RESOLVED)

All four open questions are resolved for planning: each carries a Recommendation below, and every recommendation is adopted by the Phase 2 plans. Unresolved items are explicitly deferred and tracked (fixture-refresh runbook HARN-04; user-confirmation flags).

1. **Mobile-web vs desktop-web DOM shape (WKWebView UA)** — (RESOLVED: defer to HARN-04 fixture refresh)
   - What we know: the live dump used the desktop UA via headless Edge; the container ships a mobile UA. `[role="main"]` and `<video>` were verified on the desktop surface.
   - What's unclear: whether the mobile-web surface keeps `[role="main"]` / the same aria-labels.
   - Recommendation: add a mobile-UA fixture-refresh step to the HARN-04 runbook; low risk because pathname is authoritative (D-02) and the fail-soft fallback (D-08) covers anchor loss.

2. **`/create/` (compose) route** — (RESOLVED: leave UNKNOWN, safe; flag for user confirmation, do not silently widen)
   - What we know: not in the locked preserve list (D-04); classifies UNKNOWN → safe, never degrades.
   - What's unclear: whether mid-compose should be classified SOCIAL (so Phase 4 hides the overlay there).
   - Recommendation: leave UNKNOWN (safe); if the user wants overlay-hiding on compose, they must extend the locked preserve list — flag for user confirmation, do not silently widen.

3. **Should individual `/reel/<id>/` pages degrade as REELS?** — (RESOLVED: keep UNKNOWN, out of locked scope)
   - What we know: they are a 2-segment path, `reel` is not in the locked keywords → UNKNOWN (safe).
   - What's unclear: product intent — D-01 locked REELS = `/reels/` tab only, so this is explicitly out of scope.
   - Recommendation: keep UNKNOWN; note as a future product decision (same bucket as home-feed reels, deferred).

4. **Fullscreen viewer dialog verification gap** — (RESOLVED: ship R2 root + health check so failure is loud, not silent)
   - What we know: A2 is CITED-not-verified (logged-out dump has zero `role="dialog"`; CDP click probe timed out).
   - What's unclear: the exact dialog markup in a logged-in session.
   - Recommendation: the fixture-refresh runbook (HARN-04) with a logged-in session is the only way to close this; Phase 2 ships the R2 root + health check so failure is loud, not silent.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Node test host (harness fakes, exit-code gate) | ✓ | 24.19.0 (VERIFIED this session) | — |
| npm | Not needed (zero packages) | ✓ | 11.17.0 (VERIFIED) | — |
| Microsoft Edge | Browser host smoke + live-DOM capture (`--headless --dump-dom`) | ✓ | current install, headless VERIFIED (`TOTAL: 119 passed / 119 run`) | — |
| Internet access to instagram.com | Live fixture capture (HARN-04) | ✓ | live dump fetched 2026-08-15 | Committed fixtures + `demo.html` keep tests hermetic |
| Instagram login credentials | Verifying logged-in DOM shape (loop attr, dialog) | ✗ | — | Community references (CITED) + fixture shapes; logged-in verification deferred to fixture-refresh |

**Missing dependencies with no fallback:**
- None — the phase is fully implementable with the verified toolchain + committed fixtures.

**Missing dependencies with fallback:**
- **Instagram login credentials:** logged-in DOM shapes (A1/A2) rest on CITED community evidence until a logged-in fixture-refresh run happens. The health check + fail-loud dev stance (D-08) make any drift observable rather than silent.

## Validation Architecture

> `workflow.nyquist_validation: true` — section required. [VERIFIED: .planning/config.json:24]

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Custom in-repo assert runner (test/harness.js) — no external framework; dual host (Node `require` + browser `<script>`) |
| Config file | none — see Wave 0 |
| Quick run command | `node test/slowgram.test.js` |
| Full suite command | `node test/slowgram.test.js` + open `test/harness.html` in Edge + headless smoke: `& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless --disable-gpu --dump-dom "file:///…/test/harness.html"` (expect `TOTAL: 119 passed / 119 run`, rising as Phase 2 suites land) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DETC-01 | classifyPathname: REELS/SOCIAL/UNKNOWN across all route shapes | unit | `node test/slowgram.test.js` | ❌ Wave 0 (extend slowgram.test.js) |
| DETC-02 | RouteGuard preserves /direct/, /messages, profiles, /p/, /explore/, /accounts/; re-assert on pushState/popstate/hashchange | unit | same | ❌ Wave 0 |
| DETC-03 | UNKNOWN never degrades — clock stays paused, no registration | unit | same | ❌ Wave 0 |
| DETC-04 | Observer narrow roots + attributeFilter; mutating-flag skips engine-origin batches | unit | same | ❌ Wave 0 |
| DETC-05 | VideoRegistry WeakMap; loadstart/emptied reset | unit | same | ❌ Wave 0 |
| DETC-06 | SelectorRegistry health: N=5 drift → selectorHealth event + getSelectorHealth() | unit | same | ❌ Wave 0 |
| DETC-07 | Mocks + fixtures + demo.html render detection deterministically | integration (fixture-driven) | same + Edge smoke | ❌ Wave 0 (harness.js:78 FakeMutationObserver is a stub) |
| DETC-08 | observer.disconnect() on SOCIAL/UNKNOWN; registry retained; reconnect re-syncs | unit | same | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `node test/slowgram.test.js`
- **Per wave merge:** full suite (Node + browser host + Edge headless smoke)
- **Phase gate:** full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/harness.js` — FakeElement mini-DOM (Pattern 5), record-producing FakeMutationObserver (observe/disconnect/takeRecords + record queue), FakeVideoElement (loadstart/emptied dispatch), FakeLocation (`pathname`, `history.pushState`/`replaceState`, popstate/hashchange dispatch) — current fakes are event-only shells (harness.js:26-95)
- [ ] `test/fixtures/` — Instagram DOM fixture builder derived from the verified live dump (line-58 shape) + logged-in shape per A1/A2
- [ ] `test/slowgram.test.js` — DETC-01..08 suites (8 new groups)
- [ ] `demo.html` — DETC-07 deliverable, does not exist yet

## Security Domain

> `workflow.security_enforcement: true`, `security_asvs_level: 1`, `security_block_on: high`. [VERIFIED: .planning/config.json:47-49]

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — (no auth surface; engine runs in an authenticated WebView it never touches) |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | **yes** | DOM elements + `location.pathname` are treated as untrusted input; validated exclusively via string comparison (prefix + keyword guard), selectors come from the deep-frozen CONFIG registry, and nothing is ever `eval`'d or interpolated into executable code |
| V6 Cryptography | no | — |
| V7 XSS | no | — (engine never injects markup except its own overlay host, which uses `textContent`-style safe construction — Phase 4; Phase 2 does not write DOM) |

### Known Threat Patterns for the Phase 2 stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Mutation flood / observer feedback loop (engine writes re-trigger observation) | DoS | rAF-batched `takeRecords()` + `mutating` flag + overlay-host exclusion (D-14, Pattern 4) — bounded work per frame, engine-origin batches skipped |
| Selector drift causing silent scope misclassification (trust contract break) | Tampering | SelectorRegistry health check, N=5 zero-hit → drift event (D-09/D-10); fail-loud dev / fail-soft prod bounded fallback (D-08) |
| Untrusted DOM values reaching logic | Tampering | All DOM-derived data (attributes, aria-labels, pathname) flows through string comparison only; no value is executed, concatenated into code, or used as an object key (frozen CONFIG keys only) |
| History API hijack breaking classification | Tampering | pushState/replaceState patched + popstate/hashchange + rAF re-check (D-06); pathname authoritative — a missed interception is caught within one rAF batch |

**Phase 2 writes no DOM and stores no secrets** — the threat surface is limited to input validation (V5) and the observer DoS pattern above; both have locked mitigations. Phase 3/4 levers (style writes, overlay host) add surface and will carry their own ASVS review.

## Sources

### Primary (HIGH confidence — verified this session)
- Live Instagram DOM dump `https://www.instagram.com/reels/` (logged-out, headless Edge), captured 2026-08-15 — [VERIFIED: C:\Users\Usuario\AppData\Local\Temp\eco-ig-dump.html:58] — `role="main"` (1 hit), 4× `<video class="x1lliihq x5yr21d xh8yej3" playsinline="" preload="none" src="blob:https://www.instagram.com/<uuid>" style="object-fit: cover; display: block;">`, role inventory `role="button" role="group" role="img" role="link" role="main" role="presentation" role="slider"` (zero `role="dialog"`), aria-labels `"Video player" "Press to play" "Play button icon" "Adjust volume" "Audio is muted" "Comment" "Like" "Share" "More" "{username} reels"`, zero `>Log in<` visible text, zero `/direct/` `/messages/` `/stories/` content
- Edge headless harness smoke run, 2026-08-15 — `TOTAL: 119 passed / 119 run` [VERIFIED]
- Node v24.19.0 / npm 11.17.0 version probes [VERIFIED]
- In-repo: src/slowgram.js (CONFIG seam, setContext bus, resolveEnv), test/harness.js (fakes + assert runner), 02-CONTEXT.md (locked decisions), REQUIREMENTS.md (DETC texts), config.json (workflow flags) [VERIFIED with line ranges]

### Secondary (MEDIUM confidence — CITED)
- meta-skills automation-flows/instagram.md — `main[role="main"]` feed anchor; "Verified selectors as of 2026-05-19; expect ~monthly drift"; CSS classes auto-generated; role/aria stable
- kbrianps/instagram-video-controls (GitHub) — videos carry `loop` (stripped); per-video attribute observer for React re-renders; Explore grid = static images (no video); Explore-opened posts are `<video>`; rAF-throttled processing
- InstaReelBlocker (GitHub, iOS WKWebView) — `a[href="/reels/"]` nav anchor; JS-in-injected-WebView precedent for the exact container domain; "Instagram can and does change its frontend markup without notice"
- nileane gist (Force HTML video controls) — `video.nextElementSibling` is the overlay DIV; `document.querySelectorAll('video')` + MutationObserver pattern
- webscraper forum thread — Instagram popups use `div[role='dialog']` (nested dialog structure for scrollable overlays)
- Mozilla Bugzilla 2035663 — Instagram overlays its own player over `HTMLVideoElement`s (custom player shells)

### Tertiary (LOW confidence — ASSUMED, listed in Assumptions Log)
- Logged-in attribute shapes (A1/A2), dialog-as-sibling (A3) — community-derived, not live-verified

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero packages, dual-host Node+Edge pattern verified green this session
- Architecture: HIGH — live DOM dump pins anchors; locked decisions fully quoted; the two remaining CITED claims (loop attr, dialog) are non-load-bearing (pathname authoritative)
- Pitfalls: HIGH — each maps to a verified fact (obfuscated classes, blob src, modal overlay, drift) + a locked mitigation

**Research date:** 2026-08-15
**Valid until:** 2026-09-14 (30 days for engine design; selector claims drift faster — the HARN-04 fixture-refresh runbook re-validates against a fresh live dump before each phase that touches selectors)