package com.bmrinc.earthweather

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.net.Uri
import android.webkit.WebView
import android.webkit.WebViewClient
import android.os.Build
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.Image
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.bmrinc.earthweatherwidget.WeatherAlertWorker
import com.bmrinc.earthweatherwidget.WeatherWidgetWorker
import com.bmrinc.earthweatherwidget.RainReminderWorker
import com.bmrinc.earthweatherwidget.MorningBriefingWorker
import com.bmrinc.earthweatherwidget.LiveWeatherNotificationWorker
import java.util.concurrent.TimeUnit
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val NightBg = Color(0xFF05091F)
private val CardSurface = Color(0xF20B1438)
private val RaisedSurface = Color(0xFF1B2853)
private val Ink = Color(0xFFF5F5FF)
private val Sky = Color(0xFF82B9FF)
private val Deep = Color(0xFF101B43)
private val Page = NightBg
private val Muted = Color(0xFF9AA2C0)
private val Line = Color(0xFF2A355E)
private val Good = Color(0xFF83D9A4)
private val Orange = Color(0xFFFFC66C)

private data class DashboardState(
    val current: CurrentConditions? = null,
    val hourly: List<HourlyPoint> = emptyList(),
    val daily: List<DailyPoint> = emptyList(),
    val air: AirQuality? = null,
    val alerts: List<WeatherAlert> = emptyList(),
    val alertCoverage: String = "",
    val radar: RadarInfo? = null,
    val loading: Boolean = false,
    val error: String = ""
)

