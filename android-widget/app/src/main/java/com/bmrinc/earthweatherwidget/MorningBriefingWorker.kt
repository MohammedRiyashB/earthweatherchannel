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
import java.time.ZonedDateTime
import java.util.concurrent.TimeUnit

/**
 * Sends two forecast briefings per local day:
 * - Morning: today's outlook at the user's selected morning hour.
 * - Evening: tomorrow's outlook at 18:00.
 *
 * Android WorkManager is best-effort and may defer either delivery due to
 * battery optimisation, Doze or connectivity. These are forecasts, not alerts.
 */
class MorningBriefingWorker(context: Context, params: WorkerParameters) :
    CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val appPrefs = applicationContext.getSharedPreferences("earth_weather_app", Context.MODE_PRIVATE)
        val weatherPrefs = applicationContext.getSharedPreferences("earth_weather", Context.MODE_PRIVATE)

        if (!appPrefs.getBoolean("morning_briefing_enabled", false)) {
            return@withContext Result.success()
        }
        if (ContextCompat.checkSelfPermission(
                applicationContext, Manifest.permission.POST_NOTIFICATIONS
            ) != PackageManager.PERMISSION_GRANTED
        ) return@withContext Result.success()

        val latitude = weatherPrefs.getString("lat", null) ?: return@withContext Result.retry()
        val longitude = weatherPrefs.getString("lon", null) ?: return@withContext Result.retry()
        val briefingType = inputData.getString(KEY_TYPE) ?: TYPE_MORNING

        try {
            val url = URL(
                "https://earthweather-api.onrender.com/api/forecast?latitude=$latitude&longitude=$longitude&days=2"
            )
            val connection = url.openConnection() as HttpURLConnection
            connection.connectTimeout = 12000
            connection.readTimeout = 18000
            connection.setRequestProperty("Accept", "application/json")
            if (connection.responseCode !in 200..299) {
                throw IllegalStateException("Forecast service unavailable")
            }
            val body = connection.inputStream.bufferedReader().use { it.readText() }
            connection.disconnect()

            val root = JSONObject(body)
            val daily = root.optJSONArray("daily")
            val current = root.optJSONObject("current")
            val dayIndex = if (briefingType == TYPE_EVENING) 1 else 0
            val target = daily?.optJSONObject(dayIndex)
                ?: daily?.optJSONObject(0)
                ?: throw IllegalStateException("Daily forecast missing")

            val city = weatherPrefs.getString("city", "Your location") ?: "Your location"
            val high = target.optDouble("temperature_2m_max", Double.NaN)
            val low = target.optDouble("temperature_2m_min", Double.NaN)
            val rain = target.optInt("precipitation_probability_max", -1)
            val code = target.optInt("weather_code", -1).takeIf { it >= 0 }
                ?: current?.optInt("weather_code", -1) ?: -1
            val condition = when (code) {
                0 -> "Clear"
                1, 2 -> "Partly cloudy"
                3 -> "Overcast"
                45, 48 -> "Fog"
                51, 53, 55, 56, 57 -> "Drizzle"
                61, 63, 65, 66, 67 -> "Rain"
                71, 73, 75, 77, 85, 86 -> "Snow"
                80, 81, 82 -> "Rain showers"
                95, 96, 99 -> "Thunderstorms"
                else -> "Weather outlook"
            }
            val summary = "High ${fmt(high)}° · Low ${fmt(low)}° · $condition" +
                if (rain >= 0) " · Rain chance $rain%" else ""

            val manager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val channelId = "earth_weather_daily"
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                manager.createNotificationChannel(
                    NotificationChannel(channelId, "Daily weather forecasts", NotificationManager.IMPORTANCE_DEFAULT)
                )
            }

            val title = if (briefingType == TYPE_EVENING) "Tomorrow · $city" else "Good morning · $city"
            val prefix = if (briefingType == TYPE_EVENING) "Tomorrow's forecast for $city" else "Today's forecast for $city"
            val notificationId = if (briefingType == TYPE_EVENING) EVENING_NOTIFICATION_ID else MORNING_NOTIFICATION_ID
            val intent = Intent(applicationContext, MainActivity::class.java)
            val pending = PendingIntent.getActivity(
                applicationContext, notificationId, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val notification = NotificationCompat.Builder(applicationContext, channelId)
                .setSmallIcon(R.drawable.ic_weather_partly)
                .setContentTitle(title)
                .setContentText(summary)
                .setStyle(
                    NotificationCompat.BigTextStyle().bigText(
                        "$prefix: $summary. Forecast guidance may change as new model runs arrive."
                    )
                )
                .setAutoCancel(true)
                .setContentIntent(pending)
                .build()
            NotificationManagerCompat.from(applicationContext).notify(notificationId, notification)

            schedule(applicationContext)
            Result.success()
        } catch (_: SecurityException) {
            Result.success()
        } catch (_: Exception) {
            Result.retry()
        }
    }

    private fun fmt(value: Double): String =
        if (value.isNaN() || value.isInfinite()) "—" else value.toInt().toString()

    companion object {
        private const val KEY_TYPE = "briefing_type"
        private const val TYPE_MORNING = "morning"
        private const val TYPE_EVENING = "evening"
        private const val MORNING_WORK = "earth-weather-daily-forecast-morning"
        private const val EVENING_WORK = "earth-weather-daily-forecast-evening"
        private const val LEGACY_WORK = "earth-weather-morning-briefing"
        private const val MORNING_NOTIFICATION_ID = 702
        private const val EVENING_NOTIFICATION_ID = 704
        private const val EVENING_HOUR = 18

        fun schedule(context: Context) {
            val prefs = context.getSharedPreferences("earth_weather_app", Context.MODE_PRIVATE)
            if (!prefs.getBoolean("morning_briefing_enabled", false)) {
                cancel(context)
                return
            }
            val morningHour = prefs.getInt("morning_briefing_hour", 7).coerceIn(5, 11)
            val now = ZonedDateTime.now()
            enqueueAt(context, MORNING_WORK, TYPE_MORNING, nextOccurrence(now, morningHour))
            enqueueAt(context, EVENING_WORK, TYPE_EVENING, nextOccurrence(now, EVENING_HOUR))
            WorkManager.getInstance(context).cancelUniqueWork(LEGACY_WORK)
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(MORNING_WORK)
            WorkManager.getInstance(context).cancelUniqueWork(EVENING_WORK)
            WorkManager.getInstance(context).cancelUniqueWork(LEGACY_WORK)
        }

        private fun nextOccurrence(now: ZonedDateTime, hour: Int): ZonedDateTime {
            var next = now.withHour(hour).withMinute(0).withSecond(0).withNano(0)
            if (!next.isAfter(now)) next = next.plusDays(1)
            return next
        }

        private fun enqueueAt(context: Context, name: String, type: String, at: ZonedDateTime) {
            val delay = Duration.between(ZonedDateTime.now(at.zone), at).toMillis().coerceAtLeast(1000L)
            val request = OneTimeWorkRequestBuilder<MorningBriefingWorker>()
                .setInputData(Data.Builder().putString(KEY_TYPE, type).build())
                .setInitialDelay(delay, TimeUnit.MILLISECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(name, ExistingWorkPolicy.REPLACE, request)
        }
    }
}
