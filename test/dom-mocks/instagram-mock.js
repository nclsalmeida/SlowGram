/**
 * SlowGram DOM mocks — Instagram-shaped FakeElement tree builder (DETC-07).
 *
 * Composes FakeElement trees from test/fixtures/instagram-shapes.js so every
 * detection test runs against deterministic Instagram-shaped DOM:
 *   - buildReelsFeed(shape)  → one [role="main"] containing shape.videos
 *     video children (logged-out: no loop/autoplay, blob-style src; logged-in:
 *     loop + autoplay attrs added)
 *   - buildDialogRoot(shape) → a [role="dialog"] root containing one video
 *     (logged-in fullscreen viewer, D-03)
 *   - buildSocialRoute(route)→ a minimal SOCIAL-route tree (no role=main with
 *     videos, per the verified logged-out shape)
 *
 * Requires the FakeElement factory from test/harness.js — in the browser host
 * the script order must be harness.js BEFORE instagram-mock.js.
 *
 * Dual host: attached as the single namespaced global `window.instaMocks`
 * (pinned — referenced by Plan 04's demo driver; do not rename) + Node
 * module.exports, exactly like the harness.js factory idiom.
 */
(function (global) {
  'use strict';

  var FakeElement = global.FakeElement;
  var FakeVideoElement = global.FakeVideoElement;

  /**
   * buildReelsFeed — assembles the feed root matching the given shape: one
   * [role="main"] element containing `shape.videos` video children. Logged-out
   * videos carry playsinline/preload/blob-style src (per the live dump, no
   * loop/autoplay); logged-in adds loop + autoplay attrs.
   */
  function buildReelsFeed(shape) {
    shape = shape || {};
    var videos = [];
    var count = (typeof shape.videos === 'number') ? shape.videos : 0;
    for (var i = 0; i < count; i++) {
      var attrs = { src: 'blob:https://www.instagram.com/fake-' + i };
      if (shape.hasLoop) { attrs.loop = ''; }
      if (shape.hasAutoplay) { attrs.autoplay = ''; }
      videos.push(FakeVideoElement('video', attrs));
    }
    return FakeElement('main', { role: 'main' }, videos);
  }

  /**
   * buildDialogRoot — the fullscreen viewer root (D-03): a [role="dialog"]
   * element containing one video, present only for the logged-in shape.
   * Returns null for shapes without a dialog.
   */
  function buildDialogRoot(shape) {
    shape = shape || {};
    if (!shape.hasDialog) { return null; }
    return FakeElement('div', { role: 'dialog' }, [
      FakeVideoElement('video', { src: 'blob:https://www.instagram.com/dialog-1' })
    ]);
  }

  /**
   * buildSocialRoute — a minimal tree for preserved SOCIAL routes (/direct/,
   * /messages/, /p/...): no [role="main"] containing videos, per the verified
   * logged-out shape, so SOCIAL-route tests have realistic DOM.
   */
  function buildSocialRoute(route) {
    var article = FakeElement('article');
    var header = FakeElement('header');
    var main = FakeElement('div');          // no role="main" — not the feed
    main.children.push(header);
    main.children.push(article);
    var root = FakeElement('section', {}, [main]);
    return { route: route || '/', root: root };
  }

  var instaMocks = {
    buildReelsFeed: buildReelsFeed,
    buildDialogRoot: buildDialogRoot,
    buildSocialRoute: buildSocialRoute
  };

  global.instaMocks = instaMocks;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = instaMocks;
  }
})(typeof window !== 'undefined' ? window : globalThis);