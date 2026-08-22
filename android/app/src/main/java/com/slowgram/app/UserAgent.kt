package com.slowgram.app

/**
 * User-Agent policy (pure logic, JVM-testable — no Android framework types).
 *
 * The stock Android WebView UA marks itself with the "; wv" token plus a
 * "Version/4.0" pseudo-token. instagram.com treats those markers as "limited
 * embedded browser" and restricts features (media upload surfaces among
 * them). Stripping exactly those two tokens turns the WebView UA into the
 * exact Chrome-on-Android form — same Chromium engine, honest version
 * numbers, nothing spoofed beyond what the runtime really is.
 *
 * Deriving from the LIVE WebView UA (instead of hardcoding a frozen
 * "Chrome/125..." string) keeps engine/build versions current for the life
 * of the installed WebView. The hardcoded string is only a fallback for the
 * pathological case where the host reports no usable Chromium UA.
 */
object UserAgent {

    /**
     * Fallback UA (shape per the v1.1 spec): modern mobile Chrome on a
     * generic Android device. Only used when the WebView default is blank or
     * not Chromium-derived.
     */
    const val FALLBACK: String =
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/125.0.0.0 Mobile Safari/537.36"

    /**
     * Transforms the stock WebView UA into the equivalent Chrome-mobile UA.
     *
     * Example (stock):
     *   Mozilla/5.0 (Linux; Android 14; Pixel 7 Pro; wv) AppleWebKit/537.36
     *   (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36
     * Result:
     *   Mozilla/5.0 (Linux; Android 14; Pixel 7 Pro) AppleWebKit/537.36
     *   (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36
     */
    fun chromeMobile(defaultUa: String?): String {
        val base = defaultUa?.trim().orEmpty()
        if (!base.contains("Chrome/") || !base.contains("AppleWebKit")) return FALLBACK
        return base
            .replace("; wv)", ")")                      // WebView marker token
            .replace(Regex("""\s*Version/[\d.]+"""), "")  // WebView-only pseudo token
            .replace(Regex("""\s{2,}"""), " ")             // collapse leftover runs
            .trim()
    }
}
