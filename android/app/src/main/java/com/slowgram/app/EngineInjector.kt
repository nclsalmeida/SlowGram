package com.slowgram.app

import java.net.URI
import android.webkit.WebView

/**
 * Navigation + engine-injection policy for the SlowGram WebView host.
 *
 * Pure policy logic lives here (no Activity/framework wiring) so it can be
 * unit-tested on the JVM. The WebView-specific parts stay in [MainActivity].
 *
 * ## Navigation policy (conservative — user-approved)
 *
 * - `http`/`https` on instagram.com or any *.instagram.com subdomain stay in
 *   the WebView. This keeps login, consent, SPA routes and profile links
 *   working exactly as on instagram.com in any browser.
 * - `http`/`https` on ANY other host are handed to the system browser via
 *   ACTION_VIEW (link-in-bio and similar). They are deliberately NOT loaded
 *   inside the app, so the WebView never becomes a generic browser.
 * - Every NON-http scheme is blocked outright (never resolved): this is what
 *   prevents the native Instagram app / intent hand-off (instagram://,
 *   intent://) and other external apps (tel:, mailto:, market:, ...).
 *
 * ## Engine injection
 *
 * The engine's public API is `SlowGram.init()` (idempotent, resolves its own
 * DI seam against the real browser globals). The wrapper:
 * - evaluates `slowgram.js` + `host-inject.js` once per page load
 *   ([beginInjection] guard — no double injection, no multi-instance);
 * - NEVER re-injects on SPA route changes (the engine's RouteGuard handles
 *   pushState/popstate internally);
 * - only injects on instagram.com hosts ([isEngineHost]).
 *
 * `host-inject.js` is the wrapper's boot script (cosmetic CSS shims +
 * SlowGram.init). It lives as a real .js asset so it is syntax-checked and
 * boot-tested by the Node suite (test/host-inject.test.js) — the previous
 * Kotlin-string version silently broke when a CSS rule containing `"`
 * closed a JS string early.
 */
class EngineInjector(
    private val engineSourceProvider: () -> String,
    private val bootScriptProvider: () -> String,
) {

    companion object {
        const val ENGINE_ASSET = "slowgram.js"
        const val HOST_BOOT_ASSET = "host-inject.js"
        const val ALLOWED_HOST = "instagram.com"
    }

    /** What the host should do with a navigation attempt. */
    sealed class Decision {
        /** Load in the WebView (instagram.com only). */
        data object StayInWebView : Decision()

        /** Hand to the system browser (ACTION_VIEW) — external http(s). */
        data object OpenExternally : Decision()

        /** Do nothing — non-http schemes (native-app hand-off vector). */
        data object Block : Decision()
    }

    /**
     * Navigation decision for a URL string. Parsed with java.net.URI so the
     * policy is pure JVM (no android.net.Uri) — trivially testable.
     */
    fun decide(url: String): Decision {
        val uri = runCatching { URI(url) }.getOrNull()
            ?: return Decision.StayInWebView      // unparsable → don't hand off
        val scheme = uri.scheme?.lowercase()
            ?: return Decision.StayInWebView      // relative / scheme-less
        if (scheme == "http" || scheme == "https") {
            val host = uri.host?.lowercase()
                ?: return Decision.StayInWebView
            return if (host == ALLOWED_HOST || host.endsWith(".$ALLOWED_HOST")) {
                Decision.StayInWebView
            } else {
                Decision.OpenExternally
            }
        }
        // Internal-ish schemes can never hand off to a native app.
        if (scheme == "about" || scheme == "data") return Decision.StayInWebView
        return Decision.Block
    }

    /** True when the URL belongs to the surface the engine is allowed to run on. */
    fun isEngineHost(url: String?): Boolean {
        val u = url ?: return false
        val uri = runCatching { URI(u) }.getOrNull() ?: return false
        val host = uri.host?.lowercase() ?: return false
        return host == ALLOWED_HOST || host.endsWith(".$ALLOWED_HOST")
    }

    /** Engine source + host boot script, ready for evaluateJavascript. */
    fun buildInjectionScript(): String =
        engineSourceProvider() + "\n\n" + bootScriptProvider()

    // ---- per-page-load guard ------------------------------------------------

    private var injected = false

    /** Call from WebViewClient.onPageStarted: a new document invalidates the guard. */
    fun onPageStarted() {
        injected = false
    }

    /**
     * Returns the injection script exactly once per page load; null afterwards
     * until the next [onPageStarted]. The guard is set BEFORE evaluation, so a
     * re-entrant call can never double-inject.
     */
    fun beginInjection(): String? {
        if (injected) return null
        injected = true
        return buildInjectionScript()
    }

    // Kept for wiring convenience in host code that still holds a WebView ref.
    fun injectIfNeeded(webView: WebView) {
        val script = beginInjection()
        if (script != null) {
            android.util.Log.d("SlowGram", "[inject] evaluating engine+boot (${script.length} chars)")
            webView.evaluateJavascript(script, null)
        } else {
            android.util.Log.d("SlowGram", "[inject] skipped (guard)")
        }
    }
}