class MainActivity : ComponentActivity() {
    private var dashboard by mutableStateOf(DashboardState())
    private var selectedPlace by mutableStateOf<WeatherPlace?>(null)
    private var tab by mutableStateOf("Weather")
    private var cityQuery by mutableStateOf("")
    private var cityResults by mutableStateOf<List<WeatherPlace>>(emptyList())
    private var searching by mutableStateOf(false)
    private var searchError by mutableStateOf("")
    private var citySearchVersion = 0
    private var savedCities by mutableStateOf<List<WeatherPlace>>(emptyList())
    private var celsius by mutableStateOf(true)
    private var notificationsEnabled by mutableStateOf(false)
    private var rainRemindersEnabled by mutableStateOf(false)
    private var rainThreshold by mutableIntStateOf(60)
    private var rainStartHour by mutableIntStateOf(7)
    private var rainEndHour by mutableIntStateOf(22)
    private var morningBriefingEnabled by mutableStateOf(false)
    private var morningBriefingHour by mutableIntStateOf(7)
    private var liveWeatherEnabled by mutableStateOf(false)
    private var refreshInProgress = false

    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        notificationsEnabled = granted
        getSharedPreferences("earth_weather_app", MODE_PRIVATE).edit().putBoolean("notifications_enabled", granted).apply()
        if (granted) scheduleAlertChecks() else WorkManager.getInstance(this).cancelUniqueWork("earth-weather-alert-checks")
    }

    private val rainNotificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        rainRemindersEnabled = granted
        getSharedPreferences("earth_weather_app", MODE_PRIVATE).edit().putBoolean("rain_reminders_enabled", granted).apply()
        if (granted) scheduleRainReminders() else WorkManager.getInstance(this).cancelUniqueWork("earth-weather-rain-reminders")
    }

    private val morningNotificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        morningBriefingEnabled = granted
        getSharedPreferences("earth_weather_app", MODE_PRIVATE).edit().putBoolean("morning_briefing_enabled", granted).apply()
        if (granted) MorningBriefingWorker.schedule(this)
        else WorkManager.getInstance(this).cancelUniqueWork("earth-weather-morning-briefing")
    }

    private val liveNotificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        liveWeatherEnabled = granted
        getSharedPreferences("earth_weather_app", MODE_PRIVATE).edit().putBoolean("live_weather_enabled", granted).apply()
        if (granted) LiveWeatherNotificationWorker.schedule(this) else LiveWeatherNotificationWorker.cancel(this)
    }

    private val locationPermission = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        if (grants.values.any { it }) locateDevice() else restoreSavedOrShowLocationError()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        restorePreferences()
        window.statusBarColor = android.graphics.Color.rgb(5, 9, 31)
        window.navigationBarColor = android.graphics.Color.rgb(5, 9, 31)
        window.decorView.systemUiVisibility = 0
        setContent {
            MaterialTheme(colorScheme = darkColorScheme(primary = Color(0xFF347FF6), background = NightBg, surface = CardSurface, onSurface = Ink)) {
                EarthWeatherApp(
                    state = dashboard, place = selectedPlace, tab = tab,
                    onTab = { tab = it },
                    onRefresh = { selectedPlace?.let { loadWeather(it) } ?: requestLocation() },
                    onSwipeCity = { swipeSavedCity(it) },
                    onDetectLocation = { requestLocation() },
                    query = cityQuery, onQuery = { updateCityQuery(it) },
                    results = cityResults, searching = searching, searchError = searchError,
                    savedCities = savedCities,
                    onSelect = { choosePlace(it) }, onSave = { saveCity(it) }, onRemove = { removeCity(it) },
                    celsius = celsius,
                    onUnit = { celsius = it; getSharedPreferences("earth_weather_app", MODE_PRIVATE).edit().putBoolean("celsius", it).apply(); getSharedPreferences("earth_weather", MODE_PRIVATE).edit().putBoolean("celsius", it).apply(); WeatherWidgetWorker.enqueueNow(this) },
                    notificationsEnabled = notificationsEnabled,
                    onNotifications = { setWeatherNotifications(it) },
                    rainRemindersEnabled = rainRemindersEnabled,
                    onRainReminders = { setRainReminders(it) },
                    rainThreshold = rainThreshold,
                    onRainThreshold = { rainThreshold = it; getSharedPreferences("earth_weather_app", MODE_PRIVATE).edit().putInt("rain_threshold", it).apply(); getSharedPreferences("earth_weather", MODE_PRIVATE).edit().putInt("rain_probability_threshold", it).apply() },
                    rainStartHour = rainStartHour,
                    rainEndHour = rainEndHour,
                    onRainWindow = { start, end -> rainStartHour = start; rainEndHour = end; getSharedPreferences("earth_weather_app", MODE_PRIVATE).edit().putInt("rain_start_hour", start).putInt("rain_end_hour", end).apply(); getSharedPreferences("earth_weather", MODE_PRIVATE).edit().putInt("rain_start_hour", start).putInt("rain_end_hour", end).apply() },
                    morningBriefingEnabled = morningBriefingEnabled,
                    morningBriefingHour = morningBriefingHour,
                    onMorningBriefing = { setMorningBriefing(it) },
                    onMorningHour = { morningBriefingHour = it; getSharedPreferences("earth_weather_app", MODE_PRIVATE).edit().putInt("morning_briefing_hour", it).apply(); if (morningBriefingEnabled) MorningBriefingWorker.schedule(this) },
                    onSearch = { searchCities(cityQuery) },
                    liveWeatherEnabled = liveWeatherEnabled,
                    onLiveWeather = { setLiveWeatherNotifications(it) }
                )
            }
        }
        selectedPlace?.let { loadWeather(it) } ?: requestLocation()
        if (notificationsEnabled) scheduleAlertChecks()
        if (rainRemindersEnabled) scheduleRainReminders()
        if (morningBriefingEnabled) MorningBriefingWorker.schedule(this)
        if (liveWeatherEnabled) LiveWeatherNotificationWorker.schedule(this)
    }

    private fun setLiveWeatherNotifications(enabled: Boolean) {
        if (enabled && Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            liveNotificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            return
        }
        liveWeatherEnabled = enabled
        getSharedPreferences("earth_weather_app", MODE_PRIVATE).edit().putBoolean("live_weather_enabled", enabled).apply()
        if (enabled) LiveWeatherNotificationWorker.schedule(this) else LiveWeatherNotificationWorker.cancel(this)
    }

    private fun restorePreferences() {
        val prefs = getSharedPreferences("earth_weather_app", MODE_PRIVATE)
        celsius = prefs.getBoolean("celsius", true)
        notificationsEnabled = prefs.getBoolean("notifications_enabled", false)
        rainRemindersEnabled = prefs.getBoolean("rain_reminders_enabled", false)
        rainThreshold = prefs.getInt("rain_threshold", 60).coerceIn(40, 90)
        rainStartHour = prefs.getInt("rain_start_hour", 7).coerceIn(0, 22)
        rainEndHour = prefs.getInt("rain_end_hour", 22).coerceIn(rainStartHour + 1, 24)
        morningBriefingEnabled = prefs.getBoolean("morning_briefing_enabled", false)
        morningBriefingHour = prefs.getInt("morning_briefing_hour", 7).coerceIn(5, 11)
        liveWeatherEnabled = prefs.getBoolean("live_weather_enabled", false)
        try {
            val array = JSONArray(prefs.getString("saved_cities", "[]") ?: "[]")
            savedCities = (0 until array.length()).mapNotNull { i ->
                val item = array.optJSONObject(i) ?: return@mapNotNull null
                val lat = item.optDouble("lat", Double.NaN)
                val lon = item.optDouble("lon", Double.NaN)
                if (lat.isNaN() || lon.isNaN()) null else WeatherPlace(
                    item.optString("name"), item.optString("region"), lat, lon,
                    item.optString("country"), item.optString("countryCode"),
                    item.optString("state"), item.optString("district")
                )
            }
        } catch (_: Exception) { savedCities = emptyList() }
        try {
            val item = JSONObject(prefs.getString("selected_place", "{}") ?: "{}")
            val lat = item.optDouble("lat", Double.NaN)
            val lon = item.optDouble("lon", Double.NaN)
            if (!lat.isNaN() && !lon.isNaN()) selectedPlace = WeatherPlace(
                item.optString("name"), item.optString("region"), lat, lon,
                item.optString("country"), item.optString("countryCode"),
                item.optString("state"), item.optString("district")
            )
        } catch (_: Exception) { }
    }

    private fun savePreferences(place: WeatherPlace) {
        val item = JSONObject().apply {
            put("name", place.name); put("region", place.region)
            put("lat", place.latitude); put("lon", place.longitude)
            put("country", place.country); put("countryCode", place.countryCode)
            put("state", place.state); put("district", place.district)
        }
        getSharedPreferences("earth_weather", MODE_PRIVATE).edit().putBoolean("celsius", celsius).apply()
        getSharedPreferences("earth_weather_app", MODE_PRIVATE).edit()
            .putString("selected_place", item.toString())
            .putString("lat", place.latitude.toString())
            .putString("lon", place.longitude.toString())
            .putString("city", place.name).apply()
        // Keep the existing home-screen widget's preference namespace in sync with the app.
        getSharedPreferences("earth_weather", MODE_PRIVATE).edit()
            .putString("lat", place.latitude.toString())
            .putString("lon", place.longitude.toString())
            .putString("city", place.name).apply()
        WeatherWidgetWorker.enqueueNow(this)
    }

    private fun persistSavedCities() {
        val array = JSONArray()
        savedCities.forEach { place ->
            array.put(JSONObject().apply {
                put("name", place.name); put("region", place.region)
                put("lat", place.latitude); put("lon", place.longitude)
                put("country", place.country); put("countryCode", place.countryCode)
                put("state", place.state); put("district", place.district)
            })
        }
        getSharedPreferences("earth_weather_app", MODE_PRIVATE).edit().putString("saved_cities", array.toString()).apply()
    }

    private fun requestLocation() {
        val fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (fine || coarse) locateDevice()
        else locationPermission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
    }

    private fun locateDevice() {
        try {
            LocationServices.getFusedLocationProviderClient(this).lastLocation
                .addOnSuccessListener { location ->
                    if (location == null) {
                        try {
                            LocationServices.getFusedLocationProviderClient(this)
                                .getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, CancellationTokenSource().token)
                                .addOnSuccessListener { fresh ->
                                    if (fresh == null) restoreSavedOrShowLocationError()
                                    else lifecycleScope.launch {
                                        val place = runCatching { EarthWeatherApi.reverse(fresh.latitude, fresh.longitude) }
                                            .getOrElse { WeatherPlace("Current location", "GPS location", fresh.latitude, fresh.longitude) }
                                        choosePlace(place)
                                    }
                                }.addOnFailureListener { restoreSavedOrShowLocationError() }
                        } catch (_: SecurityException) { restoreSavedOrShowLocationError() }
                    } else lifecycleScope.launch {
                        val place = runCatching { EarthWeatherApi.reverse(location.latitude, location.longitude) }
                            .getOrElse { WeatherPlace("Current location", "GPS location", location.latitude, location.longitude) }
                        choosePlace(place)
                    }
                }.addOnFailureListener { restoreSavedOrShowLocationError() }
        } catch (_: SecurityException) { restoreSavedOrShowLocationError() }
    }

    private fun restoreSavedOrShowLocationError() {
        val saved = selectedPlace
        if (saved != null) loadWeather(saved)
        else dashboard = dashboard.copy(error = "Allow location access or search for a city to see local weather.")
    }

    private fun choosePlace(place: WeatherPlace) {
        selectedPlace = place
        savePreferences(place)
        tab = "Weather"
        loadWeather(place)
    }

    private fun loadWeather(place: WeatherPlace) {
        if (refreshInProgress) return
        lifecycleScope.launch {
            refreshInProgress = true
            dashboard = dashboard.copy(loading = true, error = "")
            val current = runCatching { EarthWeatherApi.current(place) }
            if (current.isFailure) {
                dashboard = dashboard.copy(loading = false, error = current.exceptionOrNull()?.message ?: "Weather service unavailable.")
                refreshInProgress = false
                return@launch
            }
            val parts = coroutineScope {
                val forecast = async { runCatching { EarthWeatherApi.forecast(place) }.getOrNull() }
                val air = async { runCatching { EarthWeatherApi.airQuality(place) }.getOrNull() }
                val alerts = async { runCatching { EarthWeatherApi.alerts(place) }.getOrNull() }
                val radar = async { runCatching { EarthWeatherApi.radar() }.getOrNull() }
                listOf(forecast.await(), air.await(), alerts.await(), radar.await())
            }
            @Suppress("UNCHECKED_CAST")
            val forecast = parts[0] as Pair<List<HourlyPoint>, List<DailyPoint>>?
            val air = parts[1] as AirQuality?
            @Suppress("UNCHECKED_CAST")
            val alerts = parts[2] as Pair<String, List<WeatherAlert>>?
            val radar = parts[3] as RadarInfo?
            dashboard = DashboardState(
                current = current.getOrThrow(),
                hourly = forecast?.first ?: emptyList(),
                daily = forecast?.second ?: emptyList(),
                air = air,
                alerts = alerts?.second ?: emptyList(),
                alertCoverage = alerts?.first ?: "Alert provider unavailable",
                radar = radar,
                loading = false,
                error = listOfNotNull(
                    if (forecast == null) "Forecast unavailable" else null,
                    if (air == null) "Air quality unavailable" else null
                ).joinToString(" · ")
            )
            refreshInProgress = false
        }
    }

    private fun updateCityQuery(value: String) {
        cityQuery = value
        citySearchVersion++
        if (value.trim().length < 2) {
            cityResults = emptyList()
            searching = false
            searchError = ""
        } else {
            cityResults = emptyList()
        }
    }

    private fun searchCities(query: String) {
        val clean = query.trim()
        if (clean.length < 2) {
            cityResults = emptyList(); searching = false; searchError = ""; return
        }
        val requestVersion = citySearchVersion
        lifecycleScope.launch {
            searching = true
            searchError = ""
            val result = runCatching { EarthWeatherApi.search(clean) }
            if (requestVersion == citySearchVersion && cityQuery.trim() == clean) {
                cityResults = result.getOrDefault(emptyList())
                if (result.isFailure) searchError = result.exceptionOrNull()?.message ?: "Location search failed."
                else if (cityResults.isEmpty()) searchError = "No matching cities found."
                searching = false
            }
        }
    }

    private fun setWeatherNotifications(enabled: Boolean) {
        if (!enabled) {
            notificationsEnabled = false
            getSharedPreferences("earth_weather_app", MODE_PRIVATE).edit().putBoolean("notifications_enabled", false).apply()
            WorkManager.getInstance(this).cancelUniqueWork("earth-weather-alert-checks")
            return
        }
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            notificationsEnabled = true
            getSharedPreferences("earth_weather_app", MODE_PRIVATE).edit().putBoolean("notifications_enabled", true).apply()
            scheduleAlertChecks()
        }
    }

    private fun scheduleAlertChecks() {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val request = PeriodicWorkRequestBuilder<WeatherAlertWorker>(1, TimeUnit.HOURS).build()
        WorkManager.getInstance(this).enqueueUniquePeriodicWork("earth-weather-alert-checks", ExistingPeriodicWorkPolicy.UPDATE, request)
    }

    private fun setRainReminders(enabled: Boolean) {
        if (!enabled) {
            rainRemindersEnabled = false
            getSharedPreferences("earth_weather_app", MODE_PRIVATE).edit().putBoolean("rain_reminders_enabled", false).apply()
            WorkManager.getInstance(this).cancelUniqueWork("earth-weather-rain-reminders")
            return
        }
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            rainNotificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            rainRemindersEnabled = true
            getSharedPreferences("earth_weather_app", MODE_PRIVATE).edit().putBoolean("rain_reminders_enabled", true).apply()
            scheduleRainReminders()
        }
    }

    private fun scheduleRainReminders() {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val request = PeriodicWorkRequestBuilder<RainReminderWorker>(2, TimeUnit.HOURS).build()
        WorkManager.getInstance(this).enqueueUniquePeriodicWork("earth-weather-rain-reminders", ExistingPeriodicWorkPolicy.UPDATE, request)
    }

    private fun swipeSavedCity(direction: Int) {
        val current = selectedPlace ?: return
        val places = (listOf(current) + savedCities.filterNot {
            it.latitude == current.latitude && it.longitude == current.longitude
        }).distinctBy { it.latitude.toString() + "," + it.longitude.toString() }
        if (places.size < 2) return
        val index = places.indexOfFirst { it.latitude == current.latitude && it.longitude == current.longitude }.coerceAtLeast(0)
        val next = (index + direction + places.size) % places.size
        choosePlace(places[next])
    }

    private fun setMorningBriefing(enabled: Boolean) {
        if (!enabled) {
            morningBriefingEnabled = false
            getSharedPreferences("earth_weather_app", MODE_PRIVATE).edit().putBoolean("morning_briefing_enabled", false).apply()
            MorningBriefingWorker.cancel(this)
            return
        }
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            morningNotificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            morningBriefingEnabled = true
            getSharedPreferences("earth_weather_app", MODE_PRIVATE).edit().putBoolean("morning_briefing_enabled", true).apply()
            MorningBriefingWorker.schedule(this)
        }
    }

    private fun saveCity(place: WeatherPlace) {
        if (savedCities.none { it.name.equals(place.name, true) && it.countryCode == place.countryCode }) {
            savedCities = savedCities + place
            persistSavedCities()
        }
    }

    private fun removeCity(place: WeatherPlace) {
        savedCities = savedCities.filterNot { it.name == place.name && it.countryCode == place.countryCode }
        persistSavedCities()
    }

    companion object {
        fun pendingIntent(context: Context): PendingIntent {
            val intent = Intent(context, MainActivity::class.java)
            return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }
    }
}

