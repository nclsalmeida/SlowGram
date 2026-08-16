package com.slowgram.app

import java.io.File
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Single-source contract: the asset bundled into the APK must be byte-identical
 * to <repo root>/src/slowgram.js. Runs after the copy task (unit tests run in
 * the :app module dir, so paths are resolved relative to android/app).
 */
class EngineAssetIntegrityTest {

    @Test
    fun `bundled asset matches the engine source byte for byte`() {
        val moduleDir = File(System.getProperty("user.dir"))
        val asset = File(moduleDir, "src/main/assets/slowgram.js")
        val source = File(moduleDir, "../../src/slowgram.js").canonicalFile

        assertTrue("engine asset missing — did the copy task run?", asset.exists())
        assertTrue("engine source missing at ${source.absolutePath}", source.exists())

        val assetBytes = asset.readBytes()
        val sourceBytes = source.readBytes()

        assertTrue("engine asset is empty", assetBytes.isNotEmpty())
        assertArrayEquals(
            "bundled slowgram.js must be byte-identical to src/slowgram.js",
            sourceBytes,
            assetBytes
        )
    }
}
