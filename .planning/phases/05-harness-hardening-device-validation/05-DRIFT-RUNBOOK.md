# SlowGram — Drift Refresh Runbook (HARN-04 / D-10)

> When Instagram changes its DOM such that `CONFIG.selectors` no longer resolve,
> the drift guard fires FIRST in CI (the T-D02 fixture walk names the missing
> selector) or in prod logs (the N=5 `selectorHealth` drift event). This runbook
> is the human loop that keeps the versioned snapshot current.

## When to use

- **CI failure:** `test/slowgram.test.js` fails a T-D02 assert with
  `selector "<x>" not found` (or the T-D0x walk).
- **Prod log:** a `selectorHealth { status: 'drift' }` event appears — the
  engine has swapped to the fail-soft fallback scope (document-scoped `<video>`
  on `/reels/` only — registration continues, but the anchored scope is lost).

## The loop

1. **Identify the missing selector** from the assert message (T-D02 names it:
   `video` / `[role="main"]` / `[role="dialog"]`) or from the health event's
   pathname context.
2. **Capture a FRESH dump** of the current Instagram DOM:
   - Logged-OUT state: open `https://www.instagram.com/reels/` in an incognito
     window, open DevTools → Elements, copy the feed subtree.
   - Logged-IN state: same, with a playing reel (fullscreen viewer open for the
     `[role="dialog"]` shape).
   - Record the capture date + whether it was live-verified or community-cited.
3. **Update the fixture** `test/fixtures/instagram-shapes.js`, preserving the
   tagged-shape structure (`source`, `roleMain`, `videos`, `hasDialog`,
   `hasLoop`, `hasAutoplay`, `roles`, `ariaLabels`). Change ONLY the fields the
   fresh dump proves. Never blur the loggedOut/loggedIn distinction
   (02-RESEARCH Pitfall 6 — logged-out dumps show no loop/autoplay).
4. **Re-run the suite:** `node test/slowgram.test.js` — the T-D02 walk must pass
   against the updated fixture.
5. **If a selector GENUINELY changed** (not just the fixture): update
   `CONFIG.selectors` in `src/slowgram.js` — ONLY via the DETC-06 registry
   discipline (never a hardcoded query anywhere else) — and record the change in
   `.planning/STATE.md`.
6. **Commit** the fixture update (+ any selector change) together with a
   one-line runbook note, e.g. `fix(fixtures): refresh instagram shapes 2026-08-XX — [role="main"] re-verified`.

## Guarantees

- **Fail-first:** the fixture walk (T-D02) breaks the suite in CI the moment a
  selector stops resolving — production never discovers drift first (D-10).
- **No runtime re-scan:** the guard is the versioned fixture + the existing N=5
  health machinery — no new scanner, no network, no cost (D-10 rationale).
- **One source of truth:** the walk reads `CONFIG.selectors` — the same
  registry the engine queries and the health scan counts (D-11).
