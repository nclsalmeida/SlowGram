package com.slowgram.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import java.io.File

/**
 * SlowGram host — a single fullscreen WebView pointed at instagram.com.
 *
 * The engine (src/slowgram.js) is injected after every main-frame page load
 * and started through its real public API (`SlowGram.init()`). SPA route
 * changes are handled by the engine's own RouteGuard; the wrapper never
 * re-injects on route changes (idempotent per page load via
 * [EngineInjector.beginInjection]).
 *
 * Media surface (v1.1): the WebChromeClient implements file-chooser uploads
 * (DM attachments, feed/stories posts), native camera capture as a chooser
 * source, and WebRTC getUserMedia permission requests — all gated behind
 * runtime permissions asked at the moment of use, never up front.
 */
class MainActivity : ComponentActivity() {

    companion object {
        const val START_URL = "https://www.instagram.com/"
        private const val TAG = "SlowGram"

        /** Media types accepted by the upload chooser (photos AND videos). */
        internal val UPLOAD_MIME_TYPES = arrayOf("image/*", "video/*")

        private const val REQ_WEB_PERMISSIONS = 7001    // WebRTC (getUserMedia)
        private const val REQ_MEDIA_PERMISSIONS = 7002  // upload/capture gate

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

        /**
         * Pure mapping: WebKit permission resources -> Android runtime
         * permissions. Unknown resources are ignored (never granted blindly).
         */
        internal fun androidPermissionsForWebResources(resources: Array<String>): List<String> =
            resources.mapNotNull { resource ->
                when (resource) {
                    PermissionRequest.RESOURCE_VIDEO_CAPTURE -> Manifest.permission.CAMERA
                    PermissionRequest.RESOURCE_AUDIO_CAPTURE -> Manifest.permission.RECORD_AUDIO
                    else -> null
                }
            }.distinct()

        /** Storage permissions that gate media attach on this API level. */
        internal fun mediaReadPermissions(sdkInt: Int): List<String> =
            if (sdkInt >= 33) {
                listOf(
                    Manifest.permission.READ_MEDIA_IMAGES,
                    Manifest.permission.READ_MEDIA_VIDEO
                )
            } else {
                listOf(Manifest.permission.READ_EXTERNAL_STORAGE)
            }

        /** Intersection of the requested resources with camera/mic (order kept). */
        internal fun webGrantableResources(resources: Array<String>): Array<String> =
            resources.filter { it == PermissionRequest.RESOURCE_VIDEO_CAPTURE ||
                it == PermissionRequest.RESOURCE_AUDIO_CAPTURE }.toTypedArray()
    }

    private lateinit var webView: WebView
    private lateinit var injector: EngineInjector
    private var entryPathname: String? = null   // route this page load started at
    private var pageLoadCompleted = false       // first onPageFinished per load
    private var backCallback: OnBackInvokedCallback? = null

    // ---- media uploads (v1.1) ------------------------------------------------

    /** In-flight file-chooser callback; MUST be resolved exactly once or the
     *  WebView silently stops delivering future choosers. */
    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    /** FileProvider target for an in-flight ACTION_IMAGE_CAPTURE (uri + file). */
    private var pendingCaptureImage: Pair<Uri, File>? = null

    /** WebRTC request parked while the Android runtime dialog is showing. */
    private var pendingWebPermissionRequest: PermissionRequest? = null

