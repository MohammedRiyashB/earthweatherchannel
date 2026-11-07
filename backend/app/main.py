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
RAINVIEWER = "https://api.rainviewer.com/public/weather-maps.json"
NASA_GIBS_CAPABILITIES = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml"
SOURCES = [
    {"id":"weatherapi","name":"WeatherAPI.com","kind":"current weather and forecast","coverage":"Global","status":"configured-by-environment","update":"Provider dependent","note":"Primary provider; requires WEATHERAPI_KEY."},
    {"id":"openweather","name":"OpenWeather","kind":"current weather and forecast","coverage":"Global","status":"configured-by-environment","update":"Provider dependent","note":"Secondary provider; requires OPENWEATHER_API_KEY."},
    {"id":"metnorway","name":"MET Norway Locationforecast","kind":"global forecast","coverage":"Global","status":"public-with-identification","update":"Provider dependent","note":"Final fallback; requires a real identifying METNORWAY_USER_AGENT and compliant caching/traffic."},
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
    return {"latitude": ",".join(str(x) for x in latitudes), "longitude": ",".join(str(x) for x in longitudes)}


def _provider_is_configured(provider: str) -> bool:
    if provider == "weatherapi":
        return bool(os.getenv("WEATHERAPI_KEY"))
    if provider == "openweather":
        return bool(os.getenv("OPENWEATHER_API_KEY"))
    if provider == "metnorway":
        return bool(os.getenv("METNORWAY_USER_AGENT")) and "replace-with" not in os.getenv("METNORWAY_USER_AGENT", "").lower()
    return False


def _weatherapi_wmo(code: Any) -> int | None:
    if code == 1000: return 0
    if code == 1003: return 2
    if code in {1006,1009}: return 3
    if code in {1030,1135,1147}: return 45
    if code in {1063,1150,1153,1168,1171}: return 51
    if code in {1180,1183,1186,1189,1192,1195,1240,1243,1246}: return 61
    if code in {1066,1114,1117,1210,1213,1216,1219,1222,1225,1255,1258}: return 71
    if code in {1087,1273,1276,1279,1282}: return 95
    return None


def _openweather_wmo(code: Any) -> int | None:
    if not isinstance(code, int): return None
    if 200 <= code < 300: return 95
    if 300 <= code < 400: return 51
    if code in {500,501,520,521}: return 61
    if code in {502,503,504,522}: return 65
    if code in {511,600,601,620,621}: return 71
    if code in {602,622}: return 75
    if 600 <= code < 700: return 71
    if 700 <= code < 800: return 45
    if code == 800: return 0
    if code == 801: return 1
    if code == 802: return 2
    if code in {803,804}: return 3
    return None


def _metnorway_wmo(code: Any) -> int | None:
    if not isinstance(code, str): return None
    value = code.lower()
    if "thunder" in value: return 95
    if "snow" in value or "sleet" in value: return 71
    if "fog" in value: return 45
    if "rain" in value or "shower" in value: return 61
    if "cloudy" in value or "overcast" in value: return 3
    if "partlycloudy" in value: return 2
    if "fair" in value: return 1
    if "clearsky" in value: return 0
    return None


def _normalize_weatherapi(payload: dict[str, Any]) -> dict[str, Any]:
    c = payload.get("current") or {}
    condition = c.get("condition") or {}
    return {"temperature_2m":c.get("temp_c"),"relative_humidity_2m":c.get("humidity"),
        "apparent_temperature":c.get("feelslike_c"),"precipitation":c.get("precip_mm"),
        "cloud_cover":c.get("cloud"),"pressure_msl":c.get("pressure_mb"),
        "wind_speed_10m":c.get("wind_kph"),"wind_direction_10m":c.get("wind_degree"),
        "wind_gusts_10m":c.get("gust_kph"),"weather_code":_weatherapi_wmo(condition.get("code")),
        "weather_description":condition.get("text"),"time":c.get("last_updated")}


def _normalize_openweather(payload: dict[str, Any]) -> dict[str, Any]:
    main, wind = payload.get("main") or {}, payload.get("wind") or {}
    weather = (payload.get("weather") or [{}])[0]
    rain = payload.get("rain") or {}
    return {"temperature_2m":main.get("temp"),"relative_humidity_2m":main.get("humidity"),
        "apparent_temperature":main.get("feels_like"),"precipitation":rain.get("1h", rain.get("3h", 0)),
        "cloud_cover":(payload.get("clouds") or {}).get("all"),"pressure_msl":main.get("pressure"),
        "wind_speed_10m":(wind.get("speed", 0) or 0)*3.6,"wind_direction_10m":wind.get("deg"),
        "wind_gusts_10m":(wind.get("gust", 0) or 0)*3.6,"weather_code":_openweather_wmo(weather.get("id")),
        "weather_description":weather.get("description"),"time":payload.get("dt")}


def _normalize_metnorway(payload: dict[str, Any]) -> dict[str, Any]:
    series = (payload.get("properties") or {}).get("timeseries") or []
    if not series:
        raise ValueError("MET Norway returned no forecast timeseries")
    item = series[0]
    details = ((item.get("data") or {}).get("instant") or {}).get("details") or {}
    next_hour = (item.get("data") or {}).get("next_1_hours") or {}
    summary = next_hour.get("summary") or {}
    code = summary.get("symbol_code")
    return {"temperature_2m":details.get("air_temperature"),"relative_humidity_2m":details.get("relative_humidity"),
        "apparent_temperature":details.get("air_temperature"),"precipitation":(next_hour.get("details") or {}).get("precipitation_amount",0),
        "cloud_cover":details.get("cloud_area_fraction"),"pressure_msl":details.get("air_pressure_at_sea_level"),
        "wind_speed_10m":(details.get("wind_speed",0) or 0)*3.6,"wind_direction_10m":details.get("wind_from_direction"),
        "wind_gusts_10m":(details.get("wind_speed_of_gust",0) or 0)*3.6,"weather_code":_metnorway_wmo(code),
        "weather_description":code,"time":item.get("time")}


async def _fetch_provider_current(client: httpx.AsyncClient, provider: str, lat: float, lon: float) -> dict[str, Any]:
    if provider == "weatherapi":
        response = await client.get(WEATHERAPI_CURRENT, params={"key":os.environ["WEATHERAPI_KEY"],"q":f"{lat:.4f},{lon:.4f}","aqi":"no"})
        response.raise_for_status()
        current = _normalize_weatherapi(response.json())
    elif provider == "openweather":
        response = await client.get(OPENWEATHER_CURRENT, params={"appid":os.environ["OPENWEATHER_API_KEY"],"lat":lat,"lon":lon,"units":"metric"})
        response.raise_for_status()
        current = _normalize_openweather(response.json())
    else:
        ua = os.environ["METNORWAY_USER_AGENT"]
        cache_key = (round(lat, 4), round(lon, 4))
        async with _METNORWAY_CACHE_LOCK:
            cached = _METNORWAY_CACHE.get(cache_key)
            if cached and cached[0] > asyncio.get_running_loop().time():
                current = dict(cached[1])
            else:
                response = await client.get(METNORWAY_COMPACT, params={"lat":f"{lat:.4f}","lon":f"{lon:.4f}"}, headers={"User-Agent":ua,"Accept":"application/json"})
                response.raise_for_status()
                current = _normalize_metnorway(response.json())
                expires = response.headers.get("expires")
                cache_control = response.headers.get("cache-control", "")
                max_age = None
                for directive in cache_control.split(","):
                    directive = directive.strip().lower()
                    if directive.startswith("max-age="):
                        try: max_age = int(directive.split("=",1)[1])
                        except ValueError: pass
                ttl = max_age if max_age is not None else 600
                if expires:
                    try:
                        ttl = max(0, (parsedate_to_datetime(expires) - datetime.now(timezone.utc)).total_seconds())
                    except (TypeError, ValueError, OverflowError):
                        pass
                if ttl > 0:
                    _METNORWAY_CACHE[cache_key] = (asyncio.get_running_loop().time() + ttl, dict(current))
    if not isinstance(current.get("temperature_2m"), (int,float)):
        raise ValueError(f"{provider} returned no valid temperature")
    return {"current":current,"provider":provider}


async def _fetch_weather_rows(client: httpx.AsyncClient, latitudes: list[float], longitudes: list[float]) -> list[dict[str, Any]]:
    """Try three independent global weather providers in order; fail over on timeout, quota or bad payload."""
    if not latitudes or len(latitudes) != len(longitudes) or len(latitudes) > 30:
        raise HTTPException(status_code=422, detail="Provide 1–30 matching latitude and longitude values")
    if any(not -90 <= v <= 90 for v in latitudes) or any(not -180 <= v <= 180 for v in longitudes):
        raise HTTPException(status_code=422, detail="Coordinates are outside valid ranges")
    failures: list[dict[str,str]] = []
    for provider in WEATHER_PROVIDER_ORDER:
        if not _provider_is_configured(provider):
            failures.append({"provider":provider,"reason":"not_configured"})
            continue
        try:
            # Keep fan-out bounded; one provider must return the complete batch before it is selected.
            semaphore = asyncio.Semaphore(6)
            async def one(lat: float, lon: float):
                async with semaphore:
                    return await _fetch_provider_current(client, provider, lat, lon)
            rows = await asyncio.wait_for(asyncio.gather(*(one(a,b) for a,b in zip(latitudes,longitudes))), timeout=18.0)
            logger.info("Weather provider selected: %s for %s locations", provider, len(rows))
            return rows
        except (httpx.HTTPError, asyncio.TimeoutError, ValueError, KeyError) as exc:
            reason = "timeout" if isinstance(exc, asyncio.TimeoutError) else exc.__class__.__name__
            logger.warning("Weather provider %s failed (%s); trying next provider", provider, reason)
            failures.append({"provider":provider,"reason":reason})
    raise HTTPException(status_code=503, detail={"message":"All configured weather providers are unavailable","provider_failures":failures})


async def _fetch_weather_current(client: httpx.AsyncClient, params: dict[str, Any]) -> Any:
    """Compatibility-shaped adapter for the three-provider weather failover chain."""
    try:
        latitudes = [float(v) for v in str(params["latitude"]).split(",")]
        longitudes = [float(v) for v in str(params["longitude"]).split(",")]
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Invalid weather coordinates") from exc
    rows = await _fetch_weather_rows(client, latitudes, longitudes)
    return {**rows[0]["current"], "provider": rows[0]["provider"]} if len(rows) == 1 else rows

@app.get("/")
async def root(response: Response) -> dict[str, Any]:
    """Expose an uncached deployment fingerprint and the public API docs."""
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    revision = os.getenv("RENDER_GIT_COMMIT", "unknown")
    return {
        "service": "earth-weather-api",
        "name": "EARTH WEATHER API",
        "status": "ok",
        "version": app.version,
        "deployment_revision": revision[:12],
        "docs": "/docs",
        "openapi": "/openapi.json",
    }

@app.get("/health")
async def health(response: Response) -> dict[str, str]:
    """Lightweight process health check; no upstream provider dependency."""
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return {
        "status": "healthy",
        "service": "earth-weather-api",
        "version": app.version,
        "time": utc_now(),
    }

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
    """Return provider readiness plus actual live NASA GIBS WMTS imagery layers."""
    import os

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(12.0, connect=4.0),
        follow_redirects=True,
        headers={"User-Agent": "EARTH-WEATHER/1.0 (+https://earthweatherchannel.web.app)"},
    ) as client:
        try:
            live_imagery = await fetch_gibs_layers(client)
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            logger.warning("NASA GIBS layer catalogue unavailable: %s", exc.__class__.__name__)
            live_imagery = {
                "provider": "NASA EOSDIS GIBS",
                "status": "degraded",
                "retrieved_layers": 0,
                "layers": [],
                "capabilities_url": NASA_GIBS_CAPABILITIES,
                "error": exc.__class__.__name__,
            }

    providers = []
    for provider in SATELLITE_PROVIDERS:
        item = dict(provider)
        if item["id"] == "nasa-gibs":
            item["status"] = live_imagery["status"]
            item["connected"] = live_imagery["status"] == "live"
            item["live_layer_count"] = live_imagery["retrieved_layers"]
        elif item["requires_credentials"]:
            env_names = item.get("credential_env") or ""
            required = [name.strip() for name in env_names.split(" and ") if name.strip()]
            item["status"] = "credentials-configured" if required and all(os.getenv(name) for name in required) else "credentials-required"
            item["connected"] = False
        else:
            item["status"] = "public-source-not-yet-adapted"
            item["connected"] = False
        providers.append(item)

    return {
        "retrieved_at": utc_now(),
        "count": len(providers),
        "providers": providers,
        "live_imagery": live_imagery,
        "note": "Only NASA GIBS is currently connected as a live machine-readable satellite imagery feed in this backend. Other providers are identified with their real access requirements; a reachable website is not the same as an integrated data feed. Satellite imagery is not a direct replacement for local temperature forecasts or official warnings.",
    }

