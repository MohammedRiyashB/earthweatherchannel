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

def _current_weather_params(latitudes: list[float], longitudes: list[float]) -> dict[str, Any]:
    """Small current-conditions request; do not download hourly history for city cards."""
    return {
        "latitude": ",".join(str(x) for x in latitudes),
        "longitude": ",".join(str(x) for x in longitudes),
        "current": "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code",
        "timezone": "UTC",
    }

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

SATELLITE_CATALOG = [
    {"id":"nasa-gibs","provider":"NASA / EOSDIS GIBS","missions":["Terra MODIS","Aqua MODIS","Suomi-NPP VIIRS","NOAA-20 VIIRS","NOAA-21 VIIRS","GOES-East","GOES-West","DSCOVR EPIC"],"products":["true-colour imagery","clouds","fires","smoke","aerosols","snow and ice","sea surface temperature","vegetation","precipitation products"],"coverage":"Global or product-specific","access":"public WMTS/WMS; product and date dependent","status":"public","endpoint":"https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/","catalog":"https://www.earthdata.nasa.gov/data/tools/gibs","note":"More than 1,000 visualisation products; not every product is live or available at every location."},
    {"id":"noaa-goes","provider":"NOAA GOES / NESDIS","missions":["GOES-16","GOES-18","GOES-19"],"products":["ABI imagery","GeoColor","cloud and moisture imagery","GLM lightning"],"coverage":"Americas and adjacent oceans; satellite-dependent","access":"Public NOAA distribution endpoints; product-specific","status":"public-product-dependent","endpoint":"https://www.goes.noaa.gov/"},
    {"id":"copernicus-sentinel","provider":"Copernicus Data Space / ESA","missions":["Sentinel-1","Sentinel-2","Sentinel-3","Sentinel-5P"],"products":["SAR radar","optical imagery","land and ocean products","atmospheric composition"],"coverage":"Global archive; revisit and acquisition dependent","access":"STAC, OData, Sentinel Hub and OGC APIs; account/token may be required","status":"account-and-processing-dependent","endpoint":"https://dataspace.copernicus.eu/"},
    {"id":"jma-himawari","provider":"Japan Meteorological Agency","missions":["Himawari-8","Himawari-9"],"products":["visible","infrared","water vapour imagery"],"coverage":"Asia-Pacific and western Pacific","access":"Public product portals and data services; redistribution terms apply","status":"product-dependent","endpoint":"https://www.data.jma.go.jp/mscweb/en/"},
    {"id":"imd","provider":"India Meteorological Department","missions":["INSAT-3D","INSAT-3DR","INSAT-3DS"],"products":["weather imagery","cloud products","cyclone monitoring","official warnings"],"coverage":"India and surrounding region","access":"IMD API portal registration and product permissions","status":"registration-required","endpoint":"https://api.imd.gov.in/public/"},
    {"id":"landsat","provider":"USGS / NASA Landsat","missions":["Landsat 8","Landsat 9"],"products":["multispectral land imagery","thermal imagery","surface reflectance"],"coverage":"Global archive; scene acquisition dependent","access":"USGS / NASA public data services; catalogue and download APIs","status":"public-archive","endpoint":"https://www.usgs.gov/landsat-missions"},
    {"id":"commercial-earth-observation","provider":"Commercial satellite operators","missions":["Planet","Maxar","Airbus and other licensed constellations"],"products":["high-resolution optical and radar imagery"],"coverage":"Contract and collection dependent","access":"Commercial licence, API credentials and usage fees","status":"contract-required","endpoint":None}
]

@app.get("/api/satellites/catalog")
async def satellite_catalog() -> dict[str, Any]:
    """Catalog of satellite mission data services; availability and access requirements are explicit."""
    return {
        "retrieved_at": utc_now(),
        "count": len(SATELLITE_CATALOG),
        "providers": SATELLITE_CATALOG,
        "note": "This is a provider and mission catalogue, not a claim that every satellite is connected to a live feed. Live access depends on each provider's published endpoint, product coverage, latency, licence and credentials."
    }

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