    /**
     * Single launcher for every chooser variant (SAF gallery picker and the
     * camera-capture initial intents wrapped in a system chooser).
     */
    private val fileChooserLauncher: ActivityResultLauncher<Intent> =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            onFileChooserResult(result.resultCode, result.data)
        }

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
        s.databaseEnabled = true
        // Uploads/rendering compat surface. Navigation policy (handleNavigation)
        // still blocks file:// loads — this flag only unlocks the WebView's
        // internal file affordances that some web features expect.
        s.allowFileAccess = true
        // content:// results returned by the media picker must be readable by
        // the page (thumbnails of picked photos/videos).
        s.allowContentAccess = true
        // Instagram autoplays Reels; do not require a tap per video.
        s.mediaPlaybackRequiresUserGesture = false
        // instagram.com is HTTPS end-to-end; never allow mixed content.
        s.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        // v1.1 decision (supersedes "keep default UA"): present the exact
        // Chrome-on-Android UA form so instagram.com serves the full mobile
        // web experience incl. media upload surfaces. See [UserAgent].
        s.userAgentString = UserAgent.chromeMobile(s.userAgentString)
        Log.d(TAG, "[ua] ${s.userAgentString}")

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

            // ---- media uploads: DM attachments, feed & stories posts ----
            override fun onShowFileChooser(
                webView: WebView?,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                Log.d(TAG, "[upload] file chooser requested mode=${params.mode}")
                return launchFileChooser(callback, params)
            }

            // ---- WebRTC: stories/DM camera & mic (getUserMedia) ----
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread { handleWebPermissionRequest(request) }
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

    // ---- media uploads -------------------------------------------------------

    /**
     * Opens the system media chooser for an Instagram upload input.
     *
     * Permission model: the SAF picker itself needs NO storage permission, so
     * it opens immediately regardless. The missing runtime permissions are
     * requested at the same moment (before invoking the chooser); while not
     * granted, camera-capture sources are simply absent from the chooser and
     * appear automatically once granted.
     */
    private fun launchFileChooser(
        callback: ValueCallback<Array<Uri>>,
        params: WebChromeClient.FileChooserParams
    ): Boolean {
        // A stale callback (previous chooser never resolved) must be released
        // first, or future uploads silently no-op.
        filePathCallback?.onReceiveValue(null)
        filePathCallback = callback

        requestMediaPermissionsIfNeeded()

        return try {
            fileChooserLauncher.launch(buildUploadIntent(params))
            true
        } catch (e: ActivityNotFoundException) {
            Log.w(TAG, "[upload] no activity handles the media chooser", e)
            filePathCallback = null
            callback.onReceiveValue(null)
            true   // consumed: we resolved the callback ourselves
        } catch (e: Exception) {
            Log.w(TAG, "[upload] could not launch chooser", e)
            filePathCallback = null
            callback.onReceiveValue(null)
            true
        }
    }

    /** Gallery intent (images and videos) plus capture sources when allowed. */
    private fun buildUploadIntent(params: WebChromeClient.FileChooserParams): Intent {
        val gallery = Intent(Intent.ACTION_GET_CONTENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(Intent.EXTRA_MIME_TYPES, UPLOAD_MIME_TYPES)
            putExtra(
                Intent.EXTRA_ALLOW_MULTIPLE,
                params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE
            )
        }

        val sources = mutableListOf<Intent>()
        if (isGranted(Manifest.permission.CAMERA)) {
            createCaptureOutput()?.let { (uri, file) ->
                pendingCaptureImage = uri to file
                sources += Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
                    putExtra(MediaStore.EXTRA_OUTPUT, uri)
                    addFlags(
                        Intent.FLAG_GRANT_READ_URI_PERMISSION or
                            Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                    )
                }
            }
            // Video capture returns its own Uri in result data — no provider needed.
            sources += Intent(MediaStore.ACTION_VIDEO_CAPTURE)
        } else {
            Log.d(TAG, "[upload] CAMERA not granted yet — capture sources hidden")
        }

        val title = params.title ?: getString(R.string.upload_chooser_title)
        return if (sources.isEmpty()) {
            gallery
        } else {
            Intent.createChooser(gallery, title).apply {
                putExtra(Intent.EXTRA_INITIAL_INTENTS, sources.toTypedArray())
            }
        }
    }

    /** Resolves the chooser outcome into exactly one callback invocation. */
    private fun onFileChooserResult(resultCode: Int, data: Intent?) {
        val callback = filePathCallback ?: return
        filePathCallback = null

        var results: Array<Uri>? =
            WebChromeClient.FileChooserParams.parseResult(resultCode, data)

        // Camera path: with EXTRA_OUTPUT, ACTION_IMAGE_CAPTURE returns
        // RESULT_OK WITHOUT a data Uri — the photo is in our FileProvider file.
        val capture = pendingCaptureImage
        pendingCaptureImage = null
        if ((results == null || results.isEmpty()) &&
            resultCode == RESULT_OK && data?.data == null && capture != null
        ) {
            val (_, file) = capture
            if (file.exists() && file.length() > 0) {
                results = arrayOf(capture.first)
            } else {
                runCatching { file.delete() }
            }
        }

        // null (cancel/failure) tells the WebView the selection ended without
        // a pick — it keeps the input usable. Never leave the callback hanging.
        callback.onReceiveValue(results)
    }

    /** Creates cache/capture/<ts>.jpg and its shareable content:// Uri. */
    private fun createCaptureOutput(): Pair<Uri, File>? = runCatching {
        @Suppress("SpellCheckingInspection")
        val dir = File(cacheDir, "capture").apply { mkdirs() }
        pruneOldCaptures(dir)
        val file = File(dir, "capture_${System.currentTimeMillis()}.jpg")
        val uri = FileProvider.getUriForFile(this, "${packageName}.fileprovider", file)
        uri to file
    }.getOrNull()

    /** Best-effort cleanup: captures older than 24h are scratch and deleted. */
    private fun pruneOldCaptures(dir: File) {
        val cutoff = System.currentTimeMillis() - 24 * 60 * 60 * 1000L
        dir.listFiles()?.forEach { if (it.lastModified() < cutoff) runCatching { it.delete() } }
    }

    // ---- runtime permissions -------------------------------------------------

    private fun isGranted(permission: String): Boolean =
        checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

    /**
     * Fire-and-forget gate BEFORE invoking the media chooser: asks once for
     * whatever this API level needs (media read + camera). Denials never
     * block the permission-free SAF picker; they only keep the capture
     * sources hidden until granted.
     */
    private fun requestMediaPermissionsIfNeeded() {
        val missing = (mediaReadPermissions(Build.VERSION.SDK_INT) + Manifest.permission.CAMERA)
            .distinct()
            .filter { !isGranted(it) }
        if (missing.isNotEmpty()) {
            Log.d(TAG, "[perm] requesting $missing")
            requestPermissions(missing.toTypedArray(), REQ_MEDIA_PERMISSIONS)
        }
    }

    /**
     * WebRTC (getUserMedia): grant ONLY the resources we explicitly map
     * (camera / mic) and only with Android's runtime grant in hand. Unknown
     * WebKit resources are never granted — least privilege.
     */
    private fun handleWebPermissionRequest(request: PermissionRequest) {
        val grantable = webGrantableResources(request.resources)
        val missing = androidPermissionsForWebResources(grantable).filter { !isGranted(it) }
        when {
            grantable.isEmpty() -> request.deny()
            missing.isNotEmpty() -> {
                Log.d(TAG, "[perm] web request needs $missing")
                pendingWebPermissionRequest = request
                requestPermissions(missing.toTypedArray(), REQ_WEB_PERMISSIONS)
            }
            else -> request.grant(grantable)
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != REQ_WEB_PERMISSIONS) {
            // REQ_MEDIA_PERMISSIONS: nothing to resolve — the SAF picker is
            // permission-free; the grant just unhides capture sources next time.
            return
        }
        val request = pendingWebPermissionRequest
        pendingWebPermissionRequest = null
        if (request != null) {
            val grantable = webGrantableResources(request.resources)
            val allGranted = grantable.isNotEmpty() &&
                androidPermissionsForWebResources(grantable).all { isGranted(it) }
            if (allGranted) request.grant(grantable) else request.deny()
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
     * gesture bar. Platform WindowInsets APIs only.
     */
    private fun applySystemBarsInsets(target: View) {
        if (Build.VERSION.SDK_INT >= 30) {
            target.setOnApplyWindowInsetsListener { v, insets ->
                val bars = insets.getInsets(android.view.WindowInsets.Type.systemBars())
                v.setPadding(0, bars.top, 0, bars.bottom)
                insets
            }
        } else {
            @Suppress("DEPRECATION")
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
        // Resolve any dangling chooser so the WebView is never left holding a
        // callback into a destroyed activity.
        filePathCallback?.onReceiveValue(null)
        filePathCallback = null
        pendingCaptureImage?.second?.let { f -> runCatching { f.delete() } }
        pendingCaptureImage = null
        pendingWebPermissionRequest = null
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
