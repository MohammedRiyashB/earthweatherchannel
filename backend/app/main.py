from datetime import datetime, timezone
from typing import Any
import asyncio
import os

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="EARTH WEATHER API",
    version="0.2.0",
    description="Global atmospheric model fields, satellite metadata, cyclone events and source health.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Set CORS_ORIGINS to comma-separated production origins.
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

OPEN_METEO = "https://api.open-meteo.com/v1/forecast"
EONET_EVENTS = "https://eonet.gsfc.nasa.gov/api/v3/events"
RAINVIEWER = "https://api.rainviewer.com/public/weather-maps.json"
NASA_GIBS_CAPABILITIES = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml"
SOURCES = [
    {"id":"open-meteo","name":"Open-Meteo global models","kind":"forecast/model fields","coverage":"Global (model-dependent)","status":"connected","update":"Model-run dependent","note":"Wind, humidity, cloud, precipitation and evapotranspiration are model fields, not direct satellite measurements."},
    {"id":"nasa-gibs","name":"NASA GIBS / VIIRS / GOES imagery","kind":"satellite imagery","coverage":"Product-dependent global and geostationary regions","status":"connected","update":"Daily to near-real-time, product-dependent","note":"Imagery tiles are time/product dependent; not every layer is globally continuous or instantaneous."},
    {"id":"nasa-eonet","name":"NASA EONET severe-storm events","kind":"curated natural-event metadata","coverage":"Global curated events","status":"connected","update":"Near-real-time curation; not a complete cyclone warning feed","note":"Tracks/events appear only when curated and may not include every active tropical cyclone."},
    {"id":"rainviewer","name":"RainViewer radar","kind":"precipitation radar tiles","coverage":"Patchy radar network","status":"connected","update":"Past frames, about 10-minute cadence where available","note":"Historical radar only; incomplete coverage and no free nowcast. Transparent tiles do not mean guaranteed dry weather."},
    {"id":"imd","name":"India Meteorological Department (IMD)","kind":"official Indian warnings and cyclone tracks","coverage":"India and North Indian Ocean","status":"auth-required","update":"Official operational products","note":"Public API catalogue documents cyclone tracks, warnings and radar; production connection requires registered access credentials."},
    {"id":"noaa-nws","name":"NOAA / NWS","kind":"official forecasts and alerts","coverage":"United States","status":"available-us-only","update":"Operational API","note":"US-only; not a global warning feed."},
    {"id":"osm","name":"OpenStreetMap","kind":"map basemap","coverage":"Global","status":"connected","update":"Community maintained","note":"Attribution required; public tile servers are not an unlimited production CDN."},
]

def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()

def _meteo_params(latitudes: list[float], longitudes: list[float]) -> dict[str, Any]:
    return {
        "latitude": ",".join(str(x) for x in latitudes),
        "longitude": ",".join(str(x) for x in longitudes),
        "current": "temperature_2m,relative_humidity_2m,precipitation,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
        "hourly": "temperature_2m,relative_humidity_2m,dew_point_2m,precipitation_probability,precipitation,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,wind_speed_10m,wind_direction_10m,evapotranspiration,et0_fao_evapotranspiration",
        "forecast_days": 3,
        "past_days": 2,
        "timezone": "UTC",
    }

@app.get("/")
async def root() -> dict[str, str]:
    return {"name":"EARTH WEATHER API","status":"ok","version":"0.2.0","docs":"/docs"}

@app.get("/health")
async def health() -> dict[str, str]:
    return {"status":"healthy","time":utc_now()}

@app.get("/api/sources")
async def sources() -> list[dict[str, str]]:
    return SOURCES

@app.get("/api/health/sources")
async def source_health() -> dict[str, Any]:
    """Live lightweight probes. A successful HTTP response means reachable, not scientifically validated."""
    checks = [
        ("open-meteo", OPEN_METEO, {"latitude":0,"longitude":0,"current":"temperature_2m"}),
        ("nasa-eonet", EONET_EVENTS, {"category":"severeStorms","status":"open","limit":1}),
        ("rainviewer", RAINVIEWER, None),
        ("nasa-gibs", NASA_GIBS_CAPABILITIES, None),
    ]
    async def probe(client: httpx.AsyncClient, item: tuple[str, str, dict | None]) -> dict[str, Any]:
        source_id, url, params = item
        started = datetime.now(timezone.utc)
        try:
            response = await client.get(url, params=params)
            elapsed = (datetime.now(timezone.utc) - started).total_seconds() * 1000
            response.raise_for_status()
            return {"id":source_id,"status":"online","http_status":response.status_code,"latency_ms":round(elapsed),"checked_at":utc_now()}
        except (httpx.HTTPError, ValueError) as exc:
            return {"id":source_id,"status":"degraded","error":exc.__class__.__name__,"checked_at":utc_now()}
    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        results = await asyncio.gather(*(probe(client, item) for item in checks))
    return {"checked_at":utc_now(),"checks":results,"note":"Reachability checks only; they do not certify data freshness, coverage or accuracy."}

@app.get("/api/weather")
async def weather(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
) -> dict[str, Any]:
    params = _meteo_params([latitude], [longitude])
    params["current"] = "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(OPEN_METEO, params=params)
            response.raise_for_status()
            data = response.json()
            data["source"] = {"name":"Open-Meteo","type":"numerical weather-model output","retrieved_at":utc_now()}
            return data
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"Weather provider unavailable: {exc.__class__.__name__}") from exc

