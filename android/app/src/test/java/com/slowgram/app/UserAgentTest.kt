package com.slowgram.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure-JVM tests for the User-Agent policy: the stock WebView UA must come
 * out in the exact Chrome-on-Android form (no "; wv" marker, no "Version/N.N"
 * pseudo-token), so instagram.com serves the full mobile experience.
 */
class UserAgentTest {

    private val stockWebViewUa =
        "Mozilla/5.0 (Linux; Android 14; Pixel 7 Pro Build/AP4A.250105.002; wv) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 " +
            "Chrome/131.0.6778.200 Mobile Safari/537.36"

    @Test
    fun `strips the webview markers from the stock ua`() {
        val ua = UserAgent.chromeMobile(stockWebViewUa)
        assertFalse("'; wv' token must be stripped", ua.contains("; wv"))
        assertFalse("'Version/N.N' pseudo-token must be stripped", Regex("Version/[\\d.]").containsMatchIn(ua))
        assertTrue("engine version must be preserved", ua.contains("Chrome/131.0.6778.200"))
        assertTrue("mobile form factor must be preserved", ua.contains("Mobile Safari"))
        assertTrue(
            ua.startsWith("Mozilla/5.0 (Linux; Android 14; Pixel 7 Pro Build/AP4A.250105.002) ")
        )
    }

    @Test
    fun `a chrome-like ua passes through unchanged`() {
        val clean =
            "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/120.0.0.0 Mobile Safari/537.36"
        assertEquals(clean, UserAgent.chromeMobile(clean))
    }

    @Test
    fun `null or blank falls back`() {
        assertEquals(UserAgent.FALLBACK, UserAgent.chromeMobile(null))
        assertEquals(UserAgent.FALLBACK, UserAgent.chromeMobile(""))
        assertEquals(UserAgent.FALLBACK, UserAgent.chromeMobile("   "))
    }

    @Test
    fun `a non-chromium ua falls back`() {
        val out = UserAgent.chromeMobile("some exotic embedded browser")
        assertEquals(UserAgent.FALLBACK, out)
    }

    @Test
    fun `fallback has the modern chrome-mobile shape`() {
        val fb = UserAgent.FALLBACK
        assertTrue(fb.startsWith("Mozilla/5.0 (Linux; Android "))
        assertTrue(fb.contains("AppleWebKit/537.36 (KHTML, like Gecko) Chrome/"))
        assertTrue(fb.endsWith("Mobile Safari/537.36"))
        assertFalse(fb.contains("; wv"))
        assertFalse(Regex("Version/[\\d.]").containsMatchIn(fb))
    }
}