@Composable
private fun EarthWeatherApp(
    state: DashboardState, place: WeatherPlace?, tab: String, onTab: (String) -> Unit,
    onRefresh: () -> Unit, onSwipeCity: (Int) -> Unit, onDetectLocation: () -> Unit, query: String, onQuery: (String) -> Unit,
    results: List<WeatherPlace>, searching: Boolean, searchError: String,
    savedCities: List<WeatherPlace>, onSelect: (WeatherPlace) -> Unit,
    onSave: (WeatherPlace) -> Unit, onRemove: (WeatherPlace) -> Unit,
    celsius: Boolean, onUnit: (Boolean) -> Unit, notificationsEnabled: Boolean, onNotifications: (Boolean) -> Unit, rainRemindersEnabled: Boolean, onRainReminders: (Boolean) -> Unit, rainThreshold: Int, onRainThreshold: (Int) -> Unit, rainStartHour: Int, rainEndHour: Int, onRainWindow: (Int, Int) -> Unit, morningBriefingEnabled: Boolean, morningBriefingHour: Int, onMorningBriefing: (Boolean) -> Unit, onMorningHour: (Int) -> Unit, onSearch: () -> Unit,
    liveWeatherEnabled: Boolean, onLiveWeather: (Boolean) -> Unit
) {
    Scaffold(containerColor = NightBg) { padding ->
        when (tab) {
            "Weather" -> WeatherScreen(state, place, Modifier.padding(padding), celsius, onRefresh, onTab, onSwipeCity)
            "Forecast" -> ForecastScreen(state, place, Modifier.padding(padding), celsius)
            "Cities" -> CitiesScreen(place, savedCities, query, onQuery, results, searching, searchError, Modifier.padding(padding), onSelect, onSave, onRemove, onSearch, onDetectLocation, { onTab("Weather") })
            "Radar" -> RadarScreen(state, place, Modifier.padding(padding))
            "LiveNotifications" -> LiveNotificationSettingsScreen(
                place, savedCities, liveWeatherEnabled, onLiveWeather, onSelect, Modifier.padding(padding), { onTab("Settings") }
            )
            else -> SettingsScreen(
                celsius, onUnit, notificationsEnabled, onNotifications, rainRemindersEnabled, onRainReminders,
                rainThreshold, onRainThreshold, rainStartHour, rainEndHour, onRainWindow,
                morningBriefingEnabled, morningBriefingHour, onMorningBriefing, onMorningHour,
                Modifier.padding(padding), state, { onTab("Weather") }, { onTab("LiveNotifications") }
            )
        }
    }
}

@Composable
private fun WeatherScreen(
    state: DashboardState, place: WeatherPlace?, modifier: Modifier, celsius: Boolean,
    onRefresh: () -> Unit, onTab: (String) -> Unit, onSwipeCity: (Int) -> Unit
) {
    LaunchedEffect(place?.latitude, place?.longitude) {
        while (true) { delay(10 * 60 * 1000L); onRefresh() }
    }
    val current = state.current
    val condition = weatherDescription(current?.weatherCode ?: -1).first
    val high = state.daily.firstOrNull()?.high
    val low = state.daily.firstOrNull()?.low
    val aqiText = state.air?.let { if (it.europeanAqi >= 0) it.europeanAqi.toString() + " · " + it.category else "Unavailable" } ?: "Unavailable"
    Column(
        modifier.fillMaxSize().background(NightBg).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)
    ) {
        Box(Modifier.fillMaxWidth().height(378.dp)) {
            AnimatedSkyBackground(
                Modifier.matchParentSize(), current?.weatherCode ?: -1, current?.isDay ?: false
            )
            var horizontalTravel = 0f
            Column(Modifier.fillMaxSize().pointerInput(place?.latitude, place?.longitude) {
                detectHorizontalDragGestures(
                    onDragEnd = {
                        if (horizontalTravel < -55f) onSwipeCity(1)
                        else if (horizontalTravel > 55f) onSwipeCity(-1)
                        horizontalTravel = 0f
                    },
                    onDragCancel = { horizontalTravel = 0f },
                    onHorizontalDrag = { change, amount -> horizontalTravel += amount; change.consume() }
                )
            }) {
                Row(Modifier.fillMaxWidth().padding(top = 20.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(place?.name ?: "Finding your location…", color = Ink, fontSize = 27.sp, fontFamily = FontFamily.Cursive)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("●", color = Muted, fontSize = 8.sp)
                            Spacer(Modifier.width(5.dp))
                            Text(place?.region ?: "Allow location access", color = Muted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                    Text("☷", color = Ink, fontSize = 29.sp, modifier = Modifier.clickable { onTab("Cities") }.padding(horizontal = 12.dp))
                    Text("⚙", color = Ink, fontSize = 27.sp, modifier = Modifier.clickable { onTab("Settings") }.padding(start = 8.dp, end = 4.dp))
                }
                Spacer(Modifier.height(60.dp))
                Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(displayTemp(current?.temperature ?: Double.NaN, celsius) + "°", color = Color.White, fontSize = 100.sp, fontWeight = FontWeight.Light, fontFamily = FontFamily.Cursive, letterSpacing = (-4).sp)
                    Text(condition, color = Color.White, fontSize = 19.sp, fontFamily = FontFamily.Cursive)
                    Text(
                        (if (high != null && low != null) displayTemp(low, celsius) + "° / " + displayTemp(high, celsius) + "°" else "— / —") +
                            "  ·  Air quality: " + aqiText,
                        color = Color.White.copy(alpha = .90f), fontSize = 13.sp, fontFamily = FontFamily.Cursive,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                    if (state.loading) LinearProgressIndicator(Modifier.fillMaxWidth(.45f).padding(top = 14.dp), color = Sky)
                    if (state.error.isNotBlank()) Text(state.error, color = Orange, fontSize = 10.sp, modifier = Modifier.padding(top = 8.dp))
                }
            }
        }

        PollenCard()
        Spacer(Modifier.height(16.dp))
        SectionHeader("Hourly forecast", "Next hours")
        HourlyStrip(state.hourly.take(12), celsius)
        Spacer(Modifier.height(12.dp))
        Card(
            modifier = Modifier.fillMaxWidth().clickable { onTab("Radar") },
            colors = CardDefaults.cardColors(containerColor = CardSurface),
            shape = RoundedCornerShape(20.dp)
        ) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("🌧️", fontSize = 23.sp)
                Column(Modifier.weight(1f).padding(start = 12.dp)) {
                    Text("Weather radar", color = Ink, fontSize = 16.sp, fontFamily = FontFamily.Cursive)
                    Text("View recent rainfall movement", color = Muted, fontSize = 10.sp)
                }
                Text("›", color = Sky, fontSize = 25.sp)
            }
        }
        Spacer(Modifier.height(16.dp))
        SectionHeader("Multi-day forecast", "15 days", { onTab("Forecast") })
        DailyPreview(state.daily.take(7), celsius)
        Spacer(Modifier.height(16.dp))
        SectionHeader("Air quality", "Details")
        AirQualityCard(state.air)
        Spacer(Modifier.height(16.dp))
        SectionHeader("Weather details", "Current conditions")
        WeatherMetricGrid(state, celsius)
        Spacer(Modifier.height(16.dp))
        SectionHeader("Sunrise & sunset", "Daylight")
        SunriseCard(state.daily.firstOrNull())
        Spacer(Modifier.height(16.dp))
        SectionHeader("Moon information", "Night sky")
        MoonInfoCard()
        Spacer(Modifier.height(16.dp))
        SectionHeader("Lifestyle tips", "Weather guidance")
        LifeIndexCard(state)
        Spacer(Modifier.height(16.dp))
        SectionHeader("Weather alerts", "Official coverage")
        AlertsCard(state.alerts, state.alertCoverage)
        Spacer(Modifier.height(28.dp))
        Text("EARTH WEATHER · BMR INC.", color = Muted, fontSize = 10.sp, fontFamily = FontFamily.Cursive, modifier = Modifier.align(Alignment.CenterHorizontally).padding(bottom = 16.dp))
    }
}

@Composable
private fun AnimatedSkyBackground(modifier: Modifier, code: Int, isDay: Boolean) {
    val transition = rememberInfiniteTransition(label = "sky-video-like-motion")
    val drift by transition.animateFloat(
        initialValue = -14f, targetValue = 14f,
        animationSpec = infiniteRepeatable(animation = tween(8500), repeatMode = RepeatMode.Reverse),
        label = "cloud-drift"
    )
    val shimmer by transition.animateFloat(
        initialValue = .22f, targetValue = .65f,
        animationSpec = infiniteRepeatable(animation = tween(2600), repeatMode = RepeatMode.Reverse),
        label = "star-shimmer"
    )
    Canvas(modifier) {
        val palette = if (isDay) listOf(Color(0xFF10234D), Color(0xFF223F73), Color(0xFF111C42))
        else listOf(Color(0xFF03071D), Color(0xFF101B45), Color(0xFF081334))
        drawRect(Brush.verticalGradient(palette, startY = 0f, endY = size.height))
        for (i in 0 until 52) {
            val x = ((i * 97) % 997) / 997f * size.width
            val y = ((i * 61) % 503) / 503f * size.height * .63f
            val radius = if (i % 7 == 0) 1.8f else .8f
            val alpha = if (i % 3 == 0) shimmer else .25f
            drawCircle(Color.White.copy(alpha = alpha), radius, Offset(x, y))
        }
        val cloudTint = if (code in 51..99) Color(0xFFAAB6D2) else Color(0xFF8799BD)
        fun cloud(x: Float, y: Float, r: Float, alpha: Float) {
            val center = Offset(x, y)
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(cloudTint.copy(alpha = alpha), cloudTint.copy(alpha = alpha * .54f), Color.Transparent),
                    center = center, radius = r
                ),
                radius = r, center = center
            )
        }
        val baseY = size.height * .52f
        val shift = drift * density
        cloud(size.width * .18f + shift, baseY, size.width * .39f, .72f)
        cloud(size.width * .46f + shift, baseY - size.height * .045f, size.width * .42f, .82f)
        cloud(size.width * .79f + shift, baseY + size.height * .012f, size.width * .40f, .70f)
        cloud(size.width * .34f - shift, baseY + size.height * .11f, size.width * .35f, .56f)
        cloud(size.width * .70f - shift, baseY + size.height * .10f, size.width * .34f, .60f)
        cloud(size.width * .52f, baseY + size.height * .19f, size.width * .50f, .36f)
        drawRect(
            Brush.verticalGradient(
                0f to Color.Transparent,
                .55f to Color.Transparent,
                1f to NightBg.copy(alpha = .96f)
            ),
            topLeft = Offset.Zero,
            size = size
        )
    }
}