@app.get("/api/wind-grid")
async def wind_grid() -> dict[str, Any]:
    """Coarse global model sample for visualizing large-scale near-surface wind flow."""
    latitudes = [-60, -30, 0, 30, 60]
    longitudes = list(range(-180, 180, 30))
    lats = [lat for lat in latitudes for _ in longitudes]
    lons = longitudes * len(latitudes)
    params = {
        "latitude": ",".join(map(str, lats)),
        "longitude": ",".join(map(str, lons)),
        "current": "wind_speed_10m,wind_direction_10m,wind_gusts_10m",
        "timezone": "UTC",
    }
    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            response = await client.get(OPEN_METEO, params=params)
            response.raise_for_status()
            payload = response.json()
        rows = payload if isinstance(payload, list) else [payload]
        points = []
        for lat, lon, row in zip(lats, lons, rows):
            current = row.get("current") or {}
            speed, direction = current.get("wind_speed_10m"), current.get("wind_direction_10m")
            if speed is not None and direction is not None:
                points.append({"lat":lat,"lon":lon,"speed_kmh":speed,"direction_deg":direction,"gust_kmh":current.get("wind_gusts_10m")})
        return {"source":"Open-Meteo global numerical weather models","retrieved_at":utc_now(),"resolution_degrees":30,"points":points,"note":"Coarse global model samples. Particle paths interpolate between samples for visualization; not direct anemometer observations."}
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"Global wind model unavailable: {exc.__class__.__name__}") from exc

@app.get("/api/atmosphere")
async def atmosphere(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
) -> dict[str, Any]:
    """Cloud, rain, humidity and evapotranspiration time series for the selected location."""
    params = _meteo_params([latitude], [longitude])
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(OPEN_METEO, params=params)
            response.raise_for_status()
            data = response.json()
            hourly = data.get("hourly", {})
            fields = ["time","relative_humidity_2m","dew_point_2m","cloud_cover","cloud_cover_low","cloud_cover_mid","cloud_cover_high","precipitation_probability","precipitation","evapotranspiration","et0_fao_evapotranspiration","wind_speed_10m","wind_direction_10m"]
            return {"source":"Open-Meteo numerical weather model","retrieved_at":utc_now(),"timezone":data.get("timezone"),"hourly":{key:hourly.get(key) for key in fields if key in hourly},"note":"Evapotranspiration is a modeled surface water-flux estimate, not a direct measurement of atmospheric evaporation."}
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"Atmosphere model unavailable: {exc.__class__.__name__}") from exc

@app.get("/api/cyclones")
async def cyclones() -> dict[str, Any]:
    """NASA EONET curated active severe-storm events; not an official warning/complete cyclone track service."""
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(EONET_EVENTS, params={"category":"severeStorms","status":"open","limit":100})
            response.raise_for_status()
            payload = response.json()
        events = []
        for event in payload.get("events", []):
            geometries = event.get("geometry", [])
            coordinates = []
            for geometry in geometries:
                coords = geometry.get("coordinates")
                if geometry.get("type") == "Point" and isinstance(coords, list) and len(coords) >= 2:
                    coordinates.append({"lon":coords[0],"lat":coords[1],"date":geometry.get("date")})
                elif geometry.get("type") == "LineString" and isinstance(coords, list):
                    coordinates.extend({"lon":point[0],"lat":point[1],"date":geometry.get("date")} for point in coords if len(point) >= 2)
            events.append({"id":event.get("id"),"title":event.get("title"),"description":event.get("description"),"link":event.get("link"),"closed":event.get("closed"),"sources":event.get("sources",[]),"coordinates":coordinates})
        return {"source":"NASA EONET","retrieved_at":utc_now(),"events":events,"note":"Curated severe-storm events only. EONET is not a complete tropical-cyclone tracker or an official warning authority. India-specific official tracks require IMD API access."}
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"Cyclone event feed unavailable: {exc.__class__.__name__}") from exc

@app.get("/api/alerts")
async def alerts(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
) -> dict[str, Any]:
    if not (24 <= latitude <= 50 and -125 <= longitude <= -66):
        return {"source":"NOAA/NWS","coverage":"United States only","features":[],"message":"NWS alerts are not available for this location."}
    headers = {"User-Agent": os.getenv("EARTH_WEATHER_USER_AGENT", "EARTH-WEATHER/0.2 (set a monitored contact before production)")}
    try:
        async with httpx.AsyncClient(timeout=15.0, headers=headers) as client:
            response = await client.get("https://api.weather.gov/alerts/active", params={"point":f"{latitude},{longitude}"})
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="NOAA/NWS alert service unavailable") from exc

@app.get("/api/radar")
async def radar() -> dict[str, Any]:
    """Return RainViewer's available past radar frames; never a nowcast."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(RAINVIEWER)
            response.raise_for_status()
            payload = response.json()
            return {
                "source":"RainViewer","host":payload.get("host"),"generated":payload.get("generated"),
                "frames":payload.get("radar",{}).get("past",[]),
                "note":"Past radar frames only. Coverage is incomplete; transparent tiles do not mean guaranteed dry weather."
            }
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="RainViewer radar metadata unavailable") from exc