_weather_cache: dict[tuple[float, float], tuple[float, dict[str, Any]]] = {}
_weather_cache_lock = asyncio.Lock()

# Short-lived in-process cache with stale-if-error fallback. A provider outage must
# not erase a previously successful report for the same coordinates.
_current_provider_cache: dict[tuple[float, float], tuple[float, dict[str, Any]]] = {}
_CURRENT_CACHE_TTL = 90
_CURRENT_STALE_TTL = 30 * 60

async def _request_current_chunk(
    client: httpx.AsyncClient,
    latitudes: list[float],
    longitudes: list[float],
) -> list[dict[str, Any]]:
    params = _current_weather_params(latitudes, longitudes)
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            response = await client.get(OPEN_METEO, params=params)
            response.raise_for_status()
            payload = response.json()
            rows = payload if isinstance(payload, list) else [payload]
            if len(rows) != len(latitudes) or any(not isinstance(row, dict) or not isinstance(row.get("current"), dict) for row in rows):
                raise ValueError("Incomplete current-weather response")
            now = asyncio.get_running_loop().time()
            for lat, lon, row in zip(latitudes, longitudes, rows):
                _current_provider_cache[(round(lat, 3), round(lon, 3))] = (now, row)
            return rows
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            last_error = exc
            if attempt < 2:
                await asyncio.sleep(0.6 * (2 ** attempt))
    raise RuntimeError(f"Open-Meteo request failed: {last_error.__class__.__name__ if last_error else 'UnknownError'}")

async def _fetch_open_meteo_current(client: httpx.AsyncClient, params: dict[str, Any]) -> Any:
    """Fetch one or many points safely; split bulk requests and retain stale good data on outages."""
    try:
        latitudes = [float(value) for value in str(params["latitude"]).split(",")]
        longitudes = [float(value) for value in str(params["longitude"]).split(",")]
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Invalid weather coordinates") from exc
    if not latitudes or len(latitudes) != len(longitudes):
        raise HTTPException(status_code=422, detail="Latitude and longitude counts do not match")

    now = asyncio.get_running_loop().time()
    results: list[dict[str, Any] | None] = [None] * len(latitudes)
    pending_indices: list[int] = []
    for index, (lat, lon) in enumerate(zip(latitudes, longitudes)):
        cached = _current_provider_cache.get((round(lat, 3), round(lon, 3)))
        if cached and now - cached[0] <= _CURRENT_CACHE_TTL:
            results[index] = cached[1]
        else:
            pending_indices.append(index)

    # Keep upstream query strings small. Open-Meteo supports multi-location
    # requests, but modest batches are more resilient to proxy/URL/provider limits.
    chunks = [pending_indices[i:i + 4] for i in range(0, len(pending_indices), 4)]
    for chunk in chunks:
        chunk_lats = [latitudes[i] for i in chunk]
        chunk_lons = [longitudes[i] for i in chunk]
        try:
            rows = await _request_current_chunk(client, chunk_lats, chunk_lons)
            for index, row in zip(chunk, rows):
                results[index] = row
        except RuntimeError:
            # A failed multi-city batch should not take down every city card.
            # Retry each city independently, then use a bounded stale fallback.
            for index in chunk:
                lat, lon = latitudes[index], longitudes[index]
                try:
                    rows = await _request_current_chunk(client, [lat], [lon])
                    results[index] = rows[0]
                except RuntimeError:
                    cached = _current_provider_cache.get((round(lat, 3), round(lon, 3)))
                    if cached and now - cached[0] <= _CURRENT_STALE_TTL:
                        results[index] = cached[1]

    if all(row is None for row in results):
        raise HTTPException(status_code=502, detail="Weather provider is temporarily unavailable; no recent cached report exists")
    normalized = [row or {} for row in results]
    return normalized[0] if len(normalized) == 1 else normalized