@Composable
private fun PollenCard() {
    Card(
        colors = CardDefaults.cardColors(containerColor = CardSurface),
        shape = RoundedCornerShape(25.dp), modifier = Modifier.fillMaxWidth()
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 18.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("🌼", fontSize = 24.sp)
                Spacer(Modifier.width(10.dp))
                Text("Pollen", color = Ink, fontSize = 19.sp, fontFamily = FontFamily.Cursive)
            }
            Text("Pollen forecast is not available for this region", color = Ink.copy(alpha = .92f), fontSize = 12.sp, modifier = Modifier.padding(top = 7.dp))
            Text("View details  ›", color = Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 19.dp))
        }
    }
}

@Composable
private fun WeatherMetricGrid(state: DashboardState, celsius: Boolean) {
    val current = state.current
    val items = listOf(
        Triple("UV index", if (state.air?.uv?.isFinite() == true) formatValue(state.air!!.uv, 1) else "—", "☀️"),
        Triple("Feels like", displayTemp(current?.feelsLike ?: Double.NaN, celsius) + "°", "🌡️"),
        Triple("Humidity", current?.humidity?.takeIf { it >= 0 }?.toString()?.plus("%") ?: "—", "💧"),
        Triple("Wind", current?.windKmh?.let { formatValue(it) + " km/h" } ?: "—", "🌬️"),
        Triple("Air pressure", current?.pressure?.let { formatValue(it) + " hPa" } ?: "—", "↘️"),
        Triple("Visibility", "—", "👁️")
    )
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        items.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                row.forEach { item ->
                    Card(
                        modifier = Modifier.weight(1f),
                        colors = CardDefaults.cardColors(containerColor = CardSurface),
                        shape = RoundedCornerShape(18.dp)
                    ) {
                        Column(Modifier.fillMaxWidth().padding(14.dp)) {
                            Text(item.third, fontSize = 17.sp)
                            Text(item.first, color = Muted, fontSize = 11.sp, modifier = Modifier.padding(top = 7.dp))
                            Text(item.second, color = Ink, fontSize = 17.sp, fontFamily = FontFamily.Cursive, modifier = Modifier.padding(top = 4.dp))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MoonInfoCard() {
    Card(colors = CardDefaults.cardColors(containerColor = CardSurface), shape = RoundedCornerShape(22.dp)) {
        Row(Modifier.fillMaxWidth().padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Moonrise", color = Muted, fontSize = 11.sp)
                Text("—", color = Ink, fontSize = 16.sp, modifier = Modifier.padding(bottom = 12.dp))
                Text("Moonset", color = Muted, fontSize = 11.sp)
                Text("—", color = Ink, fontSize = 16.sp)
            }
            Text("🌘", fontSize = 56.sp)
            Spacer(Modifier.width(12.dp))
        }
        Text("Moonrise and moonset times are not supplied by the current data provider.", color = Muted, fontSize = 9.sp, modifier = Modifier.padding(start = 18.dp, end = 18.dp, bottom = 14.dp))
    }
}

@Composable
private fun ForecastScreen(state: DashboardState, place: WeatherPlace?, modifier: Modifier, celsius: Boolean) {
    var showChart by remember { mutableStateOf(false) }
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
        ScreenTitle("Forecast", place?.name ?: "Selected location")
        SectionHeader("HOURLY FORECAST", "48 hours")
        HourlyStrip(state.hourly.take(48), celsius)
        Spacer(Modifier.height(22.dp))
        SectionHeader("15-DAY FORECAST", "Daily outlook")
        Row(horizontalArrangement = Arrangement.spacedBy(7.dp), modifier = Modifier.padding(bottom = 10.dp)) {
            FilterChip(selected = !showChart, onClick = { showChart = false }, label = { Text("List") })
            FilterChip(selected = showChart, onClick = { showChart = true }, label = { Text("Temperature chart") })
        }
        if (showChart) ForecastTemperatureChart(state.daily, celsius)
        else state.daily.forEachIndexed { index, day ->
            DailyRow(day, index, celsius)
            Divider(color = Line, thickness = .7.dp)
        }
        Text("Forecasts are model guidance and can change as new runs arrive.", color = Muted, fontSize = 10.sp, modifier = Modifier.padding(vertical = 20.dp))
    }
}

@Composable
private fun ForecastTemperatureChart(days: List<DailyPoint>, celsius: Boolean) {
    val valid = days.filter { it.high.isFinite() && it.low.isFinite() }
    if (valid.size < 2) {
        InfoCard("Temperature chart unavailable", "Not enough daily high/low forecast points were returned.")
        return
    }
    val highColor = Color(0xFFE27A46)
    val lowColor = Color(0xFF319CC8)
    val minValue = valid.minOf { it.low }
    val maxValue = valid.maxOf { it.high }
    val range = (maxValue - minValue).coerceAtLeast(1.0)
    Card(colors = CardDefaults.cardColors(containerColor = CardSurface), shape = RoundedCornerShape(20.dp)) {
        Column(Modifier.fillMaxWidth().padding(14.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(18.dp), modifier = Modifier.padding(bottom = 12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(8.dp).background(highColor, CircleShape))
                    Spacer(Modifier.width(6.dp)); Text("High", color = Muted, fontSize = 10.sp)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(8.dp).background(lowColor, CircleShape))
                    Spacer(Modifier.width(6.dp)); Text("Low", color = Muted, fontSize = 10.sp)
                }
            }
            Canvas(Modifier.fillMaxWidth().height(170.dp)) {
                val pad = 14f
                val chartHeight = size.height - pad * 2
                val xStep = (size.width - pad * 2) / (valid.size - 1).coerceAtLeast(1)
                fun position(index: Int, value: Double): Offset {
                    val ratio = ((value - minValue) / range).toFloat()
                    return Offset(pad + xStep * index, size.height - pad - ratio * chartHeight)
                }
                val highPath = Path()
                val lowPath = Path()
                valid.forEachIndexed { index, day ->
                    val highPoint = position(index, day.high)
                    val lowPoint = position(index, day.low)
                    if (index == 0) {
                        highPath.moveTo(highPoint.x, highPoint.y)
                        lowPath.moveTo(lowPoint.x, lowPoint.y)
                    } else {
                        highPath.lineTo(highPoint.x, highPoint.y)
                        lowPath.lineTo(lowPoint.x, lowPoint.y)
                    }
                }
                for (guide in 0..3) {
                    val y = pad + chartHeight * guide / 3f
                    drawLine(Line, Offset(pad, y), Offset(size.width - pad, y), strokeWidth = 1f)
                }
                drawPath(highPath, highColor, style = Stroke(width = 4f, cap = StrokeCap.Round))
                drawPath(lowPath, lowColor, style = Stroke(width = 4f, cap = StrokeCap.Round))
                valid.forEachIndexed { index, day ->
                    drawCircle(highColor, radius = 4f, center = position(index, day.high))
                    drawCircle(lowColor, radius = 4f, center = position(index, day.low))
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(valid.first().date.takeLast(5), color = Muted, fontSize = 9.sp)
                Text(valid[(valid.size / 2)].date.takeLast(5), color = Muted, fontSize = 9.sp)
                Text(valid.last().date.takeLast(5), color = Muted, fontSize = 9.sp)
            }
            Text(
                "High " + displayTemp(maxValue, celsius) + "°  ·  Low " + displayTemp(minValue, celsius) + "°",
                color = Ink, fontWeight = FontWeight.SemiBold, fontSize = 11.sp,
                modifier = Modifier.padding(top = 10.dp)
            )
        }
    }
}

@Composable
private fun CitiesScreen(
    current: WeatherPlace?, saved: List<WeatherPlace>, query: String, onQuery: (String) -> Unit,
    results: List<WeatherPlace>, searching: Boolean, searchError: String, modifier: Modifier,
    onSelect: (WeatherPlace) -> Unit, onSave: (WeatherPlace) -> Unit,
    onRemove: (WeatherPlace) -> Unit, onSearch: () -> Unit, onDetectLocation: () -> Unit, onBack: () -> Unit
) {
    LaunchedEffect(query) { if (query.trim().length >= 2) { delay(500); onSearch() } }
    var showSearch by remember { mutableStateOf(true) }
    Box(modifier.fillMaxSize().background(NightBg)) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 18.dp)) {
            Row(Modifier.fillMaxWidth().padding(top = 22.dp, bottom = 20.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("‹", color = Ink, fontSize = 34.sp, modifier = Modifier.clickable { onBack() }.padding(end = 14.dp))
                Text("Manage cities", color = Ink, fontSize = 25.sp, fontFamily = FontFamily.Cursive)
            }
            OutlinedTextField(
                value = query, onValueChange = onQuery, modifier = Modifier.fillMaxWidth(),
                singleLine = true, shape = RoundedCornerShape(28.dp),
                placeholder = { Text("Search", color = Muted, fontFamily = FontFamily.Cursive) },
                leadingIcon = { Text("⌕", fontSize = 25.sp, color = Muted) },
                trailingIcon = { if (query.isNotBlank()) TextButton(onClick = { onQuery("") }) { Text("Clear", color = Sky) } },
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = Color(0xFF1C1C1F), unfocusedContainerColor = Color(0xFF1C1C1F),
                    focusedBorderColor = Color.Transparent, unfocusedBorderColor = Color.Transparent,
                    focusedTextColor = Ink, unfocusedTextColor = Ink, cursorColor = Sky
                )
            )
            if (searching) LinearProgressIndicator(Modifier.fillMaxWidth().padding(top = 8.dp), color = Sky)
            if (searchError.isNotBlank() && query.trim().length >= 2) Text(searchError, color = Orange, fontSize = 11.sp, modifier = Modifier.padding(top = 8.dp))
            if (results.isNotEmpty() && query.trim().length >= 2) {
                Spacer(Modifier.height(18.dp))
                results.forEach { place ->
                    DarkCityCard(place, false, "＋ Add") { onSave(place) }
                    TextButton(onClick = { onSelect(place) }) { Text("Show weather", color = Sky) }
                }
            }
            Spacer(Modifier.height(20.dp))
            Text("CURRENT CITY", color = Muted, fontSize = 11.sp, letterSpacing = 1.sp, modifier = Modifier.padding(bottom = 10.dp))
            if (current != null) DarkCityCard(current, true, "Selected") { onSelect(current) }
            Spacer(Modifier.height(18.dp))
            Text("SAVED CITIES", color = Muted, fontSize = 11.sp, letterSpacing = 1.sp, modifier = Modifier.padding(bottom = 10.dp))
            if (saved.isEmpty()) InfoCard("No saved cities", "Search for a city and add it to your list.")
            else saved.forEach { place ->
                DarkCityCard(place, current?.name == place.name, "× Remove") {
                    if (current?.name == place.name) onSelect(place) else onRemove(place)
                }
            }
            Spacer(Modifier.height(90.dp))
        }
        FloatingActionButton(
            onClick = { if (results.isNotEmpty()) onSave(results.first()) else onDetectLocation() },
            modifier = Modifier.align(Alignment.BottomEnd).padding(22.dp),
            containerColor = Color(0xFF2879F5), contentColor = Color.White
        ) { Text("+", fontSize = 35.sp, fontWeight = FontWeight.Light) }
    }
}

