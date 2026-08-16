/**
 * Host-boot E2E (wrapper side, not engine tests): evaluates the REAL engine
 * (src/slowgram.js) + the REAL Android host boot script
 * (android/app/src/main/assets/host-inject.js) in the harness's fake browser
 * environment and asserts the pair boots cleanly.
 *
 * This is the regression guard for the class of bug where Kotlin string
 * interpolation breaks the injected JS (a CSS rule containing `"` once closed
 * a JS string early, silently killing SlowGram.init on device).
 *
 * Run: node test/host-inject.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const harness = require('./harness.js');

const engine = fs.readFileSync(path.join(__dirname, '..', 'src', 'slowgram.js'), 'utf8');
const boot = fs.readFileSync(
  path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'host-inject.js'),
  'utf8'
);

const {
  FakeElement, FakeDocument, FakeWindow, FakeLocation,
  FakeMutationObserver, FakeClock
} = harness;

// ---- fake browser environment (same shape the engine's DI seam expects) ----
const root = FakeElement('div', {}, []);
const feed = FakeElement('main', { role: 'main' }, []);
root.appendChild(feed);

const doc = FakeDocument({ visibilityState: 'visible', root: root });
doc.head = FakeElement('head');           // host boot appends its <style> here
doc.documentElement = FakeElement('html');

const win = FakeWindow();
const loc = FakeLocation('/');
loc._window = win;
win.location = loc;

const clock = FakeClock(1000000);

global.window = win;
global.document = doc;
global.MutationObserver = FakeMutationObserver;
global.requestAnimationFrame = function (cb) { cb(); };   // poll exits (not running)

// ---- evaluate the exact pair the Android wrapper ships ----------------------
eval(engine + '\n\n' + boot);

const results = [];
function check(name, cond) { results.push([name, !!cond]); }

const sg = win.SlowGram;
check('SlowGram exposed on window', typeof sg === 'object' && sg !== null);
check('SlowGram.init is a function', typeof sg.init === 'function');

const st = sg.getState();
check('init ran (context UNKNOWN on /)', st.context === 'UNKNOWN');
check('phase is 0', st.phase === 0);

const style = doc.head.children[0];
check('host-shim <style> appended to head',
  !!style && style.tagName === 'STYLE' && style.getAttribute('data-slowgram') === 'host-shim');
check('banner-hiding CSS present',
  !!style && style.textContent.indexOf('div._acc8._abpk') !== -1 &&
    style.textContent.indexOf('display: none !important') !== -1);
check('wordmark-white CSS present',
  !!style && style.textContent.indexOf('i[aria-label="Instagram"]') !== -1 &&
    style.textContent.indexOf('brightness(0) invert(1)') !== -1);
check('reels-caption-lift CSS present',
  !!style && style.textContent.indexOf('xpqajaz') !== -1 &&
    style.textContent.indexOf('xtijo5x') !== -1 &&
    style.textContent.indexOf('padding-bottom: 93px') !== -1);

// ---- first-use login forward (interstitial auto-redirect) -------------------
// The logged-out landing interstitial ("Abrir Instagram" + "Entrar ou
// cadastrar-se") is useless inside the WebView (its button hands off to the
// native app, which we block). The boot script must auto-forward to the
// login screen — but never on auth routes and never more than once.
// The redirect is asserted via FakeLocation.lastNavigate (the harness
// records instead of navigating).
var interstitialBody = FakeElement('body', {}, []);
interstitialBody.innerText = 'Compartilhe momentos do dia a dia apenas com seus' +
  ' amigos próximos. Abrir Instagram Entrar ou cadastrar-se from Meta';

// Each case simulates a FRESH page load: the per-page injection guard
// (__slowgramInjected, asserted above) is reset so the boot body actually
// runs — exactly what a new document does in the WebView.
// FakeMutationObserver never fires on its own: tests drive the observer
// callback manually to simulate the async interstitial rendering.

// Case 1a: interstitial ALREADY rendered at boot -> forwards immediately.
win.__slowgramInjected = false;
win.__slowgramLoginRedirected = undefined;
loc.lastNavigate = null;
loc.setPathname('/');
doc.body.innerText = interstitialBody.innerText;
eval(boot);
check('interstitial already rendered -> immediate forward',
  loc.lastNavigate === 'https://www.instagram.com/accounts/login/' &&
    win.__slowgramLoginRedirected === true);

// Case 1b: interstitial renders AFTER boot (async, the real on-device
// case: body empty at onPageFinished) -> observer reacts to the mutation.
win.__slowgramInjected = false;
win.__slowgramLoginRedirected = undefined;
loc.lastNavigate = null;
loc.setPathname('/');
doc.body.innerText = '';                     // empty at boot, like on-device
var obsBefore = FakeMutationObserver.instances.length;
eval(boot);
check('no forward while body empty', loc.lastNavigate === null);
check('observer armed for late render',
  FakeMutationObserver.instances.length === obsBefore + 1);
doc.body.innerText = interstitialBody.innerText;   // interstitial renders now
var obs = FakeMutationObserver.instances[FakeMutationObserver.instances.length - 1];
obs.callback([{ type: 'childList' }]);
check('late render -> forward on mutation',
  loc.lastNavigate === 'https://www.instagram.com/accounts/login/');

// Case 2: already on an auth route -> never forwards (no loop) and never
// arms the observer.
win.__slowgramInjected = false;
win.__slowgramLoginRedirected = undefined;
loc.lastNavigate = null;
loc.setPathname('/accounts/login/');
doc.body.innerText = 'Log in to Instagram';  // "Log in" alone must NOT trigger
var obsBefore2 = FakeMutationObserver.instances.length;
eval(boot);
check('no forward on auth route (loop guard)', loc.lastNavigate === null);
check('no observer armed on auth route',
  FakeMutationObserver.instances.length === obsBefore2);

// Case 3: logged-in surface (no interstitial) -> never forwards.
win.__slowgramInjected = false;
win.__slowgramLoginRedirected = undefined;
loc.lastNavigate = null;
loc.setPathname('/');
doc.body.innerText = 'Home feed';
eval(boot);
check('no forward on normal pages', loc.lastNavigate === null);

// Case 4: double-injection on the SAME interstitial page -> forwards once.
win.__slowgramInjected = false;
win.__slowgramLoginRedirected = undefined;
loc.lastNavigate = null;
loc.setPathname('/');
doc.body.innerText = 'Abrir Instagram Entrar ou cadastrar-se';
eval(boot);          // runs: interstitial detected -> forwards, flag set
eval(boot);          // same page: guard -> no-op
check('forward happens exactly once per page',
  loc.lastNavigate === 'https://www.instagram.com/accounts/login/');

// ---- double-injection guard + listener hygiene ------------------------------
// The engine binds visibilitychange twice on the document by design
// (lifecycle clock + overlay). The guard must keep that count stable on a
// second boot — no stacking.
const visBefore = doc.listenerCount('visibilitychange');
const before = win.SlowGram;
eval(boot);                                    // same page: must be a no-op
check('double-injection guard keeps one instance', win.SlowGram === before);
check('no listener stacking on re-boot',
  doc.listenerCount('visibilitychange') === visBefore && visBefore === 2);

const failed = results.filter(function (r) { return !r[1]; });
console.log('host-inject: ' + (results.length - failed.length) + ' passed / ' + results.length + ' run');
if (failed.length > 0) {
  failed.forEach(function (f) { console.error('  FAIL: ' + f[0]); });
  process.exit(1);
}
