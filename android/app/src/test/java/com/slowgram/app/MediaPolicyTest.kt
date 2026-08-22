package com.slowgram.app

import android.Manifest
import android.webkit.PermissionRequest
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure-JVM tests for the media-surface policy: WebKit resource mapping,
 * per-API-level storage permissions and the upload mime-type contract.
 * (The ActivityResult plumbing itself needs a device — covered by the
 * README device checklist.)
 */
class MediaPolicyTest {

    // ---- WebRTC resource -> Android permission ------------------------------

    @Test
    fun `video capture maps to camera`() {
        assertEquals(
            listOf(Manifest.permission.CAMERA),
            MainActivity.androidPermissionsForWebResources(
                arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
            )
        )
    }

    @Test
    fun `audio capture maps to record audio`() {
        assertEquals(
            listOf(Manifest.permission.RECORD_AUDIO),
            MainActivity.androidPermissionsForWebResources(
                arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
            )
        )
    }

    @Test
    fun `unknown resources map to nothing - never granted blindly`() {
        assertTrue(
            MainActivity.androidPermissionsForWebResources(
                arrayOf("android.webkit.resource.SOMETHING_ELSE")
            ).isEmpty()
        )
    }

    @Test
    fun `mixed request deduplicates permissions`() {
        assertEquals(
            listOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO),
            MainActivity.androidPermissionsForWebResources(
                arrayOf(
                    PermissionRequest.RESOURCE_VIDEO_CAPTURE,
                    PermissionRequest.RESOURCE_AUDIO_CAPTURE,
                    PermissionRequest.RESOURCE_VIDEO_CAPTURE
                )
            )
        )
    }

    @Test
    fun `grantable resources are the camera-mic intersection in order`() {
        assertArrayEquals(
            arrayOf(
                PermissionRequest.RESOURCE_VIDEO_CAPTURE,
                PermissionRequest.RESOURCE_AUDIO_CAPTURE
            ),
            MainActivity.webGrantableResources(
                arrayOf(
                    "android.webkit.resource.PROTECTED_MEDIA_ID",
                    PermissionRequest.RESOURCE_VIDEO_CAPTURE,
                    "android.webkit.resource.SOMETHING_ELSE",
                    PermissionRequest.RESOURCE_AUDIO_CAPTURE
                )
            )
        )
    }

    // ---- storage permissions per API level ----------------------------------

    @Test
    fun `api below 33 uses the legacy read permission`() {
        assertEquals(
            listOf(Manifest.permission.READ_EXTERNAL_STORAGE),
            MainActivity.mediaReadPermissions(32)
        )
    }

    @Test
    fun `api 33+ uses the granular media permissions`() {
        assertEquals(
            listOf(
                Manifest.permission.READ_MEDIA_IMAGES,
                Manifest.permission.READ_MEDIA_VIDEO
            ),
            MainActivity.mediaReadPermissions(33)
        )
        assertEquals(MainActivity.mediaReadPermissions(33), MainActivity.mediaReadPermissions(36))
    }

    // ---- upload chooser contract ---------------------------------------------

    @Test
    fun `upload chooser accepts images and videos`() {
        assertTrue(MainActivity.UPLOAD_MIME_TYPES.contains("image/*"))
        assertTrue(MainActivity.UPLOAD_MIME_TYPES.contains("video/*"))
        assertEquals(2, MainActivity.UPLOAD_MIME_TYPES.size)
    }
}
