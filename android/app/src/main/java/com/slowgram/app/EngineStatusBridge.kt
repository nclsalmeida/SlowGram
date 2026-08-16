package com.slowgram.app

import android.util.Log
import android.webkit.JavascriptInterface

/**
 * Validation/observability-only bridge. The injected engine reports its
 * PUBLIC state (SlowGram.getState()) here after init so a developer can
 * confirm the engine is alive from Logcat (`adb logcat -s SlowGram`).
 *
 * Nothing leaves the device: the payload is written to Logcat and discarded.
 */
class EngineStatusBridge {

    companion object {
        /** The window.JS bridge name host-inject.js pings (debug builds only). */
        const val NAME = "SlowGramBridge"
    }

    @JavascriptInterface
    fun onEngineStatus(json: String) {
        Log.d("SlowGram", "engine status: $json")
    }
}
