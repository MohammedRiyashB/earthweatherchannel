package com.bmrinc.earthweather

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale

private val Ink=Color(0xFF101820); private val Sky=Color(0xFF087FA3); private val Page=Color(0xFFF1F6F8); private val Muted=Color(0xFF71818A)
private data class Weather(val temp:String="--",val feels:String="--",val humidity:String="--",val wind:String="--",val pressure:String="--",val cloud:String="--",val condition:String="Getting weather",val icon:String="🌤️",val updated:String="Connecting to EARTH WEATHER")

class MainActivity:ComponentActivity(){
 private var weather by mutableStateOf(Weather())
 private var tab by mutableStateOf("Weather")
 private val permission=registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()){g->if(g.values.any{it})locate()}
 override fun onCreate(savedInstanceState:Bundle?){super.onCreate(savedInstanceState);setContent{
  MaterialTheme(colorScheme=lightColorScheme(primary=Sky,background=Page,surface=Color.White,onSurface=Ink)){
   Scaffold(containerColor=Page,bottomBar={NavigationBar(containerColor=Color.White){listOf("Weather","Forecast","Cities","Radar","Settings").forEach{t->NavigationBarItem(selected=tab==t,onClick={tab=t},icon={Text(when(t){"Weather"->"☀";"Forecast"->"▥";"Cities"->"⌖";"Radar"->"◉";else->"⚙"},fontSize=19.sp)},label={Text(t,fontSize=10.sp)})}}}){p->
    when(tab){"Weather"->Home(weather,Modifier.padding(p),{requestLocation()});"Forecast"->InfoPage("Forecast","Hourly and 15-day forecast feeds are the next backend integration.",Modifier.padding(p));"Cities"->InfoPage("Your cities","Search, save and switch between locations.",Modifier.padding(p));"Radar"->InfoPage("Weather radar","Radar past frames are available; live nowcasting needs a dedicated feed.",Modifier.padding(p));else->InfoPage("Settings","Units, notifications, privacy, themes and app preferences.",Modifier.padding(p))}
   }
  }
 };requestLocation()}
 private fun requestLocation(){val f=ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED;val c=ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED;if(f||c)locate()else permission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION))}
 private fun locate(){try{LocationServices.getFusedLocationProviderClient(this).lastLocation.addOnSuccessListener{l->if(l!=null)fetch(l.latitude,l.longitude)else weather=weather.copy(condition="Location unavailable",updated="Turn on device location and refresh")}.addOnFailureListener{weather=weather.copy(condition="Location unavailable")}}catch(_:SecurityException){weather=weather.copy(condition="Location permission needed")}}
 private fun fetch(lat:Double,lon:Double){Thread{try{val c=URL("https://earthweather-api.onrender.com/api/weather?latitude=$lat&longitude=$lon").openConnection() as HttpURLConnection;c.connectTimeout=15000;c.readTimeout=20000;c.setRequestProperty("Accept","application/json");val body=c.inputStream.bufferedReader().use{it.readText()};c.disconnect();val root=JSONObject(body);val j=root.optJSONObject("current")?:root;val code=j.optInt("weather_code",-1);val pair=condition(code);runOnUiThread{weather=Weather(n(j,"temperature_2m"),n(j,"apparent_temperature"),n(j,"relative_humidity_2m"),n(j,"wind_speed_10m",1)+" km/h",n(j,"surface_pressure"),n(j,"cloud_cover"),pair.first,pair.second,"EARTH WEATHER · LIVE DATA")}}catch(_:Exception){runOnUiThread{weather=weather.copy(condition="Weather temporarily unavailable",updated="Check connection and refresh")}}}.start()}
 private fun n(j:JSONObject,k:String,d:Int=0):String{val v=j.optDouble(k,Double.NaN);return if(v.isNaN())"--" else String.format(Locale.US,"%."+d+"f",v)}
}
private fun condition(c:Int):Pair<String,String>=when(c){0->"Clear sky" to "☀️";1,2->"Partly cloudy" to "🌤️";3->"Overcast clouds" to "☁️";45,48->"Fog" to "🌫️";in 51..57->"Drizzle" to "🌦️";in 61..67->"Rain" to "🌧️";in 71..77->"Snow" to "❄️";in 80..82->"Rain showers" to "🌧️";in 95..99->"Thunderstorm" to "⛈️";else->"Weather update" to "🌤️"}
@Composable private fun Home(w:Weather,modifier:Modifier=Modifier,refresh:()->Unit){Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal=18.dp)){
 Row(Modifier.fillMaxWidth().padding(vertical=18.dp),verticalAlignment=Alignment.CenterVertically){Column(Modifier.weight(1f)){Text("EARTH WEATHER",fontSize=22.sp,fontWeight=FontWeight.Black,color=Ink);Text("WEATHER · YOUR WORLD",fontSize=10.sp,fontWeight=FontWeight.Bold,color=Sky,letterSpacing=2.sp)};TextButton(onClick=refresh){Text("Refresh")}}
 Column(Modifier.fillMaxWidth().background(Brush.linearGradient(listOf(Color(0xFF075B79),Color(0xFF1699B5),Color(0xFF63B7C5))),RoundedCornerShape(30.dp)).padding(24.dp)){
 Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween,verticalAlignment=Alignment.CenterVertically){Column{Text("Current location",color=Color.White,fontSize=18.sp,fontWeight=FontWeight.SemiBold);Text("Live local conditions",color=Color.White.copy(alpha=.8f),fontSize=12.sp)};Text(w.icon,fontSize=42.sp)}
 Spacer(Modifier.height(14.dp));Row(verticalAlignment=Alignment.Top){Text(w.temp,color=Color.White,fontSize=76.sp,fontWeight=FontWeight.Light);Text("°C",color=Color.White,fontSize=25.sp,modifier=Modifier.padding(top=12.dp))}
 Text(w.condition,color=Color.White,fontSize=18.sp,fontWeight=FontWeight.Medium);Text("Feels like "+w.feels+"°",color=Color.White.copy(alpha=.82f),fontSize=13.sp);Spacer(Modifier.height(20.dp))
 Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween){Metric("HUMIDITY",w.humidity+"%");Metric("WIND",w.wind);Metric("CLOUD",w.cloud+"%")}
 }
 Spacer(Modifier.height(16.dp));Text("WEATHER DETAILS",color=Muted,fontSize=11.sp,fontWeight=FontWeight.Bold,letterSpacing=1.8.sp);Spacer(Modifier.height(10.dp))
 Row(horizontalArrangement=Arrangement.spacedBy(10.dp)){Detail("Pressure",w.pressure+" hPa",Modifier.weight(1f));Detail("Feels like",w.feels+"°C",Modifier.weight(1f))}
 Spacer(Modifier.height(16.dp));Text("FORECAST",color=Muted,fontSize=11.sp,fontWeight=FontWeight.Bold,letterSpacing=1.8.sp);Spacer(Modifier.height(10.dp))
 Card(colors=CardDefaults.cardColors(containerColor=Color.White),shape=RoundedCornerShape(22.dp)){Column(Modifier.padding(18.dp)){Text("Forecast integration next",color=Ink,fontWeight=FontWeight.SemiBold,fontSize=17.sp);Text("Hourly and daily forecast values will appear after the dedicated backend feeds are connected and verified.",color=Muted,fontSize=13.sp,lineHeight=19.sp,modifier=Modifier.padding(top=6.dp))}}
 Text(w.updated,color=Muted,fontSize=10.sp,modifier=Modifier.padding(vertical=18.dp))
}}
@Composable private fun Metric(label:String,value:String){Column{Text(label,color=Color.White.copy(alpha=.72f),fontSize=9.sp,fontWeight=FontWeight.Bold);Text(value,color=Color.White,fontSize=14.sp,fontWeight=FontWeight.SemiBold)}}
@Composable private fun Detail(title:String,value:String,modifier:Modifier=Modifier){Card(modifier,colors=CardDefaults.cardColors(containerColor=Color.White),shape=RoundedCornerShape(20.dp)){Column(Modifier.padding(16.dp)){Text(title,color=Muted,fontSize=12.sp);Text(value,color=Ink,fontSize=18.sp,fontWeight=FontWeight.Bold)}}}
@Composable private fun InfoPage(title:String,body:String,modifier:Modifier=Modifier){Column(modifier.fillMaxSize().padding(22.dp),verticalArrangement=Arrangement.Center){Text("EARTH WEATHER",color=Sky,fontSize=11.sp,fontWeight=FontWeight.Bold,letterSpacing=2.sp);Text(title,color=Ink,fontSize=30.sp,fontWeight=FontWeight.Bold,modifier=Modifier.padding(top=10.dp));Text(body,color=Muted,fontSize=15.sp,lineHeight=23.sp,modifier=Modifier.padding(top=12.dp))}}
