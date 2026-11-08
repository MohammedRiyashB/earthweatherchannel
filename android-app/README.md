# EARTH WEATHER Android app shell

This Android project packages the existing EARTH WEATHER web frontend in a secure WebView. It uses the existing FastAPI backend indirectly through the deployed frontend's configured `VITE_API_BASE_URL`; it does not duplicate API secrets or create a second weather-data implementation.

## Build a debug APK

Requires JDK 17+, Android SDK Platform 35, and Gradle 8.11.1.

```bash
cd android-app
gradle --no-daemon assembleDebug
```

Output:

`app/build/outputs/apk/debug/app-debug.apk`

To point the app at a staging website:

```bash
gradle --no-daemon assembleDebug -PearthWeatherStartUrl=https://YOUR-STAGING-HOST/
```

## Permissions and security

- Internet access is required.
- Location permission is requested only when the trusted EARTH WEATHER site asks for browser geolocation.
- Only `earthweatherchannel.web.app` and `earthweatherchannel.firebaseapp.com` are trusted for in-WebView navigation and geolocation.
- External links are opened by Android outside the app.
- File access, mixed-content loading, camera and microphone access are disabled.

## Current integration boundary

This is an Android app shell for the existing EARTH WEATHER website. The OPPO resource archive is intentionally not modified or unpacked by this project. A ZIP of decoded Android resources is not, by itself, an installable app or complete Android source project: it does not contain the original app's compiled application logic and third-party dependencies. The current GitHub copy of `Uifprweather.zip` must first be re-uploaded and verified as a real ZIP before any resource-level UI integration can be assessed.

The app currently opens the deployed EARTH WEATHER web frontend, not the OPPO Weather layout. The OPPO UI remains a separate, untouched reference package until a valid archive and a legally usable integration path are available.
