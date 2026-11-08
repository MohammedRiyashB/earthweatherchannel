package com.earthweather.mobile

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.widget.ArrayAdapter
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast

class PremiumWeatherActivity : Activity() {
    private lateinit var cityName: TextView
    private lateinit var temperature: TextView
    private lateinit var condition: TextView
    private lateinit var cityList: MutableList<String>

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(34, 91, 153)
        window.navigationBarColor = Color.rgb(20, 55, 91)
        window.decorView.systemUiVisibility = 0
        setContentView(R.layout.activity_weather)

        cityName = findViewById(R.id.cityName)
        temperature = findViewById(R.id.temperature)
        condition = findViewById(R.id.condition)
        cityList = mutableListOf("Rasipuram", "Trichy", "Chennai")

        findViewById<View>(R.id.cityPicker).setOnClickListener { showCityManager() }
        findViewById<View>(R.id.settingsButton).setOnClickListener { showSettings() }
        findViewById<View>(R.id.refreshButton).setOnClickListener {
            Toast.makeText(this, "Weather refresh requested", Toast.LENGTH_SHORT).show()
        }
        findViewById<View>(R.id.alertsCard).setOnClickListener {
            AlertDialog.Builder(this)
                .setTitle("Weather alerts")
                .setMessage("No active severe-weather alerts are available in this preview.")
                .setPositiveButton("OK", null)
                .show()
        }
        findViewById<View>(R.id.airQualityCard).setOnClickListener {
            AlertDialog.Builder(this)
                .setTitle("Air quality")
                .setMessage("Air-quality details will appear here when a live AQI provider is connected.")
                .setPositiveButton("OK", null)
                .show()
        }
        findViewById<View>(R.id.sunCard).setOnClickListener {
            AlertDialog.Builder(this)
                .setTitle("Sunrise & sunset")
                .setMessage("Sunrise and sunset information is not available until live location weather data is connected.")
                .setPositiveButton("OK", null)
                .show()
        }
        findViewById<View>(R.id.forecastMore).setOnClickListener {
            findViewById<View>(R.id.weekForecast).visibility =
                if (findViewById<View>(R.id.weekForecast).visibility == View.VISIBLE) View.GONE else View.VISIBLE
        }
        findViewById<View>(R.id.homeTab).setOnClickListener { scrollHome() }
        findViewById<View>(R.id.forecastTab).setOnClickListener {
            findViewById<View>(R.id.weekForecast).visibility = View.VISIBLE
            findViewById<View>(R.id.weekForecast).requestFocus()
        }
        findViewById<View>(R.id.mapTab).setOnClickListener {
            Toast.makeText(this, "Weather map is coming soon", Toast.LENGTH_SHORT).show()
        }
        findViewById<View>(R.id.moreTab).setOnClickListener { showSettings() }

        if (checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION), 71)
        }
    }

    private fun scrollHome() {
        findViewById<View>(R.id.homeScroll).requestFocus()
    }

    private fun showCityManager() {
        val adapter = ArrayAdapter(this, android.R.layout.simple_list_item_1, cityList)
        AlertDialog.Builder(this)
            .setTitle("Manage cities")
            .setAdapter(adapter) { _, which ->
                cityName.text = cityList[which]
                Toast.makeText(this, "Selected ${cityList[which]}", Toast.LENGTH_SHORT).show()
            }
            .setPositiveButton("Add city") { _, _ -> addCity() }
            .setNegativeButton("Close", null)
            .show()
    }

    private fun addCity() {
        val input = EditText(this).apply { hint = "Enter city name" }
        AlertDialog.Builder(this)
            .setTitle("Add a city")
            .setView(input)
            .setPositiveButton("Add") { _, _ ->
                val value = input.text.toString().trim()
                if (value.isNotEmpty() && !cityList.contains(value)) {
                    cityList.add(value)
                    cityName.text = value
                    Toast.makeText(this, "$value added", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun showSettings() {
        val options = arrayOf("Temperature unit: Celsius", "Notifications", "About Earth Weather")
        AlertDialog.Builder(this)
            .setTitle("Settings")
            .setItems(options) { _, which ->
                when (which) {
                    0 -> AlertDialog.Builder(this).setTitle("Temperature unit")
                        .setItems(arrayOf("Celsius (°C)", "Fahrenheit (°F)")) { _, unit ->
                            Toast.makeText(this, if (unit == 0) "Celsius selected" else "Fahrenheit selected", Toast.LENGTH_SHORT).show()
                        }.show()
                    1 -> AlertDialog.Builder(this).setTitle("Notifications")
                        .setMessage("Weather notification preferences will be available with the alerts service.")
                        .setPositiveButton("OK", null).show()
                    else -> AlertDialog.Builder(this).setTitle("Earth Weather")
                        .setMessage("Earth Weather\nA native Android weather experience by BMR Inc.")
                        .setPositiveButton("OK", null).show()
                }
            }
            .setNegativeButton("Close", null)
            .show()
    }
}
