package com.bmrinc.earthweather

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.Locale

private const val API_BASE = "https://earthweather-api.onrender.com"

data class WeatherPlace(
    val name: String, val region: String, val latitude: Double, val longitude: Double,
    val country: String = "", val countryCode: String = "", val state: String = "", val district: String = ""
)
data class CurrentConditions(
    val temperature: Double = Double.NaN, val feelsLike: Double = Double.NaN, val humidity: Int = -1,
    val windKmh: Double = Double.NaN, val pressure: Double = Double.NaN, val cloud: Int = -1,
    val precipitation: Double = Double.NaN, val weatherCode: Int = -1, val isDay: Boolean = true,
    val observedAt: String = "", val source: String = "EARTH WEATHER"
)
data class HourlyPoint(
    val time: String, val temperature: Double, val apparentTemperature: Double,
    val precipitationProbability: Int, val precipitation: Double, val weatherCode: Int,
    val windKmh: Double, val uv: Double
)
data class DailyPoint(
    val date: String, val high: Double, val low: Double, val weatherCode: Int,
    val sunrise: String, val sunset: String, val uvMax: Double, val rainMm: Double,
    val rainChance: Int, val windMax: Double
)
data class AirQuality(
    val europeanAqi: Int = -1, val usAqi: Int = -1, val pm25: Double = Double.NaN,
    val pm10: Double = Double.NaN, val ozone: Double = Double.NaN, val uv: Double = Double.NaN,
    val updatedAt: String = ""
) {
    val category: String get() = when {
        europeanAqi < 0 -> "Unavailable"; europeanAqi <= 20 -> "Good"; europeanAqi <= 40 -> "Fair"
        europeanAqi <= 60 -> "Moderate"; europeanAqi <= 80 -> "Poor"; europeanAqi <= 100 -> "Very poor"
        else -> "Extremely poor"
    }
}
data class WeatherAlert(val title: String, val severity: String, val description: String)
data class RadarFrame(val time: Long, val path: String)
data class RadarInfo(val host: String = "", val generatedAt: String = "", val frames: List<RadarFrame> = emptyList(), val note: String = "")

