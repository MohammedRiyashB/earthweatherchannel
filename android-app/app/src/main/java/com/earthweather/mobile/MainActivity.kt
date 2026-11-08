package com.earthweather.mobile

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.location.LocationListener
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import kotlin.math.roundToInt

/**
 * Native EARTH WEATHER dashboard.
 * Uses EARTH WEATHER's own API; no WebView and no OPPO app code/resources.
 * The reference ZIP remains untouched in the repository.
 */
class MainActivity : Activity() {
    private val apiBase = "https://earth-weather-api.onrender.com"
    private val executor = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private lateinit var root: LinearLayout
    private lateinit var locationText: TextView
    private lateinit var temperatureText: TextView
    private lateinit var conditionText: TextView
    private lateinit var feelsText: TextView
    private lateinit var statusText: TextView
    private lateinit var stats: LinearLayout
    private var lastLocation: Location? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(8, 18, 38)
        window.navigationBarColor = Color.rgb(8, 18, 38)
        window.decorView.systemUiVisibility = 0
        buildDashboard()
        requestWeather()
    }

    private fun buildDashboard() {
        val scroll = ScrollView(this).apply { setBackgroundColor(Color.rgb(8, 18, 38)) }
        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(22), dp(20), dp(32))
        }
        scroll.addView(root)
        setContentView(scroll)

        val brand = text("EARTH WEATHER", 14, Color.rgb(167, 205, 255), true)
        brand.letterSpacing = .14f
        root.addView(brand)
        root.addView(space(22))

        locationText = text("Finding your location…", 18, Color.WHITE, true)
        root.addView(locationText)
        root.addView(space(12))

        val hero = card(28, Color.rgb(22, 48, 82), Color.rgb(33, 72, 111))
        hero.setPadding(dp(22), dp(24), dp(22), dp(24))
        root.addView(hero)
        val eyebrow = text("CURRENT WEATHER", 11, Color.rgb(190, 218, 248), true)
        eyebrow.letterSpacing = .12f
        hero.addView(eyebrow)
        temperatureText = text("--°", 76, Color.WHITE, false)
        temperatureText.typeface = Typeface.create("sans-serif-light", Typeface.NORMAL)
        hero.addView(temperatureText)
        conditionText = text("Connecting to weather service", 18, Color.WHITE, true)
        hero.addView(conditionText)
        feelsText = text("Feels like --°", 14, Color.rgb(205, 224, 245), false)
        hero.addView(feelsText)
        hero.addView(space(18))
        statusText = text("Waiting for location permission", 12, Color.rgb(190, 218, 248), false)
        hero.addView(statusText)

        root.addView(space(18))
        root.addView(text("Weather at a glance", 20, Color.WHITE, true))
        root.addView(space(12))
        stats = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(stats)
        addStatRows("--", "--", "--", "--")

        root.addView(space(22))
        val refresh = Button(this).apply {
            text = "Refresh weather"
            textSize = 15f
            isAllCaps = false
            setTextColor(Color.WHITE)
            background = rounded(Color.rgb(36, 115, 190), 18)
            setPadding(dp(18), dp(12), dp(18), dp(12))
            setOnClickListener { requestWeather() }
        }
        root.addView(refresh, LinearLayout.LayoutParams(-1, dp(52)))
        root.addView(space(16))
        root.addView(text("Powered by EARTH WEATHER API", 11, Color.rgb(132, 159, 190), false))
    }

    private fun addStatRows(humidity: String, wind: String, pressure: String, clouds: String) {
        stats.removeAllViews()
        val first = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        first.addView(statCard("HUMIDITY", humidity, "💧"), weightParams())
        first.addView(spaceWidth(10))
        first.addView(statCard("WIND", wind, "🌬"), weightParams())
        val second = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        second.addView(statCard("PRESSURE", pressure, "◉"), weightParams())
        second.addView(spaceWidth(10))
        second.addView(statCard("CLOUD COVER", clouds, "☁"), weightParams())
        stats.addView(first)
        stats.addView(space(10))
        stats.addView(second)
    }

    private fun statCard(label: String, value: String, icon: String) =
        card(20, Color.rgb(18, 35, 59), Color.rgb(18, 35, 59)).apply {
            setPadding(dp(15), dp(16), dp(12), dp(16))
            addView(text(icon, 19, Color.WHITE, false))
            addView(space(9))
            addView(text(label, 10, Color.rgb(143, 177, 211), true))
            addView(text(value, 18, Color.WHITE, true))
        }

    private fun requestWeather() {
        statusText.text = "Checking device location…"
        if (checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
            checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION), 71)
            return
        }
        loadLastKnownLocation()
    }

    @SuppressLint("MissingPermission")
    private fun loadLastKnownLocation() {
        try {
            val manager = getSystemService(LOCATION_SERVICE) as LocationManager
            val candidates = listOf(LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER)
            lastLocation = candidates.mapNotNull { provider ->
                try { manager.getLastKnownLocation(provider) } catch (_: Exception) { null }
            }.maxByOrNull { it.time }
        } catch (_: Exception) { lastLocation = null }

        val loc = lastLocation
        if (loc == null) {
            locationText.text = "Location unavailable"
            statusText.text = "Turn on device location, then tap Refresh weather."
            return
        }
        fetchWeather(loc.latitude, loc.longitude)
    }

    private fun fetchWeather(lat: Double, lon: Double) {
        statusText.text = "Loading live weather…"
        executor.execute {
            try {
                val url = URL("$apiBase/api/weather?latitude=$lat&longitude=$lon")
                val connection = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "GET"
                    connectTimeout = 12000
                    readTimeout = 18000
                    setRequestProperty("Accept", "application/json")
                }
                val code = connection.responseCode
                val body = (if (code in 200..299) connection.inputStream else connection.errorStream)
                    .bufferedReader().use { it.readText() }
                connection.disconnect()
                if (code !in 200..299) throw IllegalStateException("Weather API HTTP $code")
                val json = JSONObject(body)
                val current = json.optJSONObject("current") ?: throw IllegalStateException("Current weather missing")
                main.post { renderWeather(current, lat, lon) }
            } catch (error: Exception) {
                main.post {
                    statusText.text = "Weather unavailable: ${error.message ?: "Connection error"}"
                    conditionText.text = "Unable to load current conditions"
                }
            }
        }
    }

    private fun renderWeather(current: JSONObject, lat: Double, lon: Double) {
        val temp = current.optDouble("temperature_2m", Double.NaN)
        if (temp.isNaN()) {
            statusText.text = "The API did not return a valid temperature."
            return
        }
        val feels = current.optDouble("apparent_temperature", temp)
        val humidity = current.optInt("relative_humidity_2m", -1)
        val wind = current.optDouble("wind_speed_10m", Double.NaN)
        val pressure = current.optDouble("surface_pressure", Double.NaN)
        val clouds = current.optInt("cloud_cover", -1)
        val code = current.optInt("weather_code", -1)
        temperatureText.text = "${temp.roundToInt()}°"
        conditionText.text = weatherLabel(code)
        feelsText.text = "Feels like ${feels.roundToInt()}°"
        locationText.text = "Your location  ·  %.2f, %.2f".format(lat, lon)
        statusText.text = "Updated just now  ·  EARTH WEATHER"
        addStatRows(
            if (humidity >= 0) "$humidity%" else "--",
            if (!wind.isNaN()) "${wind.roundToInt()} km/h" else "--",
            if (!pressure.isNaN()) "${pressure.roundToInt()} hPa" else "--",
            if (clouds >= 0) "$clouds%" else "--"
        )
    }

    private fun weatherLabel(code: Int): String = when (code) {
        0 -> "Clear sky"
        1 -> "Mainly clear"
        2 -> "Partly cloudy"
        3 -> "Overcast"
        45, 48 -> "Fog"
        51, 53, 55, 56, 57 -> "Drizzle"
        61, 63, 65, 66, 67 -> "Rain"
        71, 73, 75, 77 -> "Snow"
        80, 81, 82 -> "Rain showers"
        85, 86 -> "Snow showers"
        95, 96, 99 -> "Thunderstorm"
        else -> "Current conditions"
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 71) {
            if (grantResults.any { it == PackageManager.PERMISSION_GRANTED }) loadLastKnownLocation()
            else statusText.text = "Location permission denied. Allow location to load local weather."
        }
    }

    private fun text(value: String, size: Int, color: Int, bold: Boolean) = TextView(this).apply {
        text = value; textSize = size.toFloat(); setTextColor(color)
        if (bold) setTypeface(Typeface.DEFAULT, Typeface.BOLD)
    }
    private fun card(radius: Int, start: Int, end: Int) = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(start, end)).apply { cornerRadius = dp(radius).toFloat() }
    }
    private fun rounded(color: Int, radius: Int) = GradientDrawable().apply { setColor(color); cornerRadius = dp(radius).toFloat() }
    private fun space(height: Int) = View(this).apply { layoutParams = LinearLayout.LayoutParams(1, dp(height)) }
    private fun spaceWidth(width: Int) = View(this).apply { layoutParams = LinearLayout.LayoutParams(dp(width), 1) }
    private fun weightParams() = LinearLayout.LayoutParams(0, -2, 1f)
    private fun dp(value: Int) = (value * resources.displayMetrics.density).roundToInt()

    override fun onDestroy() {
        executor.shutdownNow()
        super.onDestroy()
    }
}
