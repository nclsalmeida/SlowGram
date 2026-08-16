package com.slowgram.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Pure-JVM tests for the wrapper's navigation policy and injection guard.
 *  The engine's own 878 assertions are NOT duplicated here. */
class EngineInjectorTest {

    private val fakeBoot = "// boot"
    private val injector = EngineInjector({ "/* engine */" }, { fakeBoot })

    // ---- navigation policy --------------------------------------------------

    @Test
    fun `instagram origins stay in the webview`() {
        assertEquals(
            EngineInjector.Decision.StayInWebView,
            injector.decide("https://www.instagram.com/")
        )
        assertEquals(
            EngineInjector.Decision.StayInWebView,
            injector.decide("https://instagram.com/reels/")
        )
        assertEquals(
            EngineInjector.Decision.StayInWebView,
            injector.decide("https://www.instagram.com/accounts/login/")
        )
        assertEquals(
            EngineInjector.Decision.StayInWebView,
            injector.decide("https://cdn.instagram.com/assets/")
        )
    }

    @Test
    fun `external http links are handed to the system browser`() {
        assertEquals(
            EngineInjector.Decision.OpenExternally,
            injector.decide("https://example.com/link-in-bio")
        )
        assertEquals(
            EngineInjector.Decision.OpenExternally,
            injector.decide("http://example.com/")
        )
        assertEquals(
            EngineInjector.Decision.OpenExternally,
            injector.decide("https://notinstagram.com/")
        )
    }

    @Test
    fun `non-http schemes are blocked - no native app handoff`() {
        // Native Instagram app deep link
        assertEquals(
            EngineInjector.Decision.Block,
            injector.decide("instagram://user?username=slowgram")
        )
        // intent: URL (Instagram web uses these to jump to the native app)
        assertEquals(
            EngineInjector.Decision.Block,
            injector.decide("intent://reels/#Intent;scheme=https;end")
        )
        // other external apps / actions
        assertEquals(EngineInjector.Decision.Block, injector.decide("tel:+15551234"))
        assertEquals(EngineInjector.Decision.Block, injector.decide("mailto:a@b.com"))
        assertEquals(EngineInjector.Decision.Block, injector.decide("market://details?id=x"))
    }

    @Test
    fun `internal schemes stay in webview`() {
        assertEquals(EngineInjector.Decision.StayInWebView, injector.decide("about:blank"))
        assertEquals(EngineInjector.Decision.StayInWebView, injector.decide("data:text/html,hi"))
    }

    // ---- engine host detection ----------------------------------------------

    @Test
    fun `engine host detection matches only instagram`() {
        assertTrue(injector.isEngineHost("https://www.instagram.com/"))
        assertTrue(injector.isEngineHost("https://www.instagram.com/reels/abc/"))
        assertTrue(injector.isEngineHost("https://instagram.com/"))
        assertFalse(injector.isEngineHost("https://example.com/"))
        assertFalse(injector.isEngineHost("https://notinstagram.com/"))
        assertFalse(injector.isEngineHost(null))
    }

    // ---- injection script ----------------------------------------------------

    @Test
    fun `injection script is engine plus boot, in that order`() {
        val script = injector.buildInjectionScript()
        assertTrue(script.startsWith("/* engine */"))
        assertTrue(script.endsWith(fakeBoot))
        assertTrue(script.contains("/* engine */\n\n// boot"))
    }

    @Test
    fun `real host boot asset is syntactically sound and uses the public API only`() {
        // Read the REAL asset (the one shipped in the APK) — guards against
        // Kotlin-side string mangling of the boot script.
        val moduleDir = java.io.File(System.getProperty("user.dir"))
        val boot = java.io.File(moduleDir, "src/main/assets/host-inject.js")
        assertTrue("host boot asset missing", boot.exists())
        val src = boot.readText()

        assertTrue(src.contains("SlowGram.init();"))
        assertTrue(src.contains("window.__slowgramInjected"))
        assertTrue(src.contains("div._acc8._abpk"))
        assertTrue(src.contains("i[aria-label=\"Instagram\"]"))
        assertTrue(src.contains("data-slowgram"))
        // No engine test-only handles, no DOM monkey-patching.
        assertFalse(src.contains("_setDevMode"))
        assertFalse(src.contains("_setKillSwitchForTest"))
        assertFalse(src.contains("defineProperty"))
    }

    // ---- per-page-load guard -------------------------------------------------

    @Test
    fun `guard returns the script once per page load`() {
        val first = injector.beginInjection()
        assertNotNull(first)
        val second = injector.beginInjection()
        assertNull("second call on the same page must not inject", second)
    }

    @Test
    fun `onPageStarted re-arms the guard`() {
        assertNotNull(injector.beginInjection())
        assertNull(injector.beginInjection())
        injector.onPageStarted()
        assertNotNull("a new page load must allow injection again", injector.beginInjection())
    }
}
