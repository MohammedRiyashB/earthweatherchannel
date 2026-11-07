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


## Automatic Firebase Hosting deployment (GitHub Actions)

The repository includes `firebase.json`, `.firebaserc` and `.github/workflows/firebase-hosting-deploy.yml`. After the changes are merged to `main`, every push to `main` builds the frontend and deploys the production site to Firebase Hosting project **earthweatherchannel**.

### One-time Google Cloud / Firebase setup

1. In Firebase Console, open project **earthweatherchannel** and enable Firebase Hosting. Create the default Hosting site if prompted.
2. In Google Cloud Console → IAM & Admin → Service Accounts, create a dedicated account named `earth-weather-firebase-deployer`.
3. Grant it **Firebase Hosting Admin** (`roles/firebasehosting.admin`) on project `earthweatherchannel`. Do not grant Owner or Editor.
4. Create a JSON key for this service account and immediately store its entire JSON contents as a GitHub Actions secret named `FIREBASE_SERVICE_ACCOUNT_EARTHWEATHERCHANNEL`. Never commit the JSON key or paste it into chat. Rotate/revoke the key if it is exposed.
5. In GitHub → repository Settings → Secrets and variables → Actions → Variables, create these repository variables:
   - `VITE_API_BASE_URL`: the deployed FastAPI service's HTTPS URL (no trailing slash).
   - `VITE_FIREBASE_API_KEY`: Firebase web app API key.
   - `VITE_FIREBASE_AUTH_DOMAIN`: `earthweatherchannel.firebaseapp.com`.
   - `VITE_FIREBASE_DATABASE_URL`: `https://earthweatherchannel-default-rtdb.firebaseio.com`.
   - `VITE_FIREBASE_PROJECT_ID`: `earthweatherchannel`.
   - `VITE_FIREBASE_STORAGE_BUCKET`: `earthweatherchannel.firebasestorage.app`.
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`: `63892023947`.
   - `VITE_FIREBASE_APP_ID`: `1:63892023947:web:e02df1985db98b30a6c28e`.
   - `VITE_FIREBASE_MEASUREMENT_ID`: `G-SBDSSMSNCT`.
6. In Firebase Authentication, enable Google sign-in and add the Firebase Hosting domain (for example `earthweatherchannel.web.app`) to Authorized domains.
7. Create Firestore and Realtime Database, then publish the rules in `firestore.rules` and `database.rules.json`. The workflow deploys Hosting only; it does not silently create databases or change Auth providers/rules.
8. After the first successful deploy, verify the Hosting URL in Firebase Console → Hosting and check Authentication / Firestore / Realtime Database from the browser.

The workflow validates that the project ID matches `earthweatherchannel` and that the service-account secret, backend URL and Firebase web config variables exist before building. Firebase web configuration is public browser configuration, not a secret; the service-account JSON is highly sensitive and must only be stored as a GitHub Actions secret.

### Deployment scope

This GitHub workflow deploys the static React frontend to Firebase Hosting. The FastAPI backend remains a separate Render web service; set `VITE_API_BASE_URL` to that service's actual HTTPS URL. Render deployment and Firebase Hosting deployment are separate workflows. Firebase Hosting deployment does not provision Google Cloud service accounts, enable APIs, create Firestore/Realtime Database instances, or turn on Google sign-in; those one-time project-level permissions/settings require an authorized project administrator.

## Firebase integration

The frontend supports Firebase Google Authentication, Firestore user profile / last-location sync, Realtime Database live weather sync, and Analytics where browser support is available.

1. Copy `frontend/.env.example` to `frontend/.env` and fill the Firebase web app values from Firebase Console → Project settings → Your apps.
2. In Firebase Authentication, enable the **Google** provider and add your deployed website domain to Authorized domains.
3. Create a Cloud Firestore database and a Realtime Database in the same Firebase project.
4. Publish `firestore.rules` in Firestore Rules and `database.rules.json` in Realtime Database Rules. These rules restrict each signed-in user to their own `/users/{uid}` data.
5. Enable Google Analytics for the Firebase project if you want web analytics. Analytics initializes only when supported by the browser.
6. For Render, add the same `VITE_FIREBASE_*` variables to the `earth-weather-web` static service environment and redeploy. Vite variables are embedded into the public browser bundle; Firebase web config is not a server secret. Restrict the Firebase API key to the required web APIs and configure Firebase security rules.

Google sign-in uses a popup, which requires popups to be allowed by the browser. Once signed in, the app stores the user's last selected coordinates/current model conditions in their private Firestore user document and Realtime Database live-weather node. Location is only used after browser geolocation permission is granted.

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