@Composable
private fun DarkCityCard(place: WeatherPlace, selected: Boolean, actionLabel: String, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        colors = CardDefaults.cardColors(containerColor = if (selected) Color(0xFF1A2859) else CardSurface),
        shape = RoundedCornerShape(25.dp), modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp)
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 21.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(place.name, color = Ink, fontSize = 24.sp, fontFamily = FontFamily.Cursive, modifier = Modifier.weight(1f))
                if (selected) Text("●", color = Sky, fontSize = 12.sp)
            }
            Row(Modifier.fillMaxWidth().padding(top = 24.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(place.region, color = Muted, fontSize = 12.sp, maxLines = 1)
                Text(actionLabel, color = Sky, fontSize = 11.sp)
            }
        }
    }
}

@Composable
private fun RadarScreen(state: DashboardState, place: WeatherPlace?, modifier: Modifier) {
    val frames = state.radar?.frames.orEmpty()
    var frameIndex by remember(frames.size) { mutableIntStateOf((frames.size - 1).coerceAtLeast(0)) }
    var playing by remember(frames.size) { mutableStateOf(false) }
    val selectedFrame = frames.getOrNull(frameIndex)
    LaunchedEffect(playing, frameIndex, frames.size) {
        if (playing && frames.size > 1) {
            delay(700)
            frameIndex = (frameIndex + 1) % frames.size
        }
    }
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
        ScreenTitle("Rain & radar", place?.name ?: "Weather monitoring")
        if (selectedFrame != null && place != null && !state.radar?.host.isNullOrBlank()) {
            Card(shape = RoundedCornerShape(24.dp), colors = CardDefaults.cardColors(containerColor = Color(0xFF0D2736))) {
                Column(Modifier.fillMaxWidth().padding(12.dp)) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("HISTORICAL PRECIPITATION RADAR", color = Color(0xFF6BD4E7), fontSize = 9.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
                            Text(formatRadarTime(selectedFrame.time), color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 5.dp))
                        }
                        Text("${frameIndex + 1}/" + frames.size, color = Color.White.copy(alpha = .75f), fontSize = 11.sp)
                    }
                    Spacer(Modifier.height(10.dp))
                    AndroidView(
                        modifier = Modifier.fillMaxWidth().height(270.dp),
                        factory = { context ->
                            WebView(context).apply {
                                settings.javaScriptEnabled = true
                                settings.domStorageEnabled = false
                                settings.allowFileAccess = false
                                settings.allowContentAccess = false
                                settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
                                webViewClient = object : WebViewClient() {
                                    override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean = true
                                }
                                tag = ""
                            }
                        },
                        update = { webView ->
                            val pathKey = selectedFrame.path + "@" + place.latitude + "," + place.longitude
                            if (webView.tag != pathKey) {
                                webView.tag = pathKey
                                val html = radarMapHtml(
                                    state.radar?.host.orEmpty(), selectedFrame.path,
                                    place.latitude, place.longitude
                                )
                                webView.loadDataWithBaseURL("https://earthweatherchannel.web.app/", html, "text/html", "UTF-8", null)
                            }
                        }
                    )
                    Spacer(Modifier.height(9.dp))
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        TextButton(onClick = { frameIndex = (frameIndex - 1).coerceAtLeast(0); playing = false }, enabled = frameIndex > 0) { Text("‹ Previous", color = Color.White) }
                        Spacer(Modifier.weight(1f))
                        TextButton(onClick = { playing = !playing }, enabled = frames.size > 1) {
                            Text(if (playing) "Ⅱ Pause" else "▶ Play", color = Color(0xFF8EDCF0))
                        }
                        Spacer(Modifier.weight(1f))
                        TextButton(onClick = { frameIndex = (frameIndex + 1).coerceAtMost(frames.lastIndex); playing = false }, enabled = frameIndex < frames.lastIndex) { Text("Next ›", color = Color.White) }
                    }
                    if (frames.size > 1) {
                        Slider(
                            value = frameIndex.toFloat(),
                            onValueChange = { frameIndex = it.toInt().coerceIn(0, frames.lastIndex); playing = false },
                            valueRange = 0f..frames.lastIndex.toFloat(),
                            steps = (frames.size - 2).coerceAtLeast(0),
                            enabled = true
                        )
                    }
                    Text("RainViewer past radar frames · OpenStreetMap base map", color = Color.White.copy(alpha = .65f), fontSize = 9.sp)
                }
            }
        } else {
            InfoCard(
                "Radar frames unavailable",
                state.radar?.note ?: "The radar metadata is loading. Radar coverage depends on the provider and location."
            )
        }
        Spacer(Modifier.height(20.dp))
        SectionHeader("RAIN FORECAST", "Next 24 hours")
        if (state.hourly.isEmpty()) InfoCard("Rain forecast unavailable", "No hourly precipitation values were returned.")
        else state.hourly.take(24).forEach { point ->
            Row(Modifier.fillMaxWidth().padding(vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(point.time.substringAfter("T").take(5), color = Ink, fontSize = 12.sp, modifier = Modifier.weight(1f))
                Text("☔ " + (point.precipitationProbability.takeIf { it >= 0 }?.toString() ?: "—") + "%", color = Sky, fontSize = 12.sp, modifier = Modifier.weight(1f))
                Text(formatValue(point.precipitation, 1) + " mm", color = Muted, fontSize = 11.sp)
            }
            Divider(color = Line, thickness = .7.dp)
        }
        Spacer(Modifier.height(18.dp))
        SectionHeader("ACTIVE WEATHER ALERTS", "Provider coverage")
        AlertsCard(state.alerts, state.alertCoverage)
        Text(
            "Radar shows historical frames only, not a future-rain nowcast. Transparent areas may indicate missing radar coverage, not guaranteed clear weather. Official warning coverage depends on the connected national provider.",
            color = Muted, fontSize = 10.sp, lineHeight = 15.sp, modifier = Modifier.padding(vertical = 18.dp)
        )
    }
}

private fun formatRadarTime(epochSeconds: Long): String = runCatching {
    Instant.ofEpochSecond(epochSeconds).atZone(ZoneId.systemDefault())
        .format(DateTimeFormatter.ofPattern("dd MMM · HH:mm", Locale.getDefault()))
}.getOrDefault("Radar frame")

private fun radarMapHtml(host: String, path: String, latitude: Double, longitude: Double): String {
    val uri = runCatching { Uri.parse(host) }.getOrNull()
    val validHost = uri?.host?.lowercase(Locale.ROOT)
    if (uri?.scheme != "https" || validHost == null ||
        !(validHost == "rainviewer.com" || validHost.endsWith(".rainviewer.com"))) {
        return "<html><body style='background:#0d2736;color:white;font-family:sans-serif;padding:24px'>Radar tile host is unavailable.</body></html>"
    }
    val safePath = path.filter { it.isLetterOrDigit() || it == '/' || it == '-' || it == '_' || it == '.' }
    if (!safePath.startsWith("/")) {
        return "<html><body style='background:#0d2736;color:white;font-family:sans-serif;padding:24px'>Radar frame path is invalid.</body></html>"
    }
    val radarTiles = host.trimEnd('/') + safePath.trimEnd('/') + "/256/{z}/{x}/{y}/2/1_1.png"
    val lat = latitude.coerceIn(-85.0, 85.0)
    val lon = longitude.coerceIn(-180.0, 180.0)
    return """
<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#map{height:100%;width:100%;margin:0;background:#142c3a} .leaflet-control-attribution{font-size:9px!important}</style>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
</head><body><div id="map"></div><script>
const map=L.map('map',{zoomControl:true,attributionControl:true}).setView([$lat,$lon],7);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap contributors'}).addTo(map);
L.tileLayer('$radarTiles',{opacity:0.68,tileSize:256,attribution:'Radar © RainViewer'}).addTo(map);
L.circleMarker([$lat,$lon],{radius:6,color:'#ffffff',weight:2,fillColor:'#087fa3',fillOpacity:1}).addTo(map);
setTimeout(()=>map.invalidateSize(),300);
</script></body></html>
""".trimIndent()
}

