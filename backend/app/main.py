from datetime import datetime, timezone
from typing import Any
import asyncio
import os
import logging
from email.utils import parsedate_to_datetime
from collections import OrderedDict
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Keep one pooled upstream connection client for fast, uncached live requests."""
    app.state.weather_http = httpx.AsyncClient(
        timeout=httpx.Timeout(connect=2.5, read=6.0, write=3.0, pool=2.0),
        limits=httpx.Limits(max_connections=40, max_keepalive_connections=20, keepalive_expiry=30.0),
        follow_redirects=True,
        headers={
            "User-Agent": "EARTH-WEATHER/1.0 (+https://earthweatherchannel.web.app)",
            "Accept": "application/json",
        },
    )
    try:
        yield
    finally:
        await app.state.weather_http.aclose()


app = FastAPI(
    title="EARTH WEATHER API",
    version="0.3.1",
    description="Uncached live weather API with pooled upstream connections.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Set CORS_ORIGINS to comma-separated production origins.
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

from app.satellite_sources import SATELLITE_PROVIDERS, fetch_gibs_layers

logger = logging.getLogger("earthweather.weather")
WEATHERAPI_CURRENT = "https://api.weatherapi.com/v1/current.json"
OPENWEATHER_CURRENT = "https://api.openweathermap.org/data/2.5/weather"
METNORWAY_COMPACT = "https://api.met.no/weatherapi/locationforecast/2.0/compact"
WEATHER_PROVIDER_ORDER = ("weatherapi", "openweather", "metnorway")
_METNORWAY_CACHE: dict[tuple[float, float], tuple[float, dict[str, Any]]] = {}
_METNORWAY_CACHE_LOCK = asyncio.Lock()
EONET_EVENTS = "https://eonet.gsfc.nasa.gov/api/v3/events"
RAINVIEWER = "https://api.rainvie
…[1 chars truncated — re-run with head/grep/tail for full output]…
,
            "national": reports[:national_count],
            "regional": reports[national_count:national_count + regional_count],
            "international": reports[national_count + regional_count:],
            "reports": reports,
            "source": "Three-provider automatic failover",
            "provider": (rows[0].get("provider") if rows else None),
            "retrieved_at": utc_now(),
            "note": "These are model-based current conditions for selected major-city reference points, not live observations from every city or weather station.",
        }
    except HTTPException:
        raise
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        raise HTTPException(status_code=502, detail=f"Featured city weather unavailable: {exc.__class__.__name__}") from exc

@app.get("/api/weather/bulk")
async def weather_bulk(
    response: Response,
    latitudes: str = Query(..., min_length=1, max_length=1000),
    longitudes: str = Query(..., min_length=1, max_length=1000),
) -> dict[str, Any]:
    """Fetch current conditions for multiple cities in one upstream request."""
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    try:
        lats = [float(value) for value in latitudes.split(",")]
        lons = [float(value) for value in longitudes.split(",")]
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Coordinates must be comma-separated numbers") from exc
    if len(lats) != len(lons) or not lats or len(lats) > 30:
        raise HTTPException(status_code=422, detail="Provide 1–30 matching latitude and longitude values")
    if any(not -90 <= value <= 90 for value in lats) or any(not -180 <= value <= 180 for value in lons):
        raise HTTPException(status_code=422, detail="Coordinates are outside valid ranges")

    params = _current_weather_params(lats, lons)
    try:
        payload = await _fetch_weather_current(app.state.weather_http, params)
        rows = payload if isinstance(payload, list) else [payload]
        reports = []
        for index, row in enumerate(rows):
            current = row.get("current") or {}
            reports.append({
                "latitude": lats[index], "longitude": lons[index],
                "current": current,
                "source": {"name": row.get("provider", "weather-provider-failover"), "type": "weather-provider current conditions", "retrieved_at": utc_now()},
            })
        if len(reports) != len(lats):
            raise HTTPException(status_code=502, detail="Weather provider returned an incomplete city batch")
        return {"source": "Automatic weather provider failover", "retrieved_at": utc_now(), "count": len(reports), "reports": reports}
    except HTTPException:
        raise
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        raise HTTPException(status_code=502, detail=f"Bulk weather provider unavailable: {exc.__class__.__name__}") from exc

@app.get("/api/weather")
async def weather(
    response: Response,
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
) -> dict[str, Any]:
    """Return fresh current conditions for the exact requested GPS coordinates."""
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    params = _current_weather_params([latitude], [longitude])
    try:
        current = await _fetch_weather_current(app.state.weather_http, params)
        provider = current.pop("provider", "weather-provider-failover")
        return {"current": current, "source": {
            "name": provider,
            "type": "weather-provider current conditions",
            "retrieved_at": utc_now(),
        }}
    except HTTPException:
        raise
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        logger.exception("Current weather request failed")
        raise HTTPException(status_code=502, detail=f"Weather provider unavailable: {exc.__class__.__name__}") from exc


# Public Nominatim reverse-geocoding: one request at a time, cached by nearby coordinates.
_reverse_location_cache: OrderedDict[tuple[float, float], tuple[float, dict[str, Any]]] = OrderedDict()
_REVERSE_LOCATION_CACHE_MAX_ENTRIES = 2048
_reverse_location_lock = asyncio.Lock()
_last_reverse_location_request = 0.0

@app.get("/api/location/reverse")
async def reverse_location(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
) -> dict[str, Any]:
    """Resolve GPS coordinates to the closest mapped town, village or settlement."""
    global _last_reverse_location_request
    cache_key = (round(latitude, 3), round(longitude, 3))
    async with _reverse_location_lock:
        cached = _reverse_location_cache.get(cache_key)
        now = asyncio.get_running_loop().time()
        if cached and cached[0] > now:
            _reverse_location_cache.move_to_end(cache_key)
            return cached[1]

        # Respect the public Nominatim service's one-request-per-second application limit.
        elapsed = now - _last_reverse_location_request
        if elapsed < 1.1:
            await asyncio.sleep(1.1 - elapsed)

        params = {
            "format": "jsonv2",
            "lat": latitude,
            "lon": longitude,
            "zoom": 16,
            "addressdetails": 1,
        }
        headers = {
            "User-Agent": "EARTH-WEATHER/1.0 (+https://earthweatherchannel.web.app)",
            "Referer": "https://earthweatherchannel.web.app/",
            "Accept-Language": "en",
        }
        _last_reverse_location_request = asyncio.get_running_loop().time()
        try:
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                response = await client.get(
                    "https://nominatim.openstreetmap.org/reverse",
                    params=params,
                    headers=headers,
                )
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise HTTPException(status_code=502, detail="Nearby place lookup is temporarily unavailable") from exc

        address = payload.get("address") or {}
        place_name = (
            address.get("village") or address.get("hamlet") or address.get("town")
            or address.get("city") or address.get("municipality")
            or address.get("suburb") or address.get("city_district")
            or address.get("county") or address.get("state_district")
            or address.get("state") or payload.get("name") or "Nearby area"
        )
        state = address.get("state") or address.get("region")
        country = address.get("country")
        region = ", ".join(part for part in (state, country) if part and part != place_name)
        result = {
            "name": place_name,
            "region": region or country or "GPS location",
            "country": country,
            "country_code": (address.get("country_code") or "").upper() or None,
            "source": "OpenStreetMap Nominatim",
            "attribution": "© OpenStreetMap contributors",
            "retrieved_at": utc_now(),
        }
        cache_now = asyncio.get_running_loop().time()
        _reverse_location_cache[cache_key] = (cache_now + 30 * 24 * 60 * 60, result)
        _reverse_location_cache.move_to_end(cache_key)
        for key, (expires_at, _) in list(_reverse_location_cache.items()):
            if expires_at <= cache_now:
                del _reverse_location_cache[key]
        while len(_reverse_location_cache) > _REVERSE_LOCATION_CACHE_MAX_ENTRIES:
            _reverse_location_cache.popitem(last=False)
        return result

@app.get("/api/wind-grid")
async def wind_grid() -> dict[str, Any]:
    """Wind-grid layer is unavailable until a dedicated gridded-data feed is configured."""
    raise HTTPException(status_code=503, detail="Global wind-grid feed is not configured. Point weather uses the three-provider failover service.")

@app.get("/api/atmosphere")
async def atmosphere(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
) -> dict[str, Any]:
    """Atmospheric time-series is not fabricated from current-only fallback responses."""
    raise HTTPException(status_code=503, detail="Atmospheric hourly time-series is not configured for the active provider chain.")

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


@app.get("/api/weather-news")
async def weather_news(
    region: str = Query("world", pattern="^(world|india)$"),
    limit: int = Query(25, ge=1, le=50),
) -> dict[str, Any]:
    """Recent weather-only headlines aggregated from publicly indexed news outlets via GDELT."""
    query = '(weather OR forecast OR rainfall OR cyclone OR storm OR heatwave OR monsoon OR flood OR snowfall OR drought)'
    if region == "india":
        query += ' sourcecountry:IN'
    params = {
        "query": query,
        "mode": "ArtList",
        "format": "json",
        "sort": "DateDesc",
        "maxrecords": limit,
        "timespan": "24h",
        "sourcelang": "english",
    }
    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            response = await client.get("https://api.gdeltproject.org/api/v2/doc/doc", params=params)
            response.raise_for_status()
            payload = response.json()
        articles = []
        for item in payload.get("articles", []):
            title = item.get("title")
            url = item.get("url")
            if not title or not url:
                continue
            articles.append({
                "title": title,
                "url": url,
                "source": item.get("domain") or item.get("source") or "News outlet",
                "published_at": item.get("seendate"),
                "language": item.get("language"),
                "image": item.get("socialimage"),
            })
        return {
            "region": region,
            "source": "GDELT Global Knowledge Graph",
            "retrieved_at": utc_now(),
            "window": "Past 24 hours",
            "articles": articles,
            "note": "Headlines are collected from publicly indexed news outlets and filtered for weather topics. Coverage depends on publisher indexing; this is not a complete feed from every television or newspaper channel. Open the original publisher for the full report.",
        }
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"Weather news feed unavailable: {exc.__class__.__name__}") from exc


SATELLITE_PROVIDER_CHECKS = [
    {"id":"nasa-gibs","provider":"NASA EOSDIS GIBS","url":NASA_GIBS_CAPABILITIES,"access":"Public WMTS/WMS imagery; layer and timestamp dependent","coverage":"Global or product-specific","data_type":"Satellite-derived visual imagery"},
    {"id":"noaa-goes","provider":"NOAA GOES / NESDIS","url":"https://www.goes.noaa.gov/","access":"Public imagery products; product-specific endpoints","coverage":"Americas and adjacent oceans","data_type":"Geostationary weather imagery"},
    {"id":"copernicus","provider":"Copernicus Data Space","url":"https://documentation.dataspace.copernicus.eu/APIs.html","access":"Public catalogue discovery; processing/download APIs may require OAuth credentials","coverage":"Global archive; acquisition and revisit dependent","data_type":"Sentinel Earth-observation products"},
    {"id":"jma-himawari","provider":"JMA Himawari","url":"https://www.data.jma.go.jp/mscweb/data/himawari/","access":"Public web imagery; full-resolution distribution has service conditions","coverage":"Asia-Pacific and western Pacific","data_type":"Geostationary cloud and atmospheric imagery"},
    {"id":"imd-insat","provider":"IMD INSAT","url":"https://api.imd.gov.in/public/","access":"Registration and product permissions required for API integration","coverage":"India and surrounding region","data_type":"Weather satellite imagery and official products"},
]

@app.get("/api/satellites/health")
async def satellite_provider_health() -> dict[str, Any]:
    """Check provider service reachability; this is not a satellite-data ingestion or accuracy test."""
    async def probe(client: httpx.AsyncClient, provider: dict[str, str]) -> dict[str, Any]:
        started = datetime.now(timezone.utc)
        try:
            response = await client.get(provider["url"], follow_redirects=True)
            elapsed = (datetime.now(timezone.utc) - started).total_seconds() * 1000
            # A provider portal returning 401/403 is reachable but requires authorization.
            if response.status_code in (401, 403):
                status = "reachable_auth_required"
            elif response.status_code < 400:
                status = "reachable"
            else:
                status = "provider_error"
            return {
                "id": provider["id"], "provider": provider["provider"], "status": status,
                "http_status": response.status_code, "latency_ms": round(elapsed),
                "checked_at": utc_now(), "access": provider["access"],
                "coverage": provider["coverage"], "data_type": provider["data_type"],
            }
        except httpx.HTTPError as exc:
            return {
                "id": provider["id"], "provider": provider["provider"], "status": "unreachable",
                "error": exc.__class__.__name__, "checked_at": utc_now(),
                "access": provider["access"], "coverage": provider["coverage"],
                "data_type": provider["data_type"],
            }

    async with httpx.AsyncClient(timeout=12.0, headers={"User-Agent": "EARTH-WEATHER/1.0"}) as client:
        results = await asyncio.gather(*(probe(client, item) for item in SATELLITE_PROVIDER_CHECKS))
    reachable = sum(item["status"] in ("reachable", "reachable_auth_required") for item in results)
    return {
        "checked_at": utc_now(),
        "summary": {"providers_checked": len(results), "reachable": reachable, "unreachable_or_error": len(results) - reachable},
        "providers": results,
        "important": "Reachability only: this endpoint does not mean imagery has been ingested, authenticated, processed, or scientifically validated. Provider access, licensing, geographic coverage, product latency and credentials still apply.",
    }
