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

  // Navigation-confirm suppressor + fresh-home jump, declared at IIFE scope:
  // in STRICT mode a function declaration inside a try block is BLOCK-SCOPED,
  // so sections below could not see one declared in another section's try -
  // their calls threw silent ReferenceErrors and jumps never happened.
  // While the composer is open (even stuck on "Carregando..."), instagram.com
  // registers a beforeunload guard that would pop a "Leave site?" dialog over
  // our jumps. Registered at boot - BEFORE the composer's own handler - this
  // capture listener runs FIRST and stops it ONLY when WE initiated the jump;
  // user-initiated navigation away from unsaved drafts keeps the dialog.
  var sgAutoJumping = false;
  window.addEventListener('beforeunload', function (e) {
    if (sgAutoJumping && e &&
        typeof e.stopImmediatePropagation === 'function') {
      e.stopImmediatePropagation();
    }
  }, true);
  function sgJumpHome() {
    sgAutoJumping = true;
    try { window.onbeforeunload = null; } catch (err) {}
    if (window.console && console.log) {
      console.log('[SlowGram-boot] jumping -> fresh home');
    }
    window.location.replace(window.location.origin + '/');
  }

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

  // 5. Story-post guard (v1.1.1). Instagram's web composer gives NO
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

    // Completion announcement (the in-page "notification below"):
    // matched in [role=status]/[role=alert]/[aria-live] regions.
    var STORY_DONE_LABEL =
      /((story|hist[oó]ria).{0,40}(postado|publicado|compartilhado|adicionad[oa]|posted|shared|criad[oa])|(postado|publicado|compartilhado|adicionad[oa]).{0,24}(story|hist[oó]ria))/i;
    var lastLiveRegionText = '';
    var lastLiveRegionLogAt = 0;

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

        // b) auto-return to a fresh home as soon as the post is CONFIRMED
        //    (the page announces it in an aria-live/status region — the
        //    "notification below") or the composer closes, whichever first.
        var polls = 0;
        var timer = setInterval(function () {
          polls += 1;

          var confirmed = false;
          try {
            var txt = '';
            var regions = document.querySelectorAll(
              '[role="status"],[role="alert"],[aria-live]');
            for (var ri = 0; ri < regions.length; ri++) {
              var rt = regions[ri].textContent || '';
              if (rt) { txt += rt + '\n'; }
            }
            if (txt && txt !== lastLiveRegionText) {
              lastLiveRegionText = txt;
              // Diagnostic breadcrumb: the exact wording lands in Logcat so
              // the matcher can be tuned if a locale ever stops matching.
              if (window.console && console.log &&
                  Date.now() - lastLiveRegionLogAt > 3000) {
                lastLiveRegionLogAt = Date.now();
                console.log('[SlowGram-boot] live region: ' +
                  txt.replace(/\s+/g, ' ').trim().slice(0, 140));
              }
            }
            if (txt && STORY_DONE_LABEL.test(txt)) { confirmed = true; }
          } catch (err) { /* probe is best-effort */ }

          var closed = true;
          try { closed = !document.contains(btn); } catch (err) { closed = true; }
          if (!confirmed && !closed) {
            if (polls >= 40) {
              clearInterval(timer);
              if (window.console && console.log) {
                console.log('[SlowGram-boot] story watch gave up (composer hung)');
              }
            }
            return;
          }
          clearInterval(timer);
          var p = '';
          try { p = window.location.pathname || ''; } catch (err) {}
          try {
            // A CONFIRMED post ALWAYS lands on a fresh home - that is the
            // product promise ("posted -> updated home"), wherever the SPA
            // happened to route the composer. Close-only (no confirmation)
            // keeps the conservative surface guard so a stray close never
            // yanks someone browsing elsewhere.
            var mayJump = confirmed || p === '/' || p.indexOf('/stories') === 0;
            if (window.console && console.log) {
              console.log('[SlowGram-boot] story ' +
                (confirmed ? 'CONFIRMED' : 'closed') +
                ' (path=' + p + ')' + (mayJump ? ' -> fresh home' : ' -> staying'));
            }
            if (mayJump) {
              sgJumpHome();
            }
          } catch (err) { /* fail-soft */ }
        }, 1500);
      } catch (err) { /* never break the page over the guard */ }
    }, true);
  } catch (e) { /* cosmetic only */ }

  // 6. Story-lifecycle announcer watch (v1.1.1). Instagram announces story
  //    events in small aria-live/status regions. Reading THOSE nodes is
  //    cheap (textContent of a tiny subtree — unlike body.innerText, no
  //    full-page layout). A permanent 2s watcher reacts to:
  //      - story DELETED  -> jump to a FRESH home (the SPA leaves a ghost
  //        ring in the tray, and a composer opened right after deleting
  //        inherits rotten state and fails to post — both cured by the
  //        fresh load);
  //      - story post FAILED -> fresh home too (same state reset).
  //    Post SUCCESS stays owned by the guard above (it owns cooldown
  //    context). All jumps are pathname-guarded (/ or /stories*) and rate-
  //    limited; every step fail-soft.
  try {
    var STORY_DELETED_LABEL =
      /((story|hist[oó]ria).{0,40}(exclu[íi]d[oa]|apagad[oa]|removid[oa]|deleted|removed))|((exclu[íi]d[oa]|apagad[oa]|deleted).{0,24}(story|hist[oó]ria))/i;
    var STORY_FAILED_LABEL =
      /(n[aã]o foi poss[íi]vel|erro ao|algo deu errado|could[n']t|failed to|unable to).{0,80}(story|compartilh|publicar|postar|criar)/i;
    var lastAnnouncerText = '';
    var lastLifecycleJumpAt = 0;
    var sgErrScanTick = 0;

    setInterval(function () {
      try {
        // Upstream crash recovery (v1.1.1): when instagram.com's own JS
        // dies (observed after deleting stories then posting) it renders
        // "Ocorreu um erro" + "Recarregar página". Detection walks TEXT
        // NODES ONLY (TreeWalker) - body.innerText would force a full-page
        // LAYOUT read, which was the perf bug class we just fixed. The
        // React shell usually keeps the feed DOM mounted under the error,
        // so a node-count gate never opens; a text-node walk sees the real
        // words regardless. Runs every 4th tick (~8s); capped at 4000 text
        // nodes (a few ms worst case). Requires TWO independent markers
        // (headline + reload affordance) so stray template strings in a
        // healthy page can't trigger it. Loop-guarded: max 2 reloads per
        // minute (sessionStorage) - past that the manual button stays.
        sgErrScanTick += 1;
        if (sgErrScanTick % 4 === 0) {
          var errTxt = '';
          try {
            var walker = document.createTreeWalker(
              document.body || document.documentElement,
              NodeFilter.SHOW_TEXT, null);
            var tn;
            var budget = 4000;
            while ((tn = walker.nextNode()) && budget-- > 0) {
              var v = tn.nodeValue;
              if (v && v.length > 1) { errTxt += v + '\n'; }
            }
          } catch (err) { errTxt = ''; }
          var hitHeadline =
            /Ocorreu um erro|Something went wrong|n[aã]o foi poss[íi]vel carregar a p[aá]gina/i.test(errTxt);
          var hitReload =
            /Recarregar (a )?p[aá]gina|Tente novamente|Reload page|Try again/i.test(errTxt);
          if (hitHeadline && hitReload) {
            var nowMs = Date.now();
            var lastAt = parseInt(sessionStorage.getItem('sgCrashReloadAt') || '0', 10);
            var count = (nowMs - lastAt > 60000)
              ? 0
              : parseInt(sessionStorage.getItem('sgCrashReloadCount') || '0', 10);
            if (count < 2) {
              sessionStorage.setItem('sgCrashReloadAt', String(nowMs));
              sessionStorage.setItem('sgCrashReloadCount', String(count + 1));
              if (window.console && console.log) {
                console.log('[SlowGram-boot] upstream error page -> auto-reload (' +
                  (count + 1) + '/2)');
              }
              window.location.reload();
              return;
            }
          }
        }

        var txt = '';
        var regions = document.querySelectorAll(
          '[role="status"],[role="alert"],[aria-live]');
        for (var wi = 0; wi < regions.length; wi++) {
          var wt = regions[wi].textContent || '';
          if (wt) { txt += wt + '\n'; }
        }
        if (!txt || txt === lastAnnouncerText) { return; }
        lastAnnouncerText = txt;
        var flat = txt.replace(/\s+/g, ' ').trim();

        // Second safety net for SUCCESS: if the click-guard's own poll
        // somehow missed it, a done-announcement within 3 minutes of a
        // detected post click still triggers the fresh-home jump (no path
        // guard - same product promise). Deleted/failed keep the surface
        // guard so unrelated announcements elsewhere never yank anyone.
        var doneRecent =
          Date.now() - lastStoryPostAt < 180000 &&
          STORY_DONE_LABEL.test(flat);
        if (doneRecent ||
            STORY_DELETED_LABEL.test(flat) ||
            STORY_FAILED_LABEL.test(flat)) {
          var now = Date.now();
          if (now - lastLifecycleJumpAt < 5000) { return; }
          var p = '';
          try { p = window.location.pathname || ''; } catch (err) {}
          if (!doneRecent &&
              !(p === '/' || p.indexOf('/stories') === 0)) { return; }
          lastLifecycleJumpAt = now;
          if (window.console && console.log) {
            console.log('[SlowGram-boot] story lifecycle (' +
              (doneRecent ? 'success' : 'deleted/failed') +
              ', path=' + p + ') -> fresh home');
          }
          sgJumpHome();
        }
      } catch (err) { /* best-effort watcher */ }
    }, 2000);

    // Explicit deletion clicks (v1.1.1): the announcement watch above
    // depends on Instagram ANNOUNCING the deletion - it often doesn't. So
    // also arm on the ACTION itself: inside the story viewer (/stories*),
    // clicking Excluir/Discard/Delete IS the intent; give their API ~3s,
    // then land on a fresh home (the tray keeps a ghost ring until a
    // reload). Exact-label match plus the /stories* path guard keep
    // unrelated deletes (messages, comments - never under /stories*) out.
    document.addEventListener('click', function (e) {
      try {
        var p0 = '';
        try { p0 = window.location.pathname || ''; } catch (err) {}
        if (p0.indexOf('/stories') !== 0) { return; }
        var t0 = e.target;
        var b0 = (t0 && typeof t0.closest === 'function')
          ? t0.closest('button,[role="button"]')
          : null;
        if (!b0) { return; }
        var label0 = ((b0.getAttribute && b0.getAttribute('aria-label')) ||
          b0.textContent || '').replace(/\s+/g, ' ').trim();
        if (!/^(excluir|descartar|eliminar|delete|discard)$/i.test(label0)) {
          return;
        }
        if (window.console && console.log) {
          console.log('[SlowGram-boot] story delete clicked -> home in 3s');
        }
        setTimeout(function () {
          try {
            var nowD = Date.now();
            if (nowD - lastLifecycleJumpAt < 5000) {
              if (window.console && console.log) {
                console.log('[SlowGram-boot] delete jump skipped (rate limit)');
              }
              return;
            }
            lastLifecycleJumpAt = nowD;
            sgJumpHome();
          } catch (err) {
            if (window.console && console.log) {
              console.log('[SlowGram-boot] delete jump failed: ' + err);
            }
          }
        }, 3000);
      } catch (err) { /* fail-soft */ }
    }, true);
  } catch (e) { /* cosmetic only */ }

  // 7. Reels caption-lift, geometric fallback (v1.1.1). Meta ROTATES the
  //    obfuscated class names the CSS shim matches - xpqajaz/xtijo5x died
  //    on-device again and captions slid back under the bottom nav. This
  //    applier is class-INDEPENDENT: from each <video>, climb ancestors to
  //    the full-viewport snap item and pin padding-bottom inline. Layout
  //    reads (clientHeight) happen ONLY on first-seen videos; known ones
  //    get a cheap inline-style re-assert per tick because React re-renders
  //    wipe styles. Route-gated by data-sg-reels like the CSS rule. Also
  //    logs the video's ancestor className chain once per page so rotated
  //    names can be re-pinned into the CSS shim straight from Logcat.
  try {
    var sgReelVideos = (typeof WeakSet === 'function') ? new WeakSet() : null;
    var sgReelPadded = [];
    var sgReelProbeLogged = false;
    setInterval(function () {
      try {
        var el = document.documentElement;
        if (!el || el.getAttribute('data-sg-reels') !== '1') { return; }
        var vids = document.querySelectorAll('video');
        if (!vids.length) { return; }
        if (!sgReelPadded.length && vids.length &&
            sgReelVideos && sgReelVideos.has(vids[0])) { return; }
        if (!sgReelProbeLogged && window.console && console.log) {
          sgReelProbeLogged = true;
          var chain = [];
          var cur = vids[0];
          for (var d = 0; d < 5 && cur; d++) {
            chain.push(String(cur.className || '')
              .replace(/\s+/g, '.').slice(0, 50));
            cur = cur.parentElement;
          }
          console.log('[SlowGram-boot] reels probe: ' + chain.join(' < '));
        }
        // cheap re-assert of already-padded items (no layout reads)
        for (var j = 0; j < sgReelPadded.length; j++) {
          try {
            if (sgReelPadded[j].style.paddingBottom !== '93px') {
              sgReelPadded[j].style.paddingBottom = '93px';
            }
          } catch (e2) {}
        }
        var vh = window.innerHeight || 0;
        for (var i = 0; i < vids.length; i++) {
          var node = vids[i];
          if (sgReelVideos) {
            if (sgReelVideos.has(node)) { continue; }
            sgReelVideos.add(node);
          }
          var cur2 = node.parentElement;
          var target = null;
          for (var d2 = 0; d2 < 8 && cur2 && cur2 !== document.body; d2++) {
            if (cur2.clientHeight >= vh * 0.85) { target = cur2; break; }
            cur2 = cur2.parentElement;
          }
          if (target) {
            target.style.paddingBottom = '93px';
            sgReelPadded.push(target);
            if (window.console && console.log) {
              console.log('[SlowGram-boot] reels caption lift applied (geometric)');
            }
          }
        }
      } catch (err) { /* fail-soft */ }
    }, 2000);
  } catch (e) { /* cosmetic only */ }

  // TESTING LEVER (v1.1.1): accelerated reels-degradation clock. The
  // engine's public init({clock}) seam normally ticks in real time, so the
  // research-locked phase boundaries [3,7,12] minutes gate each lever tier.
  // With this 60x clock the SAME boundaries elapse in [3,7,12] SECONDS of
  // real watch time - maximum degradation (saturation .4, playbackRate .8,
  // volume .5, autoplay off) inside a minute. TESTING ONLY on the
  // maintainer's device: flip SG_FAST_REELS to false, or set
  // localStorage.sgFastReels='0', to restore the research timeline.
  // MUST ship false in any release tag.
  var SG_FAST_REELS = true;
  var fastReels = SG_FAST_REELS;
  try {
    if (localStorage.getItem('sgFastReels') === '0') { fastReels = false; }
  } catch (e) {}
  window.SlowGram.init(fastReels
    ? { clock: { now: function () { return Date.now() * 60; } } }
    : undefined);

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
