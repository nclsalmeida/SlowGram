package com.slowgram.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout

/**
 * SlowGram host — a single fullscreen WebView pointed at instagram.com.
 *
 * The engine (src/slowgram.js) is injected after every main-frame page load
 * and started through its real public API (`SlowGram.init()`). SPA route
 * changes are handled by the engine's own RouteGuard; the wrapper never
 * re-injects on route changes (idempotent per page load via
 * [EngineInjector.beginInjection]).
 */
class MainActivity : Activity() {

    companion object {
        const val START_URL = "https://www.instagram.com/"
        private const val TAG = "SlowGram"

        /**
         * JS probe for the system-back fallback. Instagram routes via SPA
         * pushState, which Android WebView does NOT reflect in
         * canGoBack() (observed on the Pixel 7 Pro — entering a DM then
         * pressing system back finished the app). This probes the PAGE's own
         * history and only asks it to go back when there is a real previous
         * route AND the current route differs from the route the page load
         * started at — so the user can always exit the app from the entry
         * route (no back-trap).
         */
        internal fun backProbeJs(entryPathname: String): String {
            val entry = entryPathname.replace("\\", "\\\\").replace("'", "\\'")
            return "(window.history.length > 1 && location.pathname !== '$entry') " +
                "? (window.history.back(), 'true') : 'false'"
        }

        /** evaluateJavascript returns the value JSON-encoded: "true" / "false". */
        internal fun shouldFinishFromBack(probeResult: String?): Boolean =
            probeResult != "\"true\""
    }

    private lateinit var webView: WebView
    private lateinit var injector: EngineInjector
    private var entryPathname: String? = null   // route this page load started at
    private var pageLoadCompleted = false       // first onPageFinished per load
    private var backCallback: OnBackInvokedCallback? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Dev-only: allow chrome://inspect (WebView devtools) in debug builds
        // so the host's DOM can be inspected during development. Never in
        // release: BuildConfig.DEBUG is false there.
        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        injector = EngineInjector(
            engineSourceProvider = {
                assets.open(EngineInjector.ENGINE_ASSET).bufferedReader().use { it.readText() }
            },
            bootScriptProvider = {
                assets.open(EngineInjector.HOST_BOOT_ASSET).bufferedReader().use { it.readText() }
            }
        )

        webView = WebView(this).apply { id = R.id.webview }
        configureWebView(webView)

