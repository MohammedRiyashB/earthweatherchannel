# EARTH WEATHER

A global weather intelligence explorer built around a CesiumJS 3D globe, NASA satellite imagery, global numerical weather-model fields, curated severe-storm events and live source-health checks.

## Current capabilities

- **3D Earth:** Cesium globe with OpenStreetMap basemap and NASA GIBS imagery layers.
- **Satellite imagery:** NASA VIIRS daily true-colour imagery and NOAA GOES-East / GOES-West GeoColor and GOES-East infrared layers through NASA GIBS.
- **Historical imagery playback:** Seven-day date selector / playback for the daily VIIRS product. Product acquisition times and tile availability vary; this is not a continuous geostationary video archive.
- **Global wind flow:** 15-degree global samples from Open-Meteo 10 m wind speed and direction, rendered as animated particle paths. This is a coarse model-derived visualization, not direct station observations or a high-resolution operational wind analysis.
- **Cloud movement:** Cloud-cover model samples advected using the model wind field. This is a simplified model visualization, not a photorealistic satellite cloud texture or a cloud-resolving forecast.
- **Rainfall:** Global coarse current model precipitation overlay and location-based hourly precipitation probability / amount timeline.
- **Atmospheric water cycle:** Relative humidity, dew point, cloud layers, precipitation and modeled evapotranspiration time series.
- **Severe-storm events:** NASA EONET active severe-storm event metadata, event locations and any available event geometry.
- **Source health:** Backend probes Open-Meteo, NASA EONET, NASA GIBS and RainViewer; the UI refreshes health status every 60 seconds.
- **Local conditions:** Browser geolocation (permission required), current model conditions and hourly forecast.
- **Radar history:** RainViewer past radar frames where radar coverage exists.

## Data provenance and important limits

| Layer / feature | Data source | What it means |
|---|---|---|
| Wind flow | Open-Meteo global forecast models | Coarse 15° model sample, particle paths interpolate the field |
| Cloud movement | Open-Meteo cloud-cover + wind fields | Simplified advection visualization; not observed cloud pixels |
| Rainfall forecast | Open-Meteo | Model precipitation and probability; local hourly series plus coarse global current field |
| Humidity / evapotranspiration | Open-Meteo | Model-derived atmospheric and surface water-flux estimates |
| Storm events | NASA EONET | Curated severe-storm event metadata; not a complete tropical-cyclone tracker or warning service |
| Satellite imagery | NASA GIBS / NOAA GOES | Product-dependent imagery with different coverage and latency |
| Radar history | RainViewer | Patchy historical radar only; no free nowcast |

**India-specific cyclone tracking:** The IMD API catalogue documents cyclone tracks, wind warnings and uncertainty cones. The public API management portal requires registration/access. Add IMD credentials and implement its authenticated adapter before marking official Indian cyclone tracking as connected. NASA EONET is not a substitute for IMD bulletins.

**Photorealistic cloud animation:** The current cloud overlay is intentionally labeled as a simplified model-advection visualization. It should not be presented as raw satellite cloud imagery. A true high-resolution satellite time-lapse requires a time-indexed geostationary imagery feed with permitted tile access and reliable timestamps.

**Source health:** A green/online status means the endpoint responded to a lightweight probe. It does not prove data freshness, scientific accuracy, full geographic coverage or service-level availability.

## Stack

- Frontend: React, TypeScript, Vite, CesiumJS
- Backend: FastAPI, HTTPX
- Model data: Open-Meteo
- Satellite imagery: NASA GIBS / NOAA GOES products
- Severe-storm event metadata: NASA EONET
- Radar history: RainViewer

## Run locally

### Frontend
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

### Backend
```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Set `VITE_API_BASE_URL=http://localhost:8000` in `frontend/.env`.

## API endpoints

- `GET /health`
- `GET /api/sources`
- `GET /api/health/sources`
- `GET /api/weather?latitude=...&longitude=...`
- `GET /api/atmosphere?latitude=...&longitude=...`
- `GET /api/wind-grid`
- `GET /api/cyclones`
- `GET /api/radar`
- `GET /api/alerts?latitude=...&longitude=...` (US only)

## Attribution and operations

- NASA GIBS: https://www.earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs
- Open-Meteo: https://open-meteo.com/ (review current terms for your deployment and commercial use)
- NASA EONET: https://eonet.gsfc.nasa.gov/docs/v3
- IMD API portal: https://api.imd.gov.in/public/
- OpenStreetMap: https://www.openstreetmap.org/copyright
- CesiumJS: https://cesium.com/learn/cesiumjs-learn/

Browser geolocation requires HTTPS (or localhost) and explicit user permission. Standard OpenStreetMap public tiles are not an unlimited production CDN. RainViewer free radar access is intended for limited personal / educational use and has incomplete coverage. Restrict backend CORS to the exact production frontend origin before public production. Set a monitored contact in `EARTH_WEATHER_USER_AGENT` before using NOAA/NWS endpoints.

**Not for emergency use.** Always follow official local meteorological authorities and warning bulletins.
