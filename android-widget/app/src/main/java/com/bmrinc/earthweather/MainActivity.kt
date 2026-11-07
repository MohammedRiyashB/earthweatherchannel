package com.bmrinc.earthweather

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Build
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
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
import java.util.concurrent.TimeUnit
import com.google.android.gms.location.LocationServices
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

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
    private var savedCities by mutableStateOf<List<WeatherPlace>>(emptyList())
    private var celsius by mutableStateOf(true)
    private var notificationsEnabled by mutableStateOf(false)
    private var refreshInProgress = false

    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        notificationsEnabled = granted
        getSharedPreferences("earth_weather_app", MODE_PRIVATE).edit().putBoolean("notifications_enabled", granted).apply()
        if (granted) scheduleAlertChecks() else WorkManager.getInstance(this).cancelUniqueWork("earth-weather-alert-checks")
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
                    query = cityQuery, onQuery = { cityQuery = it },
                    results = cityResults, searching = searching, searchError = searchError,
                    savedCities = savedCities,
                    onSelect = { choosePlace(it) }, onSave = { saveCity(it) }, onRemove = { removeCity(it) },
                    celsius = celsius,
                    onUnit = { celsius = it; getSharedPreferences("earth_weather_app", MODE_PRIVATE).edit().putBoolean("celsius", it).apply() },
                    notificationsEnabled = notificationsEnabled,
                    onNotifications = { setWeatherNotifications(it) },
                    onSearch = { searchCities(cityQuery) }
                )
            }
        }
        requestLocation()
        if (notificationsEnabled) scheduleAlertChecks()
    }

    private fun restorePreferences() {
        val prefs = getSharedPreferences("earth_weather_app", MODE_PRIVATE)
        celsius = prefs.getBoolean("celsius", true)
        notificationsEnabled = prefs.getBoolean("notifications_enabled", false)
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
                    if (location == null) restoreSavedOrShowLocationError()
                    else lifecycleScope.launch {
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

    private fun searchCities(query: String) {
        val clean = query.trim()
        if (clean.length < 2) {
            cityResults = emptyList(); searching = false; searchError = ""; return
        }
        lifecycleScope.launch {
            searching = true
            searchError = ""
            val result = runCatching { EarthWeatherApi.search(clean) }
            if (cityQuery.trim() == clean) {
                cityResults = result.getOrDefault(emptyList())
                if (result.isFailure) searchError = result.exceptionOrNull()?.message ?: "Location search failed."
                else if (cityResults.isEmpty()) searchError = "No matching cities found."
            }
            searching = false
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
    onRefresh: () -> Unit, query: String, onQuery: (String) -> Unit,
    results: List<WeatherPlace>, searching: Boolean, searchError: String,
    savedCities: List<WeatherPlace>, onSelect: (WeatherPlace) -> Unit,
    onSave: (WeatherPlace) -> Unit, onRemove: (WeatherPlace) -> Unit,
    celsius: Boolean, onUnit: (Boolean) -> Unit, notificationsEnabled: Boolean, onNotifications: (Boolean) -> Unit, onSearch: () -> Unit
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
            "Weather" -> WeatherScreen(state, place, Modifier.padding(padding), celsius, onRefresh, onTab)
            "Forecast" -> ForecastScreen(state, place, Modifier.padding(padding), celsius)
            "Cities" -> CitiesScreen(place, savedCities, query, onQuery, results, searching, searchError, Modifier.padding(padding), onSelect, onSave, onRemove, onSearch)
            "Radar" -> RadarScreen(state, place, Modifier.padding(padding))
            else -> SettingsScreen(celsius, onUnit, notificationsEnabled, onNotifications, Modifier.padding(padding), state)
        }
    }
}

@Composable
private fun WeatherScreen(state: DashboardState, place: WeatherPlace?, modifier: Modifier, celsius: Boolean, onRefresh: () -> Unit, onTab: (String) -> Unit) {
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
        Column(Modifier.fillMaxWidth().background(
            Brush.linearGradient(listOf(Color(0xFF06435F), Color(0xFF087FA3), Color(0xFF63B8C5))),
            RoundedCornerShape(28.dp)
        ).padding(22.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                Column {
                    Text("CURRENT WEATHER", color = Color.White.copy(alpha = .76f), fontSize = 9.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.8.sp)
                    Spacer(Modifier.height(6.dp))
                    Text(description.first, color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                }
                WeatherIcon(current?.weatherCode ?: -1, 62.dp)
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
        SectionHeader("HOURLY FORECAST", "Next 24 hours")
        HourlyStrip(state.hourly.take(24), celsius)
        Spacer(Modifier.height(20.dp))
        SectionHeader("15-DAY OUTLOOK", "View all", { onTab("Forecast") })
        DailyPreview(state.daily.take(5), celsius)
        Spacer(Modifier.height(20.dp))
        SectionHeader("AIR QUALITY", "Model estimate")
        AirQualityCard(state.air)
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
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
        ScreenTitle("Forecast", place?.name ?: "Selected location")
        SectionHeader("HOURLY FORECAST", "48 hours")
        HourlyStrip(state.hourly.take(48), celsius)
        Spacer(Modifier.height(22.dp))
        SectionHeader("15-DAY FORECAST", "Daily outlook")
        state.daily.forEachIndexed { index, day ->
            DailyRow(day, index, celsius)
            Divider(color = Line, thickness = .7.dp)
        }
        Text("Forecasts are model guidance and can change as new runs arrive.", color = Muted, fontSize = 10.sp, modifier = Modifier.padding(vertical = 20.dp))
    }
}

@Composable
private fun CitiesScreen(
    current: WeatherPlace?, saved: List<WeatherPlace>, query: String, onQuery: (String) -> Unit,
    results: List<WeatherPlace>, searching: Boolean, searchError: String, modifier: Modifier,
    onSelect: (WeatherPlace) -> Unit, onSave: (WeatherPlace) -> Unit,
    onRemove: (WeatherPlace) -> Unit, onSearch: () -> Unit
) {
    LaunchedEffect(query) {
        if (query.trim().length >= 2) { delay(500); onSearch() }
    }
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
        ScreenTitle("Your cities", "Search and manage locations")
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
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
        ScreenTitle("Rain & radar", place?.name ?: "Weather monitoring")
        Card(shape = RoundedCornerShape(24.dp), colors = CardDefaults.cardColors(containerColor = Color(0xFF0D2736))) {
            Column(Modifier.fillMaxWidth().padding(20.dp)) {
                Text("RADAR HISTORY", color = Color(0xFF6BD4E7), fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.4.sp)
                Spacer(Modifier.height(14.dp))
                Text((state.radar?.frames ?: 0).toString(), color = Color.White, fontSize = 48.sp, fontWeight = FontWeight.Light)
                Text("past radar frames available", color = Color.White.copy(alpha = .76f), fontSize = 12.sp)
                Text(state.radar?.note ?: "Loading radar metadata…", color = Color.White.copy(alpha = .68f), fontSize = 10.sp, lineHeight = 16.sp, modifier = Modifier.padding(top = 12.dp))
            }
        }
        Spacer(Modifier.height(20.dp)); SectionHeader("RAIN FORECAST", "Next 24 hours")
        if (state.hourly.isEmpty()) InfoCard("Rain forecast unavailable", "No hourly precipitation values were returned.")
        else state.hourly.take(24).forEach { point ->
            Row(Modifier.fillMaxWidth().padding(vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(point.time.substringAfter("T").take(5), color = Ink, fontSize = 12.sp, modifier = Modifier.weight(1f))
                Text("☔ " + (point.precipitationProbability.takeIf { it >= 0 }?.toString() ?: "—") + "%", color = Sky, fontSize = 12.sp, modifier = Modifier.weight(1f))
                Text(formatValue(point.precipitation, 1) + " mm", color = Muted, fontSize = 11.sp)
            }
            Divider(color = Line, thickness = .7.dp)
        }
        Spacer(Modifier.height(18.dp)); SectionHeader("ACTIVE WEATHER ALERTS", "Provider coverage")
        AlertsCard(state.alerts, state.alertCoverage)
        Text("RainViewer provides historical radar frames here, not guaranteed live nowcasting. Transparent areas can mean missing coverage, not necessarily clear weather.", color = Muted, fontSize = 10.sp, lineHeight = 15.sp, modifier = Modifier.padding(vertical = 18.dp))
    }
}

@Composable
private fun SettingsScreen(celsius: Boolean, onUnit: (Boolean) -> Unit, notificationsEnabled: Boolean, onNotifications: (Boolean) -> Unit, modifier: Modifier, state: DashboardState) {
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
        Spacer(Modifier.height(22.dp)); SectionHeader("DATA & PRIVACY", "About your weather")
        InfoCard("EARTH WEATHER API", "Weather information is served by BMR INC. infrastructure. Location is requested only to show local weather. City search works without GPS permission.")
        Spacer(Modifier.height(9.dp))
        InfoCard("DATA SOURCES", "Current weather uses the configured provider failover. Forecast and air-quality are currently routed through Open-Meteo evaluation endpoints. Commercial publication requires the appropriate provider licence.")
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

private fun displayTemp(value: Double, celsius: Boolean): String {
    if (value.isNaN() || value.isInfinite()) return "—"
    return formatValue(if (celsius) value else value * 9.0 / 5.0 + 32.0)
}
