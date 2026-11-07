package com.bmrinc.earthweatherwidget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.widget.RemoteViews
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.bmrinc.earthweather.MainActivity
import com.bmrinc.earthweather.R
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class WeatherWidgetWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
 override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
  val prefs = applicationContext.getSharedPreferences("earth_weather", Context.MODE_PRIVATE)
  val lat = prefs.getString("lat", null) ?: return@withContext Result.success()
  val lon = prefs.getString("lon", null) ?: return@withContext Result.success()
  try {
   val connection = URL("https://earthweather-api.onrender.com/api/weather?latitude=" + lat + "&longitude=" + lon).openConnection() as HttpURLConnection
   connection.connectTimeout = 12000
   connection.readTimeout = 15000
   connection.setRequestProperty("Accept", "application/json")
   if (connection.responseCode !in 200..299) throw IllegalStateException("Weather API unavailable")
   val body = connection.inputStream.bufferedReader().use { it.readText() }
   connection.disconnect()
   val root = JSONObject(body)
   val current = root.optJSONObject("current") ?: root
   val temp = number(current, "temperature_2m", "temperature", "temp_c")
   val humidity = number(current, "relative_humidity_2m", "humidity")
   val wind = number(current, "wind_speed_10m", "wind_kph", "wind_speed")
   val code = current.optInt("weather_code", current.optInt("weathercode", -1))
   val label = label(code)
   val iconRes = iconResource(code)
   val city = prefs.getString("city", "Your location") ?: "Your location"
   val manager = AppWidgetManager.getInstance(applicationContext)

   val detailedIds = manager.getAppWidgetIds(ComponentName(applicationContext, WeatherWidgetProvider::class.java))
   detailedIds.forEach { id ->
    val view = RemoteViews(applicationContext.packageName, R.layout.weather_widget)
    view.setTextViewText(R.id.widget_city, city)
    view.setTextViewText(R.id.widget_temperature, if (temp == null) "--°" else temp.toInt().toString() + "°")
    view.setTextViewText(R.id.widget_humidity, "💧 " + (humidity?.toInt()?.toString() ?: "--") + "%")
    view.setTextViewText(R.id.widget_wind, "🌬 " + (wind?.toInt()?.toString() ?: "--") + " km/h")
    view.setTextViewText(R.id.weather_condition, label)
    view.setImageViewResource(R.id.weather_icon, iconRes)
    view.setOnClickPendingIntent(R.id.widget_root, MainActivity.pendingIntent(applicationContext))
    manager.updateAppWidget(id, view)
   }

   val compactIds = manager.getAppWidgetIds(ComponentName(applicationContext, CompactWeatherWidgetProvider::class.java))
   compactIds.forEach { id ->
    val view = RemoteViews(applicationContext.packageName, R.layout.weather_widget_compact)
    view.setTextViewText(R.id.compact_city, city)
    view.setTextViewText(R.id.compact_temperature, if (temp == null) "--°" else temp.toInt().toString() + "°")
    view.setTextViewText(R.id.compact_humidity, "💧 " + (humidity?.toInt()?.toString() ?: "--") + "%")
    view.setTextViewText(R.id.compact_condition, label)
    view.setImageViewResource(R.id.compact_icon, iconRes)
    view.setOnClickPendingIntent(R.id.compact_root, MainActivity.pendingIntent(applicationContext))
    manager.updateAppWidget(id, view)
   }
   Result.success()
  } catch (_: Exception) { Result.retry() }
 }
 private fun number(json: JSONObject, vararg keys: String): Double? {
  keys.forEach { key ->
   if (json.has(key) && !json.isNull(key)) {
    val value = json.optDouble(key)
    if (!value.isNaN() && !value.isInfinite()) return value
   }
  }
  return null
 }
 private fun label(code: Int): String = when (code) {
  0 -> "Clear sky"; 1, 2 -> "Partly cloudy"; 3 -> "Overcast clouds"
  45, 48 -> "Fog"; 51, 53, 55, 56, 57 -> "Drizzle"
  61, 63, 65, 66, 67 -> "Rain"; 71, 73, 75, 77, 85, 86 -> "Snow"
  80, 81, 82 -> "Rain showers"; 95, 96, 99 -> "Thunderstorm"; else -> "Weather update"
 }
 private fun iconResource(code: Int): Int = when (code) {
  0 -> R.drawable.ic_weather_sun
  1, 2 -> R.drawable.ic_weather_partly
  3 -> R.drawable.ic_weather_cloud
  45, 48 -> R.drawable.ic_weather_fog
  51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82 -> R.drawable.ic_weather_rain
  71, 73, 75, 77, 85, 86 -> R.drawable.ic_weather_snow
  95, 96, 99 -> R.drawable.ic_weather_thunder
  else -> R.drawable.ic_weather_partly
 }
 companion object {
  fun enqueueNow(context: Context) {
   val request = androidx.work.OneTimeWorkRequestBuilder<WeatherWidgetWorker>().build()
   androidx.work.WorkManager.getInstance(context).enqueue(request)
  }
 }
}