@app.get("/api/health/sources")
async def source_health() -> dict[str, Any]:
    """Live lightweight probes. A successful HTTP response means reachable, not scientifically validated."""
    checks = [
        ("weatherapi", WEATHERAPI_CURRENT, {"key":os.getenv("WEATHERAPI_KEY",""),"q":"0,0"}),
        ("openweather", OPENWEATHER_CURRENT, {"appid":os.getenv("OPENWEATHER_API_KEY",""),"lat":0,"lon":0}),
        ("metnorway", METNORWAY_COMPACT, {"lat":"0.0000","lon":"0.0000"}),
        ("nasa-eonet", EONET_EVENTS, {"category":"severeStorms","status":"open","limit":1}),
        ("rainviewer", RAINVIEWER, None),
        ("nasa-gibs", NASA_GIBS_CAPABILITIES, None),
    ]
    async def probe(client: httpx.AsyncClient, item: tuple[str, str, dict | None]) -> dict[str, Any]:
        source_id, url, params = item
        if source_id in {"weatherapi", "openweather", "metnorway"} and not _provider_is_configured(source_id):
            return {"id":source_id,"status":"not_configured","checked_at":utc_now()}
        started = datetime.now(timezone.utc)
        try:
            headers = {"User-Agent":os.environ["METNORWAY_USER_AGENT"]} if source_id == "metnorway" else None
            response = await client.get(url, params=params, headers=headers)
            elapsed = (datetime.now(timezone.utc) - started).total_seconds() * 1000
            response.raise_for_status()
            return {"id":source_id,"status":"online","http_status":response.status_code,"latency_ms":round(elapsed),"checked_at":utc_now()}
        except httpx.HTTPStatusError as exc:
            status_code = exc.response.status_code
            retry_after = exc.response.headers.get("retry-after")
            return {
                "id": source_id,
                "status": "rate_limited" if status_code == 429 else "degraded",
                "http_status": status_code,
                "retry_after": retry_after,
                "error": "upstream_rate_limit" if status_code == 429 else "upstream_http_error",
                "checked_at": utc_now(),
            }
        except httpx.TimeoutException:
            return {"id": source_id, "status": "degraded", "error": "timeout", "checked_at": utc_now()}
        except httpx.HTTPError as exc:
            return {"id": source_id, "status": "degraded", "error": exc.__class__.__name__, "checked_at": utc_now()}
    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True, headers={"User-Agent":os.getenv("METNORWAY_USER_AGENT", "EARTH-WEATHER/1.0")}) as client:
        results = await asyncio.gather(*(probe(client, item) for item in checks))
    return {"checked_at":utc_now(),"checks":results,"note":"Reachability checks only; they do not certify data freshness, coverage or accuracy."}

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
    response: Response,
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    country: str = Query(..., min_length=2, max_length=80),
) -> dict[str, Any]:
    """Return four major cities in the visitor's country and four nearby international cities."""
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
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
        payload = await _fetch_weather_current(app.state.weather_http, params)
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