        // Fullscreen WebView only — no floating chrome over the Instagram UI.
        // Settings & privacy are reachable via the launcher shortcut
        // (long-press the app icon -> "Configurações e privacidade").
        //
        // The insets listener goes on the CONTAINER, never on the WebView
        // itself: Chromium owns an internal insets listener on the WebView
        // view and replaces any we attach there on page reload (observed on
        // the Pixel 7 Pro — the content slid back under the status bar after
        // a reload). The container's padding persists regardless.
        //
        // System back: on targetSdk 35+ (Android 15) onBackPressed() is NO
        // LONGER invoked — the system routes back to OnBackInvokedCallback
        // and its default action finishes the activity (the app closed when
        // pressing back inside a DM). Register our own callback so back
        // navigates WebView/SPA history instead of closing. onBackPressed()
        // remains as the fallback path for API 24-32.
        if (Build.VERSION.SDK_INT >= 33) {
            backCallback = OnBackInvokedCallback { handleBack() }
            onBackInvokedDispatcher.registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback!!
            )
        }
        val root = FrameLayout(this)
        root.addView(
            webView,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )
        setContentView(root)
        applySystemBarsInsets(root)

        if (savedInstanceState == null) {
            webView.loadUrl(START_URL)
        }
        // A non-null savedInstanceState is restored in
        // onRestoreInstanceState (the framework calls it right after onCreate).
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView(wv: WebView) {
        val s = wv.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        // instagram.com is HTTPS end-to-end; never allow mixed content.
        s.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        // User agent: intentionally the DEFAULT WebView UA for now
        // (user decision #3) — switch to a Chrome-mobile UA only if real
        // testing shows instagram.com does not deliver the web app.

        wv.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                injector.onPageStarted()
                entryPathname = null
                pageLoadCompleted = false
            }

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean = handleNavigation(request.url.toString())

            @Suppress("OVERRIDE_DEPRECATION")
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean =
                handleNavigation(url)

            override fun onPageFinished(view: WebView, url: String?) {
                // Diagnostic (always logged, before the host guard) so on-device
                // URL/redirect issues are visible in Logcat.
                Log.d(TAG, "[nav] onPageFinished url=$url viewUrl=${view.url}")
                if (injector.isEngineHost(url) || injector.isEngineHost(view.url)) {
                    if (!pageLoadCompleted) {
                        pageLoadCompleted = true
                        entryPathname = pathnameOf(url ?: view.url)
                    }
                    injector.injectIfNeeded(view)
                }
            }
        }

        wv.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: ConsoleMessage): Boolean {
                Log.d(TAG, "[console] ${consoleMessage.message()}")
                return true
            }
        }

        // Diagnostic-only JS interface (Logcat observability). Debug builds
        // only (P2-3, audit 2026-08): in release, the injected page
        // (instagram.com) must not be able to reach ANY Java-side object — a
        // release JavaScript interface is an attack surface with zero product
        // value. host-inject.js already guards the ping with
        // `if (window.SlowGramBridge)`, so the boot is unaffected in release.
        if (BuildConfig.DEBUG) {
            wv.addJavascriptInterface(EngineStatusBridge(), EngineStatusBridge.NAME)
        }
    }

    private fun handleNavigation(url: String): Boolean {
        Log.d(TAG, "[nav] decide url=$url")
        return when (injector.decide(url)) {
            EngineInjector.Decision.StayInWebView -> false
            EngineInjector.Decision.OpenExternally -> {
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                } catch (_: ActivityNotFoundException) {
                    Log.w(TAG, "no handler for external URL: $url")
                }
                true
            }
            EngineInjector.Decision.Block -> true
        }
    }



    /**
     * Android 15+ (targetSdk 35+) enforces edge-to-edge: the window draws
     * behind the status bar and gesture nav. Instagram Web assumes a classic
     * viewport, so its header ends up UNDER the system icons (observed on the
     * Pixel 7 Pro: the notifications icon mixes with the wifi/battery icons).
     *
     * Fix: inset the root by the system-bars insets so the WebView behaves
     * like a classic browser — content below the status bar, above the
     * gesture bar. Platform APIs only (no androidx dependency).
     */
    private fun applySystemBarsInsets(target: View) {
        if (Build.VERSION.SDK_INT >= 30) {
            target.setOnApplyWindowInsetsListener { v, insets ->
                val bars = insets.getInsets(android.view.WindowInsets.Type.systemBars())
                v.setPadding(0, bars.top, 0, bars.bottom)
                insets
            }
        } else {
            target.setOnApplyWindowInsetsListener { v, insets ->
                v.setPadding(0, insets.systemWindowInsetTop, 0, insets.systemWindowInsetBottom)
                insets
            }
        }
        target.requestApplyInsets()
    }

    // ---- lifecycle -----------------------------------------------------------

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onRestoreInstanceState(savedInstanceState: Bundle) {
        super.onRestoreInstanceState(savedInstanceState)
        webView.restoreState(savedInstanceState)
        // restoreState does not fire onPageFinished, so re-arm injection
        // manually for the restored page.
        injector.onPageStarted()
        webView.post { injector.injectIfNeeded(webView) }
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onDestroy() {
        if (Build.VERSION.SDK_INT >= 33) {
            backCallback?.let { onBackInvokedDispatcher.unregisterOnBackInvokedCallback(it) }
        }
        webView.destroy()
        super.onDestroy()
    }

    private fun pathnameOf(url: String?): String? =
        runCatching { Uri.parse(url).path }.getOrNull()

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        handleBack()   // API 24-32 legacy path (API 33+ uses the callback)
    }

    private fun handleBack() {
        // 1. Native WebView history (full page loads).
        if (webView.canGoBack()) {
            webView.goBack()
            return
        }
        // 2. SPA history (Instagram's pushState routes are invisible to
        //    canGoBack()). Ask the page to go back only when there is a real
        //    previous route and we are not on the entry route — otherwise the
        //    user could never exit. The probe is async; finish only when it
        //    definitively says there is nowhere to go.
        val entry = entryPathname ?: run {
            finish()
            return
        }
        webView.evaluateJavascript(backProbeJs(entry)) { result ->
            if (shouldFinishFromBack(result)) finish()
        }
    }
}
