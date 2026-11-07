# OPPO Weather reference analysis — EARTH WEATHER reconstruction

Analysis date: 8 November 2026  
Reference package: `com.coloros.weather2`, version `16.45.5`  
Reference APK: user-supplied `OppoWeather2.apk`  
EARTH WEATHER project: `MohammedRiyashB/earthweatherchannel`, branch `feat/earth-weather-native-app`

## 1. Reference APK inventory

Static archive inspection found 4,203 ZIP entries (about 104.8 MiB uncompressed), seven primary application DEX files plus two bundled audience-network DEX files, 543 Android layout resources in the earlier resource inventory, 480 WebP files, 348 PNG files, 2 bundled TTF fonts, 3 MP4 files, 5 Lottie files, and 13 native shared libraries.

Video and animation assets observed:
- One HEVC/H.265 loop: 576 × 576, 25 fps, 3.52 seconds, 10-bit YUV420.
- Two HEVC/H.265 thunder loops: 430 × 448, 25 fps, 2.24 seconds each.
- Five Lottie assets for rain and snow animations (including tablet variants).

These filenames, dimensions and formats are used only to understand the reference implementation. OPPO/OPlus video, font, icon, shader and proprietary source assets are not copied into EARTH WEATHER. The EARTH WEATHER implementation uses independent UI code and original motion artwork. OEM QuickCards/Seedling integrations are not portable Android app components.

## 2. User screenshot screen map

### A. Main weather dashboard
Observed structure, top to bottom:
1. Android status bar over a full-bleed night-sky/cloud scene.
2. City name in a handwritten-style display face and a location marker.
3. Top-right manage-cities and settings actions.
4. Very large centred current temperature.
5. Condition summary, daily low/high and AQI summary.
6. Pollen card with title, risk/availability copy and a detail affordance.
7. Horizontal hourly forecast card with local time, condition glyph and temperature.
8. Multi-day forecast card with List/Line control, day label, weather glyph and low/high values.
9. Air-quality summary and AQI scale.
10. Two-column weather metric tiles (UV, feels-like, humidity, wind, pressure, visibility).
11. Sunrise/sunset path card.
12. Moonrise/moonset card.
13. Lifestyle tips grid.
14. Weather source/alert information further down the scroll.

### B. Settings
The screenshot uses a black canvas, handwritten-style headings, charcoal rounded groups, thin grey separators and blue switches.
Sections:
- Weather alerts: rain alert schedule, severe weather, trip weather, daily forecast, weekly forecast and a route into real-time notification settings.
- Units: temperature, wind, air pressure and visibility.
- About Weather.

### C. Real-time weather notifications
A dedicated sub-screen reached from Settings:
- Back arrow/title.
- Ongoing-notification switch and explanation.
- Followed-city selector.

### D. Manage cities
A dedicated screen:
- Back arrow and title.
- Rounded city search field.
- Selected/current city card with blue gradient.
- Add-city floating action button.
- Saved city selection/removal.

## 3. Functional data mapping

| Reference feature | EARTH WEATHER data / implementation |
|---|---|
| Current temperature, condition, feels-like, humidity, wind, pressure, cloud | `GET /api/weather` |
| Hourly and multi-day outlook | `GET /api/forecast` (current app request asks for 15 days) |
| AQI, PM2.5, PM10, ozone, UV | `GET /api/air-quality` |
| City search | `GET /api/location/search` |
| Reverse geocoding | `GET /api/location/reverse` |
| Past radar frames | `GET /api/radar` |
| Severe warnings | `GET /api/alerts` (NOAA/NWS is US-only) |
| Pollen | Not currently returned for Rasipuram/India by the connected Open-Meteo pollen model; the app must show unavailable rather than invent a low/high value. |
| Visibility | Not currently mapped into the Android current-conditions model; show unavailable until a verified source field is wired. |
| Moonrise/moonset | Not supplied by the configured forecast provider; show unavailable until an astronomy source is integrated. |

Open-Meteo's official Air Quality API documentation lists pollen variables (alder, birch, grass, mugwort, olive, ragweed) as available only in Europe. Therefore pollen values must not be fabricated for India.

## 4. Current redesign changes

Commit: `2631335594ac805eeef8553e37993f195fb8ef1f`

- Replaced the generic light theme and bottom navigation with a dark, vertically scrolling weather dashboard.
- Added an animated night-sky/cloud Canvas scene to provide condition-driven motion without bundling the protected OPPO video loops.
- Added location header, top-right Manage Cities and Settings actions, handwritten-style system type, large temperature and condition summary.
- Added Pollen availability card, emoji-based forecast glyphs, dark hourly strip and List/Line multi-day forecast card.
- Reworked AQI, detail metrics, sunrise/sunset, moon information and lifestyle panels for the dark UI.
- Rebuilt Settings and Manage Cities surfaces to match the supplied layout language.
- Added a dedicated Real-time Weather Notifications settings screen.
- Added an opt-in ongoing notification worker that requests current weather on a 15-minute WorkManager cadence. Android may defer background work; this is not second-by-second streaming.

## 5. Known gaps before claiming feature parity

- Trip weather notifications are shown as unavailable until trip destination/time and provider coverage are implemented.
- Weekly forecast notification is shown as unavailable until a reliable weekly scheduling workflow is implemented.
- Pollen, visibility and moonrise/moonset need regional/provider integration before displaying numerical readings.
- Background Canvas animation is an original substitute; it is not an extracted OPPO MP4.
- The screenshots are visual references; physical-device layout, font scaling, notification behaviour and all touch targets still require testing on the user's Realme 14T 5G.
- Backend provider licensing, attribution and India-specific official weather-warning coverage still need validation before public production release.

## 6. Release integrity

The existing PR #19 remains the review target. The redesign commit is on its feature branch and does not alter `main` until the PR is merged. A successful GitHub Actions Android build and a real-device installation test are required before a new APK should be described as ready.