# Small curated set of major-city reference points. The selected set is based on
# the visitor's detected country and geographic proximity, not a fixed global list.
FEATURED_CITIES: list[dict[str, Any]] = [
    {"name":"New Delhi","country":"India","lat":28.6139,"lon":77.2090},
    {"name":"Mumbai","country":"India","lat":19.0760,"lon":72.8777},
    {"name":"Chennai","country":"India","lat":13.0827,"lon":80.2707},
    {"name":"Kolkata","country":"India","lat":22.5726,"lon":88.3639},
    {"name":"New York","country":"United States","lat":40.7128,"lon":-74.0060},
    {"name":"Los Angeles","country":"United States","lat":34.0522,"lon":-118.2437},
    {"name":"Chicago","country":"United States","lat":41.8781,"lon":-87.6298},
    {"name":"Houston","country":"United States","lat":29.7604,"lon":-95.3698},
    {"name":"London","country":"United Kingdom","lat":51.5072,"lon":-0.1276},
    {"name":"Manchester","country":"United Kingdom","lat":53.4808,"lon":-2.2426},
    {"name":"Edinburgh","country":"United Kingdom","lat":55.9533,"lon":-3.1883},
    {"name":"Birmingham","country":"United Kingdom","lat":52.4862,"lon":-1.8904},
    {"name":"Dubai","country":"United Arab Emirates","lat":25.2048,"lon":55.2708},
    {"name":"Abu Dhabi","country":"United Arab Emirates","lat":24.4539,"lon":54.3773},
    {"name":"Sharjah","country":"United Arab Emirates","lat":25.3463,"lon":55.4209},
    {"name":"Al Ain","country":"United Arab Emirates","lat":24.1302,"lon":55.8023},
    {"name":"Singapore","country":"Singapore","lat":1.3521,"lon":103.8198},
    {"name":"Tokyo","country":"Japan","lat":35.6762,"lon":139.6503},
    {"name":"Osaka","country":"Japan","lat":34.6937,"lon":135.5023},
    {"name":"Sapporo","country":"Japan","lat":43.0618,"lon":141.3545},
    {"name":"Fukuoka","country":"Japan","lat":33.5902,"lon":130.4017},
    {"name":"Shanghai","country":"China","lat":31.2304,"lon":121.4737},
    {"name":"Beijing","country":"China","lat":39.9042,"lon":116.4074},
    {"name":"Shenzhen","country":"China","lat":22.5431,"lon":114.0579},
    {"name":"Guangzhou","country":"China","lat":23.1291,"lon":113.2644},
    {"name":"Sydney","country":"Australia","lat":-33.8688,"lon":151.2093},
    {"name":"Melbourne","country":"Australia","lat":-37.8136,"lon":144.9631},
    {"name":"Brisbane","country":"Australia","lat":-27.4698,"lon":153.0251},
    {"name":"Perth","country":"Australia","lat":-31.9505,"lon":115.8605},
    {"name":"Toronto","country":"Canada","lat":43.6532,"lon":-79.3832},
    {"name":"Vancouver","country":"Canada","lat":49.2827,"lon":-123.1207},
    {"name":"Montreal","country":"Canada","lat":45.5019,"lon":-73.5674},
    {"name":"Calgary","country":"Canada","lat":51.0447,"lon":-114.0719},
    {"name":"Paris","country":"France","lat":48.8566,"lon":2.3522},
    {"name":"Marseille","country":"France","lat":43.2965,"lon":5.3698},
    {"name":"Lyon","country":"France","lat":45.7640,"lon":4.8357},
    {"name":"Toulouse","country":"France","lat":43.6047,"lon":1.4442},
    {"name":"Berlin","country":"Germany","lat":52.5200,"lon":13.4050},
    {"name":"Munich","country":"Germany","lat":48.1351,"lon":11.5820},
    {"name":"Hamburg","country":"Germany","lat":53.5511,"lon":9.9937},
    {"name":"Frankfurt","country":"Germany","lat":50.1109,"lon":8.6821},
    {"name":"Bangkok","country":"Thailand","lat":13.7563,"lon":100.5018},
    {"name":"Colombo","country":"Sri Lanka","lat":6.9271,"lon":79.8612},
    {"name":"Kuala Lumpur","country":"Malaysia","lat":3.1390,"lon":101.6869},
    {"name":"Jakarta","country":"Indonesia","lat":-6.2088,"lon":106.8456},
    {"name":"Riyadh","country":"Saudi Arabia","lat":24.7136,"lon":46.6753},
    {"name":"Doha","country":"Qatar","lat":25.2854,"lon":51.5310},
    {"name":"Cape Town","country":"South Africa","lat":-33.9249,"lon":18.4241},
    {"name":"Johannesburg","country":"South Africa","lat":-26.2041,"lon":28.0473},
    {"name":"São Paulo","country":"Brazil","lat":-23.5505,"lon":-46.6333},
    {"name":"Rio de Janeiro","country":"Brazil","lat":-22.9068,"lon":-43.1729},
    {"name":"Madrid","country":"Spain","lat":40.4168,"lon":-3.7038},
    {"name":"Barcelona","country":"Spain","lat":41.3874,"lon":2.1686},
    {"name":"Rome","country":"Italy","lat":41.9028,"lon":12.4964},
    {"name":"Milan","country":"Italy","lat":45.4642,"lon":9.1900},
    {"name":"Amsterdam","country":"Netherlands","lat":52.3676,"lon":4.9041},
    {"name":"Stockholm","country":"Sweden","lat":59.3293,"lon":18.0686},
    {"name":"Moscow","country":"Russia","lat":55.7558,"lon":37.6173},
    {"name":"Istanbul","country":"Türkiye","lat":41.0082,"lon":28.9784},
    {"name":"Ankara","country":"Türkiye","lat":39.9334,"lon":32.8597},
    {"name":"Mexico City","country":"Mexico","lat":19.4326,"lon":-99.1332},
    {"name":"Monterrey","country":"Mexico","lat":25.6866,"lon":-100.3161},
    {"name":"Buenos Aires","country":"Argentina","lat":-34.6037,"lon":-58.3816},
    {"name":"Santiago","country":"Chile","lat":-33.4489,"lon":-70.6693},
    {"name":"Lima","country":"Peru","lat":-12.0464,"lon":-77.0428},
    {"name":"Cairo","country":"Egypt","lat":30.0444,"lon":31.2357},
    {"name":"Nairobi","country":"Kenya","lat":-1.2921,"lon":36.8219},
    {"name":"Lagos","country":"Nigeria","lat":6.5244,"lon":3.3792},
    {"name":"Accra","country":"Ghana","lat":5.6037,"lon":-0.1870},
    {"name":"Seoul","country":"South Korea","lat":37.5665,"lon":126.9780},
    {"name":"Manila","country":"Philippines","lat":14.5995,"lon":120.9842},
    {"name":"Hanoi","country":"Vietnam","lat":21.0278,"lon":105.8342},
    {"name":"Ho Chi Minh City","country":"Vietnam","lat":10.8231,"lon":106.6297},
    {"name":"Dhaka","country":"Bangladesh","lat":23.8103,"lon":90.4125},
    {"name":"Kathmandu","country":"Nepal","lat":27.7172,"lon":85.3240},
    {"name":"Karachi","country":"Pakistan","lat":24.8607,"lon":67.0011},
    {"name":"Lahore","country":"Pakistan","lat":31.5204,"lon":74.3587},
    {"name":"Auckland","country":"New Zealand","lat":-36.8509,"lon":174.7645},
    {"name":"Warsaw","country":"Poland","lat":52.2297,"lon":21.0122},
    {"name":"Athens","country":"Greece","lat":37.9838,"lon":23.7275},
]
COUNTRY_ALIASES = {
    "usa":"United States","us":"United States","united states of america":"United States",
    "uk":"United Kingdom","uae":"United Arab Emirates","south korea":"South Korea",
}
def _distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    from math import asin, cos, radians, sin, sqrt
    dlat, dlon = radians(lat2-lat1), radians(lon2-lon1)
    value = sin(dlat/2)**2 + cos(radians(lat1))*cos(radians(lat2))*sin(dlon/2)**2
    return 6371.0 * 2 * asin(sqrt(min(1.0, value)))

