# EARTH WEATHER native Android app

This Android app is being migrated to a native Android UI. The launcher screen is built with Kotlin and Android XML layouts; it does not use WebView or HTML.

## Build a debug APK

Requires JDK 17+, Android SDK Platform 35, and Gradle 8.11.1.

```bash
cd android-app
gradle --no-daemon assembleDebug
```

Output:

`app/build/outputs/apk/debug/app-debug.apk`

## App identity

- Application ID: `com.bmrinc.earthweather`
- Android namespace: `com.earthweather.mobile`
- Minimum Android: API 26
- Target Android: API 35

## Native UI status

- Native Kotlin Activity and XML home screen.
- Native city picker and add-city dialog.
- Native settings dialog.
- Hourly and expandable 7-day forecast presentation.
- Air quality, sunrise/sunset, and weather-alert entry points.
- Legacy Android WebView HTML screen removed.

## Data integration status

The current native screen is the first UI migration pass. It intentionally shows placeholders where live provider data is not yet connected. Do not treat placeholder temperatures, AQI, or forecast values as live weather observations. The existing website and backend remain separate and are not loaded inside this Android app.
