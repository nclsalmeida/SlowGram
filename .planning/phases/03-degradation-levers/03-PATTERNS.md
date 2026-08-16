# Phase 3: Degradation Levers — Pattern Map

**Mapped:** 2026-08-15
**Files analyzed:** 5 (4 existing in-repo analogs + 3 new phase docs)
**Analogs found:** 5 / 5 — Phase 3 extends `src/slowgram.js`, `test/harness.js`, `test/slowgram.test.js`, `demo.html` in place (exact same-file self-analogs); no greenfield files.

---

## Read First — Phase 3 Is an Extension Phase, Not Greenfield

Phase 2 shipped the trust contract (context/scope + VideoRegistry); **Phase 3 extends the same four files in place and adds no new files.** The strongest analog for every piece of new code is the file being modified itself. Locked seam facts:

- `CONFIG.degradationMatrix` (src/slowgram.js:171-176) is frozen and T15-locked (`keys ['0','1','2','3']`) — the hub routes phase → matrix lever names → applicator map; matrix values must NOT change.
- VideoRegistry entry `appliedLevers: null` (registerVideo) is T-D26-locked as `null` at register — lever state fills it on first apply; loadstart/emptied clear it for the apply-after-load hook.
- `syncPhase()` (src/slowgram.js:118-126) is transition-guarded — the hub hooks after `emit('phasechange')`; T22/T23 lock the emission counts, so the hook must not emit anything itself.
- `setContext()` already wires REELS→connectWatcher / SOCIAL|UNKNOWN→disconnectWatcher — the hub adds revertAll/applyAll in the same branches (D-16).
- `mutating` + `_setMutatingForTest` + `_setOverlayHostForTest` (D-14) — the lever's style writes follow the self-mutation discipline.
- No timers (Phase 1 ban); no class selectors (DETC-06); all handles read CONFIG (CORE-05) — every Phase 3 source scan must stay green.

**Canonical pattern sources (verified anchors):**
- `03-RESEARCH.md` Patterns A/B/C, Pitfalls 2/3, Clamp Tables section
- `.planning/research/ARCHITECTURE.md` Pattern 3 (applicator interface), Pattern 2 (apply-after-load), Anti-Patterns 2/4/6
- `.planning/research/PITFALLS.md` Pitfall 2 (lines 44-63), Pitfall 3 (67-88), Performance Traps (265-280)

---

## File Classification

| New/Modified File | Role | Closest Analog | Match Quality |
|-------------------|------|----------------|---------------|
| `src/slowgram.js` **(MODIFY)** | engine — DegradationEngine hub + saturation applicator + CONFIG.leverParams + registryElements pruning + revertAll handle | `src/slowgram.js` itself (Phase 2 detection block) | **exact — same file** |
| `test/slowgram.test.js` **(MODIFY)** | test — LEVR tracer suite (T-L1..T-L14) + source-scan additions | `test/slowgram.test.js` itself (T-D suite) | **exact — same file** |
| `test/harness.js` **(MODIFY)** | test utility — FakeVideoElement media stubs if missing (playbackRate/volume/muted/loop/paused) for 03-02; parentNode already wired | `test/harness.js` itself | **exact — same file** |
| `demo.html` **(UNCHANGED this plan)** | demo — verdict panel already renders; lever status line lands in a later Phase 3 plan | itself | no change needed |

---

## Pattern Assignments

### `src/slowgram.js` (engine — MODIFY, exact self-analog)

**Analog:** the Phase 2 detection block (classifyPathname → setContext → DomWatcher → VideoRegistry) — the Phase 3 hub follows the same closure-private function + module-var idiom.

**CONFIG additions (initConfig, mirroring the degradationMatrix block at lines 171-176):**
```javascript
leverParams: {                                  // D-19/D-20 — per-phase lever values, frozen
  saturation: { '1': 0.85, '2': 0.65, '3': 0.4 }
},
```
All Phase 3 lever values live ONLY here (CORE-05); tests read via `getConfig().leverParams` — never literals (T-L14 source scan).

**Applicator map + hub (module vars, following `health`/`watcher` precedent):**
```javascript
var applicators = {};          // lever-key -> { key, apply(phase, video), revert(video) } (LEVR-06)
var registryElements = [];     // D-18 live-element array (WeakMap is non-iterable); pruned on removedNodes
```

**saturation applicator (LEVR-01, D-15/D-17):**
```javascript
var saturationApp = {
  key: 'saturation',
  apply: function (phase, video) { /* filterTarget -> entry.origFilter capture -> mutating write -> appliedLevers.saturation = phase */ },
  revert: function (video) { /* restore origFilter on the wrapper; delete appliedLevers.saturation */ }
};
```
- `filterTarget(video)` — D-15 walk: `parentNode` up, skip transformed (`style.transform`/`style.filter`), return first clean ancestor; stop at BODY/HTML → null (bounded, Anti-Pattern 6); never the video itself.
- Original filter captured once per video (`entry.origFilter = target.style.filter || ''`) — revert restores exactly.
- `mutating = true` around the style write, restored in a finally-equivalent (D-14 discipline).

