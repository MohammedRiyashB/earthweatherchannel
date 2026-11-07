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

private val Ink = Color(0xFF172630)
private val Sky = Color(0xFF087FA3)
private val Deep = Color(0xFF063F5B)
private val Page = Color(0xFFF2F6F8)
private val Muted = Color(0xFF778892)
private val Line = Color(0xFFE5EBEF)
private val Good = Color(0xFF28845B)
private val Orange = Color(0xFFD78A28)

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

    private val locationPermission = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        if (grants.values.any { it }) locateDevice() else restoreSavedOrShowLocationError()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        restorePreferences()
        setContent {
            MaterialTheme(colorScheme = lightColorScheme(primary = Sky, background = Page, surface = Color.White, onSurface = Ink)) {
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
                    onSearch = { searchCities(cityQuery) }
                )
            }
        }
        selectedPlace?.let { loadWeather(it) } ?: requestLocation()
        if (notificationsEnabled) scheduleAlertChecks()
        if (rainRemindersEnabled) scheduleRainReminders()
        if (morningBriefingEnabled) MorningBriefingWorker.schedule(this)
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
            WorkManager.getInstance(this).cancelUniqueWork("earth-weather-morning-briefing")
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
    celsius: Boolean, onUnit: (Boolean) -> Unit, notificationsEnabled: Boolean, onNotifications: (Boolean) -> Unit, rainRemindersEnabled: Boolean, onRainReminders: (Boolean) -> Unit, rainThreshold: Int, onRainThreshold: (Int) -> Unit, rainStartHour: Int, rainEndHour: Int, onRainWindow: (Int, Int) -> Unit, morningBriefingEnabled: Boolean, morningBriefingHour: Int, onMorningBriefing: (Boolean) -> Unit, onMorningHour: (Int) -> Unit, onSearch: () -> Unit
) {
    Scaffold(
        containerColor = Page,
        bottomBar = {
            NavigationBar(containerColor = Color.White) {
                listOf("Weather", "Forecast", "Cities", "Radar", "Settings").forEach { item ->
                    NavigationBarItem(
                        selected = tab == item, onClick = { onTab(item) },
                        icon = { Text(when (item) { "Weather" -> "☀"; "Forecast" -> "▥"; "Cities" -> "⌖"; "Radar" -> "◉"; else -> "⚙" }, fontSize = 19.sp) },
                        label = { Text(item, fontSize = 10.sp, maxLines = 1) }
                    )
                }
            }
        }
    ) { padding ->
        when (tab) {
            "Weather" -> WeatherScreen(state, place, Modifier.padding(padding), celsius, onRefresh, onTab, onSwipeCity)
            "Forecast" -> ForecastScreen(state, place, Modifier.padding(padding), celsius)
            "Cities" -> CitiesScreen(place, savedCities, query, onQuery, results, searching, searchError, Modifier.padding(padding), onSelect, onSave, onRemove, onSearch, onDetectLocation)
            "Radar" -> RadarScreen(state, place, Modifier.padding(padding))
            else -> SettingsScreen(celsius, onUnit, notificationsEnabled, onNotifications, rainRemindersEnabled, onRainReminders, rainThreshold, onRainThreshold, rainStartHour, rainEndHour, onRainWindow, morningBriefingEnabled, morningBriefingHour, onMorningBriefing, onMorningHour, Modifier.padding(padding), state)
        }
    }
}

