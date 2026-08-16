/* SlowGram Android host — boot script (WRAPPER side, never the engine).
 *
 * Injected right after src/slowgram.js on every main-frame page load, once
 * per page (guard below). Uses only the engine's real public API:
 * SlowGram.init() / SlowGram.getState(). The status ping is observability
 * (Logcat only, via the SlowGramBridge JS interface) — nothing leaves the
 * device.
 */
(function () {
  'use strict';
  if (window.__slowgramInjected) { return; }
  window.__slowgramInjected = true;

  /* Host cosmetic shims (selectors verified ON-DEVICE, Pixel 7 Pro, 2026-08):
   *
   * 1. Hide Instagram's "Usar o app" / "Use the app" install banner so the
   *    user stays in the WebView without dismissing it manually.
   *    `div._acc8._abpk` is the fixed banner element and is unique on the
   *    page. A CSS rule is live, so it hides the banner whenever it renders;
   *    if the class changes the banner simply returns (fail-soft).
   *
   * 2. Force the Instagram wordmark (`<i aria-label="Instagram">`, a CSS
   *    sprite) to always render WHITE. The sprite ships a black frame (light
   *    pages — e.g. the login screen on a dark background, where the logo is
   *    almost invisible) and a white frame. `brightness(0) invert(1)` is the
   *    standard "make any glyph white" filter: no-op on white, fixes black.
   *
   * 3. Reels: keep captions above the fixed bottom nav. Each reel item is
   *    exactly one viewport tall (position:absolute, height:100%) and the
   *    bottom nav (73px) overlays its lower edge — so the caption block's
   *    last lines ('… mais', 'Áudio original') hide behind the nav and the
   *    'mais' toggle lands inside the Reels-tab tap target (hard to tap).
   *    Adding nav-height padding to the ITEM lifts the in-flow caption
   *    block above the nav without moving the video (absolute) or the
   *    right action rail. Selector verified on-device: the combo
   *    `xpqajaz`+`xtijo5x` matches exactly the 9 loaded reel items (all
   *    826px tall); `xtijo5x` alone also hits 93px video wrappers and
   *    `xpqajaz` alone also hits the caption blocks, so BOTH must match.
   */
  try {
    var style = document.createElement('style');
    style.setAttribute('data-slowgram', 'host-shim');
    style.textContent =
      'div._acc8._abpk { display: none !important; }\n' +
      'i[aria-label="Instagram"] { filter: brightness(0) invert(1); }\n' +
      'div[class*="xpqajaz"][class*="xtijo5x"] { padding-bottom: 93px !important; }';
    (document.head || document.documentElement).appendChild(style);
  } catch (e) { /* cosmetic only */ }

  window.SlowGram.init();

  try {
    var st = window.SlowGram.getState();
    if (window.SlowGramBridge) {
      SlowGramBridge.onEngineStatus(JSON.stringify({
        injected: true,
        context: st.context,
        phase: st.phase,
        elapsedMs: st.elapsedMs
      }));
    }
  } catch (e) { /* observability only */ }
})();