@Composable
private fun SettingsScreen(
    celsius: Boolean, onUnit: (Boolean) -> Unit, notificationsEnabled: Boolean, onNotifications: (Boolean) -> Unit,
    rainRemindersEnabled: Boolean, onRainReminders: (Boolean) -> Unit, rainThreshold: Int, onRainThreshold: (Int) -> Unit,
    rainStartHour: Int, rainEndHour: Int, onRainWindow: (Int, Int) -> Unit,
    morningBriefingEnabled: Boolean, morningBriefingHour: Int, onMorningBriefing: (Boolean) -> Unit, onMorningHour: (Int) -> Unit,
    modifier: Modifier, state: DashboardState, onBack: () -> Unit, onOpenRealtime: () -> Unit
) {
    var rainExpanded by remember { mutableStateOf(false) }
    Column(modifier.fillMaxSize().background(Color.Black).verticalScroll(rememberScrollState()).padding(horizontal = 18.dp)) {
        Row(Modifier.fillMaxWidth().padding(top = 20.dp, bottom = 28.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("‹", color = Ink, fontSize = 36.sp, modifier = Modifier.clickable { onBack() }.padding(end = 18.dp))
            Text("Settings", color = Ink, fontSize = 26.sp, fontFamily = FontFamily.Cursive)
        }
        SettingsCaption("Weather alerts")
        Column(Modifier.fillMaxWidth().background(Color(0xFF1D1D1F), RoundedCornerShape(23.dp)).padding(horizontal = 18.dp)) {
            Row(Modifier.fillMaxWidth().clickable { rainExpanded = !rainExpanded }.padding(vertical = 19.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Rain alerts", color = Ink, fontSize = 18.sp, fontFamily = FontFamily.Cursive, modifier = Modifier.weight(1f))
                Text(String.format("%02d:00 am–%02d:00 pm", rainStartHour % 12, rainEndHour % 12), color = Muted, fontSize = 12.sp)
                Text("›", color = Muted, fontSize = 27.sp, modifier = Modifier.padding(start = 8.dp))
            }
            if (rainExpanded) {
                Text("Rain probability threshold · " + rainThreshold + "%", color = Muted, fontSize = 11.sp)
                Slider(value = rainThreshold.toFloat(), onValueChange = { onRainThreshold(it.toInt().coerceIn(40, 90)) }, valueRange = 40f..90f, steps = 9)
                Text("Reminder window · " + String.format("%02d:00–%02d:00", rainStartHour, rainEndHour), color = Muted, fontSize = 11.sp)
                Slider(value = rainStartHour.toFloat(), onValueChange = { onRainWindow(it.toInt().coerceIn(0, rainEndHour - 1), rainEndHour) }, valueRange = 0f..22f, steps = 21)
                Slider(value = rainEndHour.toFloat(), onValueChange = { onRainWindow(rainStartHour, it.toInt().coerceIn(rainStartHour + 1, 24)) }, valueRange = 1f..24f, steps = 22)
            }
            DarkDivider()
            SettingSwitch("Severe weather alerts", "Receive supported official weather warnings.", notificationsEnabled, onNotifications)
            DarkDivider()
            DisabledSettingRow("Trip weather notifications", "Trip-based alerts need a trip location and official local warning feed.")
            DarkDivider()
            SettingSwitch(
                "Daily weather forecasts",
                "Get weather updates for your current city twice a day.",
                morningBriefingEnabled, onMorningBriefing
            )
            if (morningBriefingEnabled) {
                Text("Morning briefing · " + String.format("%02d:00", morningBriefingHour), color = Muted, fontSize = 11.sp)
                Slider(value = morningBriefingHour.toFloat(), onValueChange = { onMorningHour(it.toInt().coerceIn(5, 11)) }, valueRange = 5f..11f, steps = 5)
            }
            DarkDivider()
            DisabledSettingRow("Weekly weather forecast", "Weekly digest will be enabled after the forecast schedule is added.")
            DarkDivider()
            Row(Modifier.fillMaxWidth().clickable { onOpenRealtime() }.padding(vertical = 18.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Real-time weather notifications", color = Ink, fontSize = 17.sp, fontFamily = FontFamily.Cursive, modifier = Modifier.weight(1f))
                Text("›", color = Muted, fontSize = 27.sp)
            }
        }
        SettingsCaption("Units")
        Column(Modifier.fillMaxWidth().background(Color(0xFF1D1D1F), RoundedCornerShape(23.dp)).padding(horizontal = 18.dp)) {
            UnitSettingRow("Temperature", if (celsius) "Celsius (°C)" else "Fahrenheit (°F)") { onUnit(!celsius) }
            DarkDivider()
            UnitSettingRow("Wind", "Kilometres per hour (km/h)") { }
            DarkDivider()
            UnitSettingRow("Air pressure", "Hectopascals (hPa)") { }
            DarkDivider()
            UnitSettingRow("Visibility", "Kilometres (km)") { }
        }
        Spacer(Modifier.height(28.dp))
        Column(Modifier.fillMaxWidth().background(Color(0xFF1D1D1F), RoundedCornerShape(23.dp)).clickable { }.padding(18.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("About Weather", color = Ink, fontSize = 17.sp, fontFamily = FontFamily.Cursive, modifier = Modifier.weight(1f))
                Text("›", color = Muted, fontSize = 27.sp)
            }
            Text("EARTH WEATHER · BMR INC.", color = Muted, fontSize = 10.sp, modifier = Modifier.padding(top = 13.dp))
            Text("Forecast and AQI values are model guidance. Alert coverage depends on the connected provider.", color = Muted, fontSize = 10.sp, lineHeight = 15.sp, modifier = Modifier.padding(top = 6.dp))
        }
        Spacer(Modifier.height(36.dp))
    }
}

@Composable
private fun LiveNotificationSettingsScreen(
    current: WeatherPlace?, saved: List<WeatherPlace>, enabled: Boolean, onEnabled: (Boolean) -> Unit,
    onSelect: (WeatherPlace) -> Unit, modifier: Modifier, onBack: () -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    Column(modifier.fillMaxSize().background(Color.Black).padding(horizontal = 18.dp)) {
        Row(Modifier.fillMaxWidth().padding(top = 20.dp, bottom = 42.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("‹", color = Ink, fontSize = 36.sp, modifier = Modifier.clickable { onBack() }.padding(end = 18.dp))
            Text("Real-time weather notifications", color = Ink, fontSize = 22.sp, fontFamily = FontFamily.Cursive)
        }
        Column(Modifier.fillMaxWidth().background(Color(0xFF1D1D1F), RoundedCornerShape(23.dp)).padding(18.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Real-time weather notifications", color = Ink, fontSize = 17.sp, fontFamily = FontFamily.Cursive)
                    Text("Show an ongoing notification with periodic weather updates.", color = Muted, fontSize = 13.sp, lineHeight = 19.sp, modifier = Modifier.padding(top = 5.dp))
                }
                Switch(checked = enabled, onCheckedChange = onEnabled)
            }
        }
        Spacer(Modifier.height(28.dp))
        Row(Modifier.fillMaxWidth().background(Color(0xFF1D1D1F), RoundedCornerShape(23.dp)).clickable { expanded = true }.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Followed city", color = Ink, fontSize = 17.sp, fontFamily = FontFamily.Cursive, modifier = Modifier.weight(1f))
            Text(current?.name ?: "Current city", color = Muted, fontSize = 14.sp)
            Text("⌄", color = Muted, fontSize = 20.sp, modifier = Modifier.padding(start = 8.dp))
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                (listOfNotNull(current) + saved.filter { it.name != current?.name }).distinctBy { it.name }.forEach { city ->
                    DropdownMenuItem(text = { Text(city.name) }, onClick = { expanded = false; onSelect(city) })
                }
            }
        }
        Text("Android may defer background work to preserve battery. Updates are scheduled at a minimum 15-minute interval, not second-by-second.", color = Muted, fontSize = 10.sp, lineHeight = 15.sp, modifier = Modifier.padding(top = 14.dp))
    }
}

@Composable
private fun SettingsCaption(value: String) {
    Text(value, color = Muted, fontSize = 12.sp, fontFamily = FontFamily.Cursive, modifier = Modifier.padding(start = 18.dp, bottom = 15.dp, top = 10.dp))
}

@Composable
private fun DarkDivider() {
    Divider(color = Color(0xFF3A3A3D), thickness = .6.dp)
}

@Composable
private fun SettingSwitch(title: String, subtitle: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 17.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f).padding(end = 12.dp)) {
            Text(title, color = Ink, fontSize = 17.sp, fontFamily = FontFamily.Cursive)
            Text(subtitle, color = Muted, fontSize = 12.sp, lineHeight = 18.sp, modifier = Modifier.padding(top = 4.dp))
        }
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

@Composable
private fun DisabledSettingRow(title: String, subtitle: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 16.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f).padding(end = 12.dp)) {
            Text(title, color = Ink, fontSize = 17.sp, fontFamily = FontFamily.Cursive)
            Text(subtitle, color = Muted, fontSize = 12.sp, lineHeight = 18.sp, modifier = Modifier.padding(top = 4.dp))
        }
        Switch(checked = false, onCheckedChange = {}, enabled = false)
    }
}

@Composable
private fun UnitSettingRow(title: String, value: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable { onClick() }.padding(vertical = 20.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, color = Ink, fontSize = 17.sp, fontFamily = FontFamily.Cursive, modifier = Modifier.weight(1f))
        Text(value, color = Muted, fontSize = 13.sp)
        Text("⌃⌄", color = Muted, fontSize = 16.sp, modifier = Modifier.padding(start = 8.dp))
    }
}

@Composable
private fun ScreenTitle(title: String, subtitle: String) {
    Column(Modifier.padding(top = 20.dp, bottom = 18.dp)) {
        Text(title, color = Ink, fontSize = 26.sp, fontFamily = FontFamily.Cursive)
        Text(subtitle, color = Muted, fontSize = 12.sp)
    }
}

@Composable
private fun SectionHeader(title: String, trailing: String, onClick: (() -> Unit)? = null) {
    Row(Modifier.fillMaxWidth().padding(bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, color = Ink, fontSize = 17.sp, fontFamily = FontFamily.Cursive, modifier = Modifier.weight(1f))
        if (onClick == null) Text(trailing, color = Muted, fontSize = 10.sp)
        else TextButton(onClick = onClick, contentPadding = PaddingValues(0.dp)) { Text(trailing, color = Sky, fontSize = 10.sp) }
    }
}