@Composable
private fun WeatherScreen(state: DashboardState, place: WeatherPlace?, modifier: Modifier, celsius: Boolean, onRefresh: () -> Unit, onTab: (String) -> Unit, onSwipeCity: (Int) -> Unit) {
    LaunchedEffect(place?.latitude, place?.longitude) {
        while (true) {
            delay(10 * 60 * 1000L)
            onRefresh()
        }
    }
    val current = state.current
    val description = weatherDescription(current?.weatherCode ?: -1)
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
        Row(Modifier.fillMaxWidth().padding(top = 15.dp, bottom = 13.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("EARTH WEATHER", fontSize = 21.sp, fontWeight = FontWeight.Black, color = Ink)
                Text("LIVE CONDITIONS · YOUR WORLD", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = Sky, letterSpacing = 1.5.sp)
            }
            TextButton(onClick = onRefresh) { Text("↻ Refresh") }
        }
        Row(Modifier.fillMaxWidth().padding(bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(place?.name ?: "Finding your location…", fontSize = 19.sp, color = Ink, fontWeight = FontWeight.Bold)
                Text(place?.region ?: "Allow location or search a city", fontSize = 11.sp, color = Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            TextButton(onClick = { onTab("Cities") }) { Text("Change") }
        }
        var horizontalTravel = 0f
        Column(Modifier.fillMaxWidth().background(
            Brush.linearGradient(weatherGradient(current?.weatherCode ?: -1, current?.isDay ?: true)),
            RoundedCornerShape(28.dp)
        ).pointerInput(place?.latitude, place?.longitude) {
            detectHorizontalDragGestures(
                onDragEnd = {
                    if (horizontalTravel < -55f) onSwipeCity(1)
                    else if (horizontalTravel > 55f) onSwipeCity(-1)
                    horizontalTravel = 0f
                },
                onDragCancel = { horizontalTravel = 0f },
                onHorizontalDrag = { change, amount -> horizontalTravel += amount; change.consume() }
            )
        }.padding(22.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                Column {
                    Text("CURRENT WEATHER", color = Color.White.copy(alpha = .76f), fontSize = 9.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.8.sp)
                    Spacer(Modifier.height(6.dp))
                    Text(description.first, color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                }
                AnimatedWeatherIcon(current?.weatherCode ?: -1, 62.dp)
            }
            Row(verticalAlignment = Alignment.Top) {
                Text(displayTemp(current?.temperature ?: Double.NaN, celsius), color = Color.White, fontSize = 78.sp, fontWeight = FontWeight.Light, letterSpacing = (-4).sp)
                Text(if (celsius) "°C" else "°F", color = Color.White, fontSize = 25.sp, modifier = Modifier.padding(top = 12.dp))
            }
            Text("Feels like " + displayTemp(current?.feelsLike ?: Double.NaN, celsius) + "°", color = Color.White.copy(alpha = .82f), fontSize = 13.sp)
            Spacer(Modifier.height(22.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                HeroMetric("HUMIDITY", current?.humidity?.takeIf { it >= 0 }?.toString()?.plus("%") ?: "—")
                HeroMetric("WIND", current?.windKmh?.let { formatValue(it) + " km/h" } ?: "—")
                HeroMetric("RAIN", current?.precipitation?.let { formatValue(it, 1) + " mm" } ?: "—")
            }
        }
        if (state.loading) LinearProgressIndicator(Modifier.fillMaxWidth().padding(top = 12.dp), color = Sky)
        if (state.error.isNotBlank()) Text(state.error, color = Orange, fontSize = 10.sp, modifier = Modifier.padding(top = 10.dp))
        Spacer(Modifier.height(20.dp))
        SectionHeader("WEATHER DETAILS", "Current conditions")
        WeatherDetailsCard(current, celsius)
        Spacer(Modifier.height(20.dp))
        SectionHeader("HOURLY FORECAST", "Next 24 hours")
        HourlyStrip(state.hourly.take(24), celsius)
        Spacer(Modifier.height(20.dp))
        SectionHeader("15-DAY OUTLOOK", "View all", { onTab("Forecast") })
        DailyPreview(state.daily.take(5), celsius)
        Spacer(Modifier.height(20.dp))
        SectionHeader("AIR QUALITY", "Model estimate")
        AirQualityCard(state.air)
        Spacer(Modifier.height(20.dp))
        SectionHeader("DAILY LIFE INDICES", "Weather guidance")
        LifeIndexCard(state)
        Spacer(Modifier.height(20.dp))
        SectionHeader("SUN & DAYLIGHT", "Today")
        SunriseCard(state.daily.firstOrNull())
        Spacer(Modifier.height(20.dp))
        SectionHeader("WEATHER ALERTS", "Coverage")
        AlertsCard(state.alerts, state.alertCoverage)
        Text("Weather data · " + (current?.source ?: "EARTH WEATHER"), color = Muted, fontSize = 9.sp, modifier = Modifier.padding(vertical = 20.dp))
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
    Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(20.dp)) {
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
    onRemove: (WeatherPlace) -> Unit, onSearch: () -> Unit, onDetectLocation: () -> Unit
) {
    LaunchedEffect(query) {
        if (query.trim().length >= 2) { delay(500); onSearch() }
    }
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
        ScreenTitle("Your cities", "Search and manage locations")
        OutlinedButton(onClick = onDetectLocation, modifier = Modifier.fillMaxWidth()) { Text("⌖  Use my current location") }
        OutlinedTextField(
            value = query, onValueChange = onQuery, modifier = Modifier.fillMaxWidth(),
            singleLine = true, shape = RoundedCornerShape(16.dp),
            placeholder = { Text("Search city, town or village") },
            leadingIcon = { Text("⌕", fontSize = 22.sp) },
            trailingIcon = { if (query.isNotBlank()) TextButton(onClick = { onQuery("") }) { Text("Clear") } }
        )
        if (searching) LinearProgressIndicator(Modifier.fillMaxWidth().padding(top = 6.dp), color = Sky)
        if (searchError.isNotBlank() && query.trim().length >= 2) Text(searchError, color = Orange, fontSize = 11.sp, modifier = Modifier.padding(top = 8.dp))
        if (results.isNotEmpty() && query.trim().length >= 2) {
            Spacer(Modifier.height(16.dp)); SectionHeader("SEARCH RESULTS", results.size.toString() + " places")
            results.forEach { place ->
                CityListRow(place, false, { onSelect(place) }) {
                    TextButton(onClick = { onSave(place) }) { Text("＋ Save") }
                }
            }
        }
        Spacer(Modifier.height(20.dp)); SectionHeader("CURRENT CITY", "Device location")
        if (current != null) CityListRow(current, true, { onSelect(current) })
        val nationalCities = topCitiesFor(current?.countryCode ?: "")
        Spacer(Modifier.height(20.dp)); SectionHeader("TOP CITIES · " + (current?.country ?: "YOUR REGION"), "Popular locations")
        nationalCities.forEach { city ->
            CityListRow(city, false, { onSelect(city) }) {
                TextButton(onClick = { onSave(city) }) { Text("＋ Save") }
            }
        }
        val worldCities = worldTopCities()
        Spacer(Modifier.height(20.dp)); SectionHeader("TOP CITIES · WORLD", "Global")
        worldCities.forEach { city ->
            CityListRow(city, false, { onSelect(city) }) {
                TextButton(onClick = { onSave(city) }) { Text("＋ Save") }
            }
        }
        Spacer(Modifier.height(20.dp)); SectionHeader("SAVED CITIES", saved.size.toString() + " saved")
        if (saved.isEmpty()) InfoCard("No saved cities yet", "Search for a city and tap Save to keep it in your list.")
        else saved.forEach { place ->
            CityListRow(place, current?.name == place.name, { onSelect(place) }) {
                TextButton(onClick = { onRemove(place) }) { Text("Remove", color = Orange) }
            }
        }
        Spacer(Modifier.height(30.dp))
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
private fun SettingsScreen(celsius: Boolean, onUnit: (Boolean) -> Unit, notificationsEnabled: Boolean, onNotifications: (Boolean) -> Unit, rainRemindersEnabled: Boolean, onRainReminders: (Boolean) -> Unit, rainThreshold: Int, onRainThreshold: (Int) -> Unit, rainStartHour: Int, rainEndHour: Int, onRainWindow: (Int, Int) -> Unit, morningBriefingEnabled: Boolean, morningBriefingHour: Int, onMorningBriefing: (Boolean) -> Unit, onMorningHour: (Int) -> Unit, modifier: Modifier, state: DashboardState) {
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
        ScreenTitle("Settings", "Personalise EARTH WEATHER")
        SectionHeader("UNITS", "Temperature")
        Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(18.dp)) {
            Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Temperature unit", color = Ink, fontWeight = FontWeight.SemiBold)
                    Text("Choose Celsius or Fahrenheit", color = Muted, fontSize = 11.sp)
                }
                FilterChip(selected = celsius, onClick = { onUnit(true) }, label = { Text("°C") })
                Spacer(Modifier.width(5.dp))
                FilterChip(selected = !celsius, onClick = { onUnit(false) }, label = { Text("°F") })
            }
        }
        Spacer(Modifier.height(18.dp))
        Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(18.dp)) {
            Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Severe weather notifications", color = Ink, fontWeight = FontWeight.SemiBold)
                    Text("Background checks when an official provider has coverage", color = Muted, fontSize = 10.sp)
                }
                Switch(checked = notificationsEnabled, onCheckedChange = onNotifications)
            }
        }
        Spacer(Modifier.height(10.dp))
        Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(18.dp)) {
            Column(Modifier.fillMaxWidth().padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Rain reminders", color = Ink, fontWeight = FontWeight.SemiBold)
                        Text("Forecast-based notification within the next 6 hours", color = Muted, fontSize = 10.sp)
                    }
                    Switch(checked = rainRemindersEnabled, onCheckedChange = onRainReminders)
                }
                Spacer(Modifier.height(12.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Rain probability threshold", color = Muted, fontSize = 11.sp)
                    Text("$rainThreshold%", color = Sky, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }
                Slider(
                    value = rainThreshold.toFloat(),
                    onValueChange = { onRainThreshold(it.toInt().coerceIn(40, 90)) },
                    valueRange = 40f..90f,
                    steps = 9
                )
                Spacer(Modifier.height(8.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Quiet hours window", color = Muted, fontSize = 11.sp)
                    Text(String.format("%02d:00–%02d:00", rainStartHour, rainEndHour), color = Sky, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
                Text("Start time", color = Muted, fontSize = 9.sp)
                Slider(
                    value = rainStartHour.toFloat(),
                    onValueChange = { onRainWindow(it.toInt().coerceIn(0, rainEndHour - 1), rainEndHour) },
                    valueRange = 0f..22f,
                    steps = 21
                )
                Text("End time", color = Muted, fontSize = 9.sp)
                Slider(
                    value = rainEndHour.toFloat(),
                    onValueChange = { onRainWindow(rainStartHour, it.toInt().coerceIn(rainStartHour + 1, 24)) },
                    valueRange = 1f..24f,
                    steps = 22
                )
            }
        }
        Spacer(Modifier.height(10.dp))
        Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(18.dp)) {
            Column(Modifier.fillMaxWidth().padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Morning weather briefing", color = Ink, fontWeight = FontWeight.SemiBold)
                        Text("A daily forecast notification around the selected time", color = Muted, fontSize = 10.sp)
                    }
                    Switch(checked = morningBriefingEnabled, onCheckedChange = onMorningBriefing)
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Briefing time", color = Muted, fontSize = 11.sp)
                    Text(String.format("%02d:00", morningBriefingHour), color = Sky, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
                Slider(
                    value = morningBriefingHour.toFloat(),
                    onValueChange = { onMorningHour(it.toInt().coerceIn(5, 11)) },
                    valueRange = 5f..11f,
                    steps = 5
                )
                Text("Android may delay background delivery to save battery.", color = Muted, fontSize = 9.sp)
            }
        }
        Spacer(Modifier.height(22.dp)); SectionHeader("DATA & PRIVACY", "About your weather")
        InfoCard("EARTH WEATHER API", "Weather information is served by BMR INC. infrastructure. Location is requested only to show local weather. City search works without GPS permission.")
        Spacer(Modifier.height(9.dp))
        InfoCard("DATA SOURCES", "Current weather uses the configured provider failover. Forecast and AQI currently use Open-Meteo evaluation endpoints (CC BY 4.0 attribution). The free tier is non-commercial; commercial release requires the appropriate customer licence/endpoint. City search and reverse geocoding use OpenStreetMap Nominatim attribution. Radar history uses RainViewer past frames; review its commercial terms before public monetisation.")
        Spacer(Modifier.height(9.dp))
        InfoCard("ALERT COVERAGE", state.alertCoverage.ifBlank { "Alert service status has not loaded." })
        Spacer(Modifier.height(9.dp))
        InfoCard("APP VERSION", "EARTH WEATHER · Android native · Version 1.0.0")
        Text("BMR INC. · EARTH WEATHER", color = Muted, fontSize = 10.sp, modifier = Modifier.padding(vertical = 24.dp))
    }
}

