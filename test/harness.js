/**
 * SlowGram test harness — FakeClock, FakeDocument, FakeWindow,
 * FakeMutationObserver, FakeRAF, and a tiny assert runner.
 *
 * Dual host: loaded via <script> in test/harness.html (browser) or via
 * require() under Node. In both cases the constructors are attached to the
 * global object so test/slowgram.test.js can reference them identically.
 */
(function (global) {
  'use strict';

  /** FakeClock — time only moves when advance(ms) is called (CORE-06). */
  function FakeClock(startMs) {
    var t = (startMs === undefined) ? 0 : startMs;
    return {
      now: function () { return t; },
      advance: function (ms) { t += ms; return t; }
    };
  }

  /**
   * FakeDocument — visibilityState + addEventListener/dispatchEvent +
   * setVisibility(v) helper. dispatchEvent invokes registered listeners for
   * event.type synchronously. DETC-07: when a root FakeElement tree is
   * provided, the document exposes the query surface the engine's selectors
   * need (delegated to the tree). Without a root (all Phase 1 tests) no
   * querySelector exists — the engine guards for that (null-safe feedRoot /
   * healthScan), so existing suites keep passing unchanged.
   */
  function FakeDocument(init) {
    init = init || {};
    var listeners = {};
    var body = (init.body === undefined) ? FakeElement('div') : init.body;
    var doc = {
      visibilityState: (init.visibilityState === undefined) ? 'visible' : init.visibilityState,
      // Phase 4 additive: the overlay host factory needs createElement + body
      // + a text-node factory for the counter text ('N min').
      createElement: function (tag) { return FakeElement(tag); },
      createTextNode: function (data) { return { nodeValue: String(data), data: String(data) }; },
      body: body,
      addEventListener: function (type, cb) {
        if (!listeners[type]) { listeners[type] = []; }
        listeners[type].push(cb);
      },
      removeEventListener: function (type, cb) {
        var cbs = listeners[type];
        if (!cbs) { return; }
        var idx = cbs.indexOf(cb);
        if (idx !== -1) { cbs.splice(idx, 1); }
      },
      dispatchEvent: function (event) {
        var cbs = listeners[event.type];
        if (cbs) {
          for (var i = 0; i < cbs.length; i++) { cbs[i](event); }
        }
        return true;
      },
      setVisibility: function (v) { doc.visibilityState = v; },
      // Phase 4 additive: listener-count probe so suites assert listener
      // hygiene (no stacking across init/destroy — T-O29/T-O36).
      listenerCount: function (type) {
        var cbs = listeners[type];
        return cbs ? cbs.length : 0;
      }
    };
    if (init.root) {
      doc.querySelector = function (sel) { return init.root.querySelector(sel); };
      doc.querySelectorAll = function (sel) { return init.root.querySelectorAll(sel); };
    }
    return doc;
  }

  /**
   * FakeWindow — same addEventListener/dispatchEvent shape, plus the D-06
   * RouteGuard seam: a RECORDABLE and PATHNAME-UPDATING history object.
   * pushState/replaceState record the call (tests assert the engine wrapped
   * them via history.calls) and, when given a root-relative url, synchronously
   * update win.location.pathname — mirroring the real browser where
   * pushState/replaceState update the current URL without reloading (that is
   * exactly why the engine's wrapper re-classifies right after
   * orig.apply(h, arguments)).
   */
  function FakeWindow() {
    var listeners = {};
    var win = {
      addEventListener: function (type, cb) {
        if (!listeners[type]) { listeners[type] = []; }
        listeners[type].push(cb);
      },
      removeEventListener: function (type, cb) {
        var cbs = listeners[type];
        if (!cbs) { return; }
        var idx = cbs.indexOf(cb);
        if (idx !== -1) { cbs.splice(idx, 1); }
      },
      dispatchEvent: function (event) {
        var cbs = listeners[event.type];
        if (cbs) {
          for (var i = 0; i < cbs.length; i++) { cbs[i](event); }
        }
        return true;
      },
      history: {
        calls: [],
        pushState: function (state, title, url) {
          win.history.calls.push(['pushState', url]);
          if (typeof url === 'string' && url.charAt(0) === '/') {
            var loc = win.location;
            if (loc) { loc.pathname = url; }
          }
        },
        replaceState: function (state, title, url) {
          win.history.calls.push(['replaceState', url]);
          if (typeof url === 'string' && url.charAt(0) === '/') {
            var loc = win.location;
            if (loc) { loc.pathname = url; }
          }
        }
      }
    };
    return win;
  }

  /**
   * FakeMutationObserver — record-producing observer fake (02-PATTERNS.md:
   * 182-188). observe(target, config) stores the last call on `lastObserved`
   * AND appends every call to the `observed` array (two-root assertion: T-D17
   * checks BOTH observe targets/configs, not just the last one); disconnect()
   * clears it; takeRecords() returns AND drains the internal queue; the test
   * helper record(mutations) injects mutation objects — the rAF batch
   * consumes them exactly like FakeRAF.flush() drives the poll loop (mirrors
   * the real observer's microtask delivery without async). Every constructed
   * instance is registered on FakeMutationObserver.instances so tests can
   * assert observe targets/config and connect/disconnect counts.
   */
  function FakeMutationObserver(callback) {
    var records = [];
    var obs = {
      callback: callback,
      lastObserved: null,
      observed: [],
      observe: function (target, config) {
        obs.lastObserved = { target: target, config: config };
        obs.observed.push({ target: target, config: config });
      },
      disconnect: function () { obs.lastObserved = null; obs.observed = []; records = []; },
      takeRecords: function () {
        var drained = records;
        records = [];
        return drained;
      },
      record: function (mutations) { records.push.apply(records, mutations); },
      recordAttributeMutation: function (target, attributeName) {
        records.push({ type: 'attributes', target: target, attributeName: attributeName });
      }
    };
    FakeMutationObserver.instances.push(obs);
    return obs;
  }
  FakeMutationObserver.instances = [];

  /**
   * FakeElement — a hand-rolled mini-DOM node (02-RESEARCH.md Pattern 5,
   * lines 263-287) so the engine's real selectors run deterministically in
   * BOTH hosts. The Phase 1 FakeDocument is an event-only shell with no
   * querySelector; this factory adds the query surface. Supports ONLY the 3
   * registered selectors — 'video', '[role="main"]', '[role="dialog"]'
   * (DETC-06: the engine never queries by class) — implemented by walking the
   * children recursively against tagName/role attribute. tagName is
   * normalized to uppercase for the engine's 'VIDEO' comparison.
   */
  function FakeElement(tagName, attrs, children) {
    attrs = attrs || {};
    var el = {
      tagName: String(tagName).toUpperCase(),
      nodeType: 1,
      children: children || [],
      parentNode: null,
      style: {},
      listeners: {},
      getAttribute: function (n) { return attrs[n] !== undefined ? attrs[n] : null; },
      hasAttribute: function (n) { return attrs[n] !== undefined; },
      setAttribute: function (n, v) { attrs[n] = String(v); },
      removeAttribute: function (n) { delete attrs[n]; },   // LEVR-04: the autoplay lever removes the loop attribute
      addEventListener: function (t, cb) { (el.listeners[t] = el.listeners[t] || []).push(cb); },
      removeEventListener: function (t, cb) {              // D-29: teardown unbinds element listeners (real DOM dedupes by fn ref)
        var arr = el.listeners[t] || [];
        var idx = arr.indexOf(cb);
        if (idx !== -1) { arr.splice(idx, 1); }
      },
      dispatchEvent: function (ev) {
        var cbs = el.listeners[ev.type] || [];
        for (var i = 0; i < cbs.length; i++) { cbs[i](ev); }
      },
      closest: function () { return null; },          // overlay-exclusion helper (D-14)
      contains: function (other) {
        return el === other || (el.children || []).some(function (c) { return c.contains(other); });
      },
      matches: function (selector) {
        if (selector === 'video') { return el.tagName === 'VIDEO'; }
        if (selector === '[role="main"]') { return el.getAttribute('role') === 'main'; }
        if (selector === '[role="dialog"]') { return el.getAttribute('role') === 'dialog'; }
        return false;                                  // unregistered selector — never matches
      },
      querySelector: function (selector) { return collect(el, selector)[0] || null; },
      querySelectorAll: function (selector) { return collect(el, selector); },
      appendChild: function (child) {
        el.children.push(child);
        child.parentNode = el;
        return child;
      },
      removeChild: function (child) {
        var idx = el.children.indexOf(child);
        if (idx !== -1) { el.children.splice(idx, 1); }
        child.parentNode = null;
        return child;
      },
      // Phase 4 additive: minimal attachShadow fake so the engine's real
      // shadow-DOM construction path (ensureOverlayHost) runs deterministically
      // on BOTH hosts. Records the injected <style> so tests assert the CSS.
      attachShadow: function (init) {
        if (el.shadowRoot) { return el.shadowRoot; }   // real-DOM semantics: attachShadow once
        var root = {
          mode: (init && init.mode) || 'closed',
          host: el,
          children: [],
          appendChild: function (child) {
            root.children.push(child);
            child.parentNode = root;
            return child;
          },
          removeChild: function (child) {
            var idx = root.children.indexOf(child);
            if (idx !== -1) { root.children.splice(idx, 1); }
            child.parentNode = null;
            return child;
          },
          // styleText — test helper: concatenated textContent of all <style>
          // children injected into the shadow root (the overlay's CSS contract).
          styleText: function () {
            var out = '';
            for (var i = 0; i < root.children.length; i++) {
              var c = root.children[i];
              if (c.tagName === 'STYLE' && typeof c.textContent === 'string') {
                out += c.textContent;
              }
            }
            return out;
          }
        };
        el.shadowRoot = root;
        return root;
      }
    };
    (children || []).forEach(function (c) { c.parentNode = el; });
    return el;

    function collect(node, selector) {
      var out = [];
      if (node.matches(selector)) { out.push(node); }
      (node.children || []).forEach(function (c) { out.push.apply(out, collect(c, selector)); });
      return out;
    }
  }

  /**
   * FakeVideoElement — extends FakeElement with a settable `src` property that
   * MIRRORS into attributes (getAttribute('src') reads the property, setting
   * the attribute writes the property) so the engine's readSrc() behaves
   * identically on fake and real elements; dispatchEvent already supports the
   * DETC-05 lifecycle events ('loadstart'/'emptied').
   */
  function FakeVideoElement(tagName, attrs, children) {
    var el = FakeElement(tagName || 'video', attrs, children);
    var srcValue = (attrs && attrs.src !== undefined) ? attrs.src : '';
    Object.defineProperty(el, 'src', {
      get: function () { return srcValue; },
      set: function (v) { srcValue = (v === undefined || v === null) ? '' : String(v); },
      configurable: true
    });
    // src <-> attribute mirror (readSrc contract, 02-03 Task 2)
    var baseGet = el.getAttribute;
    var baseSet = el.setAttribute;
    el.getAttribute = function (n) {
      if (n === 'src') { return el.src || null; }
      return baseGet(n);
    };
    el.setAttribute = function (n, v) {
      if (n === 'src') { el.src = v; }
      baseSet(n, v);
    };
    // Media stubs (STACK.md:40) — every degradation lever's target (Phase 3).
    // Plain properties so the levers read/write them like a real element.
    el.playbackRate = 1;
    el.defaultPlaybackRate = 1;
    el.volume = 1;
    el.muted = false;
    el.loop = false;
    el.autoplay = false;
    el.paused = true;
    el.currentTime = 0;
    el.duration = 10;
    el.ended = false;
    el.preservesPitch = true;
    el.play = function () { el.paused = false; };
    el.pause = function () { el.paused = true; };
    return el;
  }

  /**
   * FakeLocation — the engine's ONLY pathname source (D-02 seam): a writable
   * pathname plus the history/dispatch surface Plan 02's RouteGuard drives
   * (pushState/replaceState + popstate/hashchange). fire(type) is the test
   * helper — driven exactly like FakeClock.advance() drives time.
   *
   * Explicit-dispatch design (02-02-PLAN Task 1): setPathname(p) is a PURE
   * write — it never dispatches an event. Tests choose which signal to fire
   * (dispatchPopstate / dispatchHashchange / a window event) so the signal
   * type under test is always explicit. dispatchPopstate/dispatchHashchange
   * deliver on the WINDOW (where the engine binds popstate/hashchange —
   * real browsers fire them on the window), reached via loc._window (wired
   * by freshEnv).
   */
  function FakeLocation(pathname) {
    var listeners = {};
    var loc = {
      pathname: (pathname === undefined) ? '/' : pathname,
      history: {
        pushState: function () {},
        replaceState: function () {}
      },
      addEventListener: function (type, cb) {
        if (!listeners[type]) { listeners[type] = []; }
        listeners[type].push(cb);
      },
      removeEventListener: function (type, cb) {
        var cbs = listeners[type];
        if (!cbs) { return; }
        var idx = cbs.indexOf(cb);
        if (idx !== -1) { cbs.splice(idx, 1); }
      },
      dispatchEvent: function (event) {
        var cbs = listeners[event.type];
        if (cbs) {
          for (var i = 0; i < cbs.length; i++) { cbs[i](event); }
        }
        return true;
      },
      fire: function (type) { loc.dispatchEvent({ type: type }); },
      setPathname: function (p) { loc.pathname = p; },
      dispatchPopstate: function () { (loc._window || loc).dispatchEvent({ type: 'popstate' }); },
      dispatchHashchange: function () { (loc._window || loc).dispatchEvent({ type: 'hashchange' }); },
      // Navigation seam used by the host boot script (first-use login
      // forward): records the URL instead of navigating so tests can assert
      // the redirect happened.
      lastNavigate: null,
      replace: function (url) { loc.lastNavigate = url; },
      assign: function (url) { loc.lastNavigate = url; }
    };
    return loc;
  }

  /** FakeRAF — one flush() = one frame = one tick. */
  function FakeRAF() {
    var pending = null;
    return {
      request: function (cb) { pending = cb; },
      flush: function () {
        if (pending) {
          var cb = pending;
          pending = null;
          cb();
        }
      }
    };
  }

  var results = [];

  var assert = {
    results: results,
    equal: function (actual, expected, label) {
      var pass = (actual === expected);
      results.push({ label: label || ('equal ' + actual + ' === ' + expected), pass: pass, actual: actual, expected: expected });
      return pass;
    },
    ok: function (value, label) {
      var pass = !!value;
      results.push({ label: label || ('ok(' + value + ')'), pass: pass, actual: value, expected: true });
      return pass;
    },
    throws: function (fn, label) {
      var pass = false;
      var message = '';
      try { fn(); } catch (err) { pass = true; message = String(err && err.message || err); }
      results.push({ label: label || 'throws', pass: pass, actual: message, expected: 'an exception' });
      return pass;
    }
  };

  /**
   * renderResults — pass/fail table into containerId (consumed by
   * harness.html). Robust two-host renderer: creates the table in the given
   * container via DOM APIs using textContent (no innerHTML injection — the
   * test labels are trusted harness text, but textContent is the safe
   * default), one row per assertion, and appends a summary row with the
   * totals (passed / run).
   */
  function renderResults(containerId) {
    if (typeof document === 'undefined' || !document.getElementById) { return; }
    var container = document.getElementById(containerId);
    if (!container) { return; }
    container.textContent = '';                     // clear any prior run
    var table = document.createElement('table');
    table.setAttribute('border', '1');
    table.setAttribute('cellpadding', '4');
    table.setAttribute('cellspacing', '0');
    var header = document.createElement('tr');
    var cells = ['#', 'Assertion', 'Result'];
    for (var h = 0; h < cells.length; h++) {
      var th = document.createElement('th');
      th.textContent = cells[h];
      header.appendChild(th);
    }
    table.appendChild(header);
    var passed = 0;
    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      if (r.pass) { passed++; }
      var tr = document.createElement('tr');
      var tdNum = document.createElement('td');
      tdNum.textContent = String(i + 1);
      var tdLabel = document.createElement('td');
      tdLabel.textContent = r.label;
      var tdResult = document.createElement('td');
      tdResult.textContent = r.pass ? 'PASS' : 'FAIL';
      tdResult.style.color = r.pass ? 'green' : 'red';
      tr.appendChild(tdNum);
      tr.appendChild(tdLabel);
      tr.appendChild(tdResult);
      table.appendChild(tr);
    }
    // Summary row: totals + overall verdict.
    var summary = document.createElement('tr');
    var tdTotal = document.createElement('td');
    tdTotal.colSpan = 2;
    tdTotal.textContent = 'TOTAL: ' + passed + ' passed / ' + results.length + ' run';
    tdTotal.style.fontWeight = 'bold';
    var tdVerdict = document.createElement('td');
    var allPass = (passed === results.length);
    tdVerdict.textContent = allPass ? 'PASS' : 'FAIL';
    tdVerdict.style.color = allPass ? 'green' : 'red';
    tdVerdict.style.fontWeight = 'bold';
    summary.appendChild(tdTotal);
    summary.appendChild(tdVerdict);
    table.appendChild(summary);
    container.appendChild(table);
  }

  /**
   * injectChurn — additive Phase 5 (HARN-01) helper: pushes `count` childList
   * mutation records (the registration path — added video nodes) onto the
   * LATEST FakeMutationObserver instance, mirroring what a real feed burst
   * produces. Suites drive the deterministic 5k churn via raf.flush() — the
   * rate is derived (records ÷ frames × 60fps), never sampled (D-3).
   */
  function injectChurn(count) {
    var list = FakeMutationObserver.instances;
    if (!list.length) { throw new Error('injectChurn: no FakeMutationObserver instances'); }
    var obs = list[list.length - 1];
    var records = [];
    for (var i = 0; i < count; i++) {
      records.push({ type: 'childList', addedNodes: [FakeElement('video')], target: null });
    }
    obs.record(records);
    return count;
  }

  global.FakeClock = FakeClock;
  global.FakeDocument = FakeDocument;
  global.FakeWindow = FakeWindow;
  global.FakeMutationObserver = FakeMutationObserver;
  global.FakeRAF = FakeRAF;
  global.FakeElement = FakeElement;
  global.FakeVideoElement = FakeVideoElement;
  global.FakeLocation = FakeLocation;
  global.injectChurn = injectChurn;
  global.assert = assert;
  global.renderResults = renderResults;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      FakeClock: FakeClock,
      FakeDocument: FakeDocument,
      FakeWindow: FakeWindow,
      FakeMutationObserver: FakeMutationObserver,
      FakeRAF: FakeRAF,
      FakeElement: FakeElement,
      FakeVideoElement: FakeVideoElement,
      FakeLocation: FakeLocation,
      injectChurn: injectChurn,
      assert: assert,
      renderResults: renderResults
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);