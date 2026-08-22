package com.slowgram.app

import android.content.res.Configuration
import android.view.View
import android.webkit.WebSettings
import android.webkit.WebView
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/**
 * Wrapper-only Robolectric tests: Activity creation, WebView configuration,
 * navigation wiring. Real WebView rendering / Instagram behavior is NOT
 * exercised here — that is covered by the device checklist in the README.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MainActivityTest {

    @Test
    fun `activity creates a webview with engine settings`() {
        val activity = Robolectric.buildActivity(MainActivity::class.java).setup().get()
        val webView = activity.findViewById<WebView>(R.id.webview)

        assertNotNull("WebView must exist", webView)
        assertEquals("JavaScript must be enabled", true, webView.settings.javaScriptEnabled)
        assertEquals("DOM storage must be enabled", true, webView.settings.domStorageEnabled)
        assertEquals(
            "mixed content must never be allowed",
            WebSettings.MIXED_CONTENT_NEVER_ALLOW,
            webView.settings.mixedContentMode
        )
    }

    @Test
    fun `webview is configured for the full media experience`() {
        // v1.1: uploads (DM/feed/stories), autoplay and storage surfaces.
        val activity = Robolectric.buildActivity(MainActivity::class.java).setup().get()
        val webView = activity.findViewById<WebView>(R.id.webview)
        val s = webView.settings

        assertTrue("databaseEnabled must be on (compat surface)", s.databaseEnabled)
        assertTrue("allowFileAccess must be on (nav policy still blocks file://)", s.allowFileAccess)
        assertTrue("allowContentAccess must be on (picker thumbnails)", s.allowContentAccess)
        assertFalse(
            "Reels autoplay must not require a user gesture",
            s.mediaPlaybackRequiresUserGesture
        )
    }

    @Test
    fun `user agent is presented as chrome mobile`() {
        // v1.1 decision: instagram.com must not see the restricted WebView UA.
        val activity = Robolectric.buildActivity(MainActivity::class.java).setup().get()
        val webView = activity.findViewById<WebView>(R.id.webview)
        val ua = webView.settings.userAgentString

        assertTrue("UA must identify as Chromium", ua.contains("Chrome/"))
        assertFalse("the '; wv' marker must be stripped", ua.contains("; wv"))
        assertFalse(
            "the Version/N.N pseudo-token must be stripped",
            Regex("Version/[\\d.]").containsMatchIn(ua)
        )
        assertTrue("must remain an Android UA", ua.contains("Android"))
    }

    @Test
    fun `diagnostic bridge is exposed only in debug builds`() {
        // P2-3 (audit 2026-08): the EngineStatusBridge JavaScript interface is
        // Logcat-only observability. It must NEVER ship in release — the
        // injected page (instagram.com) would be able to reach a Java-side
        // object with zero product value. This test runs under BOTH variants
        // (testDebugUnitTest + testReleaseUnitTest): in debug BuildConfig.
        // DEBUG=true and the interface must be present; in release it must be
        // absent — an unconditional addJavascriptInterface fails this else
        // branch on the release run.
        val activity = Robolectric.buildActivity(MainActivity::class.java).setup().get()
        val webView = activity.findViewById<WebView>(R.id.webview)
        val bridge = shadowOf(webView).getJavascriptInterface(EngineStatusBridge.NAME)
        if (BuildConfig.DEBUG) {
            assertNotNull("debug build exposes the diagnostic bridge", bridge)
        } else {
            assertNull(
                "release build must NOT expose any JavaScript interface (P2-3)",
                bridge
            )
        }
    }

    @Test
    fun `activity loads the instagram start url`() {
        val activity = Robolectric.buildActivity(MainActivity::class.java).setup().get()
        val webView = activity.findViewById<WebView>(R.id.webview)
        assertEquals(MainActivity.START_URL, shadowOf(webView).lastLoadedUrl)
    }

    @Test
    fun `back probe uses the page history only off the entry route`() {
        val js = MainActivity.backProbeJs("/direct/inbox/")
        assertTrue(js.contains("history.length > 1"))
        assertTrue(js.contains("location.pathname !== '/direct/inbox/'"))
        assertTrue(js.contains("history.back()"))
        // No back-trap: when the probe returns false, the activity finishes.
        assertEquals(false, MainActivity.shouldFinishFromBack("\"true\""))
        assertEquals(true, MainActivity.shouldFinishFromBack("\"false\""))
        assertEquals(true, MainActivity.shouldFinishFromBack(null))
    }

    @Test
    fun `settings activity renders privacy and about content`() {
        val activity = Robolectric.buildActivity(SettingsActivity::class.java).setup().get()
        val github = activity.findViewById<View>(R.id.settings_github_button)
        assertNotNull("settings screen must show the GitHub button", github)
    }

    @Test
    fun `activity lifecycle tolerates configuration change`() {
        // Rotation/config change: the activity must survive save/restore
        // without crashing (WebView state round-trip). Robolectric drives the
        // full onSaveInstanceState -> recreate -> onRestoreInstanceState path.
        val controller = Robolectric.buildActivity(MainActivity::class.java)
        controller.setup()
        controller.configurationChange(Configuration())
        assertNotNull(controller.get().findViewById<WebView>(R.id.webview))
    }
}