@Composable
private fun HeroMetric(label: String, value: String) {
    Column {
        Text(label, color = Color.White.copy(alpha = .68f), fontSize = 8.sp, fontWeight = FontWeight.Bold, letterSpacing = .8.sp)
        Spacer(Modifier.height(4.dp))
        Text(value, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun HourlyStrip(items: List<HourlyPoint>, celsius: Boolean) {
    if (items.isEmpty()) {
        DarkInfoCard("Hourly forecast", "Hourly forecast data is loading.")
        return
    }
    Card(colors = CardDefaults.cardColors(containerColor = CardSurface), shape = RoundedCornerShape(25.dp)) {
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 13.dp, vertical = 18.dp),
            horizontalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            items.take(8).forEachIndexed { index, point ->
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(54.dp)) {
                    Text(if (index == 0) "Now" else formatHourLabel(point.time), color = Ink, fontSize = 11.sp, fontFamily = FontFamily.Cursive)
                    Text(weatherEmoji(point.weatherCode), fontSize = 27.sp, modifier = Modifier.padding(vertical = 8.dp))
                    Text(displayTemp(point.temperature, celsius) + "°", color = Ink, fontSize = 15.sp, fontFamily = FontFamily.Cursive)
                }
            }
        }
    }
}

private fun formatHourLabel(value: String): String {
    val time = value.substringAfter("T", value).take(5)
    return runCatching {
        java.time.LocalTime.parse(time).format(DateTimeFormatter.ofPattern("h:mm a", Locale.US)).lowercase(Locale.US)
    }.getOrDefault(time)
}

private fun weatherEmoji(code: Int): String = when (code) {
    0 -> "☀️"
    1 -> "🌤️"
    2 -> "⛅"
    3 -> "☁️"
    45, 48 -> "🌫️"
    51, 53, 55, 56, 57 -> "🌦️"
    61, 63, 65, 66, 67 -> "🌧️"
    71, 73, 75, 77, 85, 86 -> "❄️"
    80, 81, 82 -> "🌦️"
    95, 96, 99 -> "⛈️"
    else -> "🌡️"
}

@Composable
private fun DailyPreview(items: List<DailyPoint>, celsius: Boolean) {
    if (items.isEmpty()) { DarkInfoCard("Multi-day forecast", "Daily forecast is being refreshed."); return }
    var view by remember { mutableStateOf("List") }
    Card(colors = CardDefaults.cardColors(containerColor = CardSurface), shape = RoundedCornerShape(25.dp)) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Multi-day forecast", color = Muted, fontSize = 13.sp, fontFamily = FontFamily.Cursive, modifier = Modifier.weight(1f))
                Row(Modifier.background(RaisedSurface, CircleShape).padding(3.dp)) {
                    listOf("Line", "List").forEach { label ->
                        Text(
                            label, color = if (view == label) Ink else Muted, fontSize = 11.sp,
                            modifier = Modifier.background(if (view == label) Color(0xFF35416B) else Color.Transparent, CircleShape)
                                .clickable { view = label }.padding(horizontal = 13.dp, vertical = 7.dp)
                        )
                    }
                }
            }
            Divider(color = Line, modifier = Modifier.padding(vertical = 10.dp))
            if (view == "List") {
                items.take(7).forEachIndexed { index, day ->
                    DarkDailyRow(day, index, celsius)
                }
            } else {
                ForecastTemperatureChart(items, celsius)
            }
            Text("View details  ›", color = Sky, fontSize = 12.sp, modifier = Modifier.align(Alignment.CenterHorizontally).clickable { view = if (view == "List") "Line" else "List" }.padding(top = 8.dp))
        }
    }
}

@Composable
private fun DarkDailyRow(day: DailyPoint, index: Int, celsius: Boolean) {
    val dateLabel = if (index == 0) "Today" else runCatching {
        java.time.LocalDate.parse(day.date).format(DateTimeFormatter.ofPattern("d MMM  EEE", Locale.US))
    }.getOrDefault(day.date)
    Row(Modifier.fillMaxWidth().padding(vertical = 11.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(dateLabel, color = Ink, fontSize = 13.sp, fontFamily = FontFamily.Cursive, modifier = Modifier.weight(1.15f))
        Text(weatherEmoji(day.weatherCode), fontSize = 24.sp, modifier = Modifier.weight(.55f))
        Text(displayTemp(day.low, celsius) + "° / " + displayTemp(day.high, celsius) + "°", color = Ink, fontSize = 13.sp, fontFamily = FontFamily.Cursive)
    }
}

@Composable
private fun DailyRow(day: DailyPoint, index: Int, celsius: Boolean) {
    Row(Modifier.fillMaxWidth().padding(vertical = 11.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.width(76.dp)) {
            Text(if (index == 0) "Today" else day.date.takeLast(5), color = Ink, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
            Text(if (day.rainChance >= 0) "☔ " + day.rainChance + "%" else " ", color = Sky, fontSize = 9.sp)
        }
        WeatherIcon(day.weatherCode, 32.dp, Modifier.width(42.dp))
        Text(displayTemp(day.low, celsius) + "°", color = Muted, fontSize = 12.sp, modifier = Modifier.width(43.dp))
        Box(Modifier.weight(1f).height(5.dp).background(Line, CircleShape)) {
            Box(Modifier.fillMaxWidth(.55f).height(5.dp).background(Brush.horizontalGradient(listOf(Color(0xFF76C8D3), Sky)), CircleShape))
        }
        Text(displayTemp(day.high, celsius) + "°", color = Ink, fontWeight = FontWeight.Bold, fontSize = 12.sp, modifier = Modifier.width(43.dp), textAlign = androidx.compose.ui.text.style.TextAlign.End)
    }
}

@Composable
private fun AirQualityCard(air: AirQuality?) {
    if (air == null || air.europeanAqi < 0) { DarkInfoCard("Air quality", "No AQI value is available for this location."); return }
    val tone = when (air.europeanAqi) {
        in 0..20 -> Good; in 21..40 -> Color(0xFF9ACB73); in 41..60 -> Orange
        in 61..80 -> Color(0xFFE58B67); else -> Color(0xFFE65F65)
    }
    Card(colors = CardDefaults.cardColors(containerColor = CardSurface), shape = RoundedCornerShape(23.dp)) {
        Column(Modifier.fillMaxWidth().padding(18.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Air quality", color = Muted, fontSize = 12.sp, fontFamily = FontFamily.Cursive)
                    Text(air.category + " " + air.europeanAqi, color = tone, fontSize = 23.sp, fontFamily = FontFamily.Cursive)
                }
                Text("🌫️", fontSize = 35.sp)
            }
            Box(Modifier.fillMaxWidth().height(7.dp).background(
                Brush.horizontalGradient(listOf(Good, Color(0xFFB7CB54), Orange, Color(0xFFE65F65), Color(0xFF794C91))), CircleShape
            ))
            Row(Modifier.fillMaxWidth().padding(top = 13.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                TinyMetric("PM2.5", formatValue(air.pm25, 1) + " µg/m³")
                TinyMetric("PM10", formatValue(air.pm10, 1) + " µg/m³")
                TinyMetric("OZONE", formatValue(air.ozone, 1))
            }
            Text("Modelled air-quality estimate, not a ground-station reading.", color = Muted, fontSize = 9.sp, modifier = Modifier.padding(top = 10.dp))
        }
    }
}

@Composable
private fun DarkInfoCard(title: String, detail: String) {
    Card(colors = CardDefaults.cardColors(containerColor = CardSurface), shape = RoundedCornerShape(20.dp)) {
        Column(Modifier.fillMaxWidth().padding(17.dp)) {
            Text(title, color = Ink, fontSize = 15.sp, fontFamily = FontFamily.Cursive)
            Text(detail, color = Muted, fontSize = 11.sp, lineHeight = 16.sp, modifier = Modifier.padding(top = 5.dp))
        }
    }
}

@Composable
private fun SunriseCard(day: DailyPoint?) {
    if (day == null) { DarkInfoCard("Sunrise & sunset", "Sunrise and sunset data is loading."); return }
    Card(colors = CardDefaults.cardColors(containerColor = CardSurface), shape = RoundedCornerShape(23.dp)) {
        Column(Modifier.fillMaxWidth().padding(18.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Column {
                    Text("🌅  Sunrise", color = Muted, fontSize = 12.sp)
                    Text(day.sunrise.substringAfter("T").take(5).ifBlank { "—" }, color = Ink, fontSize = 18.sp, fontFamily = FontFamily.Cursive)
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text("🌇  Sunset", color = Muted, fontSize = 12.sp)
                    Text(day.sunset.substringAfter("T").take(5).ifBlank { "—" }, color = Ink, fontSize = 18.sp, fontFamily = FontFamily.Cursive)
                }
            }
            Canvas(Modifier.fillMaxWidth().height(56.dp).padding(top = 8.dp)) {
                val y = size.height * .76f
                drawLine(Line, Offset(8f, y), Offset(size.width - 8f, y), strokeWidth = 3f)
                drawCircle(Color(0xFFFFD45E), radius = 8f, center = Offset(size.width * .5f, y - 18f))
                drawArc(Color(0xFFFFD45E), 180f, 180f, false, Offset(size.width * .16f, y - 47f), androidx.compose.ui.geometry.Size(size.width * .68f, 76f), style = Stroke(width = 2f))
            }
            Text("Daylight forecast", color = Muted, fontSize = 10.sp)
        }
    }
}

@Composable
private fun AlertsCard(alerts: List<WeatherAlert>, coverage: String) {
    if (alerts.isEmpty()) {
        DarkInfoCard(
            "No active alert returned",
            (coverage.ifBlank { "The connected warning provider has not returned an active alert." }) + " This does not confirm that no local warning exists."
        )
    } else alerts.take(5).forEach { alert ->
        Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF261D2A)), shape = RoundedCornerShape(18.dp), modifier = Modifier.padding(bottom = 8.dp)) {
            Column(Modifier.fillMaxWidth().padding(15.dp)) {
                Text("⚠ " + alert.severity.uppercase(), color = Orange, fontSize = 10.sp)
                Text(alert.title, color = Ink, fontSize = 15.sp, fontFamily = FontFamily.Cursive, modifier = Modifier.padding(top = 5.dp))
                Text(alert.description.take(350), color = Muted, fontSize = 11.sp, lineHeight = 16.sp, modifier = Modifier.padding(top = 5.dp))
            }
        }
    }
}