@app.get("/api/weather/featured")
async def featured_weather(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    country: str = Query(..., min_length=2, max_length=80),
) -> dict[str, Any]:
    """Return four major cities in the visitor's country and four nearby international cities."""
    normalized = COUNTRY_ALIASES.get(country.strip().lower(), country.strip())
    national = sorted(
        (item for item in FEATURED_CITIES if item["country"].lower() == normalized.lower()),
        key=lambda item: _distance_km(latitude, longitude, item["lat"], item["lon"]),
    )[:4]
    regional: list[dict[str, Any]] = []
    if not national:
        # When the visitor's country is not yet in our curated city catalogue,
        # show honest nearby regional reference cities instead of mislabelling them national.
        regional = sorted(
            FEATURED_CITIES,
            key=lambda item: _distance_km(latitude, longitude, item["lat"], item["lon"]),
        )[:4]

    excluded_countries = {normalized.lower()}
    excluded_countries.update(item["country"].lower() for item in regional)
    candidates = sorted(
        (item for item in FEATURED_CITIES if item["country"].lower() not in excluded_countries),
        key=lambda item: _distance_km(latitude, longitude, item["lat"], item["lon"]),
    )
    international: list[dict[str, Any]] = []
    seen_countries = set(excluded_countries)
    for item in candidates:
        key = item["country"].lower()
        if key in seen_countries:
            continue
        international.append(item)
        seen_countries.add(key)
        if len(international) == 4:
            break
    selected = national + regional + international
    params = _current_weather_params([item["lat"] for item in selected], [item["lon"] for item in selected])
    try:
        async with httpx.AsyncClient(timeout=35.0, follow_redirects=True) as client:
            payload = await _fetch_open_meteo_current(client, params)
        rows = payload if isinstance(payload, list) else [payload]
        if len(rows) != len(selected):
            raise HTTPException(status_code=502, detail="Weather provider returned an incomplete featured-city batch")
        national_count = len(national)
        regional_count = len(regional)
        reports = []
        for index, (place, row) in enumerate(zip(selected, rows)):
            scope = "national" if index < national_count else (
                "regional" if index < national_count + regional_count else "international"
            )
            reports.append({**place, "scope": scope, "current": row.get("current") or {}})
        return {
            "visitor_country": normalized,
            "visitor_location": {"latitude": latitude, "longitude": longitude},
            "national": reports[:national_count],
            "regional": reports[national_count:national_count + regional_count],
            "international": reports[national_count + regional_count:],
            "reports": reports,
            "source": "Open-Meteo global numerical weather model",
            "retrieved_at": utc_now(),
            "note": "These are model-based current conditions for selected major-city reference points, not live observations from every city or weather station.",
        }
    except HTTPException:
        raise
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        raise HTTPException(status_code=502, detail=f"Featured city weather unavailable: {exc.__class__.__name__}") from exc

