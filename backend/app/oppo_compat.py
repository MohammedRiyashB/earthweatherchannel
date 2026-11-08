"""EARTH WEATHER compatibility endpoints for the preserved OPPO Weather UI data models.

The Android app calls these endpoints using the legacy request paths, but data is
served exclusively by the EARTH WEATHER API. The response schema mirrors the
app's decompiled LocationWeatherResponse/LocationWeatherData models.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Request

router = APIRouter()


def _as_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _epoch_ms(value: Any) -> int | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return int(parsed.timestamp() * 1000)
    except ValueError:
        return None


def _coordinates_from_key(key: str) -> tuple[float, float] | None:
    # Our location endpoint creates stable keys that safely round-trip in the app's city DB.
    if key.startswith("earthweather:"):
        parts = key.split(":")
        if len(parts) == 3:
            lat, lon = _as_float(parts[1]), _as_float(parts[2])
            if lat is not None and lon is not None and -90 <= lat <= 90 and -180 <= lon <= 180:
                return lat, lon
    return None


@router.post("/weather/location/for-app/sdk")
async def earth_weather_location(request: Request) -> dict[str, Any]:
    """Return a CityInfoBean-compatible location using EARTH WEATHER geocoding."""
    from app.main import reverse_location

    try:
        body = await request.json()
        latitude = float(body["latitude"])
        longitude = float(body["longitude"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=400, detail="latitude and longitude are required")
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        raise HTTPException(status_code=400, detail="coordinates are out of range")

    place = await reverse_location(latitude, longitude)
    name = str(place.get("name") or "Current location")
    country = str(place.get("country") or "")
    state = str(place.get("state") or place.get("region") or "")
    key = f"earthweather:{latitude:.5f}:{longitude:.5f}"
    return {
        "cityName": name,
        "cityNameEn": name,
        "enName": name,
        "countryName": country,
        "countryEnName": country,
        "countryID": str(place.get("country_code") or "").upper(),
        "regionName": state,
        "regionEnName": state,
        "locationKey": key,
        "locationKeyUpdate": key,
        "lat": latitude,
        "lon": longitude,
        "latitude": latitude,
        "longitude": longitude,
        "geoHash": f"{latitude:.5f},{longitude:.5f}",
        "placeId": key,
        "placeType": 0,
        "placeName": name,
        "timezone": "auto",
        "language": "en",
        "dataSouceType": 0,
        "placeDetailStatus": 0,
        "parentLocationKey": "",
        "sourceKey": key,
        "parentSourceKey": "",
        "highlightDisplayName": name,
        "order": 0,
    }


async def _build_location_weather(request: Request, key: str) -> dict[str, Any]:
    from app.main import _current_weather_params, _fetch_weather_current
    from app.forecast import fetch_forecast

    coordinates = _coordinates_from_key(key)
    if coordinates is None:
        raise HTTPException(status_code=400, detail=f"Unsupported EARTH WEATHER location key: {key}")
    latitude, longitude = coordinates
    client = request.app.state.weather_http
    current = await _fetch_weather_current(client, _current_weather_params([latitude], [longitude]))
    forecast = await fetch_forecast(client, latitude=latitude, longitude=longitude, days=7, timezone_name="auto")
    hourly = forecast.get("hourly") or {}
    daily = forecast.get("daily") or {}
    times = hourly.get("time") or []
    days = daily.get("time") or []
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)

    obw = {
        "forecastTime": current.get("time"),
        "bodyTemp": current.get("apparent_temperature"),
        "humidity": current.get("relative_humidity_2m"),
        "pressure": current.get("pressure_msl"),
        "temp": current.get("temperature_2m"),
        "uvIndex": None,
        "visibility": (hourly.get("visibility") or [None])[0],
        "weatherCode": current.get("weather_code"),
        "windDegree": current.get("wind_direction_10m"),
        "windPower": None,
        "windSpeed": current.get("wind_speed_10m"),
        "adLink": "",
        "todayDate": now_ms,
        "expireTime": now_ms + 300_000,
        "weatherIcon": current.get("weather_code"),
        "localWeatherCode": str(current.get("weather_code")) if current.get("weather_code") is not None else None,
        "weatherAdLink": "",
        "forecastTimeSeconds": now_ms // 1000,
    }

    hourly_rows = []
    hourly_fields = (
        "temperature_2m", "relative_humidity_2m", "precipitation_probability",
        "precipitation", "snowfall", "weather_code", "uv_index",
        "wind_direction_10m", "wind_speed_10m",
    )
    for i, timestamp in enumerate(times[:48]):
        def h(name: str) -> Any:
            values = hourly.get(name) or []
            return values[i] if i < len(values) else None
        hourly_rows.append({
            "hourTh": i,
            "localWeatherCode": h("weather_code"),
            "precipitationProbability": h("precipitation_probability") or 0,
            "rainPrecipitation": h("precipitation"),
            "rainProbability": h("precipitation_probability"),
            "relativeHumidity": h("relative_humidity_2m"),
            "snowPrecipitation": h("snowfall"),
            "temp": h("temperature_2m"),
            "time": _epoch_ms(timestamp),
            "uvIndex": h("uv_index"),
            "weatherCode": h("weather_code"),
            "weatherIcon": h("weather_code"),
            "windDegrees": h("wind_direction_10m"),
            "windSpeed": round(h("wind_speed_10m")) if isinstance(h("wind_speed_10m"), (int, float)) else None,
        })

    daily_rows = []
    for i, date_value in enumerate(days[:7]):
        def d(name: str) -> Any:
            values = daily.get(name) or []
            return values[i] if i < len(values) else None
        # Date-only values are interpreted as local-midnight timestamps.
        day_ms = _epoch_ms(str(date_value) + "T12:00:00+00:00") or now_ms
        sunrise = daily.get("sunrise") or []
        sunset = daily.get("sunset") or []
        daily_rows.append({
            "dayCode": d("weather_code"),
            "dayIcon": d("weather_code"),
            "dayLocalWeatherCode": d("weather_code"),
            "dayWindDegree": d("wind_direction_10m_dominant"),
            "dayWindPower": None,
            "dayWindSpeed": d("wind_speed_10m_max"),
            "nightCode": d("weather_code"),
            "nightIcon": d("weather_code"),
            "nightLocalWeatherCode": d("weather_code"),
            "nightWindDegree": d("wind_direction_10m_dominant"),
            "nightWindPower": None,
            "nightWindSpeed": d("wind_speed_10m_max"),
            "moonPhase": None,
            "moonPhaseCode": None,
            "moonriseTime": None,
            "moonsetTime": None,
            "precipitationProbability": d("precipitation_probability_max") or 0,
            "sunriseTime": _epoch_ms(sunrise[i]) if i < len(sunrise) else None,
            "sunsetTime": _epoch_ms(sunset[i]) if i < len(sunset) else None,
            "tempMax": d("temperature_2m_max"),
            "tempMin": d("temperature_2m_min"),
            "time": day_ms,
            "uvIndex": d("uv_index_max"),
        })

    data = {
        "weatherDataProvider": 1,
        "obw": {"data": obw, "errorCode": 0, "errorMessage": "", "md5": ""},
        "hfw": {"data": {"data": hourly_rows}, "errorCode": 0, "errorMessage": "", "md5": ""},
        "dfw": {"data": {"data": daily_rows}, "errorCode": 0, "errorMessage": "", "md5": ""},
        "aq": {"data": None, "errorCode": 0, "errorMessage": "", "md5": ""},
        "alert": {"data": None, "errorCode": 0, "errorMessage": "", "md5": ""},
        "ti": {"data": None, "errorCode": 0, "errorMessage": "", "md5": ""},
        "tips": {"data": [], "errorCode": 0, "errorMessage": "", "md5": ""},
        "errorCode": 0,
        "errorMessage": "",
    }
    return {"locationId": key, "weatherData": data}


@router.post("/weather/data/gzipJson/sdk/v2")
@router.post("/weather/data/gzipJson/sdk")
async def earth_weather_legacy_weather_data(request: Request) -> dict[str, Any]:
    """Translate the legacy OPPO v2 request contract into EARTH WEATHER forecast data."""
    try:
        body = await request.json()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON request")
    location_value = body.get("locationKey") or ""
    if isinstance(location_value, list):
        keys = [str(x) for x in location_value if x]
    elif isinstance(location_value, str):
        keys = [x for x in location_value.split(",") if x]
    else:
        keys = []
    if not keys:
        raise HTTPException(status_code=400, detail="locationKey is required")
    results = []
    for key in keys[:12]:
        results.append(await _build_location_weather(request, key))
    return {"data": results}
