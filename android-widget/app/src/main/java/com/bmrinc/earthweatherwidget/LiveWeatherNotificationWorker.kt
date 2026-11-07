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
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.bmrinc.earthweather.MainActivity
import com.bmrinc.earthweather.R
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

/**
 * Maintains an optional, low-priority ongoing weather notification.
 * WorkManager has a 15-minute minimum interval and Android may defer execution;
 * this is not a second-by-second live feed.
 */
class LiveWeatherNotificationWorker(context: Context, params: WorkerParameters) :
    CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val appPrefs = applicationContext.getSharedPreferences("earth_weather_app", Context.MODE_PRIVATE)
        val weatherPrefs = applicationContext.getSharedPreferences("earth_weather", Context.MODE_PRIVATE)
        if (!appPrefs.getBoolean("live_weather_enabled", false)) {
            NotificationManagerCompat.from(applicationContext).cancel(NOTIFICATION_ID)
            return@withContext Result.success()
        }
        if (ContextCompat.checkSelfPermission(applicationContext, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED) return@withContext Result.success()

        val latitude = weatherPrefs.getString("lat", null) ?: return@withContext Result.retry()
        val longitude = weatherPrefs.getString("lon", null) ?: return@withContext Result.retry()
        try {
            val connection = URL(
                "https://earthweather-api.onrender.com/api/weather?latitude=$latitude&longitude=$longitude"
            ).openConnection() as HttpURLConnection
            connection.connectTimeout = 10000
            connection.readTimeout = 16000
            connection.setRequestProperty("Accept", "application/json")
            if (connection.responseCode !in 200..299) throw IllegalStateException("Weather service unavailable")
            val payload = connection.inputStream.bufferedReader().use { it.readText() }
            connection.disconnect()

            val root = JSONObject(payload)
            val current = root.optJSONObject("current") ?: root
            val temperature = current.optDouble("temperature_2m", Double.NaN)
            val feelsLike = current.optDouble("apparent_temperature", Double.NaN)
            val humidity = current.optInt("relative_humidity_2m", -1)
            val wind = current.optDouble("wind_speed_10m", Double.NaN)
            val code = current.optInt("weather_code", -1)
            val city = weatherPrefs.getString("city", "Your location") ?: "Your location"
            val condition = when (code) {
                0 -> "Clear sky"
                1 -> "Mainly clear"
                2 -> "Partly cloudy"
                3 -> "Overcast"
                45, 48 -> "Fog"
                51, 53, 55, 56, 57 -> "Drizzle"
                61, 63, 65, 66, 67 -> "Rain"
                71, 73, 75, 77, 85, 86 -> "Snow"
                80, 81, 82 -> "Rain showers"
                95, 96, 99 -> "Thunderstorm"
                else -> "Weather update"
            }
            val tempText = if (temperature.isFinite()) "${temperature.toInt()}°C" else "—"
            val detail = buildString {
                append(condition)
                if (feelsLike.isFinite()) append(" · Feels like ${feelsLike.toInt()}°")
                if (humidity >= 0) append(" · Humidity ${humidity}%")
                if (wind.isFinite()) append(" · Wind ${wind.toInt()} km/h")
            }

            val manager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val channelId = "earth_weather_live"
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                manager.createNotificationChannel(
                    NotificationChannel(channelId, "Ongoing weather", NotificationManager.IMPORTANCE_LOW).apply {
                        description = "Periodic weather updates for your followed city"
                        setShowBadge(false)
                    }
                )
            }
            val intent = Intent(applicationContext, MainActivity::class.java)
            val pending = PendingIntent.getActivity(
                applicationContext, 703, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val notification = NotificationCompat.Builder(applicationContext, channelId)
                .setSmallIcon(R.drawable.ic_weather_partly)
                .setContentTitle("$city · $tempText")
                .setContentText(detail)
                .setStyle(NotificationCompat.BigTextStyle().bigText("$city weather · $tempText · $detail"))
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setAutoCancel(false)
                .setContentIntent(pending)
                .build()
            NotificationManagerCompat.from(applicationContext).notify(NOTIFICATION_ID, notification)
            Result.success()
        } catch (_: SecurityException) {
            Result.success()
        } catch (_: Exception) {
            Result.retry()
        }
    }

    companion object {
        private const val NOTIFICATION_ID = 703
        private const val UNIQUE_WORK = "earth-weather-live-notification"

        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<LiveWeatherNotificationWorker>(
                15, TimeUnit.MINUTES
            ).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                UNIQUE_WORK, ExistingPeriodicWorkPolicy.UPDATE, request
            )
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(UNIQUE_WORK)
            NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
        }
    }
}
