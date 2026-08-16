/**
 * SlowGram fixture data — Instagram DOM shapes (DETC-07).
 *
 * Static snapshot data for the deterministic Instagram-shaped DOM used by the
 * detection suites. Two shapes minimum (02-RESEARCH.md Pitfall 6: fake-vs-live
 * divergence — the logged-out dump shows no loop/autoplay; logged-in videos
 * carry loop). Each shape is tagged with its source so tests can assert which
 * evidence a fixture carries; the two shapes never blur.
 *
 * Dual host: loaded via <script> in the browser (before instagram-mock.js) or
 * via require() under Node. Data only — no logic beyond the attach wrapper.
 */
(function (global) {
  'use strict';

  var SHAPES = {
    /**
     * loggedOut — from the verified live dump
     * C:\Users\Usuario\AppData\Local\Temp\eco-ig-dump.html (captured
     * 2026-08-15, 860727 bytes): role="main" count 1, 4× <video> with
     * blob:https://www.instagram.com/<uuid> srcs, zero role="dialog", zero
     * loop/autoplay attrs, playsinline on all videos, and the full role /
     * aria-label inventory. Actual class values (x1lliihq, xbmvrgn, ...) are
     * auto-generated and obfuscated — they MUST NOT appear in fixtures or
     * engine code (DETC-06: role/attribute/aria only).
     *
     * Divergence note (02-01 Task 2 real-DOM verification, 2026-08-15): a
     * FRESH headless capture of https://www.instagram.com/reels/ produced an
     * 819255-byte page shell with ZERO rendered <video> (headless feed
     * hydration blocked — Instagram serves a reduced shell to headless UAs).
     * The verified on-disk dump remains the logged-out shape source: it is
     * the same page with the feed actually hydrated (4 real blob-src videos),
     * i.e. the DOM the engine observes once rendering completes. The
     * zero-video fresh capture is exactly the accepted empty-reels-tab edge
     * (02-RESEARCH.md A4/A5), NOT a stale-fixture signal. role="main" count
     * is 1 and role="dialog" 0 in BOTH captures.
     */
    loggedOut: {
      source: 'live-dump-2026-08-15',
      roleMain: 1,
      videos: 4,
      videoAttrs: ['playsinline', 'preload', 'src'],
      srcPattern: 'blob:https://www.instagram.com/<uuid>',
      roles: ['button', 'group', 'img', 'link', 'main', 'presentation', 'slider'],
      hasDialog: false,
      hasLoop: false,
      ariaLabels: [
        'Video player',
        'Press to play',
        'Play button icon',
        'Adjust volume',
        'Audio is muted',
        'Comment',
        'Like',
        'Share',
        'More'
      ]
    },

    /**
     * loggedIn — from CITED community evidence (kbrianps/instagram-video-
     * controls); NOT live-verified, non-load-bearing. The fullscreen viewer
     * carries role="dialog" (D-03: counts as REELS; A2: CITED, a sibling
     * overlay of the feed) and feed videos carry loop/autoplay.
     */
    loggedIn: {
      source: 'cited-community',
      hasLoop: true,
      hasAutoplay: true,
      hasDialog: true,
      dialogRole: '[role="dialog"]'
    }
  };

  var sourceTags = {
    loggedOut: SHAPES.loggedOut.source,
    loggedIn: SHAPES.loggedIn.source
  };

  /** The ONLY selectors the engine may query (DETC-06). */
  var verifiedSelectors = ['video', '[role="main"]', '[role="dialog"]'];

  var instaShapes = { SHAPES: SHAPES, sourceTags: sourceTags, verifiedSelectors: verifiedSelectors };

  global.instaShapes = instaShapes;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = instaShapes;
  }
})(typeof window !== 'undefined' ? window : globalThis);