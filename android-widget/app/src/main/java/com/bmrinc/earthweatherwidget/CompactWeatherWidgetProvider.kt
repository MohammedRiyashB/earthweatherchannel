package com.bmrinc.earthweatherwidget
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
import com.bmrinc.earthweather.MainActivity
import com.bmrinc.earthweather.R

class CompactWeatherWidgetProvider : AppWidgetProvider() {
 override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
  ids.forEach { id ->
   val views = RemoteViews(context.packageName, R.layout.weather_widget_compact)
   views.setOnClickPendingIntent(R.id.compact_root, MainActivity.pendingIntent(context))
   manager.updateAppWidget(id, views)
  }
  WeatherWidgetWorker.enqueueNow(context)
 }
}