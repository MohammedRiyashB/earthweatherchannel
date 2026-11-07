# EARTH WEATHER Native Android App — full reference register

## Reference APK inventory (static inspection)
- Package: `com.coloros.weather2`, version 16.45.5, APK about 96.1 MB.
- 4,203 archive entries, 7 DEX files, 543 Android layouts, 2,434 drawable entries, 297 bundled assets, 13 native libraries.
- Main weather pager / city pages; city manager; current conditions; dynamic weather scenes; hourly forecast; daily forecast with chart/list; AQI; short-term rain; weather/life indexes; sunrise/sunset; alerts; radar; accuracy feedback; followed cities; location and background updates; rain reminder times; morning weather service; settings/privacy/export/feedback/about; standard Android widgets; OEM QuickCards.

These are reference archive counts only. Protected ColorOS resources are not redistributed or renamed. EARTH WEATHER uses its own package, backend, layout, vector assets and original Compose implementation.

## Current implementation in this branch
- [x] Independent app identity `com.bmrinc.earthweather`, Kotlin + Jetpack Compose, custom launcher icon.
- [x] Current conditions via EARTH WEATHER API; location permission, GPS fix, reverse-geocoded city and selected-city persistence.
- [x] Country/regional top-city shortcuts, world cities, backend search and saved-city manager.
- [x] Swipe left/right on the main weather hero to cycle selected/saved cities.
- [x] Hourly forecast strip (up to 48 hours).
- [x] Up-to-15-day forecast list and high/low temperature graph.
- [x] AQI panel (European/US AQI, PM2.5, PM10, ozone) with model-estimate disclaimer.
- [x] UV index, sunrise/sunset, current pressure/cloud/wind/rain detail.
- [x] Daily life/outdoor/rain/UV guidance derived from the available model values; not official health/safety guidance.
- [x] Dynamic original vector condition illustrations (sun, partly-cloudy, overcast, fog, rain, thunder, snow), animated hero drift and condition-based background gradient.
- [x] Rain forecast strip using hourly precipitation probability and amount.
- [x] Interactive historical RainViewer radar map with OSM basemap, selected city marker, frame slider, previous/next and playback.
- [x] Weather alert display with coverage disclosure; background alerts only when connected provider returns an alert.
- [x] Severe-weather alert notifications (opt-in).\n- [x] Morning weather briefing (opt-in) with configurable device-local time and daily self-rescheduling worker.
- [x] Rain reminders (opt-in), user-configurable precipitation-probability threshold and selected-city local-time window.
- [x] Morning weather briefing (opt-in), configurable local-device hour (05:00–11:00).
- [x] Celsius/Fahrenheit setting.
- [x] 2×2 compact and 4×2 detailed widgets with original artwork, live backend weather and selected-city/units sync.
- [x] Settings screens for units, notification controls, provider data and privacy caveats.

## Still required before feature-complete production release
- [ ] IMD/authorised Indian warning integration and other country-specific official warning adapters. Current NOAA/NWS backend route is US-only.
- [ ] True minute-by-minute rain nowcast. Current app shows hourly forecast probabilities; do not relabel this as minute rain.

- [ ] Full-screen detail pages for weather/life indices, more condition-specific animations and day/night scene variants.
- [ ] Accuracy feedback form backed by durable storage and an anti-abuse policy.
- [ ] Rich radar timeline polish and licensing review for the intended commercial distribution scope.
- [ ] Widget configuration screen (city choice, refresh preferences), resizing previews and OEM launcher verification.
- [ ] Offline/stale-data cache with timestamps, exponential retry/backoff and provider failover visibility in UI.
- [ ] Accessibility pass (TalkBack labels, text scaling, contrast, touch targets) and responsive layout pass.
- [ ] Unit/contract/integration tests for backend endpoints; Android UI/instrumentation tests.
- [ ] Commercial Open-Meteo licence/customer API key and attribution review before public commercial release.
- [ ] Release signing, APK/AAB optimisation, Play policy/data-safety disclosure, Realme 14T 5G physical-device validation and production deployment.

## Backend routes
Existing routes:
- `GET /api/weather` — current model conditions and source metadata.
- `GET /api/weather/featured`, `GET /api/weather/bulk` — city reports.
- `GET /api/location/reverse` — coordinates to place/country/state/district.
- `GET /api/cyclones` — NASA EONET curated event metadata, not a complete cyclone warning feed.
- `GET /api/alerts` — NOAA/NWS alerts for US coordinates only.
- `GET /api/radar` — RainViewer historical past frames only.
- Weather news, satellite catalogue and provider health endpoints.
Added in this branch:
- `GET /api/location/search?q=...` — cached/rate-paced Nominatim location search.
- `GET /api/forecast?latitude=&longitude=&days=15` — hourly + up to 16 daily forecast values.
- `GET /api/air-quality?latitude=&longitude=` — AQI/pollutant estimates.

## Data integrity and licensing
- Without `OPEN_METEO_API_KEY`, forecast/AQI adapters use Open-Meteo evaluation endpoints. The free tier is non-commercial; commercial release requires the applicable Open-Meteo licence/customer endpoint and attribution.
- AQI values are model estimates, not regulatory ground-station observations. Link official agencies for health-critical decisions.
- RainViewer here is used for past radar frames, not future precipitation nowcasting. Commercial use needs a provider terms/licence review.
- NOAA/NWS alert coverage is United States only. "No alert returned" does not mean "no risk".
- IMD official alerts require registered/authorised access; no scraping or false claim of official coverage.
- Do not put upstream provider secrets in the APK; all upstream requests must go through EARTH WEATHER API.

## Platform scope
- App code and assets are independent EARTH WEATHER implementations.
- OEM-only OPlus QuickCards/Seedling APIs are not recreated using proprietary code; standard Android AppWidgets are provided instead.
- Background work uses Android WorkManager and may be deferred by the OS battery policy; exact minute delivery is not guaranteed.