@app.get("/api/weather/bulk")
async def weather_bulk(
    latitudes: str = Query(..., min_length=1, max_length=1000),
    longitudes: str = Query(..., min_length=1, max_length=1000),
) -> dict[str, Any]:
    """Fetch current conditions for multiple cities in one upstream request."""
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
        async with httpx.AsyncClient(timeout=35.0, follow_redirects=True) as client:
            payload = await _fetch_open_meteo_current(client, params)
        rows = payload if isinstance(payload, list) else [payload]
        reports = []
        for index, row in enumerate(rows):
            current = row.get("current") or {}
            reports.append({
                "latitude": lats[index], "longitude": lons[index],
                "current": current,
                "source": {"name": "Open-Meteo", "type": "numerical weather-model output", "retrieved_at": utc_now()},
            })
        if len(reports) != len(lats):
            raise HTTPException(status_code=502, detail="Weather provider returned an incomplete city batch")
        return {"source": "Open-Meteo", "retrieved_at": utc_now(), "count": len(reports), "reports": reports}
    except HTTPException:
        raise
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        raise HTTPException(status_code=502, detail=f"Bulk weather provider unavailable: {exc.__class__.__name__}") from exc

@app.get("/api/weather")
async def weather(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
) -> dict[str, Any]:
    cache_key = (round(latitude, 3), round(longitude, 3))
    now = asyncio.get_running_loop().time()
    async with _weather_cache_lock:
        cached = _weather_cache.get(cache_key)
    if cached and cached[0] > now:
        return cached[1]

    params = _current_weather_params([latitude], [longitude])
    try:
        # Do not hold the shared cache lock during network I/O: different cities must load concurrently.
        async with httpx.AsyncClient(timeout=35.0, follow_redirects=True) as client:
            data = await _fetch_open_meteo_current(client, params)
        data["source"] = {"name":"Open-Meteo","type":"numerical weather-model output","retrieved_at":utc_now()}
        async with _weather_cache_lock:
            _weather_cache[cache_key] = (asyncio.get_running_loop().time() + 45, data)
        return data
    except HTTPException:
        raise
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"Weather provider unavailable: {exc.__class__.__name__}") from exc


