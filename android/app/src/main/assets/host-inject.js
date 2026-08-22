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
   *    ROUTE-SCOPED (v1.1.1): Instagram REUSES these obfuscated classes on
   *    other surfaces — on-device, the story composer matched and the ghost
   *    93px padding desynced touch targets from visuals (story text could
   *    be typed but never dragged). The rule therefore only applies while
   *    html[data-sg-reels="1"], flipped by the SPA route watch below, AND
   *    only for elements wrapping a real reel <video> (:has(video)) — the
   *    composer previews photos as <img>, so it stays immune even when it
   *    overlays the /reels route.
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
      'html[data-sg-reels="1"] div[class*="xpqajaz"][class*="xtijo5x"]:has(video) ' +
        '{ padding-bottom: 93px !important; }';
    (document.head || document.documentElement).appendChild(style);
  } catch (e) { /* cosmetic only */ }

  // 3b. Reels-shim routing: flip html[data-sg-reels] as the SPA navigates,
  //     so the caption-lift padding exists ONLY on /reels*. Instagram
  //     routes via pushState/replaceState (invisible to popstate alone),
  //     so both history wrappers are hooked here too. The ENGINE already
  //     wraps pushState for its RouteGuard — this boot runs after the
  //     engine, so wrapping again simply chains: every navigation fires
  //     engine first, host second. Fail-soft everywhere: any error leaves
  //     the last known state (worst case, the old pre-scoping behavior).
  try {
    function syncReelsShim() {
      var p = '';
      try { p = window.location.pathname || ''; } catch (e) {}
      var el = document.documentElement;
      if (!el || typeof el.setAttribute !== 'function') { return; }
      if (p.indexOf('/reels') === 0) {
        el.setAttribute('data-sg-reels', '1');
      } else if (typeof el.removeAttribute === 'function') {
        el.removeAttribute('data-sg-reels');
      }
    }
    var hist = window.history;
    if (hist) {
      ['pushState', 'replaceState'].forEach(function (name) {
        var orig = hist[name];
        if (typeof orig !== 'function') { return; }
        try {
          hist[name] = function () {
            var r = orig.apply(hist, arguments);
            try { syncReelsShim(); } catch (e) {}
            return r;
          };
        } catch (e) { /* stay unhooked rather than break navigation */ }
      });
    }
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('popstate', function () {
        try { syncReelsShim(); } catch (e) {}
      });
    }
    syncReelsShim();
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

    var mo = null;              // armed only while the page is UNRESOLVED
    var forwardResolved = false; // page proven NOT to be the interstitial
    var lastBodyNonEmpty = false;
    var lastForwardCheck = 0;

    function tryForward() {
      if (window.__slowgramLoginRedirected) { return; }
      // PERF GUARD (v1.1.1): body.innerText forces full-page layout. The
      // story editor mutates the DOM dozens of times per second — checking
      // on EVERY mutation pegged the main thread at >100% CPU and froze
      // the composer on-device (Pixel 7 Pro). Two defenses:
      //   1. throttle expensive (non-empty-body) checks to 1 per 500ms;
      //   2. DISARM once the page resolves as not-an-interstitial: the
      //      logged-out landing only ever renders on fresh loads, so a
      //      non-empty body without its copy means we can stop watching.
      var now = Date.now();
      if (lastBodyNonEmpty && now - lastForwardCheck < 500) { return; }
      lastForwardCheck = now;

      var bodyText = document.body ? document.body.innerText || '' : '';
      lastBodyNonEmpty = bodyText.replace(/\s/g, '').length > 0;

      // Detection tolerant of how the page splits the copy across elements:
      // 'Entrar ou cadastrar-se' may read as 'Entrar ou cadastrar-se',
      // 'Entrar', 'ou', 'cadastrar-se' (separate links), 'Log in', 'Sign up'.
      var isInterstitial =
        /Entrar\s*ou\s*cadastrar|Log\s*in|Sign\s*up|Cadastre-se|Cadastrar/i.test(bodyText);
      var hasOpenAppButton =
        /Abrir Instagram|Open Instagram|Use the app|Usar o app/i.test(bodyText);
      if (isInterstitial && hasOpenAppButton) {
        window.__slowgramLoginRedirected = true;
        forwardResolved = true;
        if (mo) { try { mo.disconnect(); } catch (e) {} }
        if (window.console && console.log) {
          console.log('[SlowGram-boot] first-use: forwarded logged-out page to login');
        }
        window.location.replace('https://www.instagram.com/accounts/login/');
        return;
      }
      if (lastBodyNonEmpty) {
        // Non-empty and not the interstitial: this page is resolved. Stop
        // watching entirely (fail-soft: worst case a future Meta change
        // brings back the manual "Entrar ou cadastrar-se" link flow).
        forwardResolved = true;
        if (mo) { try { mo.disconnect(); } catch (e) {} }
      }
    }

    // First check immediately, then react to DOM mutations WHILE THE PAGE
    // IS STILL UNRESOLVED (empty body at onPageFinished -> async render).
    tryForward();
    if (!alreadyAuth && !window.__slowgramLoginRedirected && !forwardResolved &&
        typeof MutationObserver === 'function') {
      mo = new MutationObserver(function () { tryForward(); });
      try { mo.observe(document.body || document.documentElement, {
        childList: true, subtree: true
      }); } catch (e) { /* fail-soft */ }
      window.__slowgramInterstitialObserver = mo;
    }
  } catch (e) { /* fail-soft: manual login link remains */ }

  // 5. Story-post guard (v1.1.2). Instagram's web composer gives NO
  //    feedback after "Adicionar ao seu story" (on-device it hangs on
  //    "Carregando..." forever — upstream bug, see README "Limitações
  //    conhecidas"), so extra taps during the silent window post
  //    DUPLICATE stories. Two fail-soft defenses, label-based (PT/EN/ES):
  //    a) capture-phase click guard: swallow further story-post
  //       activations for 20s after the first (double-taps + impatience);
  //    b) once posted, poll for the composer to CLOSE and then jump to a
  //       FRESH home (location.replace) so the new story ring is already
  //       there — the site itself never refreshes it. Never interrupts an
  //       upload (acts only after the button left the DOM); gives up
  //       silently after ~60s if the composer hangs (upstream bug).
  try {
    var STORY_POST_LABEL =
      /adicionar ao seu story|add to story|agregar a tu historia/i;
    var STORY_COOLDOWN_MS = 20000;
    var lastStoryPostAt = 0;

    document.addEventListener('click', function (e) {
      try {
        var t = e.target;
        var btn = (t && typeof t.closest === 'function')
          ? t.closest('button,[role="button"]')
          : null;
        if (!btn) { return; }
        var label = ((btn.getAttribute && btn.getAttribute('aria-label')) ||
          btn.textContent || '').replace(/\s+/g, ' ').trim();
        if (!STORY_POST_LABEL.test(label)) { return; }

        var now = Date.now();
        if (now - lastStoryPostAt < STORY_COOLDOWN_MS) {
          if (typeof e.preventDefault === 'function') { e.preventDefault(); }
          if (typeof e.stopImmediatePropagation === 'function') {
            e.stopImmediatePropagation();
          }
          if (window.console && console.log) {
            console.log('[SlowGram-boot] story post debounced (cooldown)');
          }
          return;
        }
        lastStoryPostAt = now;
        if (window.console && console.log) {
          console.log('[SlowGram-boot] story post detected');
        }

        // b) auto-return to a fresh home once the composer closes.
        var polls = 0;
        var timer = setInterval(function () {
          polls += 1;
          var closed = true;
          try { closed = !document.contains(btn); } catch (err) { closed = true; }
          if (!closed) {
            if (polls >= 40) { clearInterval(timer); }   // hung composer: give up
            return;
          }
          clearInterval(timer);
          var p = '';
          try { p = window.location.pathname || ''; } catch (err) {}
          // Only auto-jump when the user is still on the home/stories
          // surface — never yank someone who navigated to a profile.
          if (p === '/' || p.indexOf('/stories') === 0) {
            try {
              if (window.console && console.log) {
                console.log('[SlowGram-boot] composer closed -> fresh home');
              }
              window.location.replace(window.location.origin + '/');
            } catch (err) { /* fail-soft */ }
          }
        }, 1500);
      } catch (err) { /* never break the page over the guard */ }
    }, true);
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