object EarthWeatherApi {
    private fun get(path: String): JSONObject {
        val connection = URL(API_BASE + path).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 12000; connection.readTimeout = 22000
            connection.requestMethod = "GET"
            connection.setRequestProperty("Accept", "application/json")
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() } ?: "{}"
            if (status !in 200..299) throw IllegalStateException("EARTH WEATHER API returned HTTP " + status)
            return JSONObject(text)
        } finally { connection.disconnect() }
    }
    private fun q(value: String) = URLEncoder.encode(value, "UTF-8")
    private fun JSONObject.number(key: String): Double = if (isNull(key) || !has(key)) Double.NaN else optDouble(key, Double.NaN)
    private fun JSONObject.integer(key: String): Int = if (isNull(key) || !has(key)) -1 else optInt(key, -1)
    private fun JSONObject.text(key: String): String = if (isNull(key)) "" else optString(key, "")

    suspend fun current(place: WeatherPlace): CurrentConditions = withContext(Dispatchers.IO) {
        val root = get("/api/weather?latitude=${place.latitude}&longitude=${place.longitude}")
        val item = root.optJSONObject("current") ?: root
        CurrentConditions(
            temperature=item.number("temperature_2m"), feelsLike=item.number("apparent_temperature"),
            humidity=item.integer("relative_humidity_2m"), windKmh=item.number("wind_speed_10m"),
            pressure=item.number("pressure_msl"), cloud=item.integer("cloud_cover"),
            precipitation=item.number("precipitation"), weatherCode=item.integer("weather_code"),
            isDay=item.optInt("is_day", 1) == 1, observedAt=item.text("time"),
            source=root.optJSONObject("source")?.text("name") ?: "EARTH WEATHER"
        )
    }

    suspend fun forecast(place: WeatherPlace): Pair<List<HourlyPoint>, List<DailyPoint>> = withContext(Dispatchers.IO) {
        val root = get("/api/forecast?latitude=${place.latitude}&longitude=${place.longitude}&days=15")
        val hourlyArray = root.optJSONArray("hourly") ?: JSONArray()
        val dailyArray = root.optJSONArray("daily") ?: JSONArray()
        val hourly = (0 until minOf(hourlyArray.length(), 48)).mapNotNull { index ->
            val item = hourlyArray.optJSONObject(index) ?: return@mapNotNull null
            HourlyPoint(
                time=item.text("time"), temperature=item.number("temperature_2m"),
                apparentTemperature=item.number("apparent_temperature"),
                precipitationProbability=item.integer("precipitation_probability"),
                precipitation=item.number("precipitation"), weatherCode=item.integer("weather_code"),
                windKmh=item.number("wind_speed_10m"), uv=item.number("uv_index")
            )
        }
        val daily = (0 until minOf(dailyArray.length(), 15)).mapNotNull { index ->
            val item = dailyArray.optJSONObject(index) ?: return@mapNotNull null
            DailyPoint(
                date=item.text("date"), high=item.number("temperature_2m_max"),
                low=item.number("temperature_2m_min"), weatherCode=item.integer("weather_code"),
                sunrise=item.text("sunrise"), sunset=item.text("sunset"), uvMax=item.number("uv_index_max"),
                rainMm=item.number("precipitation_sum"), rainChance=item.integer("precipitation_probability_max"),
                windMax=item.number("wind_speed_10m_max")
            )
        }
        hourly to daily
    }

    suspend fun airQuality(place: WeatherPlace): AirQuality = withContext(Dispatchers.IO) {
        val root = get("/api/air-quality?latitude=${place.latitude}&longitude=${place.longitude}")
        val item = root.optJSONObject("current") ?: JSONObject()
        AirQuality(
            europeanAqi=item.integer("european_aqi"), usAqi=item.integer("us_aqi"),
            pm25=item.number("pm2_5"), pm10=item.number("pm10"), ozone=item.number("ozone"),
            uv=item.number("uv_index"), updatedAt=item.text("time")
        )
    }

    suspend fun reverse(latitude: Double, longitude: Double): WeatherPlace = withContext(Dispatchers.IO) {
        val root = get("/api/location/reverse?latitude=$latitude&longitude=$longitude")
        WeatherPlace(
            name=root.text("name").ifBlank { "Current location" }, region=root.text("region"),
            latitude=latitude, longitude=longitude, country=root.text("country"),
            countryCode=root.text("country_code"), state=root.text("state"), district=root.text("district")
        )
    }

    suspend fun search(query: String): List<WeatherPlace> = withContext(Dispatchers.IO) {
        val root = get("/api/location/search?q=${q(query)}&limit=8")
        val array = root.optJSONArray("results") ?: JSONArray()
        (0 until array.length()).mapNotNull { index ->
            val item = array.optJSONObject(index) ?: return@mapNotNull null
            val lat=item.number("latitude"); val lon=item.number("longitude")
            if (lat.isNaN() || lon.isNaN()) return@mapNotNull null
            WeatherPlace(
                name=item.text("name"), region=item.text("region"), latitude=lat, longitude=lon,
                country=item.text("country"), countryCode=item.text("country_code"),
                state=item.text("state"), district=item.text("district")
            )
        }
    }

    suspend fun alerts(place: WeatherPlace): Pair<String, List<WeatherAlert>> = withContext(Dispatchers.IO) {
        val root = get("/api/alerts?latitude=${place.latitude}&longitude=${place.longitude}")
        val coverage=root.text("coverage").ifBlank { root.text("source") }
        val features=root.optJSONArray("features") ?: JSONArray()
        val list=(0 until features.length()).mapNotNull { index ->
            val props=features.optJSONObject(index)?.optJSONObject("properties") ?: return@mapNotNull null
            WeatherAlert(
                title=props.text("headline").ifBlank { props.text("event") },
                severity=props.text("severity"),
                description=props.text("description").ifBlank { props.text("instruction") }
            )
        }
        coverage to list
    }

    suspend fun radar(): RadarInfo = withContext(Dispatchers.IO) {
        val root=get("/api/radar")
        val rawFrames = root.optJSONArray("frames") ?: JSONArray()
        val frames = (0 until rawFrames.length()).mapNotNull { index ->
            val item = rawFrames.optJSONObject(index) ?: return@mapNotNull null
            val time = item.optLong("time", 0L)
            val path = item.optString("path", "")
            if (time <= 0L || !path.startsWith("/")) null else RadarFrame(time, path)
        }
        RadarInfo(
            host = root.text("host"),
            generatedAt = root.text("generated"),
            frames = frames,
            note = root.text("note")
        )
    }
}

fun weatherDescription(code: Int): Pair<String, String> = when (code) {
    0 -> "Clear sky" to "☀️"; 1, 2 -> "Partly cloudy" to "🌤️"; 3 -> "Overcast clouds" to "☁️"
    45, 48 -> "Fog" to "🌫️"; 51, 53, 55, 56, 57 -> "Drizzle" to "🌦️"
    61, 63, 65, 66, 67 -> "Rain" to "🌧️"; 71, 73, 75, 77 -> "Snow" to "❄️"
    80, 81, 82 -> "Rain showers" to "🌧️"; 85, 86 -> "Snow showers" to "🌨️"
    95, 96, 99 -> "Thunderstorm" to "⛈️"; else -> "Weather update" to "🌤️"
}
fun formatValue(value: Double, decimals: Int = 0): String =
    if (value.isNaN() || value.isInfinite()) "—" else String.format(Locale.US, "%." + decimals + "f", value)