@Composable
private fun ScreenTitle(title: String, subtitle: String) {
    Column(Modifier.padding(top = 20.dp, bottom = 18.dp)) {
        Text("EARTH WEATHER", color = Sky, fontWeight = FontWeight.Black, letterSpacing = 1.8.sp, fontSize = 10.sp)
        Text(title, color = Ink, fontWeight = FontWeight.Bold, fontSize = 28.sp)
        Text(subtitle, color = Muted, fontSize = 12.sp)
    }
}

@Composable
private fun SectionHeader(title: String, trailing: String, onClick: (() -> Unit)? = null) {
    Row(Modifier.fillMaxWidth().padding(bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, color = Ink, fontWeight = FontWeight.Bold, fontSize = 12.sp, letterSpacing = .7.sp, modifier = Modifier.weight(1f))
        if (onClick == null) Text(trailing, color = Sky, fontSize = 10.sp)
        else TextButton(onClick = onClick, contentPadding = PaddingValues(0.dp)) { Text(trailing, fontSize = 10.sp) }
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
    if (items.isEmpty()) { InfoCard("Hourly forecast unavailable", "No forecast points were returned by the weather service."); return }
    Row(Modifier.fillMaxWidth().horizontalScroll(androidx.compose.foundation.rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(9.dp)) {
        items.forEachIndexed { index, point ->
            Card(modifier = Modifier.width(76.dp), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(17.dp)) {
                Column(Modifier.fillMaxWidth().padding(vertical = 12.dp, horizontal = 7.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(if (index == 0) "Now" else point.time.substringAfter("T").take(5), color = Muted, fontSize = 10.sp)
                    WeatherIcon(point.weatherCode, 32.dp, Modifier.padding(vertical = 7.dp))
                    Text(displayTemp(point.temperature, celsius) + "°", color = Ink, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    Text("☔ " + (point.precipitationProbability.takeIf { it >= 0 }?.toString() ?: "—") + "%", color = Sky, fontSize = 9.sp, modifier = Modifier.padding(top = 7.dp))
                }
            }
        }
    }
}

@Composable
private fun DailyPreview(items: List<DailyPoint>, celsius: Boolean) {
    if (items.isEmpty()) { InfoCard("Forecast unavailable", "The 15-day forecast is being refreshed."); return }
    items.forEachIndexed { index, day -> DailyRow(day, index, celsius) }
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
    if (air == null || air.europeanAqi < 0) { InfoCard("Air quality unavailable", "No current AQI value was returned for this location."); return }
    val tone = when (air.europeanAqi) {
        in 0..20 -> Good; in 21..40 -> Color(0xFF6A9C49); in 41..60 -> Orange
        in 61..80 -> Color(0xFFD15E3F); else -> Color(0xFFB83B3B)
    }
    Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(20.dp)) {
        Column(Modifier.fillMaxWidth().padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("EUROPEAN AQI", color = Muted, fontSize = 9.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
                    Text(air.europeanAqi.toString(), color = tone, fontSize = 34.sp, fontWeight = FontWeight.Bold)
                    Text(air.category, color = tone, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text("US AQI", color = Muted, fontSize = 9.sp)
                    Text(if (air.usAqi >= 0) air.usAqi.toString() else "—", color = Ink, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                }
            }
            Divider(color = Line, modifier = Modifier.padding(vertical = 12.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                TinyMetric("PM2.5", formatValue(air.pm25, 1) + " µg/m³")
                TinyMetric("PM10", formatValue(air.pm10, 1) + " µg/m³")
                TinyMetric("OZONE", formatValue(air.ozone, 1))
            }
            Text("Modelled air-quality estimate, not a ground-station reading.", color = Muted, fontSize = 9.sp, modifier = Modifier.padding(top = 12.dp))
        }
    }
}

@Composable
private fun SunriseCard(day: DailyPoint?) {
    if (day == null) { InfoCard("Sun data unavailable", "Sunrise and sunset appear with daily forecast data."); return }
    Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(20.dp)) {
        Row(Modifier.fillMaxWidth().padding(17.dp), horizontalArrangement = Arrangement.SpaceAround) {
            TinyMetric("SUNRISE", day.sunrise.substringAfter("T").take(5).ifBlank { "—" }, "🌅")
            TinyMetric("SUNSET", day.sunset.substringAfter("T").take(5).ifBlank { "—" }, "🌇")
            TinyMetric("UV MAX", formatValue(day.uvMax, 1), "☀️")
        }
    }
}

@Composable
private fun AlertsCard(alerts: List<WeatherAlert>, coverage: String) {
    if (alerts.isEmpty()) {
        InfoCard(
            if (coverage.contains("United States", true) || coverage.contains("NOAA", true)) "Official alert feed coverage" else "No active alert returned",
            (coverage.ifBlank { "Connected warning provider did not return any active alerts." }) + ". This does not confirm that no local warning exists."
        )
    } else alerts.take(5).forEach { alert ->
        Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp), modifier = Modifier.padding(bottom = 8.dp)) {
            Column(Modifier.fillMaxWidth().padding(14.dp)) {
                Text(alert.severity.ifBlank { "WEATHER ALERT" }.uppercase(), color = Orange, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                Text(alert.title, color = Ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, modifier = Modifier.padding(top = 5.dp))
                if (alert.description.isNotBlank()) Text(alert.description.take(350), color = Muted, fontSize = 11.sp, lineHeight = 16.sp, modifier = Modifier.padding(top = 5.dp))
            }
        }
    }
}

@Composable
private fun CityListRow(place: WeatherPlace, selected: Boolean, onClick: () -> Unit, trailing: (@Composable () -> Unit)? = null) {
    Card(onClick = onClick, colors = CardDefaults.cardColors(containerColor = if (selected) Color(0xFFE5F3F7) else Color.White), shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
        Row(Modifier.fillMaxWidth().padding(start = 14.dp, end = 8.dp, top = 11.dp, bottom = 11.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("⌖", color = Sky, fontSize = 22.sp, modifier = Modifier.padding(end = 12.dp))
            Column(Modifier.weight(1f)) {
                Text(place.name, color = Ink, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                Text(place.region, color = Muted, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (selected) Text("SELECTED", color = Good, fontSize = 8.sp, fontWeight = FontWeight.Bold)
            trailing?.invoke()
        }
    }
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
    Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(18.dp), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(15.dp)) {
            Text(title, color = Ink, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
            Text(detail, color = Muted, fontSize = 10.sp, lineHeight = 15.sp, modifier = Modifier.padding(top = 5.dp))
        }
    }
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
    Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(19.dp)) {
        Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            TinyMetric("FEELS LIKE", displayTemp(current?.feelsLike ?: Double.NaN, celsius) + if (celsius) "°C" else "°F", "🌡️")
            TinyMetric("PRESSURE", current?.pressure?.let { formatValue(it) + " hPa" } ?: "—", "◉")
            TinyMetric("CLOUD COVER", current?.cloud?.takeIf { it >= 0 }?.let { it.toString() + "%" } ?: "—", "☁️")
        }
    }
}

@Composable
private fun LifeIndexCard(state: DashboardState) {
    val current = state.current
    val nextHours = state.hourly.take(6)
    val rainChance = nextHours.map { it.precipitationProbability }.filter { it >= 0 }.maxOrNull() ?: -1
    val uv = state.daily.firstOrNull()?.uvMax ?: state.air?.uv ?: Double.NaN
    val temperature = current?.temperature ?: Double.NaN
    val wind = current?.windKmh ?: Double.NaN
    val umbrella = when {
        rainChance >= 60 -> "Umbrella recommended"
        rainChance in 30..59 -> "Keep an umbrella nearby"
        rainChance >= 0 -> "Low rain probability"
        else -> "Rain outlook unavailable"
    }
    val outdoor = when {
        rainChance >= 70 -> "Rain likely soon"
        temperature.isFinite() && temperature >= 35 -> "Hot conditions"
        temperature.isFinite() && temperature <= 12 -> "Cool conditions"
        wind.isFinite() && wind >= 35 -> "Windy conditions"
        temperature.isFinite() -> "Generally suitable"
        else -> "Not enough data"
    }
    val uvText = when {
        uv.isNaN() -> "Unavailable"
        uv < 3 -> "Low"
        uv < 6 -> "Moderate"
        uv < 8 -> "High"
        uv < 11 -> "Very high"
        else -> "Extreme"
    }
    Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(19.dp)) {
        Column(Modifier.fillMaxWidth().padding(16.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                LifeIndexItem("OUTDOOR", outdoor, "🚶")
                LifeIndexItem("RAIN GEAR", umbrella, "☂️")
            }
            Divider(color = Line, modifier = Modifier.padding(vertical = 12.dp))
            LifeIndexItem("UV EXPOSURE", uvText + " · " + formatValue(uv, 1), "☀️")
            Text("Simple guidance derived from forecast values; not an official health or safety warning.", color = Muted, fontSize = 9.sp, lineHeight = 13.sp, modifier = Modifier.padding(top = 10.dp))
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
