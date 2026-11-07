# EARTH WEATHER Native Android App — implementation register

## Product target
Build an original native Android weather app with the functional breadth and interaction quality of the inspected ColorOS Weather reference, using EARTH WEATHER branding, original artwork and BMR INC. backend services. This is an independent implementation: no proprietary OPPO source, logo, fonts, shaders, videos, OEM UI classes or QuickCard code is redistributed.

## Reference APK inventory
- APK: 100,803,256 bytes (about 96.1 MiB), version 16.45.5, package `com.coloros.weather2`
- 4,203 ZIP entries; 7 DEX files; 543 layouts; 2,434 drawable entries across qualifiers; 297 bundled assets; 13 native libraries; arm64-v8a only; min Android 10, target/compile SDK 36.
- Main weather pager / swipeable city pages; city manager; current conditions; dynamic weather backgrounds; hourly forecast; daily/future forecast with chart/list; AQI; minute-rain banner; weather/life indices; sunrise/sunset; alert and warning cards; radar charts; accuracy feedback; followed cities; auto-location service; background update receivers; rain reminder windows; morning weather service; privacy, feedback, about and meteorological settings; standard Android AppWidget; OPlus QuickCard/Seedling cards.

Counts describe the reference archive only. They are not an instruction to copy the reference's copyrighted binary assets. All EARTH WEATHER visuals are original.

## Implemented in this branch
- [x] Independent Android package `com.bmrinc.earthweather`, Kotlin + Jetpack Compose.
- [x] EARTH WEATHER app identity and original launcher icon.
- [x] Current weather screen using the EARTH WEATHER API; foreground location permission and reverse geocoding.
- [x] Backend city search route; app city search, saved cities, select/switch city, country popular-city shortcuts and world-city shortcuts.
- [x] Typed Android API client for current conditions, forecast, AQI, reverse geocoding, alerts and radar metadata.
- [x] Dedicated backend `GET /api/forecast` returning 48-hour app-consumed hourly values and up to 15 daily forecast records (API supports up to 16).
- [x] Dedicated backend `GET /api/air-quality` with European/US AQI, PM2.5, PM10, ozone and UV fields.
- [x] Forecast UI: hourly strip and 15-day high/low list.
- [x] AQI card, daily UV max and sunrise/sunset cards.
- [x] Rain/precipitation probability screen and RainViewer past-frame metadata (not a full map player or nowcast).
- [x] Alert display using the current `/api/alerts` adapter; the connected NOAA/NWS adapter is US-only.
- [x] Settings: °C/°F and explicit severe-weather notification control.
- [x] Background alert worker (only notifies when the configured official-alert endpoint returns an active alert; currently useful only where that provider has coverage).
- [x] Original vector weather illustrations for clear, partly-cloudy, overcast, fog, rain, thunder and snow; gently animated hero artwork.
- [x] 4×2 detailed widget and 2×2 compact widget registered in the same native app. Both read current conditions from EARTH WEATHER API and refresh through WorkManager.

## Still required before calling the app feature-complete
- [ ] City pager / swipe between multiple saved city weather pages; city list currently switches through selectable rows and shortcut lists.
- [ ] 15-day chart view in addition to the list view.
- [ ] Minute-by-minute rain banner; current endpoint provides hourly precipitation probabilities, not true minute nowcast.
- [ ] More complete weather/life indices (comfort, outdoor activity, clothing guidance) with transparent calculations and source labels.
- [ ] Full interactive radar map, frame timeline and playback. Current app shows RainViewer frame metadata and rain probabilities only.
- [ ] India/region-appropriate official alert integration. `/api/alerts` currently returns NOAA/NWS data for US coordinates only; an authorised IMD feed/API arrangement is required for official Indian warnings.
- [ ] Rain reminder schedule with user-configurable time windows.
- [ ] Morning weather briefing and configurable delivery.
- [ ] Weather accuracy feedback endpoint and UI.
- [ ] More weather condition animations/background transitions and night/day scene variants.
- [ ] Widget configuration (city selection, units, refresh preferences), preview and OEM launcher verification.
- [ ] Offline/stale-data cache, retry strategy, loading/error states and accessibility audit.
- [ ] Full Android unit/instrumentation tests and API contract tests.
- [ ] Device testing on Realme 14T 5G; debug/release signing, release build, APK size optimisation and production distribution.

## Backend routes available or added
Existing:
- `GET /api/weather` — current conditions and source metadata.
- `GET /api/weather/featured`, `GET /api/weather/bulk` — featured / bulk city reports.
- `GET /api/location/reverse` — GPS coordinate to place/country/state/district.
- `GET /api/cyclones` — NASA EONET curated severe-storm events (not a complete official warning feed).
- `GET /api/alerts` — NOAA/NWS alerts for US coordinates only.
- `GET /api/radar` — RainViewer past frames only, not a nowcast.
- Weather news, satellite catalogue and health routes.
Added in this branch:
- `GET /api/location/search?q=...` — rate-paced and cached Nominatim city/town/village lookup.
- `GET /api/forecast?latitude=&longitude=&days=15` — hourly + daily forecast payload.
- `GET /api/air-quality?latitude=&longitude=` — current AQI and pollutant estimates.

## Provider licensing and data integrity
- The forecast and AQI adapters use Open-Meteo evaluation endpoints when no `OPEN_METEO_API_KEY` is configured. Their free API is limited to non-commercial use; commercial release needs the applicable Open-Meteo commercial licence/customer endpoint and attribution.
- AQI values are model estimates, not regulatory ground-station readings. Health-critical guidance must link to local official agencies.
- RainViewer endpoint currently provides past radar frames; this is not a future-rain nowcast.
- NOAA/NWS alert feed currently covers the United States only. Do not show "no alerts" as "no risk"; label provider coverage clearly.
- IMD/official India warnings need registered access and provider terms. Do not scrape or claim official coverage without permission.
- Do not ship upstream provider secrets in the APK. Route provider access through EARTH WEATHER API.

## Architecture principles
Android app -> EARTH WEATHER FastAPI -> licensed provider adapters. Add source, model/observation timestamp, coverage and limitation metadata. Respect Android background scheduling and request only permissions required by user-enabled features.