@Composable
private fun CityListRow(place: WeatherPlace, selected: Boolean, onClick: () -> Unit, trailing: (@Composable () -> Unit)? = null) {
    DarkCityCard(place, selected, if (selected) "SELECTED" else "Open") { onClick() }
    trailing?.invoke()
}

@Composable
private fun TinyMetric(title: String, value: String, icon: String = "") {
    Column(horizontalAlignment = Alignment.Start) {
        if (icon.isNotBlank()) Text(icon, fontSize = 17.sp)
        Text(title, color = Muted, fontSize = 8.sp, fontWeight = FontWeight.Bold, letterSpacing = .5.sp)
        Text(value, color = Ink, fontWeight = FontWeight.SemiBold, fontSize = 11.sp)
    }
}

@Composable
private fun InfoCard(title: String, detail: String) {
    DarkInfoCard(title, detail)
}

@Composable
private fun AnimatedWeatherIcon(code: Int, size: Dp) {
    val transition = rememberInfiniteTransition(label = "earth-weather-icon")
    val drift by transition.animateFloat(
        initialValue = 0f, targetValue = -5f,
        animationSpec = infiniteRepeatable(animation = tween(2200), repeatMode = RepeatMode.Reverse),
        label = "weather-drift"
    )
    WeatherIcon(code, size, Modifier.offset(y = drift.dp))
}

private fun topCitiesFor(countryCode: String): List<WeatherPlace> = when (countryCode.uppercase()) {
    "IN" -> listOf(
        WeatherPlace("Chennai", "Tamil Nadu, India", 13.0827, 80.2707, "India", "IN", "Tamil Nadu"),
        WeatherPlace("Coimbatore", "Tamil Nadu, India", 11.0168, 76.9558, "India", "IN", "Tamil Nadu"),
        WeatherPlace("Salem", "Tamil Nadu, India", 11.6643, 78.1460, "India", "IN", "Tamil Nadu"),
        WeatherPlace("Tiruchirappalli", "Tamil Nadu, India", 10.7905, 78.7047, "India", "IN", "Tamil Nadu"),
        WeatherPlace("Erode", "Tamil Nadu, India", 11.3410, 77.7172, "India", "IN", "Tamil Nadu"),
        WeatherPlace("Bengaluru", "Karnataka, India", 12.9716, 77.5946, "India", "IN", "Karnataka")
    )
    "US" -> listOf(
        WeatherPlace("New York", "New York, United States", 40.7128, -74.0060, "United States", "US"),
        WeatherPlace("Los Angeles", "California, United States", 34.0522, -118.2437, "United States", "US"),
        WeatherPlace("Chicago", "Illinois, United States", 41.8781, -87.6298, "United States", "US"),
        WeatherPlace("Houston", "Texas, United States", 29.7604, -95.3698, "United States", "US")
    )
    "GB" -> listOf(
        WeatherPlace("London", "England, United Kingdom", 51.5072, -0.1276, "United Kingdom", "GB"),
        WeatherPlace("Manchester", "England, United Kingdom", 53.4808, -2.2426, "United Kingdom", "GB"),
        WeatherPlace("Birmingham", "England, United Kingdom", 52.4862, -1.8904, "United Kingdom", "GB"),
        WeatherPlace("Glasgow", "Scotland, United Kingdom", 55.8642, -4.2518, "United Kingdom", "GB")
    )
    "AE" -> listOf(
        WeatherPlace("Dubai", "United Arab Emirates", 25.2048, 55.2708, "United Arab Emirates", "AE"),
        WeatherPlace("Abu Dhabi", "United Arab Emirates", 24.4539, 54.3773, "United Arab Emirates", "AE"),
        WeatherPlace("Sharjah", "United Arab Emirates", 25.3463, 55.4209, "United Arab Emirates", "AE")
    )
    "AU" -> listOf(
        WeatherPlace("Sydney", "New South Wales, Australia", -33.8688, 151.2093, "Australia", "AU"),
        WeatherPlace("Melbourne", "Victoria, Australia", -37.8136, 144.9631, "Australia", "AU"),
        WeatherPlace("Brisbane", "Queensland, Australia", -27.4698, 153.0251, "Australia", "AU")
    )
    else -> worldTopCities().take(5)
}

private fun worldTopCities(): List<WeatherPlace> = listOf(
    WeatherPlace("New York", "United States", 40.7128, -74.0060, "United States", "US"),
    WeatherPlace("London", "United Kingdom", 51.5072, -0.1276, "United Kingdom", "GB"),
    WeatherPlace("Tokyo", "Japan", 35.6762, 139.6503, "Japan", "JP"),
    WeatherPlace("Paris", "France", 48.8566, 2.3522, "France", "FR"),
    WeatherPlace("Dubai", "United Arab Emirates", 25.2048, 55.2708, "United Arab Emirates", "AE"),
    WeatherPlace("Singapore", "Singapore", 1.3521, 103.8198, "Singapore", "SG"),
    WeatherPlace("Sydney", "Australia", -33.8688, 151.2093, "Australia", "AU"),
    WeatherPlace("Toronto", "Canada", 43.6532, -79.3832, "Canada", "CA")
)

@Composable
private fun WeatherIcon(code: Int, size: Dp, modifier: Modifier = Modifier) {
    val resource = when (code) {
        0 -> R.drawable.ic_weather_sun
        1, 2 -> R.drawable.ic_weather_partly
        3 -> R.drawable.ic_weather_cloud
        45, 48 -> R.drawable.ic_weather_fog
        51, 53, 55, 56, 57 -> R.drawable.ic_weather_rain
        61, 63, 65, 66, 67, 80, 81, 82 -> R.drawable.ic_weather_rain
        71, 73, 75, 77, 85, 86 -> R.drawable.ic_weather_snow
        95, 96, 99 -> R.drawable.ic_weather_thunder
        else -> R.drawable.ic_weather_partly
    }
    Image(
        painter = painterResource(resource),
        contentDescription = weatherDescription(code).first,
        modifier = modifier.size(size)
    )
}


private fun weatherGradient(code: Int, isDay: Boolean): List<Color> = when {
    code in listOf(95, 96, 99) -> listOf(Color(0xFF273849), Color(0xFF41546B), Color(0xFF172737))
    code in listOf(51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82) -> listOf(Color(0xFF123D5A), Color(0xFF236B8E), Color(0xFF122E48))
    code in listOf(71, 73, 75, 77, 85, 86) -> listOf(Color(0xFF5A91B2), Color(0xFF8CBED2), Color(0xFF426F90))
    code in listOf(45, 48) -> listOf(Color(0xFF536B7B), Color(0xFF8096A4), Color(0xFF3A5364))
    code == 0 && !isDay -> listOf(Color(0xFF111B37), Color(0xFF243E66), Color(0xFF101D35))
    code == 0 -> listOf(Color(0xFF0B6894), Color(0xFF26A7C4), Color(0xFFF0B66B))
    else -> listOf(Color(0xFF06435F), Color(0xFF087FA3), Color(0xFF63B8C5))
}

@Composable
private fun WeatherDetailsCard(current: CurrentConditions?, celsius: Boolean) {
    WeatherMetricGrid(DashboardState(current = current), celsius)
}

@Composable
private fun LifeIndexCard(state: DashboardState) {
    val current = state.current
    val rainChance = state.hourly.take(6).map { it.precipitationProbability }.filter { it >= 0 }.maxOrNull() ?: -1
    val uv = state.daily.firstOrNull()?.uvMax ?: state.air?.uv ?: Double.NaN
    val temp = current?.temperature ?: Double.NaN
    val wind = current?.windKmh ?: Double.NaN
    val items = listOf(
        Triple("Outdoor", if (rainChance >= 70) "Rain likely" else if (temp.isFinite() && temp >= 35) "Very hot" else "Suitable for a walk", "🚶"),
        Triple("Rain gear", if (rainChance >= 60) "Carry umbrella" else if (rainChance >= 0) "Low rain chance" else "No data", "☂️"),
        Triple("UV index", if (uv.isFinite()) formatValue(uv, 1) + " · " + if (uv >= 6) "High" else "Low" else "Unavailable", "☀️"),
        Triple("Wind", if (wind.isFinite()) formatValue(wind) + " km/h" else "Unavailable", "🌬️"),
        Triple("Humidity", current?.humidity?.takeIf { it >= 0 }?.let { it.toString() + "%" } ?: "Unavailable", "💧"),
        Triple("Sky", weatherDescription(current?.weatherCode ?: -1).first, "☁️")
    )
    Card(colors = CardDefaults.cardColors(containerColor = CardSurface), shape = RoundedCornerShape(23.dp)) {
        Column(Modifier.fillMaxWidth().padding(17.dp)) {
            items.chunked(2).forEachIndexed { index, row ->
                Row(Modifier.fillMaxWidth().padding(vertical = 9.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    row.forEach { item ->
                        Column(Modifier.weight(1f)) {
                            Text(item.third + "  " + item.first, color = Ink, fontSize = 13.sp, fontFamily = FontFamily.Cursive)
                            Text(item.second, color = Muted, fontSize = 11.sp, modifier = Modifier.padding(top = 6.dp))
                        }
                    }
                }
                if (index < 2) Divider(color = Line)
            }
            Text("Guidance is derived from forecast data and is not an official health or safety notice.", color = Muted, fontSize = 9.sp, lineHeight = 13.sp, modifier = Modifier.padding(top = 8.dp))
        }
    }
}

@Composable
private fun LifeIndexItem(label: String, value: String, icon: String) {
    Column(Modifier.widthIn(max = 190.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(icon, fontSize = 16.sp)
            Spacer(Modifier.width(6.dp))
            Text(label, color = Muted, fontSize = 8.sp, fontWeight = FontWeight.Bold, letterSpacing = .7.sp)
        }
        Text(value, color = Ink, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
    }
}

private fun displayTemp(value: Double, celsius: Boolean): String {
    if (value.isNaN() || value.isInfinite()) return "—"
    return formatValue(if (celsius) value else value * 9.0 / 5.0 + 32.0)
}
