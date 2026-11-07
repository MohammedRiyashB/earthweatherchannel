from datetime import datetime, timezone
from typing import Any
import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="EARTH WEATHER API", version="0.1.0", description="Weather model proxy and data-source catalogue.")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict to your deployed frontend origin before production.
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

SOURCES = [
    {"id":"nasa-gibs","name":"NASA GIBS / VIIRS","kind":"satellite imagery","coverage":"Global (product-dependent)","status":"connected","update":"Daily / product-dependent","note":"Public imagery tile service. Latest available acquisition can lag; current-date tiles may be empty."},
    {"id":"open-meteo","name":"Open-Meteo","kind":"weather model API","coverage":"Global","status":"connected","update":"Model-dependent; typically updated several times daily","note":"Provides model-based current conditions and forecasts; not a direct satellite observation."},
    {"id":"osm","name":"OpenStreetMap","kind":"map basemap","coverage":"Global","status":"connected","update":"Community maintained","note":"Attribution required. Standard public tile servers have a usage policy and are not an unlimited production CDN."},
    {"id":"noaa-nws","name":"NOAA / NWS API","kind":"official forecasts and alerts","coverage":"United States","status":"available-us-only","update":"Operational API","note":"Official US weather forecasts, observations and alerts; not a global alert feed."},
    {"id":"noaa-goes","name":"NOAA GOES satellite products","kind":"satellite imagery","coverage":"Americas and adjacent oceans","status":"catalog-only","update":"Product / scan dependent","note":"Integration requires selecting specific ABI products, projection, file format and an imagery-serving pipeline."},
    {"id":"eumetsat","name":"EUMETSAT Meteosat / MTG","kind":"satellite imagery","coverage":"Europe, Africa and adjacent regions","status":"catalog-only","update":"Product / access dependent","note":"Some products require registration, authentication or specific redistribution permissions."},
    {"id":"jma-himawari","name":"JMA Himawari","kind":"satellite imagery","coverage":"Asia-Pacific","status":"catalog-only","update":"Product / scan dependent","note":"Needs a dedicated imagery adapter and source-specific terms review."},
    {"id":"isro-insat","name":"ISRO INSAT","kind":"satellite imagery","coverage":"Indian region","status":"catalog-only","update":"Product / access dependent","note":"Add only through verified official public feeds and permitted use."},
]

@app.get("/")
async def root() -> dict[str, str]:
    return {"name":"EARTH WEATHER API","status":"ok","docs":"/docs"}

@app.get("/health")
async def health() -> dict[str, str]:
    return {"status":"healthy","time":datetime.now(timezone.utc).isoformat()}

@app.get("/api/sources")
async def sources() -> list[dict[str, str]]:
    return SOURCES

@app.get("/api/weather")
async def weather(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
) -> dict[str, Any]:
    params = {
        "latitude": latitude, "longitude": longitude,
        "current": "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,weather_code",
        "hourly": "temperature_2m,precipitation_probability,precipitation,wind_speed_10m",
        "forecast_days": 2, "timezone": "auto",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get("https://api.open-meteo.com/v1/forecast", params=params)
            response.raise_for_status()
            data = response.json()
            data["source"] = {"name":"Open-Meteo","type":"weather-model output","retrieved_at":datetime.now(timezone.utc).isoformat()}
            return data
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Weather provider unavailable: {exc.__class__.__name__}") from exc

@app.get("/api/alerts")
async def alerts(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
) -> dict[str, Any]:
    # NWS API is United States-only. Do not imply global coverage.
    if not (24 <= latitude <= 50 and -125 <= longitude <= -66):
        return {"source":"NOAA/NWS","coverage":"United States only","features":[],"message":"NWS alerts are not available for this location."}
    headers = {"User-Agent":"EARTH-WEATHER/0.1 (contact: configure-a-real-contact-before-production)"}
    try:
        async with httpx.AsyncClient(timeout=15.0, headers=headers) as client:
            response = await client.get("https://api.weather.gov/alerts/active", params={"point":f"{latitude},{longitude}"})
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="NOAA/NWS alert service unavailable") from exc
