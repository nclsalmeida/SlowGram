# Phase 5 — Wave 7 Summary: Dual-Host Parity First-Class (HARN-07)

**Plan:** 05-07 · **Status:** ✅ Complete · **Commit:** `4e96443`

## Goal

Formalize the dual-host guarantee (same engine, same harness, same suite on
Node and in the browser) as a *first-class, provable contract* instead of a
convention the maintainers happen to follow.

## What was done

### `test/harness.html` — single-source contract header
The page now documents the contract up top: it loads `slowgram.js`,
`harness.js`, and `slowgram.test.js` **by path** and must never be a copied,
modified duplicate of any of them. A duplicated copy silently breaks parity;
the header makes the rule explicit and greppable (asserted by T-H03a).

### `test/slowgram.test.js` — T-H01..T-H04 suite + epilogue parity
- **T-H01** — structure pins: all three paths (`src/slowgram.js`,
  `test/harness.js`, `test/slowgram.test.js`) resolve and exist relative to
  `harness.html`.
- **T-H02** — zero-dependency claim provable: the harness page declares the
  engine has no runtime dependencies, and the pin reads the engine's source
  to confirm no `import`/`require`/CDN `src` exists inside `slowgram.js`.
- **T-H03** — parity contract documented: `harness.html` states the
  single-source contract, and the `TOTAL` render convention lives in the
  *shared* `harness.js` (asserted, not assumed).
- **T-H04** — env-gated full smoke: if Edge exists, spawns headless
  `--dump-dom` of `harness.html` and asserts the browser TOTAL is internally
  consistent (`passed === run`), then hands the total to the epilogue. If
  Edge is absent, skips cleanly — the structure pins hold everywhere, the
  dual-host *proof* runs where Edge exists. A missing TOTAL is treated as a
  failed smoke (profile-lock detection), never a silent pass.

### Host epilogue — parity arithmetic
The Node epilogue now compares the final suite total against the Edge TOTAL
captured by T-H04: browser TOTAL must be strictly less than the final Node
total (the Node-only source scans) and the delta must be bounded (< 200).
This turns "they're the same suite" into a numeric assertion on every run
where Edge is present.

## Verification

| Host | Total | Notes |
|------|-------|-------|
| Node | **930** assertions | full suite, exit 0 |
| Edge (headless) | **851** passed / 851 run | `harness.html` via `--dump-dom` |

Parity delta: 930 − 851 = **79** (Node-only scans: source-scan asserts +
fixture tests that `require` Node modules and skip in the browser host).
Bounded ✓ (`0 < 79 < 200`).

*Atualizado 2026-08-16 (auditoria de hardening): contagens re-sincronizadas —
os ciclos P1/P2 adicionaram testes de regressão compatíveis com os dois hosts;
a paridade (delta 79) foi preservada.*

## Files touched
- `test/harness.html` — single-source contract header
- `test/slowgram.test.js` — T-H01..T-H04 suite, `edgeTotalForParity` capture, epilogue parity assert
- `.planning/STATE.md` — execution bookkeeping (begin-phase)

## Handoff
All 7 waves of Phase 5 are green. Next: aggregate phase verification
(regression gate → verify → roadmap update → phase-complete commit).
