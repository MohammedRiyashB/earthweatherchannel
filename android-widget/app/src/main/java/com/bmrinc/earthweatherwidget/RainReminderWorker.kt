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
import com.bmrinc.earthweather.R
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class RainReminderWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
 override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
  val prefs = applicationContext.getSharedPreferences("earth_weather", Context.MODE_PRIVATE)
  val lat = prefs.getString("lat", null) ?: return@withContext Result.success()
  val lon = prefs.getString("lon", null) ?: return@withContext Result.success()
  if (ContextCompat.checkSelfPermission(applicationContext, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
   return@withContext Result.success()
  }
  try {
   val url = URL("https://earthweather-api.onrender.com/api/forecast?latitude=" + lat + "&longitude=" + lon + "&days=1")
   val connection = url.openConnection() as HttpURLConnection
   connection.connectTimeout = 10000
   connection.readTimeout = 18000
   connection.setRequestProperty("Accept", "application/json")
   if (connection.responseCode !in 200..299) throw IllegalStateException("Forecast service unavailable")
   val body = connection.inputStream.bufferedReader().use { it.readText() }
   connection.disconnect()
   val root = JSONObject(body)
   val hourly = root.optJSONArray("hourly") ?: return@withContext Result.success()
   var maximum = -1
   var firstRainTime = ""
   for (index in 0 until minOf(6, hourly.length())) {
    val item = hourly.optJSONObject(index) ?: continue
    val chance = item.optInt("precipitation_probability", -1)
    if (chance > maximum) {
     maximum = chance
     firstRainTime = item.optString("time")
    }
   }
   if (maximum < 60) return@withContext Result.success()
   val date = root.optString("timezone").ifBlank { "local" } + ":" + firstRainTime.take(10)
   val lastDate = prefs.getString("last_rain_reminder_date", "")
   if (lastDate == date) return@withContext Result.success()

   val manager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
   val channelId = "earth_weather_rain"
   if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
    manager.createNotificationChannel(NotificationChannel(channelId, "Rain reminders", NotificationManager.IMPORTANCE_DEFAULT).apply {
     description = "Rain forecast reminders from EARTH WEATHER"
    })
   }
   val intent = Intent(applicationContext, MainActivity::class.java)
   val pending = PendingIntent.getActivity(applicationContext, 701, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
   val notification = NotificationCompat.Builder(applicationContext, channelId)
    .setSmallIcon(R.drawable.ic_weather_rain)
    .setContentTitle("EARTH WEATHER · Rain expected")
    .setContentText("Rain probability may reach " + maximum + "% in the next few hours.")
    .setStyle(NotificationCompat.BigTextStyle().bigText("Forecast rain probability reaches " + maximum + "% around " + firstRainTime.replace("T", " ") + ". This is a model forecast, not a live nowcast."))
    .setAutoCancel(true)
    .setContentIntent(pending)
    .build()
   NotificationManagerCompat.from(applicationContext).notify(701, notification)
   prefs.edit().putString("last_rain_reminder_date", date).apply()
   Result.success()
  } catch (_: SecurityException) {
   Result.success()
  } catch (_: Exception) {
   Result.retry()
  }
 }
}