**DegradationEngine hub (D-16):**
```javascript
function applyToVideo(video) { /* guards REELS; for key in matrix[phase]: applicators[key].apply(phase, video); for applied-but-out-of-matrix keys: revert */ }
function applyAll() { /* iterate registryElements, skip unregistered; reconcile per video */ }
function revertAll() { /* iterate registryElements; every applicator.revert(video) — context-agnostic (LEVR-07) */ }
```
- Hook points: `syncPhase` after emit('phasechange') → applyAll; `setContext` REELS → applyAll, SOCIAL/UNKNOWN → revertAll; `registerVideo` → applyToVideo (new video mid-phase); `onLoadStart` → clear appliedLevers + applyToVideo (apply-after-load, Pattern 2).

**batchCallback removedNodes pruning (D-18):** for each record, `removedNodes` with tagName 'VIDEO' → drop from registryElements (splice). Mirrors the addedNodes loop (lines ~700-710).

**Handles:** `SlowGram.revertAll()` (public, LEVR-07), `SlowGram._liveRegistrySize()` (test-only, D-18).

### `test/slowgram.test.js` (test — MODIFY, exact self-analog)

**Analog:** the T-D17..T-D31 DETC suite (freshEnv + FakeElement tree + record + raf.flush + assert pattern).

**LEVR tracer suite (appended after T-D39):** T-L1..T-L14 per the plan's acceptance criteria — CONFIG leverParams values; apply-at-phase-1; escalation to 2/3; idempotence; revert on reset (sync(0)); revert on SOCIAL; re-apply on return-to-REELS; wrapper selection (skip transformed, plain wrapper chosen); bounded walk (null on body); never-video/never-body (assert filterTarget targets); removedNodes pruning; loadstart re-apply; original-filter preservation on revert; source scan (no timers/classes, leverParams only source of values).

### `test/harness.js` (test utility — MODIFY only if 03-02 needs it)

FakeVideoElement already has `src` + dispatchEvent; STACK.md:40 specifies playbackRate/volume/muted/loop/paused stubs — verify presence when the rate/volume levers land (03-02). This plan (03-01) needs only FakeElement.style ({}) + parentNode, both present.

### `demo.html` (demo — UNCHANGED this plan)

The verdict panel (Context / Registered videos / Selector health / Drift threshold) stays; a Phase 3 lever line (e.g. `Saturation: saturate(0.65)`) lands when the demo host smoke demands it — out of scope for the tracer.

---

## Shared Patterns (cross-cutting idioms to apply)

### 1. Hub routes CONFIG, never literals
**Source:** initConfig degradationMatrix (src/slowgram.js:171-176); T15 lock
**Apply to:** lever values (CONFIG.leverParams), matrix routing, saturation values
Rule: the hub and applicators read every phase/value from CONFIG; source scans assert no literals.

### 2. Transition-guarded work
**Source:** syncPhase (src/slowgram.js:118-126); T22/T23
**Apply to:** applyAll on phasechange only — never per frame; repeated same-phase syncs are no-ops.
Rule: emit only on real transitions; the hub's applyAll emits nothing itself.

### 3. Reconcile = automatic reset
**Source:** 03-RESEARCH.md Patterns (matrix['0'] = [] ⇒ phase 0 reverts everything)
**Apply to:** applyAll's in-matrix apply / out-of-matrix revert; resetSession + revertAll (LEVR-07) idempotent.
Rule: every applyAll pass reconciles per video — no lever is left applied when its phase leaves the matrix.

### 4. WeakMap state home + apply-after-load
**Source:** VideoRegistry (DETC-05); ARCHITECTURE Pattern 2
**Apply to:** lever state in entry.appliedLevers/origFilter; cleared + re-applied on loadstart.
Rule: never store lever state on the element; getRegistryState returns copies only.

### 5. Bounded DOM writes + self-mutation flag
**Source:** D-14 (batchCallback skip); ARCHITECTURE Anti-Pattern 4
**Apply to:** wrapper style.filter writes inside `mutating`; filterTarget never walks past BODY/HTML.
Rule: engine writes never retrigger the observer; the wrapper walk is bounded.

### 6. Containment
**Source:** contained() (src/slowgram.js); T-01-01
**Apply to:** applicator apply/revert bodies — a lever failure logs via console.error, never breaks the host page.

---

## No Analog Found

None — all Phase 3 files map to in-repo self-analogs. No external packages (STACK.md:15-42 ban): the hub, filterTarget walk, and pruning are hand-rolled against the existing FakeElement mini-DOM.

---

## Metadata

**Analog search scope:** `src/slowgram.js` (1079 lines), `test/slowgram.test.js` (1502 lines), `test/harness.js` (409 lines), `demo.html` (created 02-04) — all read in full.
**Inherited decisions to carry:** D-15 (ancestor wrapper wins), D-16 (reconcile hub), D-17 (WeakMap state, matrix-keyed applicators), D-18 (pruned live array), D-19/D-20 (leverParams values). Phase 3 must keep T15 (matrix keys), T-D26 (appliedLevers null), T22/T23 (phasechange counts), T-D31 (WeakMap semantics) green.
**Patterns valid until:** 2026-09-14 (matches research validity — Instagram DOM drift is the expiry driver; the SelectorRegistry health check + fixture-refresh runbook mitigate).
