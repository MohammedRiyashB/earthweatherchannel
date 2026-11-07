package com.bmrinc.earthweatherwidget

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.bmrinc.earthweather.MainActivity
import com.bmrinc.earthweather.R
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.Duration
import java.time.ZonedDateTime
import java.util.concurrent.TimeUnit

class MorningBriefingWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
 override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
  val appPrefs = applicationContext.getSharedPreferences("earth_weather_app", Context.MODE_PRIVATE)
  val weatherPrefs = applicationContext.getSharedPreferences("earth_weather", Context.MODE_PRIVATE)
  if (!appPrefs.getBoolean("morning_briefing_enabled", false)) return@withContext Result.success()
  if (ContextCompat.checkSelfPermission(applicationContext, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
   return@withContext Result.success()
  }
  val lat = weatherPrefs.getString("lat", null) ?: return@withContext Result.retry()
  val lon = weatherPrefs.getString("lon", null) ?: return@withContext Result.retry()
  try {
   val url = URL("https://earthweather-api.onrender.com/api/forecast?latitude=" + lat + "&longitude=" + lon + "&days=1")
   val connection = url.openConnection() as HttpURLConnection
   connection.connectTimeout = 12000
   connection.readTimeout = 18000
   connection.setRequestProperty("Accept", "application/json")
   if (connection.responseCode !in 200..299) throw IllegalStateException("Forecast service unavailable")
   val body = connection.inputStream.bufferedReader().use { it.readText() }
   connection.disconnect()
   val root = JSONObject(body)
   val daily = root.optJSONArray("daily")
   val today = daily?.optJSONObject(0)
   val current = root.optJSONObject("current")
   val city = weatherPrefs.getString("city", "Your location") ?: "Your location"
   val high = today?.optDouble("temperature_2m_max", Double.NaN) ?: Double.NaN
   val low = today?.optDouble("temperature_2m_min", Double.NaN) ?: Double.NaN
   val rain = today?.optInt("precipitation_probability_max", -1) ?: -1
   val code = today?.optInt("weather_code", -1) ?: current?.optInt("weather_code", -1) ?: -1
   val condition = when (code) {
    0 -> "Clear"; 1, 2 -> "Partly cloudy"; 3 -> "Overcast"
    45, 48 -> "Fog"; 51, 53, 55, 56, 57 -> "Drizzle"
    61, 63, 65, 66, 67 -> "Rain"; 71, 73, 75, 77, 85, 86 -> "Snow"
    80, 81, 82 -> "Rain showers"; 95, 96, 99 -> "Thunderstorms"; else -> "Weather outlook"
   }
   val summary = "High " + fmt(high) + "° · Low " + fmt(low) + "° · " + condition +
       if (rain >= 0) " · Rain chance " + rain + "%" else ""
   val manager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
   val channel = "earth_weather_morning"
   if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
    manager.createNotificationChannel(NotificationChannel(channel, "Morning weather briefing", NotificationManager.IMPORTANCE_DEFAULT))
   }
   val intent = Intent(applicationContext, MainActivity::class.java)
   val pending = PendingIntent.getActivity(applicationContext, 702, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
   val notification = NotificationCompat.Builder(applicationContext, channel)
    .setSmallIcon(R.drawable.ic_weather_partly)
    .setContentTitle("Good morning · " + city)
    .setContentText(summary)
    .setStyle(NotificationCompat.BigTextStyle().bigText("EARTH WEATHER daily outlook for " + city + ": " + summary + ". Forecast guidance may change as new model runs arrive."))
    .setAutoCancel(true)
    .setContentIntent(pending)
    .build()
   NotificationManagerCompat.from(applicationContext).notify(702, notification)
   scheduleNext(applicationContext)
   Result.success()
  } catch (_: SecurityException) {
   Result.success()
  } catch (_: Exception) {
   Result.retry()
  }
 }

 private fun fmt(value: Double): String = if (value.isNaN() || value.isInfinite()) "—" else value.toInt().toString()

 companion object {
  fun schedule(context: Context) {
   val prefs = context.getSharedPreferences("earth_weather_app", Context.MODE_PRIVATE)
   if (!prefs.getBoolean("morning_briefing_enabled", false)) return
   val hour = prefs.getInt("morning_briefing_hour", 7).coerceIn(5, 11)
   val now = ZonedDateTime.now()
   var next = now.withHour(hour).withMinute(0).withSecond(0).withNano(0)
   if (!next.isAfter(now)) next = next.plusDays(1)
   val delay = Duration.between(now, next).toMillis().coerceAtLeast(1000L)
   val request = OneTimeWorkRequestBuilder<MorningBriefingWorker>()
    .setInitialDelay(delay, TimeUnit.MILLISECONDS)
    .build()
   WorkManager.getInstance(context).enqueueUniqueWork("earth-weather-morning-briefing", ExistingWorkPolicy.REPLACE, request)
  }

  private fun scheduleNext(context: Context) = schedule(context)
 }
}
