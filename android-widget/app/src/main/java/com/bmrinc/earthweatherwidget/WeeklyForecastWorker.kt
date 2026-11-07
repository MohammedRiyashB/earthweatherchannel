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
import androidx.work.Data
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
import java.time.DayOfWeek
import java.time.ZonedDateTime
import java.util.concurrent.TimeUnit

/** Weekly Sunday forecast summary sourced from the EARTH WEATHER API. */
class WeeklyForecastWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val prefs = applicationContext.getSharedPreferences("earth_weather_app", Context.MODE_PRIVATE)
        val weatherPrefs = applicationContext.getSharedPreferences("earth_weather", Context.MODE_PRIVATE)
        if (!prefs.getBoolean("weekly_forecast_enabled", false)) return@withContext Result.success()
        if (ContextCompat.checkSelfPermission(applicationContext, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED) return@withContext Result.success()

        val lat = weatherPrefs.getString("lat", null) ?: return@withContext Result.retry()
        val lon = weatherPrefs.getString("lon", null) ?: return@withContext Result.retry()
        try {
            val connection = URL(
                "https://earthweather-api.onrender.com/api/forecast?latitude=$lat&longitude=$lon&days=7"
            ).openConnection() as HttpURLConnection
            connection.connectTimeout = 12000
            connection.readTimeout = 18000
            connection.setRequestProperty("Accept", "application/json")
            if (connection.responseCode !in 200..299) throw IllegalStateException("Forecast service unavailable")
            val body = connection.inputStream.bufferedReader().use { it.readText() }
            connection.disconnect()

            val root = JSONObject(body)
            val daily = root.optJSONArray("daily") ?: return@withContext Result.retry()
            if (daily.length() == 0) return@withContext Result.retry()
            var high = Double.NEGATIVE_INFINITY
            var low = Double.POSITIVE_INFINITY
            var wetDays = 0
            val labels = mutableListOf<String>()
            for (index in 0 until minOf(7, daily.length())) {
                val item = daily.optJSONObject(index) ?: continue
                val h = item.optDouble("temperature_2m_max", Double.NaN)
                val l = item.optDouble("temperature_2m_min", Double.NaN)
                if (h.isFinite()) high = maxOf(high, h)
                if (l.isFinite()) low = minOf(low, l)
                val rain = item.optInt("precipitation_probability_max", -1)
                if (rain >= 50) wetDays++
                val date = item.optString("date")
                if (date.isNotBlank() && rain >= 50) labels.add(date.takeLast(5) + " (" + rain + "%)")
            }
            val city = weatherPrefs.getString("city", "Your location") ?: "Your location"
            val range = if (high.isFinite() && low.isFinite()) "High ${high.toInt()}° · Low ${low.toInt()}°" else "Temperature range unavailable"
            val detail = "7-day outlook: $range · $wetDays day(s) with 50%+ rain probability." +
                if (labels.isNotEmpty()) " Rain outlook: " + labels.take(4).joinToString(", ") else ""

            val manager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val channelId = "earth_weather_weekly"
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                manager.createNotificationChannel(
                    NotificationChannel(channelId, "Weekly weather forecast", NotificationManager.IMPORTANCE_DEFAULT)
                )
            }
            val intent = Intent(applicationContext, MainActivity::class.java)
            val pending = PendingIntent.getActivity(
                applicationContext, 705, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val notification = NotificationCompat.Builder(applicationContext, channelId)
                .setSmallIcon(R.drawable.ic_weather_partly)
                .setContentTitle("Weekly weather · $city")
                .setContentText(detail)
                .setStyle(NotificationCompat.BigTextStyle().bigText("$city · $detail Forecast guidance may change as new model runs arrive."))
                .setAutoCancel(true)
                .setContentIntent(pending)
                .build()
            NotificationManagerCompat.from(applicationContext).notify(705, notification)
            schedule(applicationContext)
            Result.success()
        } catch (_: SecurityException) {
            Result.success()
        } catch (_: Exception) {
            Result.retry()
        }
    }

    companion object {
        private const val UNIQUE_WORK = "earth-weather-weekly-forecast"
        fun schedule(context: Context) {
            if (!context.getSharedPreferences("earth_weather_app", Context.MODE_PRIVATE)
                    .getBoolean("weekly_forecast_enabled", false)) {
                cancel(context)
                return
            }
            val now = ZonedDateTime.now()
            var next = now.with(DayOfWeek.SUNDAY).withHour(8).withMinute(0).withSecond(0).withNano(0)
            if (!next.isAfter(now)) next = next.plusWeeks(1)
            val delay = Duration.between(now, next).toMillis().coerceAtLeast(1000L)
            val request = OneTimeWorkRequestBuilder<WeeklyForecastWorker>()
                .setInputData(Data.Builder().putString("kind", "weekly").build())
                .setInitialDelay(delay, TimeUnit.MILLISECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(UNIQUE_WORK, ExistingWorkPolicy.REPLACE, request)
        }
        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(UNIQUE_WORK)
            NotificationManagerCompat.from(context).cancel(705)
        }
    }
}
