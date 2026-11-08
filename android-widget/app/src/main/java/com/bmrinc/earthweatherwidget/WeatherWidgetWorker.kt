package com.bmrinc.earthweatherwidget
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.widget.RemoteViews
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
class WeatherWidgetWorker(context:Context,params:WorkerParameters):CoroutineWorker(context,params) {
 override suspend fun doWork():Result=withContext(Dispatchers.IO) {
  val p=applicationContext.getSharedPreferences("earth_weather",Context.MODE_PRIVATE); val lat=p.getString("lat",null)?:return@withContext Result.success(); val lon=p.getString("lon",null)?:return@withContext Result.success()
  try {
   val c=URL("https://earthweather-api.onrender.com/api/weather?latitude="+lat+"&longitude="+lon).openConnection() as HttpURLConnection
   c.connectTimeout=12000; c.readTimeout=15000; c.setRequestProperty("Accept","application/json")
   if(c.responseCode !in 200..299) throw IllegalStateException("Weather API unavailable")
   val json=c.inputStream.bufferedReader().use { it.readText() }; c.disconnect()
   val root=JSONObject(json); val cur=root.optJSONObject("current")?:root
   val temp=num(cur,"temperature_2m","temperature","temp_c"); val hum=num(cur,"relative_humidity_2m","humidity"); val wind=num(cur,"wind_speed_10m","wind_kph","wind_speed")
   val code=cur.optInt("weather_code",cur.optInt("weathercode",-1)); val label=label(code); val icon=icon(code)
   val manager=AppWidgetManager.getInstance(applicationContext); val ids=manager.getAppWidgetIds(ComponentName(applicationContext,WeatherWidgetProvider::class.java))
   ids.forEach { id -> val v=RemoteViews(applicationContext.packageName,R.layout.weather_widget); v.setTextViewText(R.id.widget_city,p.getString("city","Your location")); v.setTextViewText(R.id.widget_temperature,if(temp==null)"--°" else temp.toInt().toString()+"°"); v.setTextViewText(R.id.widget_humidity,"💧 "+(hum?.toInt()?.toString()?: "--")+"%"); v.setTextViewText(R.id.widget_wind,"🌬 "+(wind?.toInt()?.toString()?: "--")+" km/h"); v.setTextViewText(R.id.weather_condition,label); v.setTextViewText(R.id.weather_icon,icon); v.setOnClickPendingIntent(R.id.widget_root,MainActivity.pendingIntent(applicationContext)); manager.updateAppWidget(id,v) }
   Result.success()
  } catch(e:Exception) { Result.retry() }
 }
 private fun num(o:JSONObject,vararg keys:String):Double? { keys.forEach { k -> if(o.has(k)&&!o.isNull(k)) return o.optDouble(k).takeIf { !it.isNaN() } }; return null }
 private fun label(c:Int)=when(c) { 0->"Clear sky"; 1,2->"Partly cloudy"; 3->"Overcast clouds"; 45,48->"Fog"; 51,53,55,56,57->"Drizzle"; 61,63,65,66,67->"Rain"; 71,73,75,77,85,86->"Snow"; 80,81,82->"Rain showers"; 95,96,99->"Thunderstorm"; else->"Weather update" }
 private fun icon(c:Int)=when(c) { 0->"☀️"; 1,2->"🌤️"; 3->"☁️"; 45,48->"🌫️"; 51,53,55,56,57->"🌦️"; 61,63,65,66,67,80,81,82->"🌧️"; 71,73,75,77,85,86->"❄️"; 95,96,99->"⛈️"; else->"🌤️" }
 companion object { fun enqueueNow(context:Context) { androidx.work.WorkManager.getInstance(context).enqueue(androidx.work.OneTimeWorkRequestBuilder<WeatherWidgetWorker>().build()) } }
}
