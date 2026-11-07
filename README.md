# EARTH WEATHER

Global weather intelligence explorer: a CesiumJS 3D globe, NASA GIBS satellite imagery, Open-Meteo global forecasts, and a FastAPI data service.

## Status
This repository starts as an MVP foundation. It does **not** claim that every weather satellite is connected or that all displayed layers are real-time. Each source has its own coverage, latency, licensing, and update cadence. The UI labels imagery and model forecasts separately.

## Stack
- Frontend: React, TypeScript, Vite, CesiumJS
- Satellite imagery: NASA GIBS WMTS (VIIRS global daily imagery + GOES-East/West GeoColor and GOES-East infrared NRT layers where available)
- Precipitation radar: RainViewer past radar frames (personal / educational use only; incomplete coverage; no free nowcast after 2026-01-01)
- Global weather: Open-Meteo (model-based forecast/current conditions)
- Backend: FastAPI with source metadata and weather proxy
- US official alerts: NOAA/NWS API where supported (US coverage only)

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

## Data and attribution
- NASA GIBS: https://www.earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs
- Open-Meteo: https://open-meteo.com/ (free API is for non-commercial use; review terms before public/commercial launch)
- OpenStreetMap: https://www.openstreetmap.org/copyright (standard tile servers have a usage policy; do not treat them as an unlimited production tile CDN)
- CesiumJS: https://cesium.com/learn/cesiumjs-learn/

## Important limitations
- Browser geolocation requires HTTPS (or localhost) and explicit user permission.
- NASA GIBS imagery is not uniformly live; many products are daily or delayed and can be missing for the newest date.
- Open-Meteo current conditions are weather-model output, not direct satellite observations.
- NOAA/NWS alerts and forecast endpoints cover the United States; they are not a global warning service.
- GOES, Himawari, Meteosat/MTG, INSAT and other satellite missions need separate product endpoints, formats, coverage logic and licensing review. A source catalogue is not proof of a live connection.
- Never use this site as the sole source for emergency decisions. Follow local meteorological authorities.

## Deployment
A Render Blueprint is provided in `render.yaml`. Review the service settings and set a real `EARTH_WEATHER_USER_AGENT` contact value before relying on NOAA/NWS requests. Deploy the frontend as a static Vite site and the backend as a separate Python service. Configure the frontend API URL and restrict backend CORS to the exact production domain.