@app.get("/api/satellite-weather")
async def satellite_weather_report(latitude: float, longitude: float) -> dict[str, Any]:
    """Honest satellite-only numerical report. Never substitutes NWP or conventional weather APIs."""
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        raise HTTPException(status_code=422, detail="Invalid latitude/longitude")
    parameters = [
        {"id":"air_temperature","label":"Air temperature","value":None,"unit":"°C","status":"unavailable","source":None,"reason":"No verified, globally available satellite-only 2 m air-temperature point retrieval is connected. Land-surface temperature is not equivalent to 2 m air temperature."},
        {"id":"relative_humidity","label":"Relative humidity","value":None,"unit":"%","status":"unavailable","source":None,"reason":"Satellite humidity retrievals are generally profile/pressure-level products with coverage and retrieval gaps; no point-level product adapter is currently connected."},
        {"id":"wind_speed","label":"Wind speed","value":None,"unit":"km/h","status":"unavailable","source":None,"reason":"Available satellite wind products are feature/cloud-motion or ocean-surface retrievals, not a verified all-surface 10 m wind feed for this point."},
        {"id":"wind_direction","label":"Wind direction","value":None,"unit":"°","status":"unavailable","source":None,"reason":"No verified satellite-only near-surface wind-direction retrieval is connected for this location."},
        {"id":"cloud_cover","label":"Cloud cover","value":None,"unit":"%","status":"unavailable","source":None,"reason":"A satellite cloud-fraction numeric retrieval adapter is not yet connected; true-colour imagery is not converted into a fabricated percentage."},
        {"id":"rainfall_rate","label":"Rainfall rate","value":None,"unit":"mm/h","status":"metadata_only","source":{"name":"NASA GPM IMERG V07B","url":"https://gpm.nasa.gov/data/imerg","nominal_resolution":"0.1° (~10 km)","temporal_resolution":"30 minutes","minimum_latency":"about 4 hours"},"reason":"NASA documents the satellite-derived IMERG precipitation-rate product, but its numeric point-extraction/download path is not yet integrated. No rainfall value is guessed."},
    ]
    return {
        "product":"EARTH WEATHER Satellite Numerical Report",
        "mode":"satellite-only",
        "coordinates":{"latitude":latitude,"longitude":longitude},
        "retrieved_at":utc_now(),
        "status":"partial-data-integration",
        "parameters":parameters,
        "policy":"Only directly satellite-derived/retrieved products are eligible. No WeatherAPI, OpenWeather, MET Norway, Open-Meteo, NWP forecast or reanalysis fallback is used by this endpoint.",
        "next_integration":"NASA GPM IMERG V07B point extraction is the first numerical satellite adapter to complete; temperature, humidity, wind and cloud products require separate scientifically compatible retrieval pipelines.",
    }

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
