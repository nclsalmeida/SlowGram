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
   *
   * 4. First-use experience: Instagram's logged-out landing page (the
   *    "Compartilhe momentos…" interstitial with an "Abrir Instagram"
   *    button) is useless inside a WebView — the button hands off to the
   *    native app, which we deliberately block. Auto-forward logged-out
   *    users straight to the login screen instead of making them tap
   *    "Entrar ou cadastrar-se" manually. Text-based detection (no fragile
   *    class names); guarded so it never loops on the auth routes and only
   *    fires when the interstitial is actually present.
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

  // 4. First-use: auto-forward the logged-out interstitial to the login
  //    screen. The interstitial renders ASYNCHRONOUSLY (the body is empty at
  //    onPageFinished), so detection is reactive: a MutationObserver re-checks
  //    the rendered text until the open-app button appears, then forwards.
  //    Fail-soft: if detection never matches (login page, logged-in feed,
  //    changed copy), the user still sees the page with the manual
  //    "Entrar ou cadastrar-se" link — nothing breaks. Loop-guard: never
  //    run on auth routes and never more than once per page.
  try {
    var path = (window.location && window.location.pathname) || '';
    var alreadyAuth =
      path.indexOf('/accounts/') === 0 || path.indexOf('/auth/') === 0;

    function tryForward() {
      if (window.__slowgramLoginRedirected) { return; }
      var bodyText = document.body ? document.body.innerText || '' : '';
      // Detection tolerant of how the page splits the copy across elements:
      // 'Entrar ou cadastrar-se' may read as 'Entrar ou cadastrar-se',
      // 'Entrar', 'ou', 'cadastrar-se' (separate links), 'Log in', 'Sign up'.
      var isInterstitial =
        /Entrar\s*ou\s*cadastrar|Log\s*in|Sign\s*up|Cadastre-se|Cadastrar/i.test(bodyText);
      var hasOpenAppButton =
        /Abrir Instagram|Open Instagram|Use the app|Usar o app/i.test(bodyText);
      if (isInterstitial && hasOpenAppButton) {
        window.__slowgramLoginRedirected = true;
        if (window.console && console.log) {
          console.log('[SlowGram-boot] first-use: forwarded logged-out page to login');
        }
        window.location.replace('https://www.instagram.com/accounts/login/');
      }
    }

    // First check immediately, then react to DOM mutations. Bounded: the
    // observer is disconnected once the forward fires, and the check itself
    // is cheap (innerText on a small landing page).
    tryForward();
    if (!alreadyAuth && !window.__slowgramLoginRedirected &&
        typeof MutationObserver === 'function') {
      var mo = new MutationObserver(function () { tryForward(); });
      try { mo.observe(document.body || document.documentElement, {
        childList: true, subtree: true, characterData: true
      }); } catch (e) { /* fail-soft */ }
      window.__slowgramInterstitialObserver = mo;
    }
  } catch (e) { /* fail-soft: manual login link remains */ }

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