# Public Nominatim reverse-geocoding: one request at a time, cached by nearby coordinates.
_reverse_location_cache: dict[tuple[float, float], tuple[float, dict[str, Any]]] = {}
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
        _reverse_location_cache[cache_key] = (asyncio.get_running_loop().time() + 30 * 24 * 60 * 60, result)
        return result

@app.get("/api/wind-grid")
async def wind_grid() -> dict[str, Any]:
    """15-degree global model sample for large-scale near-surface wind and cloud visualization."""
    latitudes = list(range(-60, 61, 15))
    longitudes = list(range(-180, 180, 15))
    locations = [(lat, lon) for lat in latitudes for lon in longitudes]
    chunks = [locations[i:i + 72] for i in range(0, len(locations), 72)]
    async def fetch_chunk(client: httpx.AsyncClient, chunk: list[tuple[int, int]]) -> list[dict[str, Any]]:
        params = {
            "latitude": ",".join(str(p[0]) for p in chunk),
            "longitude": ",".join(str(p[1]) for p in chunk),
            "current": "wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,relative_humidity_2m,precipitation",
            "timezone": "UTC",
        }
        response = await client.get(OPEN_METEO, params=params)
        response.raise_for_status()
        payload = response.json()
        return payload if isinstance(payload, list) else [payload]
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            batches = await asyncio.gather(*(fetch_chunk(client, chunk) for chunk in chunks))
        points = []
        for chunk, rows in zip(chunks, batches):
            for (lat, lon), row in zip(chunk, rows):
                current = row.get("current") or {}
                speed, direction = current.get("wind_speed_10m"), current.get("wind_direction_10m")
                if speed is not None and direction is not None:
                    points.append({
                        "lat":lat,"lon":lon,"speed_kmh":speed,"direction_deg":direction,
                        "gust_kmh":current.get("wind_gusts_10m"),"cloud_cover_pct":current.get("cloud_cover"),
                        "humidity_pct":current.get("relative_humidity_2m"),"precipitation_mm":current.get("precipitation")
                    })
        return {
            "source":"Open-Meteo global numerical weather models","retrieved_at":utc_now(),
            "resolution_degrees":15,"points":points,
            "note":"15-degree coarse global model samples. Animated particles interpolate between model samples; this is not a high-resolution operational analysis or direct station observation."
        }
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
