package com.earthweather.mobile

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.webkit.GeolocationPermissions
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private var pendingGeoOrigin: String? = null
    private var pendingGeoCallback: GeolocationPermissions.Callback? = null

    private val trustedHosts = setOf(
        "earthweatherchannel.web.app",
        "earthweatherchannel.firebaseapp.com"
    )

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        setContentView(webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            javaScriptCanOpenWindowsAutomatically = true
            setSupportMultipleWindows(false)
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            userAgentString = "$userAgentString EARTHWEATHER-ANDROID/0.1"
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                val uri = request.url
                val host = uri.host?.lowercase().orEmpty()
                if (uri.scheme == "https" && host in trustedHosts) {
                    return false
                }
                openExternal(uri)
                return true
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(
                origin: String,
                callback: GeolocationPermissions.Callback
            ) {
                val host = Uri.parse(origin).host?.lowercase().orEmpty()
                if (host !in trustedHosts) {
                    callback.invoke(origin, false, false)
                    return
                }
                requestLocationPermission(origin, callback)
            }

            override fun onPermissionRequest(request: android.webkit.PermissionRequest) {
                // Camera and microphone access are not needed for weather features.
                request.deny()
            }
        }

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(BuildConfig.START_URL)
        }
    }

    private fun requestLocationPermission(
        origin: String,
        callback: GeolocationPermissions.Callback
    ) {
        val fineGranted = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        val coarseGranted = checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

        if (fineGranted || coarseGranted) {
            callback.invoke(origin, true, false)
            return
        }

        pendingGeoOrigin = origin
        pendingGeoCallback = callback
        requestPermissions(
            arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ),
            REQUEST_LOCATION
        )
    }

    @Deprecated("Deprecated by Android; retained for compatibility with minSdk 26")
    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != REQUEST_LOCATION) return

        val granted = grantResults.any { it == PackageManager.PERMISSION_GRANTED }
        pendingGeoCallback?.invoke(pendingGeoOrigin.orEmpty(), granted, false)
        pendingGeoCallback = null
        pendingGeoOrigin = null
    }

    private fun openExternal(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (_: Exception) {
            Toast.makeText(this, "Unable to open this link", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    @Deprecated("Deprecated by Android; retained for compatibility")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        if (::webView.isInitialized) {
            webView.stopLoading()
            webView.destroy()
        }
        super.onDestroy()
    }

    companion object {
        private const val REQUEST_LOCATION = 1001
    }
}
