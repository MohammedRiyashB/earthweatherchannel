package com.earthweather.mobile

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.webkit.GeolocationPermissions
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

class PremiumWeatherActivity : Activity() {
    private lateinit var webView: WebView
    private var pageReady = false
    private val locationRequestCode = 71

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(7, 23, 42)
        window.navigationBarColor = Color.rgb(7, 23, 42)

        webView = WebView(this).apply {
            setBackgroundColor(Color.rgb(7, 23, 42))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = false
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.javaScriptCanOpenWindowsAutomatically = false
            settings.setSupportMultipleWindows(false)
            settings.setGeolocationEnabled(true)
            settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    pageReady = true
                    startPageWeather()
                }

                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                    val uri = request?.url ?: return false
                    val host = uri.host ?: return false
                    if (host == "earthweatherchannel.web.app" || host == "earthweatherchannel.firebaseapp.com") return false
                    if (uri.scheme == "https" || uri.scheme == "http") {
                        startActivity(Intent(Intent.ACTION_VIEW, uri))
                        return true
                    }
                    return true
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onGeolocationPermissionsShowPrompt(origin: String?, callback: GeolocationPermissions.Callback?) {
                    val allowed = hasLocationPermission()
                    callback?.invoke(origin, allowed, false)
                }
            }
        }
        setContentView(webView)
        val html = assets.open("earth_weather.html").bufferedReader(Charsets.UTF_8).use { it.readText() }
        webView.loadDataWithBaseURL("https://earthweatherchannel.web.app/", html, "text/html", "UTF-8", null)

        if (!hasLocationPermission()) {
            requestPermissions(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION), locationRequestCode)
        }
    }

    private fun hasLocationPermission(): Boolean =
        checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == locationRequestCode) {
            if (pageReady) startPageWeather()
        }
    }

    override fun onResume() {
        super.onResume()
        if (pageReady && hasLocationPermission()) startPageWeather()
    }

    private fun startPageWeather() {
        val permitted = hasLocationPermission()
        webView.evaluateJavascript("startWeather(" + permitted.toString() + ")", null)
    }

    @Deprecated("Deprecated in Android API 33; retained for compatibility with device back navigation")
    override fun onBackPressed() {
        if (!::webView.isInitialized) {
            super.onBackPressed()
            return
        }
        webView.evaluateJavascript("handleBack()") { result ->
            if (result != "true") finish()
        }
    }
}
