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
import androidx.work.WorkerParameters
import com.bmrinc.earthweather.MainActivity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class WeatherAlertWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
 override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
  val prefs = applicationContext.getSharedPreferences("earth_weather", Context.MODE_PRIVATE)
  val lat = prefs.getString("lat", null) ?: return@withContext Result.success()
  val lon = prefs.getString("lon", null) ?: return@withContext Result.success()
  if (ContextCompat.checkSelfPermission(applicationContext, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
   return@withContext Result.success()
  }
  try {
   val connection = URL("https://earthweather-api.onrender.com/api/alerts?latitude=" + lat + "&longitude=" + lon).openConnection() as HttpURLConnection
   connection.connectTimeout = 10000
   connection.readTimeout = 15000
   connection.setRequestProperty("Accept", "application/json")
   if (connection.responseCode !in 200..299) throw IllegalStateException("Alert service unavailable")
   val body = connection.inputStream.bufferedReader().use { it.readText() }
   connection.disconnect()
   val root = JSONObject(body)
   val features = root.optJSONArray("features") ?: return@withContext Result.success()
   if (features.length() == 0) return@withContext Result.success()

   val manager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
   val channelId = "earth_weather_alerts"
   if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
    manager.createNotificationChannel(NotificationChannel(channelId, "Severe weather alerts", NotificationManager.IMPORTANCE_HIGH).apply {
     description = "Weather warning notifications from EARTH WEATHER"
     enableVibration(true)
    })
   }
   val sent = (prefs.getStringSet("sent_weather_alerts", emptySet()) ?: emptySet()).toMutableSet()
   val intent = Intent(applicationContext, MainActivity::class.java)
   val pending = PendingIntent.getActivity(applicationContext, 700, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
   for (index in 0 until features.length()) {
    val feature = features.optJSONObject(index) ?: continue
    val properties = feature.optJSONObject("properties") ?: continue
    val title = properties.optString("headline").ifBlank { properties.optString("event", "Weather warning") }
    val id = feature.optString("id").ifBlank { title.hashCode().toString() }
    if (id in sent) continue
    val detail = properties.optString("description").ifBlank { properties.optString("instruction", "Check the latest local weather guidance.") }
    val notification = NotificationCompat.Builder(applicationContext, channelId)
     .setSmallIcon(com.bmrinc.earthweather.R.drawable.ic_weather_thunder)
     .setContentTitle("EARTH WEATHER · " + title)
     .setContentText(detail.take(120))
     .setStyle(NotificationCompat.BigTextStyle().bigText(detail.take(1200)))
     .setPriority(NotificationCompat.PRIORITY_HIGH)
     .setAutoCancel(true)
     .setContentIntent(pending)
     .build()
    NotificationManagerCompat.from(applicationContext).notify(id.hashCode(), notification)
    sent.add(id)
   }
   prefs.edit().putStringSet("sent_weather_alerts", sent).apply()
   Result.success()
  } catch (_: SecurityException) {
   Result.success()
  } catch (_: Exception) {
   Result.retry()
  }
 }
}
