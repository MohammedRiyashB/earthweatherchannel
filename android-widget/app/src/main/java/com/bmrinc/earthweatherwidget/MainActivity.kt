package com.bmrinc.earthweatherwidget
import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Bundle
import android.widget.*
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.work.*
import com.google.android.gms.location.LocationServices
import java.util.concurrent.TimeUnit
class MainActivity : Activity() {
 private lateinit var info: TextView
 override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState)
  val root=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL; setPadding(32,48,32,32); setBackgroundColor(0xFF090C10.toInt()) }
  val title=TextView(this).apply { text="EARTH WEATHER"; textSize=25f; setTextColor(-1) }
  info=TextView(this).apply { text="Allow location once, then add the 4×2 EARTH WEATHER widget from your Home Screen widget menu."; textSize=16f; setTextColor(0xFFD4D9DE.toInt()); setPadding(0,24,0,24) }
  val button=Button(this).apply { text="Use my current location"; setOnClickListener { saveLocation() } }
  root.addView(title); root.addView(info); root.addView(button); setContentView(root)
  val req=PeriodicWorkRequestBuilder<WeatherWidgetWorker>(30,TimeUnit.MINUTES).build()
  WorkManager.getInstance(this).enqueueUniquePeriodicWork("earth-weather-refresh",ExistingPeriodicWorkPolicy.UPDATE,req)
 }
 private fun saveLocation() {
  val fine=ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED
  val coarse=ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED
  if(!fine && !coarse) { ActivityCompat.requestPermissions(this,arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION),41); return }
  info.text="Getting your location…"
  LocationServices.getFusedLocationProviderClient(this).lastLocation.addOnSuccessListener { loc ->
   if(loc!=null) { getSharedPreferences("earth_weather",MODE_PRIVATE).edit().putString("lat",loc.latitude.toString()).putString("lon",loc.longitude.toString()).putString("city","Current location").apply(); WeatherWidgetWorker.enqueueNow(this); info.text="Location saved. Add EARTH WEATHER (4×2) from Home Screen → Widgets." }
   else info.text="Location unavailable. Turn on phone Location and try again."
  }.addOnFailureListener { info.text="Could not get location. Please try again." }
 }
 override fun onRequestPermissionsResult(requestCode:Int,permissions:Array<out String>,grantResults:IntArray) { super.onRequestPermissionsResult(requestCode,permissions,grantResults); if(requestCode==41 && grantResults.any { it==PackageManager.PERMISSION_GRANTED }) saveLocation() }
 companion object { fun pendingIntent(context:android.content.Context):android.app.PendingIntent { val i=android.content.Intent(context,MainActivity::class.java); return android.app.PendingIntent.getActivity(context,0,i,android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE) } }
}
