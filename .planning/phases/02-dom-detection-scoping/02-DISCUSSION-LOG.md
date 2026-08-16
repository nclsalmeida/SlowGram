# Phase 2: DOM Detection & Scoping - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-15
**Phase:** 2-DOM Detection & Scoping
**Areas discussed:** Reels surface scope, Preserved routes list, Drift & health-check stance, Observer scope & lifecycle

---

## Reels Surface Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Reels tab only | REELS only on /reels/ tab + fullscreen reels viewer. Home feed stays UNKNOWN. Safest, minimal false-positive risk. | ✓ |
| Reels tab + home feed | REELS on /reels/ AND home feed video posts in role=main. More coverage, needs careful per-video scoping. | |
| Any video in feed container | REELS whenever a video in a scoped feed container plays, regardless of pathname. Broadest, main scope-leakage risk. | |

**User's choice:** Reels tab only
**Notes:** Product degrades ONLY the /reels/ passive-consumption surface. Home feed stays native.

| Option | Description | Selected |
|--------|-------------|----------|
| Pathname authoritative | REELS only when pathname starts with /reels/; DOM signals refine but never upgrade. | ✓ |
| Pathname + video required | REELS requires both pathname AND a video present. Avoids empty-tab counting but lags after navigation. | |

**User's choice:** Pathname authoritative
**Notes:** Empty reels tab edge accepted.

| Option | Description | Selected |
|--------|-------------|----------|
| Include dialog | Reels viewer dialog (role=dialog) counts as REELS while pathname stays /reels/. | ✓ |
| Exclude dialog | Only feed pathname counts; role=dialog is UNKNOWN. Simpler but fullscreen consumers escape degradation. | |

**User's choice:** Include dialog (Recommended)
**Notes:** Full reels consumption surface preserved.

---

## Preserved Routes List

| Option | Description | Selected |
|--------|-------------|----------|
| Full preserve list | /direct/, /messages/, profiles, /p/ posts, /explore/, /accounts/, stories tray. Broadest social safety. | ✓ |
| Core social list | Only /direct/ and /messages/ + profiles and search; /p/ and stories default UNKNOWN. | |

**User's choice:** Full preserve list
**Notes:** All social surfaces locked as never-degrade.

| Option | Description | Selected |
|--------|-------------|----------|
| Prefix + keyword-guard | Match on prefix or prefix+'/'; profiles matched by single-segment paths not starting with known keyword. | ✓ |
| Explicit prefix list only | Exact/prefix matches from explicit list; profiles need curated allowlist (brittle). | |

**User's choice:** Prefix + keyword-guard (Recommended)
**Notes:** Keywords: reels, direct, messages, p, explore, accounts, stories.

| Option | Description | Selected |
|--------|-------------|----------|
| Intercept + rAF fallback | pushState/replaceState/popstate/hashchange interception + pathname check on each rAF tick. | ✓ |
| Interception only | Only pushState/replaceState/popstate. Lighter but misses navigation types that bypass interception. | |

**User's choice:** Intercept + rAF fallback (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Disconnect, keep registry | Disconnect observers on social (DETC-08), keep VideoRegistry for reconnect sync, clock pauses via setContext(SOCIAL). | ✓ |
| Disconnect + clear registry | Also clear VideoRegistry on social; rebuild on return. More memory, no stale state. | |

**User's choice:** Disconnect, keep registry (Recommended)
**Notes:** Phase 3's revertAll owns restoring videos to native.

---

## Drift & Health-Check Stance

| Option | Description | Selected |
|--------|-------------|----------|
| Fail-loud dev, fail-soft prod | Dev: log + health signal. Prod: degrade document-scoped video on reels route when anchor missing (bounded). | ✓ |
| Halt degradation on drift | Anchor missing N scans → halt ALL degradation until anchor returns (UNKNOWN). | |
| Always fail soft | Never block degradation; always degrade document-scoped video on reels routes. | |

**User's choice:** Fail-loud dev, fail-soft prod (Recommended)
**Notes:** Matches research Pitfall 7.

| Option | Description | Selected |
|--------|-------------|----------|
| Per-batch, N=5 | Health check per rAF batch, N=5 consecutive zero-video+anchor scans = drift. | ✓ |
| Throttled time-based, N=3 | Health check every 5s of REELS time, N=3. Reintroduces a timer (banned in Phase 1). | |

**User's choice:** Per-batch, N=5 (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Public handle + bus event | SlowGram.getSelectorHealth() + 'selectorHealth' bus event on drift-declared/recovered. | ✓ |
| Console logs only | Health status via console logs only. Untestable for harness assertions. | |

**User's choice:** Public handle + bus event (Recommended)

---

## Observer Scope & Lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Feed container only | Observe only the Reels feed container (role/attribute anchored), childList+subtree, attributeFilter limited. | ✓ |
| Body-wide | Observe document.body childList+subtree, rAF-batched. Violates narrow-observer perf requirement. | |

**User's choice:** Feed container only (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Connect-on-REELS only | Observer connects only on REELS (pathname + container), disconnects on SOCIAL/UNKNOWN (DETC-08). | ✓ |
| Always connected, gate in callback | Always connected, callback short-circuits when not REELS. Wastes records on social routes. | |

**User's choice:** Connect-on-REELS only (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Pathname + mutations + batch | Refresh from pathname events, role/attribute mutations, rAF batch after mutations. Lifecycle events feed VideoRegistry, not context. | ✓ |
| Include media lifecycle events | Also re-evaluate on play/pause/ended. Noisy coupling for no benefit (pathname authoritative). | |

**User's choice:** Pathname + mutations + batch (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Mutating flag + overlay-exclusion | Mutating flag around engine writes + exclusion of engine's overlay host subtree. | ✓ |
| Target-type filter only | Act on childList addedNodes, ignore attribute mutations. Simpler but Phase 3 style writes would need the flag anyway. | |

**User's choice:** Mutating flag + overlay-exclusion (Recommended)

---

## the agent's Discretion

- VideoRegistry per-video state shape (beyond WeakMap + lifecycle reset) — left to planning.
- Selector registry exact anchor/helper contents — left to research/planning.
- Instagram DOM mock fixture depth — planner discretion.

## Deferred Ideas

- Home-feed video posts as future REELS surface — rejected for v1.
- Profile reels as degraded surface — rejected (stays SOCIAL).
- VideoRegistry clearing on social routes — considered and rejected (D-07).