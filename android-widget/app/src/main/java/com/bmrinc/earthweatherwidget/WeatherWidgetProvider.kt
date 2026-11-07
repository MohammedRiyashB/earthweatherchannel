package com.bmrinc.earthweatherwidget
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
class WeatherWidgetProvider:AppWidgetProvider() { override fun onUpdate(context:Context,manager:AppWidgetManager,ids:IntArray) { ids.forEach { id -> val v=RemoteViews(context.packageName,com.bmrinc.earthweather.R.layout.weather_widget); v.setOnClickPendingIntent(com.bmrinc.earthweather.R.id.widget_root,MainActivity.pendingIntent(context)); manager.updateAppWidget(id,v) }; WeatherWidgetWorker.enqueueNow(context) } }
