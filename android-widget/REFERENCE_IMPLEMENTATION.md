# EARTH WEATHER Native Android App — implementation register

## Product target
Build an original native Android weather app with the breadth of the inspected ColorOS Weather reference, using EARTH WEATHER branding, original artwork and BMR INC. backend services. This is an independent implementation; third-party source, proprietary assets, logos, fonts, shaders, videos and OEM-only components are not copied.

## Reference APK inventory
- 4,203 archive entries; 7 DEX files; 543 layouts; 2,434 drawable resource entries; 297 bundled assets; 13 native libraries.
- Launcher/weather pager; city manager; current conditions; dynamic weather backgrounds; hourly and daily forecast; AQI; short-term rain; life indices; sunrise/sunset; alerts; radar/chart; accuracy feedback; followed cities; location service; notifications; rain schedule; settings/privacy/about; standard Android widget; OEM QuickCards.

These are inventory counts, not a reusable asset pack. EARTH WEATHER will create original equivalents for each required visual.

## Implementation status
- [x] Independent Android package ID: com.bmrinc.earthweather
- [x] Native Kotlin + Jetpack Compose app foundation
- [x] Main weather screen shell with EARTH WEATHER identity
- [x] Foreground location permission and current-weather request to existing API
- [x] Navigation shell: Weather, Forecast, Cities, Radar, Settings
- [ ] Resolve reverse-geocoded city name in app
- [ ] Typed API client, error states, cache and offline mode
- [ ] Hourly forecast endpoint and UI
- [ ] 10–15 day forecast endpoint and UI
- [ ] AQI provider integration and UI
- [ ] India/regional official alert source and notifications
- [ ] Radar viewer and licensed nowcast feed
- [ ] UV, sunrise/sunset and life-index data
- [ ] City search, favourites and multi-city pager
- [ ] Original weather condition illustrations, animations and backgrounds
- [ ] Rain reminder settings, app preferences, units, privacy and accessibility
- [ ] Reintegrate the approved 4×2 widget into the full application
- [ ] Test on Realme 14T 5G; debug/release signing and production APK

## Backend routes already present
- GET /api/weather
- GET /api/weather/featured
- GET /api/weather/bulk
- GET /api/location/reverse
- GET /api/cyclones
- GET /api/alerts (NOAA/NWS US coverage only)
- GET /api/radar (RainViewer past frames only)
- weather news and satellite catalogue/health routes

## Backend gaps to close before advertising features as live
Hourly/daily forecast, AQI, India official warnings, radar nowcasting, global wind grid and atmospheric time series need dedicated feeds/endpoints. The current /api/atmosphere and /api/wind-grid return 503; do not present them as working.

## Architecture principles
Android app -> EARTH WEATHER FastAPI -> licensed provider adapters. Do not ship upstream API secrets in the APK. Label provider/source and observation time. Respect Android background execution and request only permissions needed by a feature.
